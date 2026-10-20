<?php

declare(strict_types=1);

namespace PvcShelter;

use JsonException;

/** Utilidades de petición/respuesta JSON con cabeceras de seguridad. */
final class Http
{
    /** Máximo para cuerpos que no son partidas (login, registro...). */
    private const SMALL_BODY_BYTES = 8 * 1024;

    /** @param array<string, mixed> $body */
    public static function json(int $status, array $body): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: no-referrer');
        header('Cache-Control: no-store');
        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    public static function method(): string
    {
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    }

    public static function path(): string
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
        return is_string($path) ? rtrim($path, '/') : '';
    }

    public static function clientIp(): string
    {
        // Solo REMOTE_ADDR: X-Forwarded-For lo puede falsificar cualquiera.
        // Si el VPS usa un proxy inverso, configúralo para que REMOTE_ADDR sea la IP real.
        return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }

    /**
     * Lee y decodifica el cuerpo JSON validando tipo y tamaño.
     *
     * @return array<string, mixed>
     */
    public static function jsonBody(?int $maxBytes = null): array
    {
        $maxBytes ??= self::SMALL_BODY_BYTES;
        $type = $_SERVER['CONTENT_TYPE'] ?? '';
        if (!str_starts_with(strtolower($type), 'application/json')) {
            throw new HttpException(415, 'Se esperaba JSON.');
        }
        $declared = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($declared > $maxBytes) {
            throw new HttpException(413, 'La petición es demasiado grande.');
        }
        // Se lee como mucho un byte más del límite para detectar cuerpos sin Content-Length fiable.
        $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
        if ($raw === false || strlen($raw) > $maxBytes) {
            throw new HttpException(413, 'La petición es demasiado grande.');
        }
        try {
            $data = json_decode($raw, true, 128, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new HttpException(400, 'JSON inválido.');
        }
        if (!is_array($data)) {
            throw new HttpException(400, 'Se esperaba un objeto JSON.');
        }
        return $data;
    }
}
