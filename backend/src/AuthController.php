<?php

declare(strict_types=1);

namespace PvcShelter;

use PDO;
use PDOException;

/** Registro, inicio y cierre de sesión. */
final class AuthController
{
    private const HASH_OPTIONS = ['cost' => 12];

    public function __construct(private PDO $db, private RateLimiter $limiter)
    {
    }

    /** GET /api/session — usuario actual (o null) y token CSRF para las siguientes peticiones. */
    public function session(): void
    {
        Http::json(200, ['user' => $this->currentUser(), 'csrfToken' => Session::csrfToken()]);
    }

    /** POST /api/register */
    public function register(): void
    {
        Session::requireCsrf();
        $body = Http::jsonBody();
        $username = Validator::username($body['username'] ?? null);
        $password = Validator::password($body['password'] ?? null, $username);
        $ip = Http::clientIp();
        $this->limiter->assertRegisterAllowed($ip);
        $this->limiter->record('register', $ip, $username);

        $hash = password_hash($password, PASSWORD_DEFAULT, self::HASH_OPTIONS);
        try {
            $stmt = $this->db->prepare('INSERT INTO users (username, password_hash, last_login_at) VALUES (:username, :hash, UTC_TIMESTAMP())');
            $stmt->execute([':username' => $username, ':hash' => $hash]);
        } catch (PDOException $e) {
            // 23000 = clave única duplicada (el nombre ya existe).
            if ($e->getCode() === '23000') {
                throw new HttpException(409, 'Ese nombre de usuario ya está en uso.');
            }
            throw $e;
        }
        $id = (int) $this->db->lastInsertId();
        Session::login($id);
        Http::json(201, ['user' => ['id' => $id, 'username' => $username], 'csrfToken' => Session::csrfToken()]);
    }

    /** POST /api/login */
    public function login(): void
    {
        Session::requireCsrf();
        $body = Http::jsonBody();
        $username = is_string($body['username'] ?? null) ? trim($body['username']) : '';
        $password = is_string($body['password'] ?? null) ? $body['password'] : '';
        // Mismo mensaje para todo fallo: no revela si el usuario existe.
        $invalid = new HttpException(401, 'Usuario o contraseña incorrectos.');
        if ($username === '' || $password === '' || strlen($username) > 24 || strlen($password) > 72) {
            throw $invalid;
        }
        $ip = Http::clientIp();
        $this->limiter->assertLoginAllowed($ip, $username);

        $stmt = $this->db->prepare('SELECT id, username, password_hash FROM users WHERE username = :username LIMIT 1');
        $stmt->execute([':username' => $username]);
        $user = $stmt->fetch();

        // Si el usuario no existe se verifica contra un hash falso para que el tiempo
        // de respuesta sea similar y no permita adivinar qué usuarios existen.
        $hash = is_array($user) ? (string) $user['password_hash'] : self::dummyHash();
        if (!password_verify($password, $hash) || !is_array($user)) {
            $this->limiter->record('login', $ip, $username);
            throw $invalid;
        }

        $this->limiter->clearLogin($ip, $username);
        if (password_needs_rehash($hash, PASSWORD_DEFAULT, self::HASH_OPTIONS)) {
            $update = $this->db->prepare('UPDATE users SET password_hash = :hash WHERE id = :id');
            $update->execute([':hash' => password_hash($password, PASSWORD_DEFAULT, self::HASH_OPTIONS), ':id' => $user['id']]);
        }
        $this->db->prepare('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = :id')->execute([':id' => $user['id']]);

        Session::login((int) $user['id']);
        Http::json(200, ['user' => ['id' => (int) $user['id'], 'username' => $user['username']], 'csrfToken' => Session::csrfToken()]);
    }

    /** POST /api/logout */
    public function logout(): void
    {
        Session::requireCsrf();
        Session::logout();
        Http::json(200, ['ok' => true]);
    }

    /** @return array{id: int, username: string}|null */
    private function currentUser(): ?array
    {
        $id = Session::userId();
        if ($id === null) {
            return null;
        }
        $stmt = $this->db->prepare('SELECT id, username FROM users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $user = $stmt->fetch();
        if (!is_array($user)) {
            Session::logout(); // La cuenta ya no existe.
            return null;
        }
        return ['id' => (int) $user['id'], 'username' => (string) $user['username']];
    }

    private static function dummyHash(): string
    {
        static $hash = null;
        return $hash ??= password_hash('pvc-shelter-dummy-password', PASSWORD_DEFAULT, self::HASH_OPTIONS);
    }
}
