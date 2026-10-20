<?php

declare(strict_types=1);

namespace PvcShelter;

use RuntimeException;

/**
 * Carga de configuración desde backend/.env.
 *
 * Las variables de entorno reales del servidor tienen prioridad sobre el
 * archivo, así en el VPS se pueden definir en la config de PHP-FPM/Apache sin
 * tocar el .env.
 */
final class Env
{
    /** @var array<string, string> */
    private static array $values = [];

    public static function load(string $path): void
    {
        if (!is_file($path) || !is_readable($path)) {
            return; // Sin archivo: se usan solo las variables del entorno.
        }
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            throw new RuntimeException('No se pudo leer el archivo .env');
        }
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                continue;
            }
            [$key, $value] = array_map('trim', explode('=', $line, 2));
            if (!preg_match('/^[A-Z][A-Z0-9_]*$/', $key)) {
                continue;
            }
            // Quita comillas envolventes: KEY="valor" o KEY='valor'.
            if (strlen($value) >= 2 && ($value[0] === '"' || $value[0] === "'") && $value[-1] === $value[0]) {
                $value = substr($value, 1, -1);
            }
            self::$values[$key] = $value;
        }
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        $fromServer = getenv($key);
        if ($fromServer !== false && $fromServer !== '') {
            return $fromServer;
        }
        return self::$values[$key] ?? $default;
    }

    /** Valor obligatorio: falla si falta (mejor un error claro que conectar con credenciales vacías). */
    public static function require(string $key): string
    {
        $value = self::get($key);
        if ($value === null || $value === '') {
            throw new RuntimeException("Falta la variable de configuración {$key} en backend/.env");
        }
        return $value;
    }

    public static function bool(string $key, bool $default = false): bool
    {
        $value = self::get($key);
        return $value === null ? $default : in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true);
    }

    public static function int(string $key, int $default): int
    {
        $value = self::get($key);
        return $value !== null && ctype_digit($value) ? (int) $value : $default;
    }

    public static function isProduction(): bool
    {
        return self::get('APP_ENV', 'production') === 'production';
    }
}
