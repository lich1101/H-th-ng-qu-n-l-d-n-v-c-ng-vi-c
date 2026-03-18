<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddLeadAndContractNotificationSettingsToAppSettings extends Migration
{
    public function up()
    {
        Schema::table('app_settings', function (Blueprint $table) {
            $table->boolean('lead_capture_notification_enabled')
                ->default(true)
                ->after('task_item_progress_reminder_enabled');
            $table->boolean('contract_unpaid_reminder_enabled')
                ->default(true)
                ->after('lead_capture_notification_enabled');
            $table->string('contract_unpaid_reminder_time', 5)
                ->default('08:00')
                ->after('contract_unpaid_reminder_enabled');
            $table->boolean('contract_expiry_reminder_enabled')
                ->default(true)
                ->after('contract_unpaid_reminder_time');
            $table->string('contract_expiry_reminder_time', 5)
                ->default('09:00')
                ->after('contract_expiry_reminder_enabled');
            $table->unsignedTinyInteger('contract_expiry_reminder_days_before')
                ->default(3)
                ->after('contract_expiry_reminder_time');
        });
    }

    public function down()
    {
        Schema::table('app_settings', function (Blueprint $table) {
            $table->dropColumn([
                'lead_capture_notification_enabled',
                'contract_unpaid_reminder_enabled',
                'contract_unpaid_reminder_time',
                'contract_expiry_reminder_enabled',
                'contract_expiry_reminder_time',
                'contract_expiry_reminder_days_before',
            ]);
        });
    }
}
