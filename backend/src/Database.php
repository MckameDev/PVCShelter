<?php

declare(strict_types=1);

namespace PvcShelter;

use PDO;

/**
 * Conexión PDO a MySQL/MariaDB.
 *
 * - Sentencias preparadas REALES (EMULATE_PREPARES=false): los parámetros viajan
 *   separados del SQL, así que no hay inyección SQL posible por los valores.
 * - Errores como excepciones (nunca se devuelven al cliente, ver Http).
 * - utf8mb4 y zona horaria UTC para que las fechas sean consistentes.
 */
final class Database
{
    private static ?PDO $pdo = null;

    public static function connection(): PDO
    {
        if (self::$pdo === null) {
            $dsn = sprintf(
                'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
                Env::require('DB_HOST'),
                Env::int('DB_PORT', 3306),
                Env::require('DB_NAME'),
            );
            self::$pdo = new PDO($dsn, Env::require('DB_USER'), Env::get('DB_PASS', '') ?? '', [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_STRINGIFY_FETCHES => false,
            ]);
            self::$pdo->exec("SET time_zone = '+00:00', sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION'");
        }
        return self::$pdo;
    }
}
