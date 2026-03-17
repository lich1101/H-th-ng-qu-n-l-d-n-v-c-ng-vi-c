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
        return (bool) $this->getMessagingAccessToken();
    }

    public function pushTaskMessage(int $taskId, int $messageId, array $payload): bool
    {
        if (! $this->databaseEnabled()) {
            return false;
        }
        $token = $this->getDatabaseAccessToken();
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
        $token = $this->getDatabaseAccessToken();
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

        $accessToken = $this->getMessagingAccessToken();
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

            if ($this->responseOk($response)) {
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
                    'http_code' => $this->responseStatus($response),
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
        $code = $this->responseStatus($response);

        $json = $this->responseJson($response);
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
            $message = trim($this->responseBody($response));
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
        return $this->getMessagingAccessToken();
    }

    private function getMessagingAccessToken(): ?string
    {
        return $this->getScopedAccessToken(
            [
                'https://www.googleapis.com/auth/firebase.messaging',
                'https://www.googleapis.com/auth/firebase.database',
                'https://www.googleapis.com/auth/userinfo.email',
            ],
            'firebase_access_token_messaging'
        );
    }

    private function getDatabaseAccessToken(): ?string
    {
        return $this->getScopedAccessToken(
            [
                'https://www.googleapis.com/auth/firebase.database',
                'https://www.googleapis.com/auth/userinfo.email',
            ],
            'firebase_access_token_database'
        );
    }

    private function getScopedAccessToken(array $scopes, string $cacheKey): ?string
    {
        $cached = Cache::get($cacheKey);
        if (is_string($cached) && $cached !== '') {
            return trim($cached);
        }

        $jwt = $this->makeJwt($scopes);
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
            $token = trim($token);
            Cache::put($cacheKey, $token, 3500);
            return $token;
        }

        return null;
    }

    private function sendFcmRequest(string $url, array $payload, string &$accessToken)
    {
        $accessToken = trim($accessToken);
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($body === false) {
            $body = '{}';
        }

        $response = $this->performFcmHttpRequest($url, $body, $accessToken);

        if ($this->responseStatus($response) === 401) {
            $binaryResponse = $this->performFcmBinaryCurlRequest($url, $body, $accessToken);
            if ($binaryResponse !== null && $this->responseStatus($binaryResponse) !== 401) {
                return $binaryResponse;
            }
        }

        if ($this->responseStatus($response) !== 401) {
            return $response;
        }

        // Access token may be stale/revoked in cache; refresh once and retry.
        Cache::forget('firebase_access_token_messaging');
        $freshToken = $this->getMessagingAccessToken();
        if (! is_string($freshToken) || $freshToken === '') {
            return $response;
        }

        $accessToken = trim($freshToken);
        $retryResponse = $this->performFcmHttpRequest($url, $body, $accessToken);
        if ($this->responseStatus($retryResponse) === 401) {
            $binaryRetryResponse = $this->performFcmBinaryCurlRequest($url, $body, $accessToken);
            if ($binaryRetryResponse !== null) {
                return $binaryRetryResponse;
            }
        }

        return $retryResponse;
    }

    private function performFcmHttpRequest(string $url, string $body, string $accessToken)
    {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            $curlOptions = [
                CURLOPT_POST => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 10,
                CURLOPT_CONNECTTIMEOUT => 5,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_USERAGENT => 'curl/8.0.1',
                CURLOPT_HTTPHEADER => [
                    'Authorization: Bearer '.$accessToken,
                    'Accept: application/json',
                    'Content-Type: application/json; charset=UTF-8',
                    'Expect:',
                ],
                CURLOPT_POSTFIELDS => $body,
            ];

            if (defined('CURL_HTTP_VERSION_2TLS')) {
                $curlOptions[CURLOPT_HTTP_VERSION] = CURL_HTTP_VERSION_2TLS;
            }

            curl_setopt_array($ch, $curlOptions);

            $rawBody = curl_exec($ch);
            $curlError = curl_error($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            curl_close($ch);

            if ($rawBody === false) {
                $rawBody = '';
            }

            return [
                'status' => $status,
                'body' => $curlError !== '' && $rawBody === '' ? $curlError : (string) $rawBody,
                'json' => json_decode((string) $rawBody, true),
            ];
        }

        return Http::timeout(10)
            ->withHeaders([
                'Authorization' => 'Bearer '.$accessToken,
                'Accept' => 'application/json',
                'Content-Type' => 'application/json; charset=UTF-8',
            ])
            ->withOptions([
                'connect_timeout' => 5,
            ])
            ->withBody($body, 'application/json; charset=UTF-8')
            ->post($url);
    }

    private function performFcmBinaryCurlRequest(string $url, string $body, string $accessToken): ?array
    {
        $curlBinary = $this->findCurlBinaryPath();
        if ($curlBinary === null || ! function_exists('proc_open')) {
            return null;
        }

        $disabledFunctions = array_map('trim', explode(',', (string) ini_get('disable_functions')));
        if (in_array('proc_open', $disabledFunctions, true)) {
            return null;
        }

        $command = [
            $curlBinary,
            '--silent',
            '--show-error',
            '--max-time',
            '10',
            '--connect-timeout',
            '5',
            '--http2',
            '-X',
            'POST',
            $url,
            '-H',
            'Authorization: Bearer '.$accessToken,
            '-H',
            'Accept: application/json',
            '-H',
            'Content-Type: application/json; charset=UTF-8',
            '--data-binary',
            $body,
            '--write-out',
            "\n__HTTP_STATUS__:%{http_code}",
        ];

        $descriptors = [
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];

        $process = @proc_open($command, $descriptors, $pipes, null, null, ['bypass_shell' => true]);
        if (! is_resource($process)) {
            return null;
        }

        $stdout = stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[2]);
        proc_close($process);

        $status = 0;
        $rawBody = (string) $stdout;
        if (preg_match('/__HTTP_STATUS__:(\d+)\s*$/', $rawBody, $matches) === 1) {
            $status = (int) $matches[1];
            $rawBody = preg_replace('/\n__HTTP_STATUS__:\d+\s*$/', '', $rawBody) ?? $rawBody;
        }

        $rawBody = trim($rawBody);
        if ($rawBody === '' && trim((string) $stderr) !== '') {
            $rawBody = trim((string) $stderr);
        }

        return [
            'status' => $status,
            'body' => $rawBody,
            'json' => json_decode($rawBody, true),
        ];
    }

    private function findCurlBinaryPath(): ?string
    {
        foreach (['/usr/bin/curl', '/bin/curl'] as $path) {
            if (is_file($path) && is_executable($path)) {
                return $path;
            }
        }

        return null;
    }

    private function responseStatus($response): int
    {
        if (is_array($response)) {
            return (int) ($response['status'] ?? 0);
        }

        return (int) $response->status();
    }

    private function responseOk($response): bool
    {
        $status = $this->responseStatus($response);
        return $status >= 200 && $status < 300;
    }

    private function responseJson($response): ?array
    {
        if (is_array($response)) {
            return is_array($response['json'] ?? null) ? $response['json'] : null;
        }

        $json = $response->json();
        return is_array($json) ? $json : null;
    }

    private function responseBody($response): string
    {
        if (is_array($response)) {
            return (string) ($response['body'] ?? '');
        }

        return (string) $response->body();
    }

    private function safeLogWarning(string $message, array $context = []): void
    {
        try {
            Log::warning($message, $context);
        } catch (\Throwable $e) {
            // Ignore log-write failures so push flow can continue.
        }
    }

    private function makeJwt(array $scopes): ?string
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
            'scope' => implode(' ', $scopes),
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
