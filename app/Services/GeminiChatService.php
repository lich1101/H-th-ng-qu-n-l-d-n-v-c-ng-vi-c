<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

class GeminiChatService
{
    private const INLINE_IMAGE_MAX_BYTES = 8000000;

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
            $parts = [];

            $text = trim((string) ($item['content'] ?? ''));
            if ($text !== '') {
                $parts[] = ['text' => $text];
            }

            $attachment = $item['attachment'] ?? null;
            if (is_array($attachment) && ! empty($attachment)) {
                $attachmentPart = $this->buildAttachmentPart($trimmedKey, $attachment);
                if (! ($attachmentPart['ok'] ?? false)) {
                    return [
                        'ok' => false,
                        'error' => (string) ($attachmentPart['error'] ?? 'attachment_failed'),
                        'message' => (string) ($attachmentPart['message'] ?? 'Không đọc được tệp đính kèm.'),
                        'status' => $attachmentPart['status'] ?? null,
                        'raw' => $attachmentPart['raw'] ?? null,
                    ];
                }
                if (is_array($attachmentPart['part'] ?? null)) {
                    $parts[] = $attachmentPart['part'];
                }
            }

            if (empty($parts)) {
                continue;
            }

            $contents[] = [
                'role' => $role === 'assistant' ? 'model' : 'user',
                'parts' => $parts,
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

    private function buildAttachmentPart(string $apiKey, array $attachment): array
    {
        $path = trim((string) ($attachment['path'] ?? ''));
        if ($path === '' || ! is_file($path)) {
            return [
                'ok' => false,
                'error' => 'attachment_not_found',
                'message' => 'Không tìm thấy file đính kèm để gửi cho Gemini.',
            ];
        }

        $mimeType = trim((string) ($attachment['mime'] ?? ''));
        if ($mimeType === '') {
            $mimeType = 'application/octet-stream';
        }
        $displayName = trim((string) ($attachment['name'] ?? basename($path)));
        if ($displayName === '') {
            $displayName = 'attachment';
        }

        $bytes = @file_get_contents($path);
        if ($bytes === false) {
            return [
                'ok' => false,
                'error' => 'attachment_read_failed',
                'message' => 'Không đọc được nội dung file đính kèm.',
            ];
        }

        if ($this->isInlineImageMime($mimeType) && strlen($bytes) <= self::INLINE_IMAGE_MAX_BYTES) {
            return [
                'ok' => true,
                'part' => [
                    'inline_data' => [
                        'mime_type' => $mimeType,
                        'data' => base64_encode($bytes),
                    ],
                ],
            ];
        }

        $upload = $this->uploadFileToGemini($apiKey, $mimeType, $displayName, $bytes);
        if (! ($upload['ok'] ?? false)) {
            return $upload;
        }

        return [
            'ok' => true,
            'part' => [
                'file_data' => [
                    'mime_type' => (string) ($upload['mime_type'] ?? $mimeType),
                    'file_uri' => (string) ($upload['uri'] ?? ''),
                ],
            ],
        ];
    }

    private function uploadFileToGemini(
        string $apiKey,
        string $mimeType,
        string $displayName,
        string $bytes
    ): array {
        $startUrl = sprintf(
            'https://generativelanguage.googleapis.com/upload/v1beta/files?key=%s',
            urlencode($apiKey)
        );

        $startResponse = Http::timeout(60)
            ->acceptJson()
            ->withHeaders([
                'X-Goog-Upload-Protocol' => 'resumable',
                'X-Goog-Upload-Command' => 'start',
                'X-Goog-Upload-Header-Content-Length' => (string) strlen($bytes),
                'X-Goog-Upload-Header-Content-Type' => $mimeType,
            ])
            ->post($startUrl, [
                'file' => [
                    'display_name' => $displayName,
                ],
            ]);

        $startJson = $startResponse->json();
        if (! $startResponse->successful()) {
            $errorMessage = data_get($startJson, 'error.message', $startResponse->body());
            return [
                'ok' => false,
                'error' => data_get($startJson, 'error.status', 'gemini_file_start_failed'),
                'message' => (string) $errorMessage,
                'status' => $startResponse->status(),
                'raw' => is_array($startJson) ? $startJson : ['body' => $startResponse->body()],
            ];
        }

        $uploadUrl = trim((string) (
            $startResponse->header('X-Goog-Upload-URL')
            ?? $startResponse->header('x-goog-upload-url')
            ?? data_get($startJson, 'uploadUrl', '')
        ));
        if ($uploadUrl === '') {
            return [
                'ok' => false,
                'error' => 'gemini_file_upload_url_missing',
                'message' => 'Không lấy được upload URL từ Gemini Files API.',
                'status' => $startResponse->status(),
                'raw' => is_array($startJson) ? $startJson : null,
            ];
        }

        $uploadResponse = Http::timeout(180)
            ->acceptJson()
            ->withHeaders([
                'X-Goog-Upload-Offset' => '0',
                'X-Goog-Upload-Command' => 'upload, finalize',
            ])
            ->withBody($bytes, $mimeType)
            ->post($uploadUrl);

        $uploadJson = $uploadResponse->json();
        if (! $uploadResponse->successful()) {
            $errorMessage = data_get($uploadJson, 'error.message', $uploadResponse->body());
            return [
                'ok' => false,
                'error' => data_get($uploadJson, 'error.status', 'gemini_file_upload_failed'),
                'message' => (string) $errorMessage,
                'status' => $uploadResponse->status(),
                'raw' => is_array($uploadJson) ? $uploadJson : ['body' => $uploadResponse->body()],
            ];
        }

        $uri = trim((string) (
            data_get($uploadJson, 'file.uri')
            ?? data_get($uploadJson, 'file.fileUri')
            ?? ''
        ));
        if ($uri === '') {
            return [
                'ok' => false,
                'error' => 'gemini_file_uri_missing',
                'message' => 'Gemini chưa trả về file URI sau khi upload.',
                'status' => $uploadResponse->status(),
                'raw' => is_array($uploadJson) ? $uploadJson : null,
            ];
        }

        return [
            'ok' => true,
            'uri' => $uri,
            'mime_type' => (string) (
                data_get($uploadJson, 'file.mimeType')
                ?? data_get($uploadJson, 'file.mime_type')
                ?? $mimeType
            ),
            'raw' => is_array($uploadJson) ? $uploadJson : null,
        ];
    }

    private function isInlineImageMime(string $mimeType): bool
    {
        return str_starts_with(strtolower(trim($mimeType)), 'image/');
    }
}
