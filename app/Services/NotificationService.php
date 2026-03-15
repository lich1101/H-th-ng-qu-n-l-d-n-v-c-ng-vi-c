<?php

namespace App\Services;

use App\Models\User;
use App\Models\UserDeviceToken;
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
            $this->notifyUser($user, $title, $body, $data);
        }
    }

    public function notifyUser(User $user, string $title, string $body, array $data = []): void
    {
        $tokens = UserDeviceToken::query()
            ->where('user_id', $user->id)
            ->pluck('token')
            ->all();

        $result = $this->firebase->sendPush($tokens, $title, $body, $data);
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
        $tokens = UserDeviceToken::query()
            ->where('user_id', $user->id)
            ->pluck('token')
            ->all();

        $result = $this->firebase->sendPush($tokens, $title, $body, $data);
        $sent = (int) ($result['sent'] ?? 0);
        $failedTokens = $result['failed_tokens'] ?? [];

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
        ];
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
