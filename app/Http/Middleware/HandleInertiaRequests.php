<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;
use Tightenco\Ziggy\Ziggy;
use App\Models\AppSetting;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that is loaded on the first page visit.
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determine the current asset version.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return string|null
     */
    public function version(Request $request)
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return array
     */
    public function share(Request $request)
    {
        $setting = AppSetting::query()->first();
        $settingsPayload = $setting
            ? [
                'brand_name' => $setting->brand_name ?: config('app.name', 'Jobs ClickOn'),
                'primary_color' => $setting->primary_color ?: '#04BC5C',
                'logo_url' => $setting->logo_url ?: AppSetting::defaults()['logo_url'],
                'support_email' => $setting->support_email,
                'support_phone' => $setting->support_phone,
                'support_address' => $setting->support_address,
                'notifications_push_enabled' => (bool) ($setting->notifications_push_enabled ?? true),
                'notifications_in_app_enabled' => (bool) ($setting->notifications_in_app_enabled ?? true),
                'notifications_email_fallback_enabled' => (bool) ($setting->notifications_email_fallback_enabled ?? true),
                'meeting_reminder_enabled' => (bool) ($setting->meeting_reminder_enabled ?? true),
                'notifications_dedupe_seconds' => (int) ($setting->notifications_dedupe_seconds ?? 45),
                'meeting_reminder_minutes_before' => (int) ($setting->meeting_reminder_minutes_before ?? 60),
                'task_item_progress_reminder_enabled' => (bool) ($setting->task_item_progress_reminder_enabled ?? true),
                'task_item_progress_reminder_time' => (string) ($setting->task_item_progress_reminder_time ?: '09:00'),
                'lead_capture_notification_enabled' => (bool) ($setting->lead_capture_notification_enabled ?? true),
                'contract_unpaid_reminder_enabled' => (bool) ($setting->contract_unpaid_reminder_enabled ?? true),
                'contract_unpaid_reminder_time' => (string) ($setting->contract_unpaid_reminder_time ?: '08:00'),
                'contract_expiry_reminder_enabled' => (bool) ($setting->contract_expiry_reminder_enabled ?? true),
                'contract_expiry_reminder_time' => (string) ($setting->contract_expiry_reminder_time ?: '09:00'),
                'contract_expiry_reminder_days_before' => (int) ($setting->contract_expiry_reminder_days_before ?? 3),
                'project_handover_min_progress_percent' => (int) ($setting->project_handover_min_progress_percent ?? 90),
                'attendance_enabled' => (bool) ($setting->attendance_enabled ?? true),
                'attendance_work_start_time' => (string) ($setting->attendance_work_start_time ?: '08:30'),
                'attendance_work_end_time' => (string) ($setting->attendance_work_end_time ?: '17:30'),
                'attendance_afternoon_start_time' => (string) ($setting->attendance_afternoon_start_time ?: '13:30'),
                'attendance_late_grace_minutes' => (int) ($setting->attendance_late_grace_minutes ?? 10),
                'attendance_reminder_enabled' => (bool) ($setting->attendance_reminder_enabled ?? true),
                'attendance_reminder_minutes_before' => (int) ($setting->attendance_reminder_minutes_before ?? 10),
                'app_android_apk_url' => $setting->app_android_apk_url,
                'app_ios_testflight_url' => $setting->app_ios_testflight_url,
                'app_release_notes' => $setting->app_release_notes,
                'app_release_version' => $setting->app_release_version,
            ]
            : AppSetting::defaults();

        $impersonator = $request->session()->get('impersonator');

        return array_merge(parent::share($request), [
            'auth' => [
                'user' => $request->user(),
            ],
            'impersonation' => is_array($impersonator) && ! empty($impersonator['id'])
                ? [
                    'active' => true,
                    'original' => [
                        'id' => (int) $impersonator['id'],
                        'name' => (string) ($impersonator['name'] ?? ''),
                        'email' => (string) ($impersonator['email'] ?? ''),
                    ],
                ]
                : [
                    'active' => false,
                    'original' => null,
                ],
            'settings' => $settingsPayload,
            'ziggy' => function () use ($request) {
                return array_merge((new Ziggy)->toArray(), [
                    'location' => $request->url(),
                ]);
            },
        ]);
    }
}
