<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddTaskReminderTimeAndSmtpToAppSettings extends Migration
{
    public function up()
    {
        Schema::table('app_settings', function (Blueprint $table) {
            $table->string('task_item_progress_reminder_time', 5)
                ->default('09:00')
                ->after('task_item_progress_reminder_enabled');
            $table->boolean('smtp_custom_enabled')
                ->default(false)
                ->after('contract_expiry_reminder_days_before');
            $table->string('smtp_mailer', 20)
                ->default('smtp')
                ->after('smtp_custom_enabled');
            $table->string('smtp_host', 120)
                ->nullable()
                ->after('smtp_mailer');
            $table->unsignedInteger('smtp_port')
                ->nullable()
                ->after('smtp_host');
            $table->string('smtp_encryption', 20)
                ->nullable()
                ->after('smtp_port');
            $table->string('smtp_username', 120)
                ->nullable()
                ->after('smtp_encryption');
            $table->string('smtp_password', 255)
                ->nullable()
                ->after('smtp_username');
            $table->string('smtp_from_address', 120)
                ->nullable()
                ->after('smtp_password');
            $table->string('smtp_from_name', 120)
                ->nullable()
                ->after('smtp_from_address');
        });
    }

    public function down()
    {
        Schema::table('app_settings', function (Blueprint $table) {
            $table->dropColumn([
                'task_item_progress_reminder_time',
                'smtp_custom_enabled',
                'smtp_mailer',
                'smtp_host',
                'smtp_port',
                'smtp_encryption',
                'smtp_username',
                'smtp_password',
                'smtp_from_address',
                'smtp_from_name',
            ]);
        });
    }
}
