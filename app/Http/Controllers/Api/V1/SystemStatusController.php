<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\UserDeviceToken;
use App\Services\FirebaseService;
use Illuminate\Http\JsonResponse;

class SystemStatusController extends Controller
{
    public function show(FirebaseService $firebase): JsonResponse
    {
        $setting = AppSetting::query()->first();
        $defaults = AppSetting::defaults();

        $totalTokens = (int) UserDeviceToken::query()->count();
        $byPlatform = UserDeviceToken::query()
            ->selectRaw('platform, count(*) as total')
            ->groupBy('platform')
            ->pluck('total', 'platform');
        $lastSeen = UserDeviceToken::query()->max('last_seen_at');
        $lastUpdated = UserDeviceToken::query()->max('updated_at');

        return response()->json([
            'firebase' => [
                'enabled' => $firebase->enabled(),
                'database_enabled' => $firebase->databaseEnabled(),
                'access_token' => $firebase->accessTokenAvailable(),
                'project_id' => (string) config('firebase.project_id'),
                'database_url_configured' => (string) config('firebase.database_url') !== '',
            ],
            'push_tokens' => [
                'total' => $totalTokens,
                'by_platform' => [
                    'ios' => (int) ($byPlatform['ios'] ?? 0),
                    'android' => (int) ($byPlatform['android'] ?? 0),
                    'web' => (int) ($byPlatform['web'] ?? 0),
                ],
                'last_seen_at' => $lastSeen,
                'last_updated_at' => $lastUpdated,
            ],
            'notification_config' => [
                'channels' => [
                    'push_enabled' => $setting ? (bool) $setting->notifications_push_enabled : true,
                    'in_app_enabled' => $setting ? (bool) $setting->notifications_in_app_enabled : true,
                    'email_fallback_enabled' => $setting ? (bool) $setting->notifications_email_fallback_enabled : true,
                ],
                'dedupe_seconds' => $setting ? (int) $setting->notifications_dedupe_seconds : 45,
                'meeting_reminder_minutes_before' => $setting ? (int) $setting->meeting_reminder_minutes_before : 60,
                'task_item_progress_reminder_enabled' => $setting ? (bool) $setting->task_item_progress_reminder_enabled : true,
                'mail_configured' => (string) config('mail.default') !== '',
                'schedule' => [
                    'meetings_send_reminders' => '* * * * *',
                    'task_items_remind_progress' => 'daily 08:00',
                ],
                'app_settings_exists' => ! is_null($setting),
                'brand_name' => $setting ? (string) $setting->brand_name : (string) $defaults['brand_name'],
            ],
        ]);
    }
}
