<?php

declare(strict_types=1);

namespace PvcShelter;

/** Validación estricta de los datos de cuenta. */
final class Validator
{
    /** Letras, números y guion bajo; de 3 a 24 caracteres. */
    public static function username(mixed $value): string
    {
        if (!is_string($value) || !preg_match('/^[A-Za-z0-9_]{3,24}$/', $value)) {
            throw new HttpException(422, 'El usuario debe tener de 3 a 24 caracteres: letras, números o guion bajo.');
        }
        return $value;
    }

    /**
     * De 8 a 72 bytes (bcrypt ignora lo que pasa de 72, así que se rechaza en
     * lugar de truncar en silencio) y distinta del nombre de usuario.
     */
    public static function password(mixed $value, string $username): string
    {
        if (!is_string($value) || strlen($value) < 8 || strlen($value) > 72) {
            throw new HttpException(422, 'La contraseña debe tener entre 8 y 72 caracteres.');
        }
        if (strcasecmp($value, $username) === 0) {
            throw new HttpException(422, 'La contraseña no puede ser igual al usuario.');
        }
        return $value;
    }
}
