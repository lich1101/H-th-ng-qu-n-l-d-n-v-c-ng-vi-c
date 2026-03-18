<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\UserDeviceToken;
use App\Services\FirebaseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Schema;

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
        $permissionByPlatform = [
            'ios' => ['enabled' => 0, 'disabled' => 0, 'unknown' => 0],
            'android' => ['enabled' => 0, 'disabled' => 0, 'unknown' => 0],
            'web' => ['enabled' => 0, 'disabled' => 0, 'unknown' => 0],
        ];
        $apnsEnvironment = [
            'production' => 0,
            'development' => 0,
            'unknown' => 0,
        ];
        $permissionsEnabledTotal = 0;
        $permissionsDisabledTotal = 0;
        $permissionsUnknownTotal = $totalTokens;
        if (Schema::hasColumn('user_device_tokens', 'notifications_enabled')) {
            $permissionRows = UserDeviceToken::query()
                ->selectRaw('platform, notifications_enabled, count(*) as total')
                ->groupBy('platform', 'notifications_enabled')
                ->get();

            foreach ($permissionRows as $row) {
                $platform = (string) ($row->platform ?? '');
                if (! array_key_exists($platform, $permissionByPlatform)) {
                    $permissionByPlatform[$platform] = ['enabled' => 0, 'disabled' => 0, 'unknown' => 0];
                }

                $total = (int) ($row->total ?? 0);
                if ($row->notifications_enabled === null) {
                    $permissionByPlatform[$platform]['unknown'] += $total;
                } elseif ((bool) $row->notifications_enabled) {
                    $permissionByPlatform[$platform]['enabled'] += $total;
                } else {
                    $permissionByPlatform[$platform]['disabled'] += $total;
                }
            }

            $permissionsEnabledTotal = (int) UserDeviceToken::query()
                ->where('notifications_enabled', true)
                ->count();
            $permissionsDisabledTotal = (int) UserDeviceToken::query()
                ->where('notifications_enabled', false)
                ->count();
            $permissionsUnknownTotal = (int) UserDeviceToken::query()
                ->whereNull('notifications_enabled')
                ->count();
        }
        if (Schema::hasColumn('user_device_tokens', 'apns_environment')) {
            $apnsEnvironment['production'] = (int) UserDeviceToken::query()
                ->where('platform', 'ios')
                ->where('apns_environment', 'production')
                ->count();
            $apnsEnvironment['development'] = (int) UserDeviceToken::query()
                ->where('platform', 'ios')
                ->where('apns_environment', 'development')
                ->count();
            $apnsEnvironment['unknown'] = (int) UserDeviceToken::query()
                ->where('platform', 'ios')
                ->where(function ($query) {
                    $query->whereNull('apns_environment')
                        ->orWhere('apns_environment', '');
                })
                ->count();
        }
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
                'ios_apns_environment' => $apnsEnvironment,
                'permissions' => [
                    'enabled_total' => $permissionsEnabledTotal,
                    'disabled_total' => $permissionsDisabledTotal,
                    'unknown_total' => $permissionsUnknownTotal,
                    'by_platform' => $permissionByPlatform,
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
                'meeting_reminder_enabled' => $setting ? (bool) ($setting->meeting_reminder_enabled ?? true) : true,
                'dedupe_seconds' => $setting ? (int) $setting->notifications_dedupe_seconds : 45,
                'meeting_reminder_minutes_before' => $setting ? (int) $setting->meeting_reminder_minutes_before : 60,
                'task_item_progress_reminder_enabled' => $setting ? (bool) $setting->task_item_progress_reminder_enabled : true,
                'task_item_progress_reminder_time' => $setting ? (string) ($setting->task_item_progress_reminder_time ?: '09:00') : '09:00',
                'task_item_update_submission_notification_enabled' => $setting ? (bool) ($setting->task_item_update_submission_notification_enabled ?? true) : true,
                'task_item_update_feedback_notification_enabled' => $setting ? (bool) ($setting->task_item_update_feedback_notification_enabled ?? true) : true,
                'lead_capture_notification_enabled' => $setting ? (bool) $setting->lead_capture_notification_enabled : true,
                'contract_unpaid_reminder_enabled' => $setting ? (bool) $setting->contract_unpaid_reminder_enabled : true,
                'contract_unpaid_reminder_time' => $setting ? (string) ($setting->contract_unpaid_reminder_time ?: '08:00') : '08:00',
                'contract_expiry_reminder_enabled' => $setting ? (bool) $setting->contract_expiry_reminder_enabled : true,
                'contract_expiry_reminder_time' => $setting ? (string) ($setting->contract_expiry_reminder_time ?: '09:00') : '09:00',
                'contract_expiry_reminder_days_before' => $setting ? (int) ($setting->contract_expiry_reminder_days_before ?? 3) : 3,
                'mail_configured' => $setting
                    ? ((bool) ($setting->smtp_custom_enabled ?? false)
                        ? (trim((string) $setting->smtp_host) !== '' && trim((string) $setting->smtp_from_address) !== '')
                        : ((string) config('mail.default') !== ''))
                    : ((string) config('mail.default') !== ''),
                'smtp' => [
                    'custom_enabled' => $setting ? (bool) ($setting->smtp_custom_enabled ?? false) : false,
                    'mailer' => $setting && $setting->smtp_mailer ? (string) $setting->smtp_mailer : (string) config('mail.default'),
                    'host' => $setting ? (string) ($setting->smtp_host ?: '') : '',
                    'port' => $setting ? (int) ($setting->smtp_port ?: 0) : (int) config('mail.mailers.smtp.port', 0),
                    'encryption' => $setting ? (string) ($setting->smtp_encryption ?: '') : (string) config('mail.mailers.smtp.encryption', ''),
                    'username' => $setting ? (string) ($setting->smtp_username ?: '') : '',
                    'from_address' => $setting ? (string) ($setting->smtp_from_address ?: '') : (string) config('mail.from.address'),
                    'from_name' => $setting ? (string) ($setting->smtp_from_name ?: '') : (string) config('mail.from.name'),
                ],
                'schedule' => [
                    'meetings_send_reminders' => ($setting ? (bool) ($setting->meeting_reminder_enabled ?? true) : true)
                        ? '* * * * * (khớp giờ họp theo cấu hình)'
                        : 'đang tắt',
                    'task_items_remind_progress' => sprintf(
                        'every minute (gửi lúc %s)',
                        $setting && $setting->task_item_progress_reminder_time
                            ? (string) $setting->task_item_progress_reminder_time
                            : '09:00'
                    ),
                    'contracts_send_reminders' => '* * * * *',
                ],
                'app_settings_exists' => ! is_null($setting),
                'brand_name' => $setting ? (string) $setting->brand_name : (string) $defaults['brand_name'],
            ],
        ]);
    }
}
