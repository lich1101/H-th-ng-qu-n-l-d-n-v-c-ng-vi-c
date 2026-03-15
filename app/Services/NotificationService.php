<?php

namespace App\Services;

use App\Models\User;
use App\Models\UserDeviceToken;
use App\Models\InAppNotification;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;

class NotificationService
{
    private FirebaseService $firebase;

    public function __construct(FirebaseService $firebase)
    {
        $this->firebase = $firebase;
    }

    public function notifyUsers(array $userIds, string $title, string $body, array $data = []): void
    {
        $userIds = array_values(array_filter(array_unique(array_map('intval', $userIds))));
        if (empty($userIds)) {
            return;
        }
        $users = User::query()->whereIn('id', $userIds)->get();
        foreach ($users as $user) {
            try {
                $this->notifyUser($user, $title, $body, $data);
            } catch (\Throwable $e) {
                Log::warning('Notify user failed', [
                    'user_id' => $user->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }

    public function notifyUser(User $user, string $title, string $body, array $data = []): void
    {
        $this->recordInAppNotification($user, $title, $body, $data);

        $tokens = UserDeviceToken::query()
            ->where('user_id', $user->id)
            ->pluck('token')
            ->all();

        $result = $this->safeSendPush($tokens, $title, $body, $data, $user->id);
        $sent = (int) ($result['sent'] ?? 0);
        $failedTokens = $result['failed_tokens'] ?? [];

        if (! empty($failedTokens)) {
            UserDeviceToken::query()->whereIn('token', $failedTokens)->delete();
        }

        if ($sent <= 0) {
            $this->sendEmailFallback($user, $title, $body);
        }
    }

    public function notifyUserWithResult(User $user, string $title, string $body, array $data = []): array
    {
        $this->recordInAppNotification($user, $title, $body, $data);

        $tokens = UserDeviceToken::query()
            ->where('user_id', $user->id)
            ->pluck('token')
            ->all();

        $result = $this->safeSendPush($tokens, $title, $body, $data, $user->id);
        $sent = (int) ($result['sent'] ?? 0);
        $failedTokens = $result['failed_tokens'] ?? [];
        $error = $result['error'] ?? null;

        if (! empty($failedTokens)) {
            UserDeviceToken::query()->whereIn('token', $failedTokens)->delete();
        }

        $emailSent = false;
        if ($sent <= 0) {
            $emailSent = $this->sendEmailFallback($user, $title, $body);
        }

        return [
            'push_sent' => $sent > 0,
            'email_sent' => $emailSent,
            'error' => $error,
        ];
    }

    private function safeSendPush(
        array $tokens,
        string $title,
        string $body,
        array $data,
        int $userId
    ): array {
        try {
            return $this->firebase->sendPush($tokens, $title, $body, $data);
        } catch (\Throwable $e) {
            Log::warning('Firebase push failed', [
                'user_id' => $userId,
                'error' => $e->getMessage(),
            ]);
            return [
                'sent' => 0,
                'failed' => count($tokens),
                'failed_tokens' => $tokens,
                'error' => $e->getMessage(),
            ];
        }
    }

    private function recordInAppNotification(User $user, string $title, string $body, array $data = []): void
    {
        try {
            $type = isset($data['type']) ? (string) $data['type'] : 'general';
            InAppNotification::create([
                'user_id' => $user->id,
                'type' => $type === '' ? 'general' : $type,
                'title' => $title,
                'body' => $body,
                'data' => empty($data) ? null : $data,
            ]);
        } catch (\Throwable $e) {
            Log::warning('In-app notification save failed', [
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function sendEmailFallback(User $user, string $title, string $body): bool
    {
        if (! $user->email) {
            return false;
        }
        try {
            Mail::raw($body, function ($mail) use ($user, $title) {
                $mail->to($user->email)->subject($title);
            });
            return true;
        } catch (\Throwable $e) {
            Log::warning('Email fallback failed', [
                'user_id' => $user->id,
                'email' => $user->email,
                'error' => $e->getMessage(),
            ]);
            return false;
        }
    }
}
