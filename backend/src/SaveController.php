<?php

declare(strict_types=1);

namespace PvcShelter;

use JsonException;
use PDO;
use PDOException;

/**
 * Guardado en la nube: una partida JSON por usuario con bloqueo optimista.
 *
 * El cliente envía la versión sobre la que trabaja; si en la base hay otra
 * más nueva (otra pestaña u otro dispositivo), se responde 409 y no se pisa.
 */
final class SaveController
{
    public function __construct(private PDO $db)
    {
    }

    /** GET /api/save */
    public function load(): void
    {
        $userId = Session::requireUser();
        $stmt = $this->db->prepare(
            'SELECT data, version, UNIX_TIMESTAMP(updated_at) AS saved_at, UNIX_TIMESTAMP(UTC_TIMESTAMP()) AS server_now
             FROM saves WHERE user_id = :id LIMIT 1',
        );
        $stmt->execute([':id' => $userId]);
        $row = $stmt->fetch();
        if (!is_array($row)) {
            Http::json(200, ['save' => null, 'serverNow' => time()]);
            return;
        }
        try {
            $data = json_decode((string) $row['data'], true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new HttpException(500, 'La partida guardada está dañada.');
        }
        Http::json(200, [
            'save' => ['data' => $data, 'version' => (int) $row['version'], 'savedAt' => (int) $row['saved_at']],
            'serverNow' => (int) $row['server_now'],
        ]);
    }

    /** PUT /api/save — cuerpo: { "data": {...}, "version": number|null } */
    public function store(): void
    {
        $userId = Session::requireUser();
        Session::requireCsrf();
        $maxBytes = Env::int('MAX_SAVE_BYTES', 2 * 1024 * 1024);
        $body = Http::jsonBody($maxBytes + 1024);

        $data = $body['data'] ?? null;
        if (!is_array($data) || !is_int($data['schema'] ?? null) || !is_array($data['game'] ?? null)) {
            throw new HttpException(422, 'Formato de partida inválido.');
        }
        $version = $body['version'] ?? null;
        if ($version !== null && (!is_int($version) || $version < 1)) {
            throw new HttpException(422, 'Versión inválida.');
        }
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        if (strlen($json) > $maxBytes) {
            throw new HttpException(413, 'La partida es demasiado grande.');
        }

        if ($version === null) {
            // Primera vez: solo se inserta si no existía (si existe, el cliente está desfasado).
            try {
                $stmt = $this->db->prepare('INSERT INTO saves (user_id, data, version, updated_at) VALUES (:id, :data, 1, UTC_TIMESTAMP())');
                $stmt->execute([':id' => $userId, ':data' => $json]);
            } catch (PDOException $e) {
                if ($e->getCode() === '23000') {
                    throw new HttpException(409, 'Ya hay una partida guardada más reciente.', ['version' => $this->currentVersion($userId)]);
                }
                throw $e;
            }
            $newVersion = 1;
        } else {
            $stmt = $this->db->prepare(
                'UPDATE saves SET data = :data, version = version + 1, updated_at = UTC_TIMESTAMP()
                 WHERE user_id = :id AND version = :version',
            );
            $stmt->execute([':data' => $json, ':id' => $userId, ':version' => $version]);
            if ($stmt->rowCount() === 0) {
                throw new HttpException(409, 'La partida se guardó desde otra pestaña o dispositivo.', ['version' => $this->currentVersion($userId)]);
            }
            $newVersion = $version + 1;
        }
        Http::json(200, ['version' => $newVersion, 'savedAt' => time()]);
    }

    private function currentVersion(int $userId): ?int
    {
        $stmt = $this->db->prepare('SELECT version FROM saves WHERE user_id = :id LIMIT 1');
        $stmt->execute([':id' => $userId]);
        $version = $stmt->fetchColumn();
        return $version === false ? null : (int) $version;
    }
}
