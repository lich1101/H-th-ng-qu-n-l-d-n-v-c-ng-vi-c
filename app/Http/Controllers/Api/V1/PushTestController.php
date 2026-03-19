<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\UserDeviceToken;
use App\Services\NotificationService;
use App\Services\FirebaseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class PushTestController extends Controller
{
    public function store(
        Request $request,
        NotificationService $notifications,
        FirebaseService $firebase
    ): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Chưa đăng nhập.'], 401);
        }

        $validated = $request->validate([
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
            'title' => ['nullable', 'string', 'max:120'],
            'body' => ['nullable', 'string', 'max:500'],
        ]);

        $targetUser = $user;
        $requestedUserId = ! empty($validated['user_id']) ? (int) $validated['user_id'] : null;
        if (! empty($validated['user_id']) && in_array($user->role, ['admin', 'administrator'], true)) {
            $selected = User::query()->find((int) $validated['user_id']);
            if ($selected) {
                $targetUser = $selected;
            }
        }

        try {
            $tokenColumns = ['token', 'platform', 'last_seen_at', 'updated_at'];
            if (Schema::hasColumn('user_device_tokens', 'apns_environment')) {
                $tokenColumns[] = 'apns_environment';
            }
            if (Schema::hasColumn('user_device_tokens', 'notifications_enabled')) {
                $tokenColumns[] = 'notifications_enabled';
            }

            $tokens = UserDeviceToken::query()
                ->where('user_id', $targetUser->id)
                ->get($tokenColumns);

            $tokenCount = (int) $tokens->count();
            $tokensByPlatform = [
                'ios' => (int) $tokens->where('platform', 'ios')->count(),
                'android' => (int) $tokens->where('platform', 'android')->count(),
                'web' => (int) $tokens->where('platform', 'web')->count(),
            ];
            $tokensByApnsEnvironment = [
                'production' => (int) $tokens
                    ->where('platform', 'ios')
                    ->where('apns_environment', 'production')
                    ->count(),
                'development' => (int) $tokens
                    ->where('platform', 'ios')
                    ->where('apns_environment', 'development')
                    ->count(),
                'unknown' => (int) $tokens
                    ->where('platform', 'ios')
                    ->filter(function ($item) {
                        return ! array_key_exists('apns_environment', $item->getAttributes())
                            || $item->apns_environment === null
                            || $item->apns_environment === '';
                    })
                    ->count(),
            ];
            $tokensEnabled = (int) $tokens
                ->filter(function ($item) {
                    if (! array_key_exists('notifications_enabled', $item->getAttributes())) {
                        return true;
                    }
                    return $item->notifications_enabled !== false;
                })
                ->count();
            $tokensDisabled = (int) $tokens
                ->filter(function ($item) {
                    if (! array_key_exists('notifications_enabled', $item->getAttributes())) {
                        return false;
                    }
                    return $item->notifications_enabled === false;
                })
                ->count();

            $result = $notifications->notifyUserWithResult(
                $targetUser,
                trim((string) ($validated['title'] ?? 'Test thông báo')) ?: 'Test thông báo',
                trim((string) ($validated['body'] ?? 'Đây là thông báo kiểm tra từ hệ thống CRM.')) ?: 'Đây là thông báo kiểm tra từ hệ thống CRM.',
                [
                    'type' => 'push_test',
                    'user_id' => (string) $targetUser->id,
                    'triggered_by' => (string) $user->id,
                    'dedupe' => false,
                ]
            );

            return response()->json([
                'apns_environment_column' => Schema::hasColumn('user_device_tokens', 'apns_environment'),
                'ok' => (bool) ($result['push_sent'] ?? false),
                'token_count' => $tokenCount,
                'token_by_platform' => $tokensByPlatform,
                'token_by_apns_environment' => $tokensByApnsEnvironment,
                'token_notifications_enabled' => $tokensEnabled,
                'token_notifications_disabled' => $tokensDisabled,
                'push_sent' => $result['push_sent'] ?? false,
                'email_sent' => $result['email_sent'] ?? false,
                'error' => $result['error'] ?? null,
                'push_result' => $result['push_result'] ?? null,
                'target_user_id' => $targetUser->id,
                'target_user_name' => $targetUser->name,
                'target_user_email' => $targetUser->email,
                'firebase_enabled' => $firebase->enabled(),
                'access_token_ready' => $firebase->accessTokenAvailable(),
                'debug' => [
                    'requested_user_id' => $requestedUserId,
                    'acting_user_id' => (int) $user->id,
                    'target_user_id' => (int) $targetUser->id,
                    'db_connection' => config('database.default'),
                    'db_database' => (string) config('database.connections.'.config('database.default').'.database'),
                    'db_host' => (string) config('database.connections.'.config('database.default').'.host'),
                    'recent_token_users' => UserDeviceToken::query()
                        ->select(
                            Schema::hasColumn('user_device_tokens', 'apns_environment')
                                ? ['user_id', 'platform', 'apns_environment', 'updated_at']
                                : ['user_id', 'platform', 'updated_at']
                        )
                        ->orderByDesc('updated_at')
                        ->limit(5)
                        ->get()
                        ->map(function ($item) {
                            return [
                                'user_id' => (int) $item->user_id,
                                'platform' => $item->platform,
                                'apns_environment' => $item->apns_environment,
                                'updated_at' => $item->updated_at,
                            ];
                        })
                        ->values(),
                ],
                'token_samples' => $tokens->map(function ($item) {
                    return [
                        'platform' => $item->platform,
                        'apns_environment' => $item->apns_environment,
                        'notifications_enabled' => $item->notifications_enabled,
                        'token_suffix' => substr((string) $item->token, -14),
                        'last_seen_at' => $item->last_seen_at,
                        'updated_at' => $item->updated_at,
                    ];
                })->values(),
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'ok' => false,
                'message' => $e->getMessage(),
                'file' => basename($e->getFile()),
                'line' => $e->getLine(),
                'target_user_id' => $targetUser ? $targetUser->id : null,
                'target_user_name' => $targetUser ? $targetUser->name : null,
                'target_user_email' => $targetUser ? $targetUser->email : null,
                'debug' => [
                    'requested_user_id' => $requestedUserId,
                    'acting_user_id' => (int) $user->id,
                    'db_connection' => config('database.default'),
                    'db_database' => (string) config('database.connections.'.config('database.default').'.database'),
                    'db_host' => (string) config('database.connections.'.config('database.default').'.host'),
                ],
                'firebase_enabled' => $firebase->enabled(),
                'access_token_ready' => $firebase->accessTokenAvailable(),
            ]);
        }
    }
}
