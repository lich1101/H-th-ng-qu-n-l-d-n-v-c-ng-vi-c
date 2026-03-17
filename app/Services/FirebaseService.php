<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

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
            return [
                'sent' => 0,
                'failed' => count($tokens),
                'failed_tokens' => [],
                'temporary_failed_tokens' => $tokens,
                'errors' => [],
                'error' => 'firebase_disabled',
            ];
        }
        $tokens = array_values(array_filter(array_unique($tokens)));
        if (empty($tokens)) {
            return [
                'sent' => 0,
                'failed' => 0,
                'failed_tokens' => [],
                'temporary_failed_tokens' => [],
                'errors' => [],
                'error' => 'no_device_tokens',
            ];
        }

        $accessToken = $this->getAccessToken();
        if (! $accessToken) {
            return [
                'sent' => 0,
                'failed' => count($tokens),
                'failed_tokens' => [],
                'temporary_failed_tokens' => $tokens,
                'errors' => [],
                'error' => 'firebase_access_token_unavailable',
            ];
        }

        $projectId = (string) config('firebase.project_id');
        $url = "https://fcm.googleapis.com/v1/projects/{$projectId}/messages:send";
        $sent = 0;
        $invalidTokens = [];
        $temporaryFailedTokens = [];
        $errors = [];
        $channelId = trim((string) config('firebase.push_channel_id', 'crm_default'));
        if ($channelId === '') {
            $channelId = 'crm_default';
        }

        $stringData = [];
        foreach ($data as $key => $value) {
            if (is_scalar($value)) {
                $stringData[(string) $key] = (string) $value;
                continue;
            }

            $encoded = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $stringData[(string) $key] = $encoded === false ? '' : $encoded;
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
                    'android' => [
                        'priority' => 'HIGH',
                        'notification' => [
                            'channel_id' => $channelId,
                            'notification_priority' => 'PRIORITY_HIGH',
                            'sound' => 'default',
                            'default_sound' => true,
                        ],
                    ],
                    'apns' => [
                        'headers' => [
                            'apns-priority' => '10',
                        ],
                        'payload' => [
                            'aps' => [
                                'sound' => 'default',
                            ],
                        ],
                    ],
                    'webpush' => [
                        'headers' => [
                            'Urgency' => 'high',
                        ],
                    ],
                ],
            ];

            $response = $this->sendFcmRequest($url, $payload, $accessToken);

            if ($response->ok()) {
                $sent++;
            } else {
                $error = $this->extractFcmError($response);
                $errors[$token] = $error;
                if ($this->isInvalidTokenError($error)) {
                    $invalidTokens[] = $token;
                } else {
                    $temporaryFailedTokens[] = $token;
                }
                $this->safeLogWarning('FCM push token failed', [
                    'token_suffix' => substr($token, -12),
                    'status' => $error['status'] ?? null,
                    'message' => $error['message'] ?? null,
                    'http_code' => $response->status(),
                ]);
            }
        }

        $failed = count($invalidTokens) + count($temporaryFailedTokens);

        return [
            'sent' => $sent,
            'failed' => $failed,
            'failed_tokens' => $invalidTokens,
            'temporary_failed_tokens' => $temporaryFailedTokens,
            'errors' => $errors,
            'error' => $failed > 0 ? 'push_failed' : null,
        ];
    }

    private function extractFcmError($response): array
    {
        $status = '';
        $message = '';
        $code = $response->status();

        $json = $response->json();
        if (is_array($json)) {
            $error = $json['error'] ?? null;
            if (is_array($error)) {
                $status = (string) ($error['status'] ?? '');
                $message = trim((string) ($error['message'] ?? ''));
                if (isset($error['code']) && is_numeric($error['code'])) {
                    $code = (int) $error['code'];
                }
            }
        }

        if ($message === '') {
            $message = trim((string) $response->body());
        }
        if ($message === '') {
            $message = 'FCM request failed';
        }

        return [
            'code' => $code,
            'status' => $status,
            'message' => substr($message, 0, 300),
        ];
    }

    private function isInvalidTokenError(array $error): bool
    {
        $status = strtoupper(trim((string) ($error['status'] ?? '')));
        $message = strtolower((string) ($error['message'] ?? ''));

        if (in_array($status, ['UNREGISTERED', 'INVALID_ARGUMENT'], true)) {
            return true;
        }

        return str_contains($message, 'invalid registration token')
            || str_contains($message, 'not a valid fcm registration token')
            || str_contains($message, 'requested entity was not found');
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

    private function sendFcmRequest(string $url, array $payload, string &$accessToken)
    {
        $response = Http::timeout(10)
            ->withToken($accessToken)
            ->post($url, $payload);

        if ($response->status() !== 401) {
            return $response;
        }

        // Access token may be stale/revoked in cache; refresh once and retry.
        Cache::forget('firebase_access_token');
        $freshToken = $this->getAccessToken();
        if (! is_string($freshToken) || $freshToken === '') {
            return $response;
        }

        $accessToken = $freshToken;
        return Http::timeout(10)
            ->withToken($accessToken)
            ->post($url, $payload);
    }

    private function safeLogWarning(string $message, array $context = []): void
    {
        try {
            Log::warning($message, $context);
        } catch (\Throwable $e) {
            // Ignore log-write failures so push flow can continue.
        }
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
