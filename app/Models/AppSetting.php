<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AppSetting extends Model
{
    protected $fillable = [
        'brand_name',
        'primary_color',
        'logo_url',
        'support_email',
        'support_phone',
        'support_address',
        'notifications_push_enabled',
        'notifications_in_app_enabled',
        'notifications_email_fallback_enabled',
        'meeting_reminder_enabled',
        'notifications_dedupe_seconds',
        'meeting_reminder_minutes_before',
        'task_item_progress_reminder_enabled',
        'task_item_progress_reminder_time',
        'task_item_update_submission_notification_enabled',
        'task_item_update_feedback_notification_enabled',
        'lead_capture_notification_enabled',
        'contract_unpaid_reminder_enabled',
        'contract_unpaid_reminder_time',
        'contract_expiry_reminder_enabled',
        'contract_expiry_reminder_time',
        'contract_expiry_reminder_days_before',
        'smtp_custom_enabled',
        'smtp_mailer',
        'smtp_host',
        'smtp_port',
        'smtp_encryption',
        'smtp_username',
        'smtp_password',
        'smtp_from_address',
        'smtp_from_name',
        'updated_by',
    ];

    protected $casts = [
        'notifications_push_enabled' => 'boolean',
        'notifications_in_app_enabled' => 'boolean',
        'notifications_email_fallback_enabled' => 'boolean',
        'meeting_reminder_enabled' => 'boolean',
        'notifications_dedupe_seconds' => 'integer',
        'meeting_reminder_minutes_before' => 'integer',
        'task_item_progress_reminder_enabled' => 'boolean',
        'task_item_progress_reminder_time' => 'string',
        'task_item_update_submission_notification_enabled' => 'boolean',
        'task_item_update_feedback_notification_enabled' => 'boolean',
        'lead_capture_notification_enabled' => 'boolean',
        'contract_unpaid_reminder_enabled' => 'boolean',
        'contract_expiry_reminder_enabled' => 'boolean',
        'contract_expiry_reminder_days_before' => 'integer',
        'smtp_custom_enabled' => 'boolean',
        'smtp_port' => 'integer',
    ];

    public static function defaults(): array
    {
        return [
            'brand_name' => config('app.name', 'Job ClickOn'),
            'primary_color' => '#04BC5C',
            'logo_url' => '/brand/icon.png',
            'support_email' => null,
            'support_phone' => null,
            'support_address' => null,
            'notifications_push_enabled' => true,
            'notifications_in_app_enabled' => true,
            'notifications_email_fallback_enabled' => true,
            'meeting_reminder_enabled' => true,
            'notifications_dedupe_seconds' => 45,
            'meeting_reminder_minutes_before' => 60,
            'task_item_progress_reminder_enabled' => true,
            'task_item_progress_reminder_time' => '09:00',
            'task_item_update_submission_notification_enabled' => true,
            'task_item_update_feedback_notification_enabled' => true,
            'lead_capture_notification_enabled' => true,
            'contract_unpaid_reminder_enabled' => true,
            'contract_unpaid_reminder_time' => '08:00',
            'contract_expiry_reminder_enabled' => true,
            'contract_expiry_reminder_time' => '09:00',
            'contract_expiry_reminder_days_before' => 3,
            'smtp_custom_enabled' => false,
            'smtp_mailer' => 'smtp',
            'smtp_host' => null,
            'smtp_port' => 587,
            'smtp_encryption' => 'tls',
            'smtp_username' => null,
            'smtp_password' => null,
            'smtp_from_address' => null,
            'smtp_from_name' => null,
        ];
    }
}
