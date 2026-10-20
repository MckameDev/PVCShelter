# PVC Shelter — Backend (PHP + MySQL)

API de cuentas y guardado en la nube del juego. PHP puro (sin dependencias) con PDO.

## Requisitos

- PHP 8.0 o superior con `pdo_mysql`.
- MySQL 8 o MariaDB 10.4+.
- Apache con `mod_rewrite` (o Nginx, ver abajo).

## 1. Base de datos

El script [`database/pvc_shelter.sql`](database/pvc_shelter.sql) crea la base `pvc_shelter` y sus tablas, y se puede ejecutar varias veces sin romper nada:

```bash
mysql -u root -p < backend/database/pvc_shelter.sql
```

Al final del script está, **comentada**, la creación del usuario de la aplicación para `localhost`, con permisos mínimos (`SELECT, INSERT, UPDATE, DELETE`): no puede crear, borrar ni alterar tablas. Para usarla:

1. Reemplaza `PON_AQUI_TU_USUARIO` y `PON_AQUI_TU_PASSWORD` (usa una contraseña larga y aleatoria).
2. Descomenta las tres líneas y ejecútalas como administrador.

> Si tu panel del VPS ya creó la base con otro nombre, cambia `pvc_shelter` por ese nombre en las líneas `CREATE DATABASE`, `USE` y `GRANT`, o ejecuta solo los `CREATE TABLE` después de `USE tu_base;`.

## 2. Configuración (`.env`)

Copia `.env.example` como `.env` en esta carpeta y completa `DB_*`. El `.env` **no se sube al repositorio** (está en `.gitignore`). En producción:

```ini
APP_ENV=production
SESSION_SECURE=true   # requiere HTTPS
```

Las variables de entorno del servidor (PHP-FPM, Apache `SetEnv`) tienen prioridad sobre el `.env`.

## 3. Desarrollo local

```bash
# Terminal 1: API en http://127.0.0.1:8000
php -S 127.0.0.1:8000 -t backend/public backend/public/index.php

# Terminal 2: juego en http://localhost:5179 (Vite redirige /api a la API)
cd pvc-shelter && npm run dev
```

Otro puerto para la API: `VITE_API_TARGET=http://127.0.0.1:9000 npm run dev`.

## 4. Producción (VPS)

1. `cd pvc-shelter && npm run build:backend`: compila el juego dentro de `backend/public/` (junto a `index.php`).
2. Sube la carpeta `backend/` al servidor y apunta la **raíz web a `backend/public/`**. Así `.env`, `src/`, `database/` y `storage/` quedan fuera del alcance web; además `backend/.htaccess` bloquea todo por si la raíz se configura mal.
3. Da permiso de escritura al usuario del servidor web sobre `backend/storage/logs/`.
4. Activa HTTPS y pon `SESSION_SECURE=true` y `APP_ENV=production`.

Nginx (equivalente al `.htaccess`):

```nginx
root /ruta/a/backend/public;
location / {
    try_files $uri /index.php$is_args$args;
}
location ~ \.php$ {
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root/index.php;
    fastcgi_pass unix:/run/php/php-fpm.sock;
}
```

## API

| Método | Ruta | Cuerpo | Descripción |
|---|---|---|---|
| GET | `/api/session` | — | Usuario actual (o `null`) y token CSRF |
| POST | `/api/register` | `{ username, password }` | Crea la cuenta e inicia sesión |
| POST | `/api/login` | `{ username, password }` | Inicia sesión |
| POST | `/api/logout` | `{}` | Cierra sesión |
| GET | `/api/save` | — | Partida guardada, versión y hora del servidor |
| PUT | `/api/save` | `{ data, version }` | Guarda (bloqueo optimista por versión) |

Toda petición POST/PUT exige la cabecera `X-CSRF-Token` con el token de `/api/session`.

## Seguridad

- **Inyección SQL:** todas las consultas son sentencias preparadas con PDO (`EMULATE_PREPARES=false`) y parámetros enlazados; nunca se concatenan datos en el SQL.
- **Contraseñas:** `password_hash` (bcrypt, coste 12) y rehash automático; nunca se guardan en claro. Login con mensaje genérico y verificación contra un hash falso para no revelar qué usuarios existen.
- **Sesión:** cookie `HttpOnly`, `SameSite=Strict`, `Secure` con HTTPS, `use_strict_mode` contra la fijación de sesión, y el id se regenera al iniciar o cerrar sesión.
- **CSRF:** token aleatorio por sesión en la cabecera `X-CSRF-Token`, comparado en tiempo constante.
- **Fuerza bruta:** 5 fallos por IP+usuario y 20 por IP cada 15 minutos; 5 registros por IP y hora.
- **Validación:** usuario `^[A-Za-z0-9_]{3,24}$`; contraseña de 8 a 72 bytes; solo JSON (`Content-Type`), con tamaño máximo y profundidad limitada.
- **Errores:** el cliente solo ve mensajes genéricos; el detalle va a `storage/logs/php-error.log`.
- **Cabeceras:** `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
- **Mínimo privilegio en MySQL:** el usuario de la app solo lee y escribe datos.

Limitación conocida: la partida la calcula el navegador, así que un jugador avanzado puede modificar su propio guardado. Solo afecta a su partida; para rankings competitivos haría falta validar la simulación en el servidor.
