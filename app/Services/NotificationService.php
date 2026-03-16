<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\User;
use App\Models\UserDeviceToken;
use App\Models\InAppNotification;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;

class NotificationService
{
    private const DEFAULT_DEDUPE_SECONDS = 45;

    private $firebase;
    private $cachedSettings = null;

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
        $settings = $this->notificationSettings();

        if ($this->shouldSkipDuplicate($user, $title, $body, $data)) {
            return;
        }

        if ($settings['in_app_enabled']) {
            $this->recordInAppNotification($user, $title, $body, $data);
        }

        $tokens = [];
        if ($settings['push_enabled']) {
            $tokens = UserDeviceToken::query()
                ->where('user_id', $user->id)
                ->pluck('token')
                ->all();
        }

        $result = $this->safeSendPush($tokens, $title, $body, $data, $user->id);
        $sent = (int) ($result['sent'] ?? 0);
        $failedTokens = $result['failed_tokens'] ?? [];

        if (! empty($failedTokens)) {
            UserDeviceToken::query()->whereIn('token', $failedTokens)->delete();
        }

        if ($sent <= 0 && $settings['email_fallback_enabled']) {
            $this->sendEmailFallback($user, $title, $body);
        }
    }

    public function notifyUserWithResult(User $user, string $title, string $body, array $data = []): array
    {
        $settings = $this->notificationSettings();

        if ($this->shouldSkipDuplicate($user, $title, $body, $data)) {
            return [
                'push_sent' => false,
                'email_sent' => false,
                'error' => 'duplicate_suppressed',
            ];
        }

        if ($settings['in_app_enabled']) {
            $this->recordInAppNotification($user, $title, $body, $data);
        }

        $tokens = [];
        if ($settings['push_enabled']) {
            $tokens = UserDeviceToken::query()
                ->where('user_id', $user->id)
                ->pluck('token')
                ->all();
        }

        $result = $this->safeSendPush($tokens, $title, $body, $data, $user->id);
        $sent = (int) ($result['sent'] ?? 0);
        $failedTokens = $result['failed_tokens'] ?? [];
        $error = $result['error'] ?? null;

        if (! empty($failedTokens)) {
            UserDeviceToken::query()->whereIn('token', $failedTokens)->delete();
        }

        $emailSent = false;
        if ($sent <= 0 && $settings['email_fallback_enabled']) {
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
        if (empty($tokens)) {
            return [
                'sent' => 0,
                'failed' => 0,
                'failed_tokens' => [],
                'error' => null,
            ];
        }

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

    private function shouldSkipDuplicate(User $user, string $title, string $body, array $data = []): bool
    {
        $window = $this->resolveDedupeWindow($data);
        if ($window <= 0) {
            return false;
        }

        $type = isset($data['type']) ? (string) $data['type'] : 'general';
        if ($type === '') {
            $type = 'general';
        }
        $fingerprint = $this->buildFingerprint($type, $title, $body, $data);
        $cutoff = now()->subSeconds($window);

        $recent = InAppNotification::query()
            ->where('user_id', $user->id)
            ->where('type', $type)
            ->where('created_at', '>=', $cutoff)
            ->orderByDesc('id')
            ->limit(20)
            ->get(['title', 'body', 'data']);

        foreach ($recent as $item) {
            $payload = is_array($item->data) ? $item->data : [];
            $existingFingerprint = $this->buildFingerprint(
                $type,
                (string) ($item->title ?? ''),
                (string) ($item->body ?? ''),
                $payload
            );
            if (hash_equals($fingerprint, $existingFingerprint)) {
                return true;
            }
        }

        return false;
    }

    private function resolveDedupeWindow(array $data): int
    {
        if (array_key_exists('dedupe', $data) && $data['dedupe'] === false) {
            return 0;
        }
        if (isset($data['dedupe_seconds']) && is_numeric($data['dedupe_seconds'])) {
            $value = (int) $data['dedupe_seconds'];
            return max(0, min(3600, $value));
        }

        $settings = $this->notificationSettings();
        $configured = (int) ($settings['dedupe_seconds'] ?? self::DEFAULT_DEDUPE_SECONDS);

        return max(0, min(3600, $configured));
    }

    private function buildFingerprint(string $type, string $title, string $body, array $data): string
    {
        $cleaned = $data;
        unset($cleaned['dedupe'], $cleaned['dedupe_seconds']);

        return hash('sha256', json_encode([
            'type' => $type,
            'title' => trim($title),
            'body' => trim($body),
            'data' => $this->normalizePayload($cleaned),
        ]));
    }

    private function normalizePayload($value)
    {
        if (is_array($value)) {
            if ($this->isAssoc($value)) {
                ksort($value);
                $normalized = [];
                foreach ($value as $key => $item) {
                    $normalized[(string) $key] = $this->normalizePayload($item);
                }
                return $normalized;
            }

            $normalized = array_map(function ($item) {
                return $this->normalizePayload($item);
            }, $value);
            usort($normalized, function ($left, $right) {
                return strcmp(
                    json_encode($left),
                    json_encode($right)
                );
            });
            return $normalized;
        }

        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }

        if (is_numeric($value)) {
            return (string) ((float) $value);
        }

        if (is_string($value)) {
            return trim($value);
        }

        return (string) $value;
    }

    private function isAssoc(array $array): bool
    {
        return array_keys($array) !== range(0, count($array) - 1);
    }

    private function notificationSettings(): array
    {
        if (is_array($this->cachedSettings)) {
            return $this->cachedSettings;
        }

        $defaults = [
            'push_enabled' => true,
            'in_app_enabled' => true,
            'email_fallback_enabled' => true,
            'dedupe_seconds' => self::DEFAULT_DEDUPE_SECONDS,
        ];

        $setting = AppSetting::query()->first();
        if (! $setting) {
            $this->cachedSettings = $defaults;
            return $this->cachedSettings;
        }

        $this->cachedSettings = [
            'push_enabled' => (bool) ($setting->notifications_push_enabled ?? $defaults['push_enabled']),
            'in_app_enabled' => (bool) ($setting->notifications_in_app_enabled ?? $defaults['in_app_enabled']),
            'email_fallback_enabled' => (bool) ($setting->notifications_email_fallback_enabled ?? $defaults['email_fallback_enabled']),
            'dedupe_seconds' => (int) ($setting->notifications_dedupe_seconds ?? $defaults['dedupe_seconds']),
        ];

        return $this->cachedSettings;
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
