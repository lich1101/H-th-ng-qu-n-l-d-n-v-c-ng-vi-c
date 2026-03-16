<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\UserDeviceToken;
use App\Services\NotificationService;
use App\Services\FirebaseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
        if (! empty($validated['user_id']) && $user->role === 'admin') {
            $selected = User::query()->find((int) $validated['user_id']);
            if ($selected) {
                $targetUser = $selected;
            }
        }

        try {
            $tokenCount = (int) UserDeviceToken::query()
                ->where('user_id', $targetUser->id)
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
                'ok' => (bool) ($result['push_sent'] ?? false),
                'token_count' => $tokenCount,
                'push_sent' => $result['push_sent'] ?? false,
                'email_sent' => $result['email_sent'] ?? false,
                'error' => $result['error'] ?? null,
                'target_user_id' => $targetUser->id,
                'target_user_name' => $targetUser->name,
                'firebase_enabled' => $firebase->enabled(),
                'access_token_ready' => $firebase->accessTokenAvailable(),
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'ok' => false,
                'message' => $e->getMessage(),
                'file' => basename($e->getFile()),
                'line' => $e->getLine(),
                'firebase_enabled' => $firebase->enabled(),
                'access_token_ready' => $firebase->accessTokenAvailable(),
            ]);
        }
    }
}
