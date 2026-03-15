<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class FirebaseService
{
    public function enabled(): bool
    {
        if (! config('firebase.enabled')) {
            return false;
        }
        return (string) config('firebase.project_id') !== ''
            && (string) config('firebase.client_email') !== ''
            && (string) config('firebase.private_key') !== '';
    }

    public function databaseEnabled(): bool
    {
        return $this->enabled() && (string) config('firebase.database_url') !== '';
    }

    public function accessTokenAvailable(): bool
    {
        return (bool) $this->getAccessToken();
    }

    public function pushTaskMessage(int $taskId, int $messageId, array $payload): bool
    {
        if (! $this->databaseEnabled()) {
            return false;
        }
        $token = $this->getAccessToken();
        if (! $token) {
            return false;
        }
        $url = rtrim((string) config('firebase.database_url'), '/')
            ."/task_chats/{$taskId}/messages/{$messageId}.json";

        $response = Http::timeout(10)
            ->withOptions(['query' => ['access_token' => $token]])
            ->put($url, array_merge($payload, [
                'id' => $messageId,
            ]));

        return $response->ok();
    }

    public function deleteTaskMessage(int $taskId, int $messageId): bool
    {
        if (! $this->databaseEnabled()) {
            return false;
        }
        $token = $this->getAccessToken();
        if (! $token) {
            return false;
        }
        $url = rtrim((string) config('firebase.database_url'), '/')
            ."/task_chats/{$taskId}/messages/{$messageId}.json";

        $response = Http::timeout(10)
            ->withOptions(['query' => ['access_token' => $token]])
            ->delete($url);

        return $response->ok();
    }

    public function sendPush(array $tokens, string $title, string $body, array $data = []): array
    {
        if (! $this->enabled()) {
            return ['sent' => 0, 'failed' => count($tokens), 'failed_tokens' => $tokens];
        }
        $tokens = array_values(array_filter(array_unique($tokens)));
        if (empty($tokens)) {
            return ['sent' => 0, 'failed' => 0, 'failed_tokens' => []];
        }

        $accessToken = $this->getAccessToken();
        if (! $accessToken) {
            return ['sent' => 0, 'failed' => count($tokens), 'failed_tokens' => $tokens];
        }

        $projectId = (string) config('firebase.project_id');
        $url = "https://fcm.googleapis.com/v1/projects/{$projectId}/messages:send";
        $sent = 0;
        $failedTokens = [];

        $stringData = [];
        foreach ($data as $key => $value) {
            $stringData[(string) $key] = is_scalar($value) ? (string) $value : json_encode($value);
        }

        foreach ($tokens as $token) {
            $payload = [
                'message' => [
                    'token' => $token,
                    'notification' => [
                        'title' => $title,
                        'body' => $body,
                    ],
                    'data' => $stringData,
                ],
            ];

            $response = Http::timeout(10)
                ->withToken($accessToken)
                ->post($url, $payload);

            if ($response->ok()) {
                $sent++;
            } else {
                $failedTokens[] = $token;
            }
        }

        return [
            'sent' => $sent,
            'failed' => count($failedTokens),
            'failed_tokens' => $failedTokens,
        ];
    }

    public function createCustomToken(string $uid, array $claims = []): ?string
    {
        if (! $this->enabled()) {
            return null;
        }

        $clientEmail = (string) config('firebase.client_email');
        $privateKey = (string) config('firebase.private_key');
        if ($clientEmail === '' || $privateKey === '') {
            return null;
        }

        $privateKey = str_replace("\\n", "\n", $privateKey);
        $now = time();
        $payload = [
            'iss' => $clientEmail,
            'sub' => $clientEmail,
            'aud' => 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
            'iat' => $now,
            'exp' => $now + 3600,
            'uid' => $uid,
        ];
        if (! empty($claims)) {
            $payload['claims'] = $claims;
        }

        $header = $this->base64UrlEncode(json_encode([
            'alg' => 'RS256',
            'typ' => 'JWT',
        ]));
        $body = $this->base64UrlEncode(json_encode($payload));
        $unsigned = $header.'.'.$body;
        $signature = '';
        $ok = openssl_sign($unsigned, $signature, $privateKey, 'sha256');
        if (! $ok) {
            return null;
        }
        return $unsigned.'.'.$this->base64UrlEncode($signature);
    }

    private function getAccessToken(): ?string
    {
        $cached = Cache::get('firebase_access_token');
        if (is_string($cached) && $cached !== '') {
            return $cached;
        }

        $jwt = $this->makeJwt();
        if (! $jwt) {
            return null;
        }

        $response = Http::asForm()->timeout(10)->post('https://oauth2.googleapis.com/token', [
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $jwt,
        ]);

        if (! $response->ok()) {
            return null;
        }

        $data = $response->json();
        $token = is_array($data) ? ($data['access_token'] ?? null) : null;
        if (is_string($token) && $token !== '') {
            Cache::put('firebase_access_token', $token, 3500);
            return $token;
        }

        return null;
    }

    private function makeJwt(): ?string
    {
        $clientEmail = (string) config('firebase.client_email');
        $privateKey = (string) config('firebase.private_key');
        if ($clientEmail === '' || $privateKey === '') {
            return null;
        }

        $privateKey = str_replace("\\n", "\n", $privateKey);
        $now = time();
        $header = $this->base64UrlEncode(json_encode([
            'alg' => 'RS256',
            'typ' => 'JWT',
        ]));
        $claims = $this->base64UrlEncode(json_encode([
            'iss' => $clientEmail,
            'scope' => implode(' ', [
                'https://www.googleapis.com/auth/firebase.messaging',
                'https://www.googleapis.com/auth/firebase.database',
                'https://www.googleapis.com/auth/userinfo.email',
            ]),
            'aud' => 'https://oauth2.googleapis.com/token',
            'iat' => $now,
            'exp' => $now + 3600,
        ]));

        $unsigned = $header.'.'.$claims;
        $signature = '';
        $ok = openssl_sign($unsigned, $signature, $privateKey, 'sha256');
        if (! $ok) {
            return null;
        }

        return $unsigned.'.'.$this->base64UrlEncode($signature);
    }

    private function base64UrlEncode(string $input): string
    {
        return rtrim(strtr(base64_encode($input), '+/', '-_'), '=');
    }
}
