<?php

declare(strict_types=1);

namespace PvcShelter;

use PDO;

/**
 * Límite de intentos de login y registro, guardado en la tabla auth_attempts.
 *
 * Login: como mucho 5 fallos por IP+usuario y 20 por IP cada 15 minutos.
 * Registro: como mucho 5 cuentas por IP cada hora.
 */
final class RateLimiter
{
    private const LOGIN_WINDOW_MINUTES = 15;
    private const LOGIN_MAX_PER_USER = 5;
    private const LOGIN_MAX_PER_IP = 20;
    private const REGISTER_WINDOW_MINUTES = 60;
    private const REGISTER_MAX_PER_IP = 5;

    public function __construct(private PDO $db)
    {
    }

    private static function ipBinary(string $ip): string
    {
        $packed = @inet_pton($ip);
        return $packed === false ? str_repeat("\0", 4) : $packed;
    }

    private function count(string $action, string $ip, ?string $username, int $minutes): int
    {
        $sql = 'SELECT COUNT(*) FROM auth_attempts
                WHERE action = :action AND ip = :ip
                  AND attempted_at > (UTC_TIMESTAMP() - INTERVAL :minutes MINUTE)';
        $params = [':action' => $action, ':ip' => self::ipBinary($ip), ':minutes' => $minutes];
        if ($username !== null) {
            $sql .= ' AND username = :username';
            $params[':username'] = $username;
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    }

    public function record(string $action, string $ip, ?string $username): void
    {
        $stmt = $this->db->prepare('INSERT INTO auth_attempts (action, ip, username, attempted_at) VALUES (:action, :ip, :username, UTC_TIMESTAMP())');
        $stmt->execute([':action' => $action, ':ip' => self::ipBinary($ip), ':username' => $username]);
        // Limpieza perezosa de intentos viejos (1 de cada 50 peticiones).
        if (random_int(1, 50) === 1) {
            $this->db->exec('DELETE FROM auth_attempts WHERE attempted_at < (UTC_TIMESTAMP() - INTERVAL 1 DAY)');
        }
    }

    public function clearLogin(string $ip, string $username): void
    {
        $stmt = $this->db->prepare("DELETE FROM auth_attempts WHERE action = 'login' AND ip = :ip AND username = :username");
        $stmt->execute([':ip' => self::ipBinary($ip), ':username' => $username]);
    }

    public function assertLoginAllowed(string $ip, string $username): void
    {
        if (
            $this->count('login', $ip, $username, self::LOGIN_WINDOW_MINUTES) >= self::LOGIN_MAX_PER_USER
            || $this->count('login', $ip, null, self::LOGIN_WINDOW_MINUTES) >= self::LOGIN_MAX_PER_IP
        ) {
            throw new HttpException(429, 'Demasiados intentos. Espera unos minutos y vuelve a probar.');
        }
    }

    public function assertRegisterAllowed(string $ip): void
    {
        if ($this->count('register', $ip, null, self::REGISTER_WINDOW_MINUTES) >= self::REGISTER_MAX_PER_IP) {
            throw new HttpException(429, 'Demasiados registros desde esta conexión. Prueba más tarde.');
        }
    }
}
