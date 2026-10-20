<?php

declare(strict_types=1);

// Arranque común: autoload, configuración y manejo de errores.
// Nunca se muestran errores internos al cliente: van al log de storage/logs.

spl_autoload_register(static function (string $class): void {
    $prefix = 'PvcShelter\\';
    if (str_starts_with($class, $prefix)) {
        $file = __DIR__ . '/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
        if (is_file($file)) {
            require $file;
        }
    }
});

ini_set('display_errors', '0');
ini_set('log_errors', '1');
ini_set('error_log', dirname(__DIR__) . '/storage/logs/php-error.log');
error_reporting(E_ALL);

\PvcShelter\Env::load(dirname(__DIR__) . '/.env');

set_exception_handler(static function (Throwable $e): void {
    if ($e instanceof \PvcShelter\HttpException) {
        \PvcShelter\Http::json($e->status, ['error' => $e->getMessage()] + $e->extra);
        return;
    }
    error_log(sprintf('[%s] %s in %s:%d', get_class($e), $e->getMessage(), $e->getFile(), $e->getLine()));
    $message = \PvcShelter\Env::isProduction()
        ? 'Error interno del servidor.'
        : 'Error interno del servidor (revisa backend/storage/logs/php-error.log).';
    \PvcShelter\Http::json(500, ['error' => $message]);
});
