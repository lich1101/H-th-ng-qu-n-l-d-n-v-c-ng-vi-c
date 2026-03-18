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
        return response()->json($this->publicPayload($setting));
    }

    public function adminShow(Request $request): JsonResponse
    {
        if (! $request->user() || $request->user()->role !== 'administrator') {
            return response()->json(['message' => 'Không có quyền xem cài đặt nâng cao.'], 403);
        }

        $setting = AppSetting::query()->first();

        return response()->json($this->adminPayload($setting));
    }

    public function update(Request $request): JsonResponse
    {
        if (! $request->user() || $request->user()->role !== 'administrator') {
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
            'meeting_reminder_enabled' => ['nullable', 'boolean'],
            'notifications_dedupe_seconds' => ['nullable', 'integer', 'min:0', 'max:3600'],
            'meeting_reminder_minutes_before' => ['nullable', 'integer', 'min:1', 'max:1440'],
            'task_item_progress_reminder_enabled' => ['nullable', 'boolean'],
            'task_item_progress_reminder_time' => ['nullable', 'regex:/^\d{2}:\d{2}$/'],
            'task_item_update_submission_notification_enabled' => ['nullable', 'boolean'],
            'task_item_update_feedback_notification_enabled' => ['nullable', 'boolean'],
            'lead_capture_notification_enabled' => ['nullable', 'boolean'],
            'contract_unpaid_reminder_enabled' => ['nullable', 'boolean'],
            'contract_unpaid_reminder_time' => ['nullable', 'regex:/^\d{2}:\d{2}$/'],
            'contract_expiry_reminder_enabled' => ['nullable', 'boolean'],
            'contract_expiry_reminder_time' => ['nullable', 'regex:/^\d{2}:\d{2}$/'],
            'contract_expiry_reminder_days_before' => ['nullable', 'integer', 'min:1', 'max:30'],
            'smtp_custom_enabled' => ['nullable', 'boolean'],
            'smtp_mailer' => ['nullable', 'string', 'in:smtp'],
            'smtp_host' => ['nullable', 'string', 'max:120'],
            'smtp_port' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'smtp_encryption' => ['nullable', 'string', 'in:tls,ssl,none'],
            'smtp_username' => ['nullable', 'string', 'max:120'],
            'smtp_password' => ['nullable', 'string', 'max:255'],
            'smtp_from_address' => ['nullable', 'email', 'max:120'],
            'smtp_from_name' => ['nullable', 'string', 'max:120'],
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
            'meeting_reminder_enabled' => array_key_exists('meeting_reminder_enabled', $validated)
                ? (bool) $validated['meeting_reminder_enabled']
                : $setting->meeting_reminder_enabled,
            'notifications_dedupe_seconds' => array_key_exists('notifications_dedupe_seconds', $validated)
                ? (int) $validated['notifications_dedupe_seconds']
                : $setting->notifications_dedupe_seconds,
            'meeting_reminder_minutes_before' => array_key_exists('meeting_reminder_minutes_before', $validated)
                ? (int) $validated['meeting_reminder_minutes_before']
                : $setting->meeting_reminder_minutes_before,
            'task_item_progress_reminder_enabled' => array_key_exists('task_item_progress_reminder_enabled', $validated)
                ? (bool) $validated['task_item_progress_reminder_enabled']
                : $setting->task_item_progress_reminder_enabled,
            'task_item_progress_reminder_time' => array_key_exists('task_item_progress_reminder_time', $validated)
                ? (string) $validated['task_item_progress_reminder_time']
                : $setting->task_item_progress_reminder_time,
            'task_item_update_submission_notification_enabled' => array_key_exists('task_item_update_submission_notification_enabled', $validated)
                ? (bool) $validated['task_item_update_submission_notification_enabled']
                : $setting->task_item_update_submission_notification_enabled,
            'task_item_update_feedback_notification_enabled' => array_key_exists('task_item_update_feedback_notification_enabled', $validated)
                ? (bool) $validated['task_item_update_feedback_notification_enabled']
                : $setting->task_item_update_feedback_notification_enabled,
            'lead_capture_notification_enabled' => array_key_exists('lead_capture_notification_enabled', $validated)
                ? (bool) $validated['lead_capture_notification_enabled']
                : $setting->lead_capture_notification_enabled,
            'contract_unpaid_reminder_enabled' => array_key_exists('contract_unpaid_reminder_enabled', $validated)
                ? (bool) $validated['contract_unpaid_reminder_enabled']
                : $setting->contract_unpaid_reminder_enabled,
            'contract_unpaid_reminder_time' => array_key_exists('contract_unpaid_reminder_time', $validated)
                ? (string) $validated['contract_unpaid_reminder_time']
                : $setting->contract_unpaid_reminder_time,
            'contract_expiry_reminder_enabled' => array_key_exists('contract_expiry_reminder_enabled', $validated)
                ? (bool) $validated['contract_expiry_reminder_enabled']
                : $setting->contract_expiry_reminder_enabled,
            'contract_expiry_reminder_time' => array_key_exists('contract_expiry_reminder_time', $validated)
                ? (string) $validated['contract_expiry_reminder_time']
                : $setting->contract_expiry_reminder_time,
            'contract_expiry_reminder_days_before' => array_key_exists('contract_expiry_reminder_days_before', $validated)
                ? (int) $validated['contract_expiry_reminder_days_before']
                : $setting->contract_expiry_reminder_days_before,
            'smtp_custom_enabled' => array_key_exists('smtp_custom_enabled', $validated)
                ? (bool) $validated['smtp_custom_enabled']
                : $setting->smtp_custom_enabled,
            'smtp_mailer' => array_key_exists('smtp_mailer', $validated)
                ? (string) $validated['smtp_mailer']
                : $setting->smtp_mailer,
            'smtp_host' => array_key_exists('smtp_host', $validated)
                ? $validated['smtp_host']
                : $setting->smtp_host,
            'smtp_port' => array_key_exists('smtp_port', $validated)
                ? (int) $validated['smtp_port']
                : $setting->smtp_port,
            'smtp_encryption' => array_key_exists('smtp_encryption', $validated)
                ? (($validated['smtp_encryption'] ?? '') === 'none' ? null : $validated['smtp_encryption'])
                : $setting->smtp_encryption,
            'smtp_username' => array_key_exists('smtp_username', $validated)
                ? $validated['smtp_username']
                : $setting->smtp_username,
            'smtp_password' => array_key_exists('smtp_password', $validated)
                ? $validated['smtp_password']
                : $setting->smtp_password,
            'smtp_from_address' => array_key_exists('smtp_from_address', $validated)
                ? $validated['smtp_from_address']
                : $setting->smtp_from_address,
            'smtp_from_name' => array_key_exists('smtp_from_name', $validated)
                ? $validated['smtp_from_name']
                : $setting->smtp_from_name,
            'updated_by' => $request->user()->id,
        ]);

        return response()->json($this->adminPayload($setting));
    }

    private function publicPayload(?AppSetting $setting): array
    {
        $defaults = AppSetting::defaults();
        return [
            'brand_name' => $setting && $setting->brand_name ? $setting->brand_name : config('app.name', 'Job ClickOn'),
            'primary_color' => $setting && $setting->primary_color ? $setting->primary_color : '#04BC5C',
            'logo_url' => $setting && $setting->logo_url ? $setting->logo_url : $defaults['logo_url'],
            'support_email' => $setting ? $setting->support_email : null,
            'support_phone' => $setting ? $setting->support_phone : null,
            'support_address' => $setting ? $setting->support_address : null,
            'notifications_push_enabled' => $setting ? (bool) ($setting->notifications_push_enabled ?? true) : true,
            'notifications_in_app_enabled' => $setting ? (bool) ($setting->notifications_in_app_enabled ?? true) : true,
            'notifications_email_fallback_enabled' => $setting ? (bool) ($setting->notifications_email_fallback_enabled ?? true) : true,
            'meeting_reminder_enabled' => $setting ? (bool) ($setting->meeting_reminder_enabled ?? true) : true,
            'notifications_dedupe_seconds' => $setting ? (int) ($setting->notifications_dedupe_seconds ?? 45) : 45,
            'meeting_reminder_minutes_before' => $setting ? (int) ($setting->meeting_reminder_minutes_before ?? 60) : 60,
            'task_item_progress_reminder_enabled' => $setting ? (bool) ($setting->task_item_progress_reminder_enabled ?? true) : true,
            'task_item_progress_reminder_time' => $setting && $setting->task_item_progress_reminder_time ? (string) $setting->task_item_progress_reminder_time : '09:00',
            'task_item_update_submission_notification_enabled' => $setting ? (bool) ($setting->task_item_update_submission_notification_enabled ?? true) : true,
            'task_item_update_feedback_notification_enabled' => $setting ? (bool) ($setting->task_item_update_feedback_notification_enabled ?? true) : true,
            'lead_capture_notification_enabled' => $setting ? (bool) ($setting->lead_capture_notification_enabled ?? true) : true,
            'contract_unpaid_reminder_enabled' => $setting ? (bool) ($setting->contract_unpaid_reminder_enabled ?? true) : true,
            'contract_unpaid_reminder_time' => $setting && $setting->contract_unpaid_reminder_time ? (string) $setting->contract_unpaid_reminder_time : '08:00',
            'contract_expiry_reminder_enabled' => $setting ? (bool) ($setting->contract_expiry_reminder_enabled ?? true) : true,
            'contract_expiry_reminder_time' => $setting && $setting->contract_expiry_reminder_time ? (string) $setting->contract_expiry_reminder_time : '09:00',
            'contract_expiry_reminder_days_before' => $setting ? (int) ($setting->contract_expiry_reminder_days_before ?? 3) : 3,
        ];
    }

    private function adminPayload(?AppSetting $setting): array
    {
        $payload = $this->publicPayload($setting);
        $defaults = AppSetting::defaults();

        return array_merge($payload, [
            'smtp_custom_enabled' => $setting ? (bool) ($setting->smtp_custom_enabled ?? $defaults['smtp_custom_enabled']) : (bool) $defaults['smtp_custom_enabled'],
            'smtp_mailer' => $setting && $setting->smtp_mailer ? (string) $setting->smtp_mailer : (string) $defaults['smtp_mailer'],
            'smtp_host' => $setting ? $setting->smtp_host : null,
            'smtp_port' => $setting && $setting->smtp_port ? (int) $setting->smtp_port : (int) $defaults['smtp_port'],
            'smtp_encryption' => $setting && $setting->smtp_encryption ? (string) $setting->smtp_encryption : (string) $defaults['smtp_encryption'],
            'smtp_username' => $setting ? $setting->smtp_username : null,
            'smtp_password' => $setting ? $setting->smtp_password : null,
            'smtp_from_address' => $setting ? $setting->smtp_from_address : null,
            'smtp_from_name' => $setting ? $setting->smtp_from_name : null,
        ]);
    }
}
