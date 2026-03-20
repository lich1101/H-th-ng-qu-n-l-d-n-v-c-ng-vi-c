<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

class GeminiChatService
{
    public function listModels(string $apiKey): array
    {
        $trimmedKey = trim($apiKey);
        if ($trimmedKey === '') {
            return [
                'ok' => false,
                'error' => 'missing_api_key',
                'message' => 'Thiếu Gemini API key.',
            ];
        }

        $models = [];
        $nextPageToken = null;

        for ($page = 0; $page < 5; $page++) {
            $url = sprintf(
                'https://generativelanguage.googleapis.com/v1beta/models?key=%s%s',
                urlencode($trimmedKey),
                $nextPageToken ? '&pageToken='.urlencode($nextPageToken) : ''
            );

            $response = Http::timeout(30)->acceptJson()->get($url);
            $json = $response->json();

            if (! $response->successful()) {
                $errorMessage = data_get($json, 'error.message', $response->body());
                return [
                    'ok' => false,
                    'error' => data_get($json, 'error.status', 'gemini_request_failed'),
                    'message' => (string) $errorMessage,
                    'status' => $response->status(),
                    'raw' => is_array($json) ? $json : ['body' => $response->body()],
                ];
            }

            $rows = data_get($json, 'models', []);
            if (is_array($rows)) {
                foreach ($rows as $row) {
                    $name = (string) data_get($row, 'name', '');
                    if ($name === '') {
                        continue;
                    }

                    $supported = data_get($row, 'supportedGenerationMethods', []);
                    $supportsGenerate = is_array($supported)
                        ? in_array('generateContent', $supported, true)
                        : false;

                    if (! $supportsGenerate) {
                        continue;
                    }

                    $normalized = str_starts_with($name, 'models/')
                        ? substr($name, 7)
                        : $name;

                    $models[$normalized] = [
                        'id' => $normalized,
                        'name' => $normalized,
                        'display_name' => (string) data_get($row, 'displayName', $normalized),
                        'description' => (string) data_get($row, 'description', ''),
                        'version' => (string) data_get($row, 'version', ''),
                        'input_token_limit' => data_get($row, 'inputTokenLimit'),
                        'output_token_limit' => data_get($row, 'outputTokenLimit'),
                    ];
                }
            }

            $nextPageToken = (string) data_get($json, 'nextPageToken', '');
            if ($nextPageToken === '') {
                break;
            }
        }

        $list = array_values($models);
        usort($list, function (array $a, array $b): int {
            return strnatcasecmp((string) ($a['name'] ?? ''), (string) ($b['name'] ?? ''));
        });

        return [
            'ok' => true,
            'models' => $list,
        ];
    }

    public function generateReply(
        string $apiKey,
        string $model,
        string $systemMessageMarkdown,
        array $conversation
    ): array {
        $trimmedKey = trim($apiKey);
        $trimmedModel = trim($model);

        if ($trimmedKey === '') {
            return [
                'ok' => false,
                'error' => 'missing_api_key',
                'message' => 'Thiếu Gemini API key.',
            ];
        }

        if ($trimmedModel === '') {
            return [
                'ok' => false,
                'error' => 'missing_model',
                'message' => 'Thiếu tên model Gemini.',
            ];
        }

        $contents = [];
        foreach ($conversation as $item) {
            $role = strtolower((string) ($item['role'] ?? ''));
            $text = trim((string) ($item['content'] ?? ''));
            if ($text === '') {
                continue;
            }

            $contents[] = [
                'role' => $role === 'assistant' ? 'model' : 'user',
                'parts' => [
                    ['text' => $text],
                ],
            ];
        }

        if (empty($contents)) {
            return [
                'ok' => false,
                'error' => 'empty_conversation',
                'message' => 'Không có nội dung hội thoại để gửi Gemini.',
            ];
        }

        $payload = [
            'contents' => $contents,
            'generationConfig' => [
                'temperature' => 0.2,
            ],
        ];

        $systemMessage = trim($systemMessageMarkdown);
        if ($systemMessage !== '') {
            $payload['systemInstruction'] = [
                'role' => 'system',
                'parts' => [
                    ['text' => $systemMessage],
                ],
            ];
        }

        $url = sprintf(
            'https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s',
            rawurlencode($trimmedModel),
            urlencode($trimmedKey)
        );

        $response = Http::timeout(120)->post($url, $payload);
        $json = $response->json();

        if (! $response->successful()) {
            $errorMessage = data_get($json, 'error.message', $response->body());
            return [
                'ok' => false,
                'error' => data_get($json, 'error.status', 'gemini_request_failed'),
                'message' => (string) $errorMessage,
                'status' => $response->status(),
                'raw' => is_array($json) ? $json : ['body' => $response->body()],
            ];
        }

        $parts = data_get($json, 'candidates.0.content.parts', []);
        $replyText = '';
        if (is_array($parts)) {
            $chunks = [];
            foreach ($parts as $part) {
                $line = trim((string) data_get($part, 'text', ''));
                if ($line !== '') {
                    $chunks[] = $line;
                }
            }
            $replyText = trim(implode("\n", $chunks));
        }

        if ($replyText === '') {
            return [
                'ok' => false,
                'error' => 'empty_reply',
                'message' => 'Gemini trả về rỗng.',
                'status' => $response->status(),
                'raw' => is_array($json) ? $json : ['body' => $response->body()],
            ];
        }

        return [
            'ok' => true,
            'text' => $replyText,
            'status' => $response->status(),
            'usage' => data_get($json, 'usageMetadata'),
            'raw' => is_array($json) ? $json : null,
        ];
    }
}
