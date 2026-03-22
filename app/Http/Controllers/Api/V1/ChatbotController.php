<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\ChatbotBot;
use App\Models\ChatbotMessage;
use App\Models\ChatbotUserState;
use App\Services\GeminiChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ChatbotController extends Controller
{
    private const MAX_CHAT_SESSIONS_PER_USER = 10;

    /** @var GeminiChatService */
    private $geminiChatService;

    public function __construct(GeminiChatService $geminiChatService)
    {
        $this->geminiChatService = $geminiChatService;
    }

    public function bots(Request $request): JsonResponse
    {
        $setting = $this->resolveSettings();
        $this->ensureDefaultBot($setting, $request->user() ? $request->user()->id : null);

        return response()->json([
            'chatbot' => [
                'enabled' => (bool) ($setting->chatbot_enabled ?? false),
                'provider' => (string) ($setting->chatbot_provider ?? 'gemini'),
            ],
            'bots' => $this->botListPayload(false, false),
        ]);
    }

    public function manageBots(Request $request): JsonResponse
    {
        $this->assertAdministrator($request);

        $setting = $this->resolveSettings();
        $this->ensureDefaultBot($setting, $request->user() ? $request->user()->id : null);

        return response()->json([
            'bots' => $this->botListPayload(true, true),
        ]);
    }

    public function models(Request $request): JsonResponse
    {
        $this->assertAdministrator($request);

        $validated = $request->validate([
            'provider' => ['nullable', 'string', 'in:gemini'],
            'api_key' => ['required', 'string', 'max:4096'],
        ]);

        $provider = $validated['provider'] ?? 'gemini';
        if ($provider !== 'gemini') {
            return response()->json([
                'message' => 'Provider hiện tại chưa được hỗ trợ lấy model tự động.',
            ], 422);
        }

        $result = $this->geminiChatService->listModels((string) $validated['api_key']);
        if (! ($result['ok'] ?? false)) {
            return response()->json([
                'message' => (string) ($result['message'] ?? 'Không tải được danh sách model Gemini.'),
                'error' => (string) ($result['error'] ?? 'model_fetch_failed'),
                'status' => $result['status'] ?? null,
            ], 422);
        }

        return response()->json([
            'models' => $result['models'] ?? [],
        ]);
    }

    public function storeBot(Request $request): JsonResponse
    {
        $this->assertAdministrator($request);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:255'],
            'provider' => ['nullable', 'string', 'in:gemini'],
            'model' => ['required', 'string', 'max:120'],
            'api_key' => ['nullable', 'string', 'max:4096'],
            'system_message_markdown' => ['nullable', 'string', 'max:120000'],
            'history_pairs' => ['nullable', 'integer', 'min:1', 'max:40'],
            'accent_color' => ['nullable', 'regex:/^#([0-9A-Fa-f]{6})$/'],
            'icon' => ['nullable', 'string', 'max:32'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'is_active' => ['nullable', 'boolean'],
            'is_default' => ['nullable', 'boolean'],
            'avatar' => ['nullable', 'image', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
        ]);

        $user = $request->user();
        $avatarUrl = $request->hasFile('avatar')
            ? $this->storeChatbotAvatar($request->file('avatar'))
            : null;

        $bot = null;
        try {
            DB::transaction(function () use ($validated, $user, $avatarUrl, &$bot) {
                $hasAny = ChatbotBot::query()->exists();
                $isDefault = array_key_exists('is_default', $validated)
                    ? (bool) $validated['is_default']
                    : ! $hasAny;
                $isActive = array_key_exists('is_active', $validated)
                    ? (bool) $validated['is_active']
                    : true;

                if ($isDefault) {
                    $isActive = true;
                    ChatbotBot::query()->update(['is_default' => false]);
                }

                $bot = ChatbotBot::query()->create([
                    'name' => trim((string) $validated['name']),
                    'description' => $validated['description'] ?? null,
                    'provider' => $validated['provider'] ?? 'gemini',
                    'model' => trim((string) $validated['model']),
                    'api_key' => $this->nullableTrim($validated['api_key'] ?? null),
                    'system_message_markdown' => $validated['system_message_markdown'] ?? null,
                    'history_pairs' => array_key_exists('history_pairs', $validated) ? (int) $validated['history_pairs'] : 8,
                    'accent_color' => $validated['accent_color'] ?? '#6366F1',
                    'icon' => $this->nullableTrim($validated['icon'] ?? null),
                    'avatar_url' => $avatarUrl,
                    'sort_order' => array_key_exists('sort_order', $validated) ? (int) $validated['sort_order'] : 0,
                    'is_active' => $isActive,
                    'is_default' => $isDefault,
                    'created_by' => $user ? $user->id : null,
                    'updated_by' => $user ? $user->id : null,
                ]);

                $this->ensureOneDefaultBot();
            });
        } catch (\Throwable $e) {
            $this->deleteStoredPublicFile($avatarUrl);
            throw $e;
        }

        return response()->json([
            'message' => 'Đã tạo chatbot mới.',
            'bot' => $this->mapBot($bot, true),
            'bots' => $this->botListPayload(true, true),
        ]);
    }

    public function updateBot(Request $request, ChatbotBot $bot): JsonResponse
    {
        $this->assertAdministrator($request);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:255'],
            'provider' => ['nullable', 'string', 'in:gemini'],
            'model' => ['required', 'string', 'max:120'],
            'api_key' => ['nullable', 'string', 'max:4096'],
            'system_message_markdown' => ['nullable', 'string', 'max:120000'],
            'history_pairs' => ['nullable', 'integer', 'min:1', 'max:40'],
            'accent_color' => ['nullable', 'regex:/^#([0-9A-Fa-f]{6})$/'],
            'icon' => ['nullable', 'string', 'max:32'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'is_active' => ['nullable', 'boolean'],
            'is_default' => ['nullable', 'boolean'],
            'avatar' => ['nullable', 'image', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
            'remove_avatar' => ['nullable', 'boolean'],
        ]);

        $nextActive = array_key_exists('is_active', $validated)
            ? (bool) $validated['is_active']
            : (bool) $bot->is_active;
        $nextDefault = array_key_exists('is_default', $validated)
            ? (bool) $validated['is_default']
            : (bool) $bot->is_default;

        if ($nextDefault) {
            $nextActive = true;
        }

        if (! $nextActive && (bool) $bot->is_active) {
            $activeCount = (int) ChatbotBot::query()->where('is_active', true)->count();
            if ($activeCount <= 1) {
                return response()->json([
                    'message' => 'Cần giữ ít nhất 1 chatbot đang bật để người dùng có thể sử dụng.',
                ], 422);
            }
        }

        $user = $request->user();
        $removeAvatar = $request->boolean('remove_avatar', false);
        $newAvatarUrl = $request->hasFile('avatar')
            ? $this->storeChatbotAvatar($request->file('avatar'))
            : null;
        $oldAvatarUrl = null;
        try {
            DB::transaction(function () use (
                $validated,
                $bot,
                $nextActive,
                $nextDefault,
                $user,
                $removeAvatar,
                $newAvatarUrl,
                &$oldAvatarUrl
            ) {
                if ($nextDefault) {
                    ChatbotBot::query()->where('id', '!=', $bot->id)->update(['is_default' => false]);
                }

                $avatarUrl = $bot->avatar_url;
                if ($newAvatarUrl !== null) {
                    $oldAvatarUrl = $bot->avatar_url;
                    $avatarUrl = $newAvatarUrl;
                } elseif ($removeAvatar) {
                    $oldAvatarUrl = $bot->avatar_url;
                    $avatarUrl = null;
                }

                $bot->update([
                    'name' => trim((string) $validated['name']),
                    'description' => $validated['description'] ?? null,
                    'provider' => $validated['provider'] ?? 'gemini',
                    'model' => trim((string) $validated['model']),
                    'api_key' => array_key_exists('api_key', $validated)
                        ? $this->nullableTrim($validated['api_key'])
                        : $bot->api_key,
                    'system_message_markdown' => array_key_exists('system_message_markdown', $validated)
                        ? $validated['system_message_markdown']
                        : $bot->system_message_markdown,
                    'history_pairs' => array_key_exists('history_pairs', $validated)
                        ? (int) $validated['history_pairs']
                        : (int) $bot->history_pairs,
                    'accent_color' => array_key_exists('accent_color', $validated)
                        ? $validated['accent_color']
                        : $bot->accent_color,
                    'icon' => array_key_exists('icon', $validated)
                        ? $this->nullableTrim($validated['icon'])
                        : $bot->icon,
                    'avatar_url' => $avatarUrl,
                    'sort_order' => array_key_exists('sort_order', $validated)
                        ? (int) $validated['sort_order']
                        : (int) $bot->sort_order,
                    'is_active' => $nextActive,
                    'is_default' => $nextDefault,
                    'updated_by' => $user ? $user->id : null,
                ]);

                $this->ensureOneDefaultBot();
            });
        } catch (\Throwable $e) {
            if ($newAvatarUrl) {
                $this->deleteStoredPublicFile($newAvatarUrl);
            }
            throw $e;
        }
        $this->deleteStoredPublicFile($oldAvatarUrl);

        return response()->json([
            'message' => 'Đã cập nhật chatbot.',
            'bot' => $this->mapBot($bot->fresh(), true),
            'bots' => $this->botListPayload(true, true),
        ]);
    }

    public function destroyBot(Request $request, ChatbotBot $bot): JsonResponse
    {
        $this->assertAdministrator($request);

        $allCount = (int) ChatbotBot::query()->count();
        if ($allCount <= 1) {
            return response()->json([
                'message' => 'Phải giữ lại ít nhất 1 chatbot trong hệ thống.',
            ], 422);
        }

        $activeCount = (int) ChatbotBot::query()->where('is_active', true)->count();
        if ((bool) $bot->is_active && $activeCount <= 1) {
            return response()->json([
                'message' => 'Không thể xoá chatbot đang bật cuối cùng.',
            ], 422);
        }

        $avatarUrl = $bot->avatar_url;
        $attachmentPaths = ChatbotMessage::query()
            ->where('bot_id', $bot->id)
            ->whereNotNull('attachment_path')
            ->pluck('attachment_path')
            ->filter()
            ->unique()
            ->values();
        DB::transaction(function () use ($bot) {
            $bot->delete();
            $this->ensureOneDefaultBot();
        });
        $this->deleteStoredPublicFile($avatarUrl);
        foreach ($attachmentPaths as $path) {
            $this->deleteStoredPublicRelativePath((string) $path);
        }

        return response()->json([
            'message' => 'Đã xoá chatbot.',
            'bots' => $this->botListPayload(true, true),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $limit = max(40, min($this->requestInt($request, 'limit', 160), 400));
        $bot = $this->resolveSelectedBot($request);

        if ($bot) {
            $this->processQueue($user->id, (int) $bot->id, 1);
            $this->pruneUserChatHistory($user->id, (int) $bot->id);
        }

        return response()->json($this->conversationPayload($user->id, $bot, $limit));
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validate([
            'content' => ['nullable', 'string', 'max:12000'],
            'bot_id' => ['nullable', 'integer', 'min:1'],
            'attachment' => ['nullable', 'file', 'max:30720'],
        ]);

        $bot = $this->resolveSelectedBot($request, true);
        if (! $bot) {
            return response()->json([
                'message' => 'Không tìm thấy chatbot được chọn hoặc bot đang tắt.',
            ], 422);
        }

        $content = trim((string) ($validated['content'] ?? ''));
        $attachmentPayload = $request->hasFile('attachment')
            ? $this->storeChatbotAttachment($request->file('attachment'))
            : null;

        if ($content === '' && ! $attachmentPayload) {
            return response()->json([
                'message' => 'Cần nhập nội dung hoặc gửi kèm ít nhất 1 tệp/ảnh.',
            ], 422);
        }

        $message = null;
        try {
            DB::transaction(function () use ($user, $bot, $content, $attachmentPayload, &$message) {
                $state = $this->lockState($user->id, (int) $bot->id);
                if ($state->stop_requested && ! $state->is_processing) {
                    $state->stop_requested = false;
                    $state->save();
                }

                $message = ChatbotMessage::query()->create([
                    'user_id' => $user->id,
                    'bot_id' => $bot->id,
                    'role' => ChatbotMessage::ROLE_USER,
                    'status' => ChatbotMessage::STATUS_QUEUED,
                    'content' => $content,
                    'attachment_path' => $attachmentPayload['path'] ?? null,
                    'attachment_url' => $attachmentPayload['url'] ?? null,
                    'attachment_name' => $attachmentPayload['name'] ?? null,
                    'attachment_mime' => $attachmentPayload['mime'] ?? null,
                    'attachment_size' => $attachmentPayload['size'] ?? null,
                    'queued_at' => now(),
                ]);
            });
        } catch (\Throwable $e) {
            if (is_array($attachmentPayload)) {
                $this->deleteStoredPublicRelativePath($attachmentPayload['path'] ?? null);
            }
            throw $e;
        }
        $this->pruneUserChatHistory($user->id, (int) $bot->id);

        $this->processQueue($user->id, (int) $bot->id, 1);

        return response()->json(array_merge(
            $this->conversationPayload($user->id, $bot, 180),
            ['queued_message_id' => $message ? $message->id : null]
        ));
    }

    public function updateQueued(Request $request, ChatbotMessage $message): JsonResponse
    {
        $user = $request->user();
        if ((int) $message->user_id !== (int) $user->id) {
            return response()->json(['message' => 'Không thể sửa tin nhắn của tài khoản khác.'], 403);
        }

        if ($message->role !== ChatbotMessage::ROLE_USER || $message->status !== ChatbotMessage::STATUS_QUEUED) {
            return response()->json(['message' => 'Chỉ có thể sửa tin nhắn đang nằm trong hàng chờ.'], 422);
        }

        $validated = $request->validate([
            'content' => ['required', 'string', 'max:12000'],
        ]);

        $content = trim((string) $validated['content']);
        if ($content === '') {
            return response()->json([
                'message' => 'Nội dung hàng chờ không được để trống.',
            ], 422);
        }

        $message->update([
            'content' => $content,
        ]);

        $bot = $message->bot_id
            ? ChatbotBot::query()->find($message->bot_id)
            : $this->resolveSelectedBot($request);

        return response()->json($this->conversationPayload($user->id, $bot, 180));
    }

    public function destroyQueued(Request $request, ChatbotMessage $message): JsonResponse
    {
        $user = $request->user();
        if ((int) $message->user_id !== (int) $user->id) {
            return response()->json(['message' => 'Không thể xoá tin nhắn của tài khoản khác.'], 403);
        }

        if ($message->role !== ChatbotMessage::ROLE_USER || $message->status !== ChatbotMessage::STATUS_QUEUED) {
            return response()->json(['message' => 'Chỉ có thể xoá tin nhắn đang chờ gửi.'], 422);
        }

        $bot = $message->bot_id
            ? ChatbotBot::query()->find($message->bot_id)
            : $this->resolveSelectedBot($request);
        $attachmentPath = $message->attachment_path;
        $message->delete();
        $this->deleteStoredPublicRelativePath($attachmentPath);

        return response()->json($this->conversationPayload($user->id, $bot, 180));
    }

    public function stop(Request $request): JsonResponse
    {
        $user = $request->user();
        $clearQueue = $request->boolean('clear_queue', false);
        $bot = $this->resolveSelectedBot($request, true);

        if (! $bot) {
            return response()->json([
                'message' => 'Không tìm thấy chatbot được chọn hoặc bot đang tắt.',
            ], 422);
        }

        DB::transaction(function () use ($user, $bot, $clearQueue) {
            $state = $this->lockState($user->id, (int) $bot->id);
            $state->stop_requested = (bool) $state->is_processing;

            if ($clearQueue) {
                ChatbotMessage::query()
                    ->where('user_id', $user->id)
                    ->where('bot_id', $bot->id)
                    ->where('role', ChatbotMessage::ROLE_USER)
                    ->where('status', ChatbotMessage::STATUS_QUEUED)
                    ->update([
                        'status' => ChatbotMessage::STATUS_CANCELLED,
                        'cancelled_at' => now(),
                        'completed_at' => now(),
                    ]);
            }

            $state->save();
        });

        return response()->json($this->conversationPayload($user->id, $bot, 180));
    }

    public function history(Request $request): JsonResponse
    {
        $viewer = $request->user();
        $bot = $this->resolveSelectedBot($request);
        if (! $bot) {
            return response()->json([
                'pairs' => [],
                'pairs_limit' => 0,
                'user_id' => (int) $viewer->id,
                'bot' => null,
            ]);
        }

        $pairs = max(1, min($this->requestInt($request, 'pairs', (int) ($bot->history_pairs ?? 8)), 40));
        $targetUserId = (int) $viewer->id;
        $requestedUserId = $this->requestInt($request, 'user_id', 0);
        if ($requestedUserId > 0 && in_array((string) $viewer->role, ['administrator', 'admin'], true)) {
            $targetUserId = $requestedUserId;
        }

        return response()->json([
            'user_id' => $targetUserId,
            'pairs_limit' => $pairs,
            'bot' => $this->mapBot($bot, false),
            'pairs' => $this->buildHistoryPairs($targetUserId, (int) $bot->id, $pairs),
        ]);
    }

    private function processQueue(int $userId, int $botId, int $maxLoops = 4): void
    {
        $loops = max(1, min($maxLoops, 12));

        for ($i = 0; $i < $loops; $i++) {
            $messageId = $this->claimNextQueuedMessage($userId, $botId);
            if (! $messageId) {
                break;
            }

            $this->processSingleMessage($userId, $botId, $messageId);
        }
    }

    private function claimNextQueuedMessage(int $userId, int $botId): ?int
    {
        return DB::transaction(function () use ($userId, $botId) {
            $state = $this->lockState($userId, $botId);

            if ($state->is_processing) {
                $current = $state->current_message_id
                    ? ChatbotMessage::query()->where('bot_id', $botId)->find($state->current_message_id)
                    : null;

                if ($current && $current->status === ChatbotMessage::STATUS_PROCESSING) {
                    return null;
                }

                $state->is_processing = false;
                $state->current_message_id = null;
                $state->processing_started_at = null;
                $state->save();
            }

            if ($state->stop_requested) {
                return null;
            }

            $queued = ChatbotMessage::query()
                ->where('user_id', $userId)
                ->where('bot_id', $botId)
                ->where('role', ChatbotMessage::ROLE_USER)
                ->where('status', ChatbotMessage::STATUS_QUEUED)
                ->orderBy('id')
                ->lockForUpdate()
                ->first();

            if (! $queued) {
                return null;
            }

            $queued->status = ChatbotMessage::STATUS_PROCESSING;
            $queued->started_at = now();
            $queued->save();

            $state->is_processing = true;
            $state->current_message_id = $queued->id;
            $state->processing_started_at = now();
            $state->last_error = null;
            $state->save();

            return (int) $queued->id;
        });
    }

    private function processSingleMessage(int $userId, int $botId, int $messageId): void
    {
        $message = ChatbotMessage::query()
            ->where('bot_id', $botId)
            ->find($messageId);
        if (! $message || $message->status !== ChatbotMessage::STATUS_PROCESSING) {
            $this->releaseState($userId, $botId, $messageId);
            return;
        }

        $setting = $this->resolveSettings();
        if (! $setting || ! $setting->chatbot_enabled) {
            $this->markMessageFailed(
                $userId,
                $botId,
                $messageId,
                'chatbot_disabled',
                'Chatbot đang tắt trong cài đặt hệ thống.'
            );
            return;
        }

        $bot = ChatbotBot::query()->find($botId);
        if (! $bot) {
            $this->markMessageFailed(
                $userId,
                $botId,
                $messageId,
                'bot_not_found',
                'Không tìm thấy chatbot được chọn.'
            );
            return;
        }

        if (! $bot->is_active) {
            $this->markMessageFailed(
                $userId,
                $botId,
                $messageId,
                'bot_inactive',
                'Chatbot này đang tắt.'
            );
            return;
        }

        $apiKey = trim((string) ($bot->api_key ?? ''));
        $model = trim((string) ($bot->model ?? ''));
        if ($apiKey === '' || $model === '') {
            $this->markMessageFailed(
                $userId,
                $botId,
                $messageId,
                'chatbot_not_configured',
                'Chatbot chưa có API key hoặc model.'
            );
            return;
        }

        if ($this->isStopRequested($userId, $botId)) {
            $this->markMessageCancelled($userId, $botId, $messageId, 'Đã dừng bởi người dùng.');
            return;
        }

        $historyPairs = max(1, min((int) ($bot->history_pairs ?: 8), 40));
        $conversation = $this->buildConversationForModel($userId, $botId, $historyPairs, $message);
        $systemMessage = (string) ($bot->system_message_markdown ?? '');

        $result = $this->geminiChatService->generateReply(
            $apiKey,
            $model,
            $systemMessage,
            $conversation
        );

        if ($this->isStopRequested($userId, $botId)) {
            $this->markMessageCancelled($userId, $botId, $messageId, 'Đã dừng bởi người dùng.');
            return;
        }

        if (! ($result['ok'] ?? false)) {
            $this->markMessageFailed(
                $userId,
                $botId,
                $messageId,
                (string) ($result['error'] ?? 'gemini_failed'),
                (string) ($result['message'] ?? 'Gemini trả lỗi không xác định.')
            );
            return;
        }

        DB::transaction(function () use ($userId, $botId, $messageId, $message, $model, $result) {
            $state = $this->lockState($userId, $botId);
            $target = ChatbotMessage::query()->where('bot_id', $botId)->lockForUpdate()->find($messageId);
            if (! $target) {
                $this->resetStateFields($state, $messageId);
                return;
            }

            $target->status = ChatbotMessage::STATUS_COMPLETED;
            $target->completed_at = now();
            $target->model = $model;
            $target->meta = is_array($result['usage'] ?? null)
                ? ['usage' => $result['usage']]
                : null;
            $target->save();

            ChatbotMessage::query()->create([
                'user_id' => $userId,
                'bot_id' => $botId,
                'parent_id' => $target->id,
                'role' => ChatbotMessage::ROLE_ASSISTANT,
                'status' => ChatbotMessage::STATUS_COMPLETED,
                'content' => (string) $result['text'],
                'model' => $model,
                'meta' => is_array($result['usage'] ?? null)
                    ? ['usage' => $result['usage']]
                    : null,
                'queued_at' => $target->started_at ?? $message->created_at ?? now(),
                'started_at' => $target->started_at ?? now(),
                'completed_at' => now(),
            ]);

            $this->resetStateFields($state, $messageId);
        });
        $this->pruneUserChatHistory($userId, $botId);
    }

    private function markMessageFailed(
        int $userId,
        int $botId,
        int $messageId,
        string $errorCode,
        string $errorMessage
    ): void {
        DB::transaction(function () use ($userId, $botId, $messageId, $errorCode, $errorMessage) {
            $state = $this->lockState($userId, $botId);
            $message = ChatbotMessage::query()->where('bot_id', $botId)->lockForUpdate()->find($messageId);
            if ($message) {
                $message->status = ChatbotMessage::STATUS_FAILED;
                $message->error_message = trim($errorMessage);
                $message->completed_at = now();
                $message->meta = [
                    'error_code' => $errorCode,
                ];
                $message->save();
            }

            $state->last_error = trim($errorCode.': '.$errorMessage);
            $this->resetStateFields($state, $messageId);
        });
        $this->pruneUserChatHistory($userId, $botId);
    }

    private function markMessageCancelled(int $userId, int $botId, int $messageId, string $reason): void
    {
        DB::transaction(function () use ($userId, $botId, $messageId, $reason) {
            $state = $this->lockState($userId, $botId);
            $message = ChatbotMessage::query()->where('bot_id', $botId)->lockForUpdate()->find($messageId);
            if ($message) {
                $message->status = ChatbotMessage::STATUS_CANCELLED;
                $message->error_message = $reason;
                $message->cancelled_at = now();
                $message->completed_at = now();
                $message->save();
            }

            $state->last_error = $reason;
            $this->resetStateFields($state, $messageId);
        });
        $this->pruneUserChatHistory($userId, $botId);
    }

    private function isStopRequested(int $userId, int $botId): bool
    {
        $state = ChatbotUserState::query()
            ->where('user_id', $userId)
            ->where('bot_id', $botId)
            ->first();

        return (bool) ($state->stop_requested ?? false);
    }

    private function releaseState(int $userId, int $botId, int $messageId): void
    {
        DB::transaction(function () use ($userId, $botId, $messageId) {
            $state = $this->lockState($userId, $botId);
            $this->resetStateFields($state, $messageId);
        });
    }

    private function resetStateFields(
        ChatbotUserState $state,
        int $messageId,
        bool $keepStopRequested = false
    ): void {
        if ((int) ($state->current_message_id ?? 0) === $messageId) {
            $state->is_processing = false;
            $state->current_message_id = null;
            $state->processing_started_at = null;
            if (! $keepStopRequested) {
                $state->stop_requested = false;
            }
            $state->save();
        }
    }

    private function lockState(int $userId, int $botId): ChatbotUserState
    {
        $state = ChatbotUserState::query()
            ->where('user_id', $userId)
            ->where('bot_id', $botId)
            ->lockForUpdate()
            ->first();

        if ($state) {
            return $state;
        }

        $created = ChatbotUserState::query()->create([
            'user_id' => $userId,
            'bot_id' => $botId,
            'is_processing' => false,
            'stop_requested' => false,
        ]);

        return ChatbotUserState::query()
            ->whereKey($created->id)
            ->lockForUpdate()
            ->firstOrFail();
    }

    private function buildConversationForModel(
        int $userId,
        int $botId,
        int $historyPairs,
        ChatbotMessage $currentMessage
    ): array {
        $historyRows = ChatbotMessage::query()
            ->where('user_id', $userId)
            ->where('bot_id', $botId)
            ->where('id', '<', $currentMessage->id)
            ->whereIn('role', [ChatbotMessage::ROLE_USER, ChatbotMessage::ROLE_ASSISTANT])
            ->where('status', ChatbotMessage::STATUS_COMPLETED)
            ->orderByDesc('id')
            ->limit(max(2, $historyPairs * 2))
            ->get()
            ->reverse()
            ->values();

        $conversation = [];
        foreach ($historyRows as $row) {
            $content = (string) $row->content;
            if ($row->role === ChatbotMessage::ROLE_USER && $row->attachment_name) {
                $attachmentLine = '[Người dùng đã gửi tệp đính kèm trước đó: '.$row->attachment_name.']';
                $content = trim($content) === '' ? $attachmentLine : trim($content)."\n\n".$attachmentLine;
            }
            $conversation[] = [
                'role' => $row->role,
                'content' => $content,
            ];
        }

        $conversation[] = [
            'role' => ChatbotMessage::ROLE_USER,
            'content' => (string) $currentMessage->content,
            'attachment' => $this->attachmentContextForModel($currentMessage),
        ];

        return $conversation;
    }

    private function conversationPayload(int $userId, ?ChatbotBot $bot, int $limit = 160): array
    {
        $setting = $this->resolveSettings();
        $state = $bot
            ? ChatbotUserState::query()
                ->where('user_id', $userId)
                ->where('bot_id', $bot->id)
                ->first()
            : null;

        $rows = $bot
            ? ChatbotMessage::query()
                ->where('user_id', $userId)
                ->where('bot_id', $bot->id)
                ->orderByDesc('id')
                ->limit(max(40, min($limit, 500)))
                ->get()
                ->sortBy('id')
                ->values()
            : collect([]);

        $messages = $rows->map(function (ChatbotMessage $row) {
            return [
                'id' => (int) $row->id,
                'bot_id' => $row->bot_id ? (int) $row->bot_id : null,
                'parent_id' => $row->parent_id ? (int) $row->parent_id : null,
                'role' => $row->role,
                'status' => $row->status,
                'content' => (string) $row->content,
                'model' => $row->model,
                'error_message' => $row->error_message,
                'attachment' => $this->attachmentPayload($row),
                'created_at' => optional($row->created_at)->toIso8601String(),
                'queued_at' => optional($row->queued_at)->toIso8601String(),
                'started_at' => optional($row->started_at)->toIso8601String(),
                'completed_at' => optional($row->completed_at)->toIso8601String(),
                'cancelled_at' => optional($row->cancelled_at)->toIso8601String(),
            ];
        })->values()->all();

        $queued = collect($messages)
            ->filter(function ($msg) {
                return $msg['role'] === ChatbotMessage::ROLE_USER
                    && $msg['status'] === ChatbotMessage::STATUS_QUEUED;
            })
            ->values()
            ->all();

        return [
            'chatbot' => [
                'enabled' => (bool) ($setting->chatbot_enabled ?? false),
                'provider' => (string) ($setting->chatbot_provider ?? 'gemini'),
                'configured' => $bot ? $this->botConfigured($bot) : false,
            ],
            'bot' => $bot ? $this->mapBot($bot, false) : null,
            'bots' => $this->botListPayload(false, false),
            'state' => [
                'is_processing' => (bool) ($state->is_processing ?? false),
                'stop_requested' => (bool) ($state->stop_requested ?? false),
                'current_message_id' => $state && $state->current_message_id ? (int) $state->current_message_id : null,
                'last_error' => $state ? $state->last_error : null,
                'processing_started_at' => $state && $state->processing_started_at
                    ? $state->processing_started_at->toIso8601String()
                    : null,
            ],
            'messages' => $messages,
            'queue' => $queued,
            'server_time' => Carbon::now()->toIso8601String(),
        ];
    }

    private function resolveSettings(): AppSetting
    {
        $setting = AppSetting::query()->first();
        if ($setting) {
            return $setting;
        }

        return AppSetting::query()->create(AppSetting::defaults());
    }

    private function buildHistoryPairs(int $userId, int $botId, int $pairs): array
    {
        $rows = ChatbotMessage::query()
            ->where('user_id', $userId)
            ->where('bot_id', $botId)
            ->whereIn('role', [ChatbotMessage::ROLE_USER, ChatbotMessage::ROLE_ASSISTANT])
            ->where('status', ChatbotMessage::STATUS_COMPLETED)
            ->orderBy('id')
            ->get();

        $result = [];
        $pendingQuestion = null;

        foreach ($rows as $row) {
            if ($row->role === ChatbotMessage::ROLE_USER) {
                $pendingQuestion = [
                    'question_id' => (int) $row->id,
                    'question' => (string) $row->content,
                    'question_at' => optional($row->created_at)->toIso8601String(),
                    'answer_id' => null,
                    'answer' => null,
                    'answer_at' => null,
                ];
                continue;
            }

            if (! $pendingQuestion) {
                continue;
            }

            $pendingQuestion['answer_id'] = (int) $row->id;
            $pendingQuestion['answer'] = (string) $row->content;
            $pendingQuestion['answer_at'] = optional($row->created_at)->toIso8601String();
            $result[] = $pendingQuestion;
            $pendingQuestion = null;
        }

        return collect($result)
            ->reverse()
            ->take($pairs)
            ->reverse()
            ->values()
            ->all();
    }

    private function requestedBotId(Request $request): int
    {
        $raw = $request->input('bot_id', $request->query('bot_id'));
        if ($raw === null || $raw === '') {
            return 0;
        }
        if (! is_numeric($raw)) {
            return 0;
        }

        return max(0, (int) $raw);
    }

    private function resolveSelectedBot(
        Request $request,
        bool $strictRequested = false,
        bool $includeInactive = false
    ): ?ChatbotBot {
        $setting = $this->resolveSettings();
        $this->ensureDefaultBot($setting, $request->user() ? $request->user()->id : null);

        $query = $this->botListQuery($includeInactive);
        $requestedId = $this->requestedBotId($request);
        if ($requestedId > 0) {
            $selected = (clone $query)->where('id', $requestedId)->first();
            if ($selected) {
                return $selected;
            }

            if ($strictRequested) {
                return null;
            }
        }

        return $query->first();
    }

    private function botListQuery(bool $includeInactive = false)
    {
        $query = ChatbotBot::query();
        if (! $includeInactive) {
            $query->where('is_active', true);
        }

        return $query
            ->orderByDesc('is_default')
            ->orderBy('sort_order')
            ->orderBy('id');
    }

    private function botListPayload(bool $includeInactive = false, bool $includeSecrets = false): array
    {
        return $this->botListQuery($includeInactive)
            ->get()
            ->map(function (ChatbotBot $bot) use ($includeSecrets) {
                return $this->mapBot($bot, $includeSecrets);
            })
            ->values()
            ->all();
    }

    private function mapBot(ChatbotBot $bot, bool $includeSecrets = false): array
    {
        $payload = [
            'id' => (int) $bot->id,
            'name' => (string) $bot->name,
            'description' => $bot->description,
            'provider' => (string) ($bot->provider ?: 'gemini'),
            'model' => (string) ($bot->model ?: ''),
            'history_pairs' => (int) ($bot->history_pairs ?: 8),
            'accent_color' => $bot->accent_color ?: '#6366F1',
            'icon' => $bot->icon ?: '🤖',
            'avatar_url' => $bot->avatar_url,
            'sort_order' => (int) ($bot->sort_order ?: 0),
            'is_active' => (bool) $bot->is_active,
            'is_default' => (bool) $bot->is_default,
            'configured' => $this->botConfigured($bot),
            'created_at' => optional($bot->created_at)->toIso8601String(),
            'updated_at' => optional($bot->updated_at)->toIso8601String(),
        ];

        if ($includeSecrets) {
            $payload['api_key'] = $bot->api_key;
            $payload['system_message_markdown'] = $bot->system_message_markdown;
        }

        return $payload;
    }

    private function botConfigured(ChatbotBot $bot): bool
    {
        return trim((string) ($bot->api_key ?? '')) !== ''
            && trim((string) ($bot->model ?? '')) !== '';
    }

    private function ensureDefaultBot(AppSetting $setting, ?int $userId = null): ?ChatbotBot
    {
        $default = ChatbotBot::query()
            ->where('is_default', true)
            ->orderBy('id')
            ->first();

        if ($default) {
            return $default;
        }

        $first = ChatbotBot::query()->orderBy('id')->first();
        if ($first) {
            $first->is_default = true;
            if (! $first->is_active) {
                $first->is_active = true;
            }
            $first->save();
            return $first;
        }

        return ChatbotBot::query()->create([
            'name' => 'Trợ lý mặc định',
            'description' => 'Bot mặc định dùng cho hệ thống nội bộ.',
            'provider' => (string) ($setting->chatbot_provider ?: 'gemini'),
            'model' => (string) ($setting->chatbot_model ?: 'gemini-2.0-flash'),
            'api_key' => $setting->chatbot_api_key,
            'system_message_markdown' => $setting->chatbot_system_message_markdown,
            'history_pairs' => (int) ($setting->chatbot_history_pairs ?: 8),
            'accent_color' => '#6366F1',
            'icon' => '🤖',
            'sort_order' => 0,
            'is_active' => true,
            'is_default' => true,
            'created_by' => $userId,
            'updated_by' => $userId,
        ]);
    }

    private function ensureOneDefaultBot(): void
    {
        $defaultId = ChatbotBot::query()
            ->where('is_default', true)
            ->orderBy('id')
            ->value('id');
        if ($defaultId) {
            return;
        }

        $fallbackId = ChatbotBot::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->value('id');
        if (! $fallbackId) {
            $fallbackId = ChatbotBot::query()
                ->orderBy('sort_order')
                ->orderBy('id')
                ->value('id');
        }

        if ($fallbackId) {
            ChatbotBot::query()->where('id', $fallbackId)->update([
                'is_default' => true,
                'is_active' => true,
            ]);
        }
    }

    private function assertAdministrator(Request $request): void
    {
        if (! $request->user() || (string) $request->user()->role !== 'administrator') {
            abort(response()->json(['message' => 'Không có quyền quản lý chatbot.'], 403));
        }
    }

    private function nullableTrim($value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim((string) $value);
        return $trimmed === '' ? null : $trimmed;
    }

    private function requestInt(Request $request, string $key, int $default = 0): int
    {
        $raw = $request->input($key, $default);
        if (is_int($raw)) {
            return $raw;
        }
        if (is_numeric($raw)) {
            return (int) $raw;
        }

        return $default;
    }

    private function attachmentPayload(ChatbotMessage $message): ?array
    {
        if (! $message->attachment_url && ! $message->attachment_name) {
            return null;
        }

        $mime = trim((string) ($message->attachment_mime ?? ''));
        return [
            'url' => $message->attachment_url,
            'name' => $message->attachment_name,
            'mime' => $mime,
            'size' => $message->attachment_size ? (int) $message->attachment_size : null,
            'is_image' => $mime !== '' ? str_starts_with(strtolower($mime), 'image/') : false,
        ];
    }

    private function attachmentContextForModel(ChatbotMessage $message): ?array
    {
        $relativePath = trim((string) ($message->attachment_path ?? ''));
        if ($relativePath === '') {
            return null;
        }

        $safeRelativePath = ltrim(str_replace(['..\\', '../', '\\'], ['', '', '/'], $relativePath), '/');
        if ($safeRelativePath === '') {
            return null;
        }

        $absolutePath = storage_path('app/public/'.$safeRelativePath);
        if (! is_file($absolutePath)) {
            return null;
        }

        $mime = trim((string) ($message->attachment_mime ?? ''));
        if ($mime === '') {
            $mime = 'application/octet-stream';
        }

        return [
            'path' => $absolutePath,
            'mime' => $mime,
            'name' => $message->attachment_name ?: basename($absolutePath),
            'size' => $message->attachment_size ? (int) $message->attachment_size : (int) filesize($absolutePath),
        ];
    }

    private function storeChatbotAttachment(?UploadedFile $file): ?array
    {
        if (! $file) {
            return null;
        }

        $originalName = trim((string) $file->getClientOriginalName());
        if ($originalName === '') {
            $originalName = 'attachment';
        }

        $extension = strtolower((string) $file->getClientOriginalExtension());
        if ($extension === '') {
            $extension = strtolower((string) $file->extension());
        }

        $basename = pathinfo($originalName, PATHINFO_FILENAME);
        $basename = preg_replace('/[^A-Za-z0-9_\-]+/', '_', (string) $basename);
        $basename = trim((string) $basename, '_-');
        if ($basename === '') {
            $basename = 'file';
        }

        $targetName = sprintf(
            '%s_%s_%s%s',
            Str::snake($basename),
            now()->format('Ymd_His'),
            Str::lower(Str::random(6)),
            $extension !== '' ? '.'.$extension : ''
        );
        $folder = 'chatbots/messages/'.now()->format('Y/m');
        $storedPath = $file->storeAs($folder, $targetName, 'public');

        return [
            'path' => $storedPath,
            'url' => Storage::url($storedPath),
            'name' => $originalName,
            'mime' => trim((string) ($file->getMimeType() ?? 'application/octet-stream')),
            'size' => $file->getSize(),
        ];
    }

    private function storeChatbotAvatar(?UploadedFile $file): ?string
    {
        if (! $file) {
            return null;
        }

        $storedPath = $file->store('chatbots', 'public');
        return Storage::url($storedPath);
    }

    private function deleteStoredPublicFile(?string $publicUrl): void
    {
        $url = trim((string) $publicUrl);
        if ($url === '') {
            return;
        }

        $path = (string) parse_url($url, PHP_URL_PATH);
        if ($path === '' || ! str_starts_with($path, '/storage/')) {
            return;
        }

        $relative = ltrim(substr($path, strlen('/storage/')), '/');
        if ($relative === '') {
            return;
        }

        Storage::disk('public')->delete($relative);
    }

    private function deleteStoredPublicRelativePath(?string $relativePath): void
    {
        $path = trim((string) $relativePath);
        if ($path === '') {
            return;
        }

        $normalized = ltrim(str_replace(['..\\', '../', '\\'], ['', '', '/'], $path), '/');
        if ($normalized === '') {
            return;
        }

        Storage::disk('public')->delete($normalized);
    }

    private function pruneUserChatHistory(int $userId, int $botId): void
    {
        $recentIds = ChatbotMessage::query()
            ->where('user_id', $userId)
            ->where('bot_id', $botId)
            ->where('role', ChatbotMessage::ROLE_USER)
            ->orderByDesc('id')
            ->limit(self::MAX_CHAT_SESSIONS_PER_USER)
            ->pluck('id');

        $activeQueueIds = ChatbotMessage::query()
            ->where('user_id', $userId)
            ->where('bot_id', $botId)
            ->where('role', ChatbotMessage::ROLE_USER)
            ->whereIn('status', [
                ChatbotMessage::STATUS_QUEUED,
                ChatbotMessage::STATUS_PROCESSING,
            ])
            ->pluck('id');

        $keepIds = $recentIds
            ->merge($activeQueueIds)
            ->unique()
            ->values();

        if ($keepIds->isEmpty()) {
            return;
        }

        $staleUserIds = ChatbotMessage::query()
            ->where('user_id', $userId)
            ->where('bot_id', $botId)
            ->where('role', ChatbotMessage::ROLE_USER)
            ->whereNotIn('id', $keepIds)
            ->pluck('id');

        if ($staleUserIds->isEmpty()) {
            return;
        }

        $staleAttachmentPaths = ChatbotMessage::query()
            ->where('user_id', $userId)
            ->where('bot_id', $botId)
            ->where(function ($query) use ($staleUserIds) {
                $query
                    ->whereIn('id', $staleUserIds)
                    ->orWhereIn('parent_id', $staleUserIds);
            })
            ->whereNotNull('attachment_path')
            ->pluck('attachment_path')
            ->filter()
            ->unique()
            ->values();

        ChatbotMessage::query()
            ->where('user_id', $userId)
            ->where('bot_id', $botId)
            ->where(function ($query) use ($staleUserIds) {
                $query
                    ->whereIn('id', $staleUserIds)
                    ->orWhereIn('parent_id', $staleUserIds);
            })
            ->delete();

        foreach ($staleAttachmentPaths as $path) {
            $this->deleteStoredPublicRelativePath((string) $path);
        }
    }
}
