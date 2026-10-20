<?php

declare(strict_types=1);

// Punto de entrada único de la API (y del juego compilado, si se sirve desde aquí).
//
//   GET  /api/session   usuario actual + token CSRF
//   POST /api/register  { username, password }
//   POST /api/login     { username, password }
//   POST /api/logout
//   GET  /api/save      partida guardada
//   PUT  /api/save      { data, version }

use PvcShelter\AuthController;
use PvcShelter\Database;
use PvcShelter\Http;
use PvcShelter\HttpException;
use PvcShelter\RateLimiter;
use PvcShelter\SaveController;
use PvcShelter\Session;

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

// Servidor de desarrollo de PHP (php -S): los archivos estáticos se sirven tal cual.
if (PHP_SAPI === 'cli-server' && !str_starts_with($path, '/api/') && is_file(__DIR__ . $path)) {
    return false;
}

if (!str_starts_with($path, '/api/')) {
    // Fuera de /api se sirve el juego compilado (SPA) si existe.
    $spa = __DIR__ . '/index.html';
    if (is_file($spa)) {
        header('Content-Type: text/html; charset=utf-8');
        readfile($spa);
        exit;
    }
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/bootstrap.php';

Session::start();
$db = Database::connection();
$auth = new AuthController($db, new RateLimiter($db));
$saves = new SaveController($db);

$route = Http::method() . ' ' . Http::path();
match ($route) {
    'GET /api/session' => $auth->session(),
    'POST /api/register' => $auth->register(),
    'POST /api/login' => $auth->login(),
    'POST /api/logout' => $auth->logout(),
    'GET /api/save' => $saves->load(),
    'PUT /api/save' => $saves->store(),
    default => throw new HttpException(404, 'Ruta no encontrada.'),
};
