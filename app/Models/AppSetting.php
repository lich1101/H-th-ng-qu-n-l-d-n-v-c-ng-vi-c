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
        'notifications_dedupe_seconds',
        'meeting_reminder_minutes_before',
        'task_item_progress_reminder_enabled',
        'lead_capture_notification_enabled',
        'contract_unpaid_reminder_enabled',
        'contract_unpaid_reminder_time',
        'contract_expiry_reminder_enabled',
        'contract_expiry_reminder_time',
        'contract_expiry_reminder_days_before',
        'updated_by',
    ];

    protected $casts = [
        'notifications_push_enabled' => 'boolean',
        'notifications_in_app_enabled' => 'boolean',
        'notifications_email_fallback_enabled' => 'boolean',
        'notifications_dedupe_seconds' => 'integer',
        'meeting_reminder_minutes_before' => 'integer',
        'task_item_progress_reminder_enabled' => 'boolean',
        'lead_capture_notification_enabled' => 'boolean',
        'contract_unpaid_reminder_enabled' => 'boolean',
        'contract_expiry_reminder_enabled' => 'boolean',
        'contract_expiry_reminder_days_before' => 'integer',
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
            'notifications_dedupe_seconds' => 45,
            'meeting_reminder_minutes_before' => 60,
            'task_item_progress_reminder_enabled' => true,
            'lead_capture_notification_enabled' => true,
            'contract_unpaid_reminder_enabled' => true,
            'contract_unpaid_reminder_time' => '08:00',
            'contract_expiry_reminder_enabled' => true,
            'contract_expiry_reminder_time' => '09:00',
            'contract_expiry_reminder_days_before' => 3,
        ];
    }
}
