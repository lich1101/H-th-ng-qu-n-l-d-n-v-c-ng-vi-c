<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

class GeminiChatService
{
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

