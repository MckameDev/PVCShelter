<?php

declare(strict_types=1);

namespace PvcShelter;

/**
 * Sesión PHP endurecida y protección CSRF.
 *
 * - Cookie HttpOnly (JavaScript no la puede leer), SameSite=Strict y Secure
 *   en producción (HTTPS).
 * - use_strict_mode: PHP rechaza ids de sesión que no haya generado él
 *   (evita la fijación de sesión).
 * - El id se regenera al iniciar o cerrar sesión.
 * - Token CSRF por sesión, exigido en la cabecera X-CSRF-Token de toda
 *   petición que modifica datos.
 */
final class Session
{
    public static function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        $lifetime = Env::int('SESSION_LIFETIME_DAYS', 30) * 86400;
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.use_trans_sid', '0');
        ini_set('session.cookie_httponly', '1');
        ini_set('session.gc_maxlifetime', (string) $lifetime);
        session_name('PVCSESSID');
        session_set_cookie_params([
            'lifetime' => $lifetime,
            'path' => '/',
            'secure' => Env::bool('SESSION_SECURE', Env::isProduction()),
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
        session_start();
    }

    public static function userId(): ?int
    {
        $id = $_SESSION['uid'] ?? null;
        return is_int($id) ? $id : null;
    }

    /** Inicia sesión como `userId` con un id de sesión nuevo y un token CSRF nuevo. */
    public static function login(int $userId): void
    {
        session_regenerate_id(true);
        $_SESSION['uid'] = $userId;
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }

    public static function logout(): void
    {
        $_SESSION = [];
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 3600,
            'path' => $params['path'],
            'secure' => $params['secure'],
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
        session_destroy();
    }

    public static function csrfToken(): string
    {
        if (!isset($_SESSION['csrf']) || !is_string($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf'];
    }

    /** Comprueba el token CSRF en tiempo constante. */
    public static function requireCsrf(): void
    {
        $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        $expected = $_SESSION['csrf'] ?? '';
        if (!is_string($sent) || !is_string($expected) || $expected === '' || !hash_equals($expected, $sent)) {
            throw new HttpException(403, 'Token de seguridad inválido. Recarga la página.');
        }
    }

    public static function requireUser(): int
    {
        $id = self::userId();
        if ($id === null) {
            throw new HttpException(401, 'Inicia sesión para continuar.');
        }
        return $id;
    }
}
