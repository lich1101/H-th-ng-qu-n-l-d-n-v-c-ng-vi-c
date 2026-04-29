<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\LeadType;
use App\Models\User;
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
            'project_handover_min_progress_percent' => ['nullable', 'integer', 'min:1', 'max:100'],
            'smtp_custom_enabled' => ['nullable', 'boolean'],
            'smtp_mailer' => ['nullable', 'string', 'in:smtp'],
            'smtp_host' => ['nullable', 'string', 'max:120'],
            'smtp_port' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'smtp_encryption' => ['nullable', 'string', 'in:tls,ssl,none'],
            'smtp_username' => ['nullable', 'string', 'max:120'],
            'smtp_password' => ['nullable', 'string', 'max:255'],
            'smtp_from_address' => ['nullable', 'email', 'max:120'],
            'smtp_from_name' => ['nullable', 'string', 'max:120'],
            'chatbot_enabled' => ['nullable', 'boolean'],
            'chatbot_provider' => ['nullable', 'string', 'in:gemini'],
            'chatbot_model' => ['nullable', 'string', 'max:120'],
            'chatbot_api_key' => ['nullable', 'string', 'max:4096'],
            'chatbot_system_message_markdown' => ['nullable', 'string', 'max:120000'],
            'chatbot_history_pairs' => ['nullable', 'integer', 'min:1', 'max:40'],
            'gsc_enabled' => ['nullable', 'boolean'],
            'gsc_client_id' => ['nullable', 'string', 'max:255'],
            'gsc_client_secret' => ['nullable', 'string', 'max:255'],
            'gsc_refresh_token' => ['nullable', 'string', 'max:4096'],
            'gsc_row_limit' => ['nullable', 'integer', 'min:100', 'max:25000'],
            'gsc_data_state' => ['nullable', 'string', 'in:all,final'],
            'gsc_alert_threshold_percent' => ['nullable', 'integer', 'min:1', 'max:100'],
            'gsc_recipes_path_token' => ['nullable', 'string', 'max:120'],
            'gsc_brand_terms' => ['nullable', 'string', 'max:12000'],
            'gsc_sync_time' => ['nullable', 'regex:/^\d{2}:\d{2}$/'],
            'client_rotation_enabled' => ['nullable', 'boolean'],
            'client_rotation_comment_stale_days' => ['nullable', 'integer', 'min:1', 'max:3650'],
            'client_rotation_opportunity_stale_days' => ['nullable', 'integer', 'min:1', 'max:3650'],
            'client_rotation_contract_stale_days' => ['nullable', 'integer', 'min:1', 'max:3650'],
            'client_rotation_warning_days' => ['nullable', 'integer', 'min:0', 'max:60'],
            'client_rotation_daily_receive_limit' => ['nullable', 'integer', 'min:1', 'max:100'],
            'client_rotation_pool_claim_daily_limit' => ['nullable', 'integer', 'min:1', 'max:100'],
            'client_rotation_run_time' => ['nullable', 'regex:/^(?:[01]\d|2[0-3]):[0-5]\d$/'],
            'client_rotation_lead_type_ids' => ['nullable'],
            'client_rotation_participant_user_ids' => ['nullable'],
            'client_rotation_same_department_only' => ['nullable', 'boolean'],
            'client_rotation_scope_mode' => ['nullable', 'string', 'in:same_department,global_staff,balanced_department'],
            'client_rotation_participant_modes' => ['nullable'],
            'app_android_apk_url' => ['nullable', 'string', 'max:255'],
            'app_ios_testflight_url' => ['nullable', 'string', 'max:255'],
            'app_release_notes' => ['nullable', 'string', 'max:20000'],
            'app_release_version' => ['nullable', 'string', 'max:40'],
            'logo' => ['nullable', 'file', 'max:5120'],
            'app_android_apk_file' => ['nullable', 'file', 'max:262144'],
        ]);

        $setting = AppSetting::query()->first();
        if (! $setting) {
            $setting = AppSetting::create(AppSetting::defaults());
        }

        $brandTerms = array_key_exists('gsc_brand_terms', $validated)
            ? $this->normalizeBrandTerms($validated['gsc_brand_terms'] ?? null)
            : $this->extractBrandTermsFromSetting($setting);
        $clientRotationLeadTypeIds = array_key_exists('client_rotation_lead_type_ids', $validated)
            ? $this->normalizeIntegerList($request->input('client_rotation_lead_type_ids'))
            : $this->extractIntegerListFromSetting($setting?->client_rotation_lead_type_ids);
        $clientRotationParticipantUserIds = array_key_exists('client_rotation_participant_user_ids', $validated)
            ? $this->normalizeIntegerList($request->input('client_rotation_participant_user_ids'))
            : $this->extractIntegerListFromSetting($setting?->client_rotation_participant_user_ids);
        $clientRotationScopeMode = $this->resolveClientRotationScopeMode(
            array_key_exists('client_rotation_scope_mode', $validated)
                ? $validated['client_rotation_scope_mode']
                : null,
            array_key_exists('client_rotation_same_department_only', $validated)
                ? $validated['client_rotation_same_department_only']
                : ($setting->client_rotation_same_department_only ?? null),
            $setting?->client_rotation_scope_mode
        );
        $clientRotationParticipantModes = array_key_exists('client_rotation_participant_modes', $validated)
            ? $this->normalizeClientRotationParticipantModes(
                $request->input('client_rotation_participant_modes'),
                $clientRotationParticipantUserIds
            )
            : $this->extractClientRotationParticipantModes(
                $setting?->client_rotation_participant_modes,
                $clientRotationParticipantUserIds
            );

        if (! empty($clientRotationLeadTypeIds)) {
            $leadTypeCount = LeadType::query()
                ->whereIn('id', $clientRotationLeadTypeIds)
                ->count();
            if ($leadTypeCount !== count($clientRotationLeadTypeIds)) {
                return response()->json(['message' => 'Danh sách loại khách xoay vòng không hợp lệ.'], 422);
            }
        }

        if (! empty($clientRotationParticipantUserIds)) {
            $participantCount = User::query()
                ->whereIn('id', $clientRotationParticipantUserIds)
                ->whereIn('role', ['quan_ly', 'nhan_vien'])
                ->where(function ($query) {
                    $query->whereNull('is_active')->orWhere('is_active', true);
                })
                ->count();
            if ($participantCount !== count($clientRotationParticipantUserIds)) {
                return response()->json(['message' => 'Danh sách nhân sự xoay vòng chỉ được gồm quản lý/nhân viên đang hoạt động.'], 422);
            }
        }

        $logoUrl = $validated['logo_url'] ?? $setting->logo_url ?? AppSetting::defaults()['logo_url'];
        if ($request->hasFile('logo')) {
            $stored = $request->file('logo')->store('brand', 'public');
            $logoUrl = Storage::url($stored);
        }

        $apkUrl = array_key_exists('app_android_apk_url', $validated)
            ? trim((string) ($validated['app_android_apk_url'] ?? ''))
            : ($setting->app_android_apk_url ?? null);
        if ($apkUrl === '') {
            $apkUrl = null;
        }
        if ($request->hasFile('app_android_apk_file')) {
            $storedApk = $request->file('app_android_apk_file')->store('app-builds', 'public');
            $apkUrl = Storage::url($storedApk);
        }
        $iosTestflightUrl = array_key_exists('app_ios_testflight_url', $validated)
            ? trim((string) ($validated['app_ios_testflight_url'] ?? ''))
            : $setting->app_ios_testflight_url;
        if ($iosTestflightUrl === '') {
            $iosTestflightUrl = null;
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
            'project_handover_min_progress_percent' => array_key_exists('project_handover_min_progress_percent', $validated)
                ? (int) $validated['project_handover_min_progress_percent']
                : $setting->project_handover_min_progress_percent,
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
            'chatbot_enabled' => array_key_exists('chatbot_enabled', $validated)
                ? (bool) $validated['chatbot_enabled']
                : $setting->chatbot_enabled,
            'chatbot_provider' => array_key_exists('chatbot_provider', $validated)
                ? (string) $validated['chatbot_provider']
                : ($setting->chatbot_provider ?: 'gemini'),
            'chatbot_model' => array_key_exists('chatbot_model', $validated)
                ? $validated['chatbot_model']
                : $setting->chatbot_model,
            'chatbot_api_key' => array_key_exists('chatbot_api_key', $validated)
                ? $validated['chatbot_api_key']
                : $setting->chatbot_api_key,
            'chatbot_system_message_markdown' => array_key_exists('chatbot_system_message_markdown', $validated)
                ? $validated['chatbot_system_message_markdown']
                : $setting->chatbot_system_message_markdown,
            'chatbot_history_pairs' => array_key_exists('chatbot_history_pairs', $validated)
                ? (int) $validated['chatbot_history_pairs']
                : (int) ($setting->chatbot_history_pairs ?: 8),
            'gsc_enabled' => array_key_exists('gsc_enabled', $validated)
                ? (bool) $validated['gsc_enabled']
                : (bool) ($setting->gsc_enabled ?? false),
            'gsc_client_id' => array_key_exists('gsc_client_id', $validated)
                ? trim((string) ($validated['gsc_client_id'] ?? ''))
                : $setting->gsc_client_id,
            'gsc_client_secret' => array_key_exists('gsc_client_secret', $validated)
                ? trim((string) ($validated['gsc_client_secret'] ?? ''))
                : $setting->gsc_client_secret,
            'gsc_refresh_token' => array_key_exists('gsc_refresh_token', $validated)
                ? trim((string) ($validated['gsc_refresh_token'] ?? ''))
                : $setting->gsc_refresh_token,
            'gsc_row_limit' => array_key_exists('gsc_row_limit', $validated)
                ? (int) $validated['gsc_row_limit']
                : (int) ($setting->gsc_row_limit ?? 2500),
            'gsc_data_state' => array_key_exists('gsc_data_state', $validated)
                ? (string) $validated['gsc_data_state']
                : (string) ($setting->gsc_data_state ?: 'all'),
            'gsc_alert_threshold_percent' => array_key_exists('gsc_alert_threshold_percent', $validated)
                ? (int) $validated['gsc_alert_threshold_percent']
                : (int) ($setting->gsc_alert_threshold_percent ?? 30),
            'gsc_recipes_path_token' => array_key_exists('gsc_recipes_path_token', $validated)
                ? trim((string) ($validated['gsc_recipes_path_token'] ?? '/recipes'))
                : (string) ($setting->gsc_recipes_path_token ?: '/recipes'),
            'gsc_brand_terms' => $brandTerms,
            'gsc_sync_time' => array_key_exists('gsc_sync_time', $validated)
                ? (string) $validated['gsc_sync_time']
                : (string) ($setting->gsc_sync_time ?: '11:17'),
            'client_rotation_enabled' => array_key_exists('client_rotation_enabled', $validated)
                ? (bool) $validated['client_rotation_enabled']
                : (bool) ($setting->client_rotation_enabled ?? false),
            'client_rotation_comment_stale_days' => array_key_exists('client_rotation_comment_stale_days', $validated)
                ? (int) $validated['client_rotation_comment_stale_days']
                : (int) ($setting->client_rotation_comment_stale_days ?? 3),
            'client_rotation_opportunity_stale_days' => array_key_exists('client_rotation_opportunity_stale_days', $validated)
                ? (int) $validated['client_rotation_opportunity_stale_days']
                : (int) ($setting->client_rotation_opportunity_stale_days ?? 30),
            'client_rotation_contract_stale_days' => array_key_exists('client_rotation_contract_stale_days', $validated)
                ? (int) $validated['client_rotation_contract_stale_days']
                : (int) ($setting->client_rotation_contract_stale_days ?? 90),
            'client_rotation_warning_days' => array_key_exists('client_rotation_warning_days', $validated)
                ? (int) $validated['client_rotation_warning_days']
                : (int) ($setting->client_rotation_warning_days ?? 3),
            'client_rotation_daily_receive_limit' => array_key_exists('client_rotation_daily_receive_limit', $validated)
                ? (int) $validated['client_rotation_daily_receive_limit']
                : (int) ($setting->client_rotation_daily_receive_limit ?? 5),
            'client_rotation_pool_claim_daily_limit' => array_key_exists('client_rotation_pool_claim_daily_limit', $validated)
                ? (int) $validated['client_rotation_pool_claim_daily_limit']
                : (int) ($setting->client_rotation_pool_claim_daily_limit ?? 5),
            'client_rotation_run_time' => array_key_exists('client_rotation_run_time', $validated)
                ? (string) $validated['client_rotation_run_time']
                : (string) ($setting->client_rotation_run_time ?? '12:00'),
            'client_rotation_lead_type_ids' => $clientRotationLeadTypeIds,
            'client_rotation_participant_user_ids' => $clientRotationParticipantUserIds,
            'client_rotation_same_department_only' => $clientRotationScopeMode === 'same_department',
            'client_rotation_scope_mode' => $clientRotationScopeMode,
            'client_rotation_participant_modes' => $clientRotationParticipantModes,
            'app_android_apk_url' => $apkUrl,
            'app_ios_testflight_url' => $iosTestflightUrl,
            'app_release_notes' => array_key_exists('app_release_notes', $validated)
                ? trim((string) ($validated['app_release_notes'] ?? ''))
                : $setting->app_release_notes,
            'app_release_version' => array_key_exists('app_release_version', $validated)
                ? trim((string) ($validated['app_release_version'] ?? ''))
                : $setting->app_release_version,
            'updated_by' => $request->user()->id,
        ]);

        return response()->json($this->adminPayload($setting));
    }

    private function publicPayload(?AppSetting $setting): array
    {
        $defaults = AppSetting::defaults();
        return [
            'brand_name' => $setting && $setting->brand_name ? $setting->brand_name : config('app.name', 'Jobs ClickOn'),
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
            'project_handover_min_progress_percent' => $setting ? (int) ($setting->project_handover_min_progress_percent ?? 90) : 90,
            'attendance_enabled' => $setting ? (bool) ($setting->attendance_enabled ?? true) : true,
            'attendance_work_start_time' => $setting && $setting->attendance_work_start_time ? (string) $setting->attendance_work_start_time : '08:30',
            'attendance_work_end_time' => $setting && $setting->attendance_work_end_time ? (string) $setting->attendance_work_end_time : '17:30',
            'attendance_afternoon_start_time' => $setting && $setting->attendance_afternoon_start_time ? (string) $setting->attendance_afternoon_start_time : '13:30',
            'attendance_late_grace_minutes' => $setting ? (int) ($setting->attendance_late_grace_minutes ?? 10) : 10,
            'attendance_reminder_enabled' => $setting ? (bool) ($setting->attendance_reminder_enabled ?? true) : true,
            'attendance_reminder_minutes_before' => $setting ? (int) ($setting->attendance_reminder_minutes_before ?? 10) : 10,
            'client_rotation_enabled' => $setting ? (bool) ($setting->client_rotation_enabled ?? false) : false,
            'client_rotation_comment_stale_days' => $setting ? (int) ($setting->client_rotation_comment_stale_days ?? 3) : 3,
            'client_rotation_opportunity_stale_days' => $setting ? (int) ($setting->client_rotation_opportunity_stale_days ?? 30) : 30,
            'client_rotation_contract_stale_days' => $setting ? (int) ($setting->client_rotation_contract_stale_days ?? 90) : 90,
            'client_rotation_warning_days' => $setting ? (int) ($setting->client_rotation_warning_days ?? 3) : 3,
            'client_rotation_daily_receive_limit' => $setting ? (int) ($setting->client_rotation_daily_receive_limit ?? 5) : 5,
            'client_rotation_pool_claim_daily_limit' => $setting ? (int) ($setting->client_rotation_pool_claim_daily_limit ?? 5) : 5,
            'client_rotation_run_time' => $setting && $setting->client_rotation_run_time
                ? (string) $setting->client_rotation_run_time
                : '12:00',
            'client_rotation_lead_type_ids' => $this->extractIntegerListFromSetting($setting?->client_rotation_lead_type_ids),
            'client_rotation_participant_user_ids' => $this->extractIntegerListFromSetting($setting?->client_rotation_participant_user_ids),
            'client_rotation_same_department_only' => $this->clientRotationScopeModeFromSetting($setting) === 'same_department',
            'client_rotation_scope_mode' => $this->clientRotationScopeModeFromSetting($setting),
            'client_rotation_participant_modes' => $this->extractClientRotationParticipantModes(
                $setting?->client_rotation_participant_modes,
                $this->extractIntegerListFromSetting($setting?->client_rotation_participant_user_ids)
            ),
            'app_android_apk_url' => $setting ? $setting->app_android_apk_url : null,
            'app_ios_testflight_url' => $setting ? $setting->app_ios_testflight_url : null,
            'app_release_notes' => $setting ? $setting->app_release_notes : null,
            'app_release_version' => $setting ? $setting->app_release_version : null,
            'chatbot_enabled' => $setting ? (bool) ($setting->chatbot_enabled ?? false) : false,
            'chatbot_provider' => $setting && $setting->chatbot_provider ? (string) $setting->chatbot_provider : 'gemini',
            'chatbot_model' => $setting && $setting->chatbot_model ? (string) $setting->chatbot_model : (string) ($defaults['chatbot_model'] ?? 'gemini-2.0-flash'),
            'chatbot_history_pairs' => $setting ? (int) ($setting->chatbot_history_pairs ?? 8) : 8,
            'gsc_enabled' => $setting ? (bool) ($setting->gsc_enabled ?? false) : false,
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
            'chatbot_api_key' => $setting ? $setting->chatbot_api_key : null,
            'chatbot_system_message_markdown' => $setting ? $setting->chatbot_system_message_markdown : null,
            'gsc_client_id' => $setting ? (string) ($setting->gsc_client_id ?? '') : '',
            'gsc_client_secret' => $setting ? (string) ($setting->gsc_client_secret ?? '') : '',
            'gsc_refresh_token' => $setting ? (string) ($setting->gsc_refresh_token ?? '') : '',
            'gsc_row_limit' => $setting ? (int) ($setting->gsc_row_limit ?? 2500) : 2500,
            'gsc_data_state' => $setting ? (string) ($setting->gsc_data_state ?? 'all') : 'all',
            'gsc_alert_threshold_percent' => $setting ? (int) ($setting->gsc_alert_threshold_percent ?? 30) : 30,
            'gsc_recipes_path_token' => $setting ? (string) ($setting->gsc_recipes_path_token ?? '/recipes') : '/recipes',
            'gsc_brand_terms' => $this->extractBrandTermsFromSetting($setting),
            'gsc_sync_time' => $setting ? (string) ($setting->gsc_sync_time ?? '11:17') : '11:17',
            'gsc_access_token_expires_at' => $setting && $setting->gsc_access_token_expires_at
                ? $setting->gsc_access_token_expires_at->toIso8601String()
                : null,
        ]);
    }

    private function normalizeBrandTerms(?string $raw): array
    {
        $value = trim((string) $raw);
        if ($value === '') {
            return [];
        }

        $segments = preg_split('/[\r\n,]+/', $value) ?: [];
        $terms = [];
        foreach ($segments as $segment) {
            $term = trim((string) $segment);
            if ($term === '') {
                continue;
            }
            $terms[] = mb_strtolower($term);
        }

        return array_values(array_unique($terms));
    }

    private function extractBrandTermsFromSetting(?AppSetting $setting): array
    {
        $terms = $setting ? $setting->gsc_brand_terms : [];
        if (! is_array($terms)) {
            return [];
        }

        $clean = [];
        foreach ($terms as $term) {
            $value = trim((string) $term);
            if ($value === '') {
                continue;
            }
            $clean[] = mb_strtolower($value);
        }

        return array_values(array_unique($clean));
    }

    private function normalizeIntegerList($value): array
    {
        if (is_string($value)) {
            $trimmed = trim($value);
            if ($trimmed === '') {
                return [];
            }

            $decoded = json_decode($trimmed, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                $value = $decoded;
            } else {
                $value = preg_split('/[\s,;|]+/', $trimmed) ?: [];
            }
        }

        if (! is_array($value)) {
            return [];
        }

        return collect($value)
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values()
            ->all();
    }

    private function extractIntegerListFromSetting($value): array
    {
        return $this->normalizeIntegerList($value);
    }

    private function resolveClientRotationScopeMode($requestedScopeMode, $requestedSameDepartmentOnly, $storedScopeMode): string
    {
        $scope = trim((string) ($requestedScopeMode ?? ''));
        if (in_array($scope, ['same_department', 'global_staff', 'balanced_department'], true)) {
            return $scope;
        }

        if (! is_null($requestedSameDepartmentOnly)) {
            return (bool) $requestedSameDepartmentOnly ? 'same_department' : 'global_staff';
        }

        $stored = trim((string) ($storedScopeMode ?? ''));
        if (in_array($stored, ['same_department', 'global_staff', 'balanced_department'], true)) {
            return $stored;
        }

        return 'global_staff';
    }

    private function clientRotationScopeModeFromSetting(?AppSetting $setting): string
    {
        return $this->resolveClientRotationScopeMode(
            $setting?->client_rotation_scope_mode,
            $setting?->client_rotation_same_department_only,
            $setting?->client_rotation_scope_mode
        );
    }

    private function normalizeClientRotationParticipantModes($value, array $participantUserIds): array
    {
        if (is_string($value)) {
            $trimmed = trim($value);
            if ($trimmed === '') {
                return [];
            }

            $decoded = json_decode($trimmed, true);
            $value = json_last_error() === JSON_ERROR_NONE ? $decoded : [];
        }

        if (! is_array($value) || empty($participantUserIds)) {
            return [];
        }

        $participantSet = array_flip($participantUserIds);
        $normalized = [];

        foreach ($value as $rawUserId => $mode) {
            $userId = (int) $rawUserId;
            if ($userId <= 0 || ! isset($participantSet[$userId]) || ! is_array($mode)) {
                continue;
            }

            $onlyReceive = (bool) ($mode['only_receive'] ?? false);
            $onlyGive = (bool) ($mode['only_give'] ?? false);

            if (! $onlyReceive && ! $onlyGive) {
                continue;
            }

            $normalized[(string) $userId] = [
                'only_receive' => $onlyReceive,
                'only_give' => $onlyGive,
            ];
        }

        ksort($normalized, SORT_NATURAL);

        return $normalized;
    }

    private function extractClientRotationParticipantModes($value, array $participantUserIds): array
    {
        return $this->normalizeClientRotationParticipantModes($value, $participantUserIds);
    }
}
