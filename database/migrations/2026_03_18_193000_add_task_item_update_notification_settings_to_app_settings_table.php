<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddTaskItemUpdateNotificationSettingsToAppSettingsTable extends Migration
{
    public function up()
    {
        Schema::table('app_settings', function (Blueprint $table) {
            if (! Schema::hasColumn('app_settings', 'task_item_update_submission_notification_enabled')) {
                $table->boolean('task_item_update_submission_notification_enabled')
                    ->default(true)
                    ->after('task_item_progress_reminder_time');
            }

            if (! Schema::hasColumn('app_settings', 'task_item_update_feedback_notification_enabled')) {
                $table->boolean('task_item_update_feedback_notification_enabled')
                    ->default(true)
                    ->after('task_item_update_submission_notification_enabled');
            }
        });
    }

    public function down()
    {
        Schema::table('app_settings', function (Blueprint $table) {
            if (Schema::hasColumn('app_settings', 'task_item_update_feedback_notification_enabled')) {
                $table->dropColumn('task_item_update_feedback_notification_enabled');
            }

            if (Schema::hasColumn('app_settings', 'task_item_update_submission_notification_enabled')) {
                $table->dropColumn('task_item_update_submission_notification_enabled');
            }
        });
    }
}
