<?php

declare(strict_types=1);

namespace PvcShelter;

use RuntimeException;

/** Error con código HTTP y mensaje SEGURO para mostrar al cliente. */
final class HttpException extends RuntimeException
{
    /** @param array<string, mixed> $extra Datos adicionales seguros (p. ej. la versión actual en un 409). */
    public function __construct(public int $status, string $message, public array $extra = [])
    {
        parent::__construct($message, $status);
    }
}
