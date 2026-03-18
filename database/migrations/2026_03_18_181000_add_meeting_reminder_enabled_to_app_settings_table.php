<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddMeetingReminderEnabledToAppSettingsTable extends Migration
{
    public function up()
    {
        Schema::table('app_settings', function (Blueprint $table) {
            $table->boolean('meeting_reminder_enabled')
                ->default(true)
                ->after('notifications_email_fallback_enabled');
        });
    }

    public function down()
    {
        Schema::table('app_settings', function (Blueprint $table) {
            $table->dropColumn('meeting_reminder_enabled');
        });
    }
}
