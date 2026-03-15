<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
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

        try {
            $tokenCount = (int) UserDeviceToken::query()
                ->where('user_id', $user->id)
                ->count();

            $result = $notifications->notifyUserWithResult(
                $user,
                'Test thông báo',
                'Đây là thông báo kiểm tra từ hệ thống CRM.',
                [
                    'type' => 'push_test',
                    'user_id' => (string) $user->id,
                ]
            );

            return response()->json([
                'ok' => (bool) ($result['push_sent'] ?? false),
                'token_count' => $tokenCount,
                'push_sent' => $result['push_sent'] ?? false,
                'email_sent' => $result['email_sent'] ?? false,
                'error' => $result['error'] ?? null,
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
