-- =============================================================================
-- PVC Shelter — Base de datos (MySQL 8 / MariaDB 10.4+)
--
-- Uso (como administrador, p. ej. root):
--   mysql -u root -p < pvc_shelter.sql
--
-- 1) Crea la base de datos y las tablas (se puede ejecutar varias veces).
-- 2) El usuario de la aplicación está al final, COMENTADO: cambia los marcadores
--    PON_AQUI_TU_USUARIO / PON_AQUI_TU_PASSWORD, descomenta y ejecuta.
--    Luego pon esos mismos valores en backend/.env (DB_USER / DB_PASS).
-- =============================================================================

CREATE DATABASE IF NOT EXISTS pvc_shelter
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pvc_shelter;

-- -----------------------------------------------------------------------------
-- Usuarios. El nombre es único sin distinguir mayúsculas (collation *_ci).
-- La contraseña se guarda SOLO como hash (password_hash de PHP, bcrypt).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username       VARCHAR(24)  NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at  DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Partidas guardadas: una por usuario, en JSON (grid, habitantes, inventario,
-- temporizadores...). `version` permite el bloqueo optimista: un guardado solo
-- se acepta si parte de la última versión (evita que una pestaña vieja pise
-- una partida más nueva).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saves (
  user_id     INT UNSIGNED NOT NULL,
  data        JSON         NOT NULL,
  version     INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_saves_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Intentos de autenticación para limitar la fuerza bruta (login) y el abuso
-- de registros. La IP se guarda en binario (IPv4 o IPv6, 16 bytes máx.).
-- El backend borra solo las filas de más de 1 día.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_attempts (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  action        ENUM('login', 'register') NOT NULL,
  ip            VARBINARY(16) NOT NULL,
  username      VARCHAR(24)   NULL,
  attempted_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attempts_ip (action, ip, attempted_at),
  KEY idx_attempts_user (action, username, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Usuario de la aplicación (solo conexiones desde localhost).
-- Mínimo privilegio: puede leer y escribir datos, pero NO crear, borrar ni
-- modificar tablas (sin DROP/ALTER/CREATE/GRANT).
--
-- 1. Reemplaza PON_AQUI_TU_USUARIO y PON_AQUI_TU_PASSWORD (usa una contraseña
--    larga y aleatoria).
-- 2. Descomenta las tres líneas y ejecútalas como administrador.
-- -----------------------------------------------------------------------------
-- CREATE USER IF NOT EXISTS 'PON_AQUI_TU_USUARIO'@'localhost' IDENTIFIED BY 'PON_AQUI_TU_PASSWORD';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON pvc_shelter.* TO 'PON_AQUI_TU_USUARIO'@'localhost';
-- FLUSH PRIVILEGES;
