<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            $table->boolean('notifications_push_enabled')->default(true)->after('support_address');
            $table->boolean('notifications_in_app_enabled')->default(true)->after('notifications_push_enabled');
            $table->boolean('notifications_email_fallback_enabled')->default(true)->after('notifications_in_app_enabled');
            $table->unsignedSmallInteger('notifications_dedupe_seconds')->default(45)->after('notifications_email_fallback_enabled');
            $table->unsignedSmallInteger('meeting_reminder_minutes_before')->default(60)->after('notifications_dedupe_seconds');
            $table->boolean('task_item_progress_reminder_enabled')->default(true)->after('meeting_reminder_minutes_before');
        });
    }

    public function down(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            $table->dropColumn([
                'notifications_push_enabled',
                'notifications_in_app_enabled',
                'notifications_email_fallback_enabled',
                'notifications_dedupe_seconds',
                'meeting_reminder_minutes_before',
                'task_item_progress_reminder_enabled',
            ]);
        });
    }
};
