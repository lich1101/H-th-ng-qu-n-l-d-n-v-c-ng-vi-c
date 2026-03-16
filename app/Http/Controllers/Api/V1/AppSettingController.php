<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class AppSettingController extends Controller
{
    public function show(): JsonResponse
    {
        $setting = AppSetting::query()->first();
        if (! $setting) {
            return response()->json(AppSetting::defaults());
        }

        return response()->json([
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
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        if (! $request->user() || $request->user()->role !== 'admin') {
            return response()->json(['message' => 'Không có quyền cập nhật cài đặt.'], 403);
        }

        $validated = $request->validate([
            'brand_name' => ['nullable', 'string', 'max:120'],
            'primary_color' => ['nullable', 'regex:/^#([0-9A-Fa-f]{6})$/'],
            'logo_url' => ['nullable', 'string', 'max:255'],
            'support_email' => ['nullable', 'email', 'max:120'],
            'support_phone' => ['nullable', 'string', 'max:40'],
            'support_address' => ['nullable', 'string', 'max:255'],
            'notifications_push_enabled' => ['nullable', 'boolean'],
            'notifications_in_app_enabled' => ['nullable', 'boolean'],
            'notifications_email_fallback_enabled' => ['nullable', 'boolean'],
            'notifications_dedupe_seconds' => ['nullable', 'integer', 'min:0', 'max:3600'],
            'meeting_reminder_minutes_before' => ['nullable', 'integer', 'min:1', 'max:1440'],
            'task_item_progress_reminder_enabled' => ['nullable', 'boolean'],
            'logo' => ['nullable', 'file', 'max:5120'],
        ]);

        $setting = AppSetting::query()->first();
        if (! $setting) {
            $setting = AppSetting::create(AppSetting::defaults());
        }

        $logoUrl = $validated['logo_url'] ?? $setting->logo_url ?? AppSetting::defaults()['logo_url'];
        if ($request->hasFile('logo')) {
            $stored = $request->file('logo')->store('brand', 'public');
            $logoUrl = Storage::url($stored);
        }

        $setting->update([
            'brand_name' => $validated['brand_name'] ?? $setting->brand_name,
            'primary_color' => $validated['primary_color'] ?? $setting->primary_color,
            'logo_url' => $logoUrl,
            'support_email' => $validated['support_email'] ?? $setting->support_email,
            'support_phone' => $validated['support_phone'] ?? $setting->support_phone,
            'support_address' => $validated['support_address'] ?? $setting->support_address,
            'notifications_push_enabled' => array_key_exists('notifications_push_enabled', $validated)
                ? (bool) $validated['notifications_push_enabled']
                : $setting->notifications_push_enabled,
            'notifications_in_app_enabled' => array_key_exists('notifications_in_app_enabled', $validated)
                ? (bool) $validated['notifications_in_app_enabled']
                : $setting->notifications_in_app_enabled,
            'notifications_email_fallback_enabled' => array_key_exists('notifications_email_fallback_enabled', $validated)
                ? (bool) $validated['notifications_email_fallback_enabled']
                : $setting->notifications_email_fallback_enabled,
            'notifications_dedupe_seconds' => array_key_exists('notifications_dedupe_seconds', $validated)
                ? (int) $validated['notifications_dedupe_seconds']
                : $setting->notifications_dedupe_seconds,
            'meeting_reminder_minutes_before' => array_key_exists('meeting_reminder_minutes_before', $validated)
                ? (int) $validated['meeting_reminder_minutes_before']
                : $setting->meeting_reminder_minutes_before,
            'task_item_progress_reminder_enabled' => array_key_exists('task_item_progress_reminder_enabled', $validated)
                ? (bool) $validated['task_item_progress_reminder_enabled']
                : $setting->task_item_progress_reminder_enabled,
            'updated_by' => $request->user()->id,
        ]);

        return response()->json([
            'brand_name' => $setting->brand_name ?: config('app.name', 'Job ClickOn'),
            'primary_color' => $setting->primary_color,
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
        ]);
    }
}
