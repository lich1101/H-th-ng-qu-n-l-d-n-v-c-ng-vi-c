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
                'brand_name' => $setting->brand_name ?: config('app.name', 'Job ClickOn'),
                'primary_color' => $setting->primary_color ?: '#04BC5C',
                'logo_url' => $setting->logo_url ?: AppSetting::defaults()['logo_url'],
                'support_email' => $setting->support_email,
                'support_phone' => $setting->support_phone,
                'support_address' => $setting->support_address,
                'notifications_push_enabled' => (bool) ($setting->notifications_push_enabled ?? true),
                'notifications_in_app_enabled' => (bool) ($setting->notifications_in_app_enabled ?? true),
                'notifications_email_fallback_enabled' => (bool) ($setting->notifications_email_fallback_enabled ?? true),
                'notifications_dedupe_seconds' => (int) ($setting->notifications_dedupe_seconds ?? 45),
                'meeting_reminder_minutes_before' => (int) ($setting->meeting_reminder_minutes_before ?? 60),
                'task_item_progress_reminder_enabled' => (bool) ($setting->task_item_progress_reminder_enabled ?? true),
            ]
            : AppSetting::defaults();

        return array_merge(parent::share($request), [
            'auth' => [
                'user' => $request->user(),
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
