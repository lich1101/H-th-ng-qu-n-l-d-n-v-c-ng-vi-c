<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_settings', function (Blueprint $table): void {
            if (! Schema::hasColumn('app_settings', 'app_android_apk_url')) {
                $table->string('app_android_apk_url', 255)
                    ->nullable()
                    ->after('attendance_reminder_minutes_before');
            }
            if (! Schema::hasColumn('app_settings', 'app_ios_testflight_url')) {
                $table->string('app_ios_testflight_url', 255)
                    ->nullable()
                    ->after('app_android_apk_url');
            }
            if (! Schema::hasColumn('app_settings', 'app_release_notes')) {
                $table->text('app_release_notes')
                    ->nullable()
                    ->after('app_ios_testflight_url');
            }
            if (! Schema::hasColumn('app_settings', 'app_release_version')) {
                $table->string('app_release_version', 40)
                    ->nullable()
                    ->after('app_release_notes');
            }
        });
    }

    public function down(): void
    {
        Schema::table('app_settings', function (Blueprint $table): void {
            $columns = [
                'app_release_version',
                'app_release_notes',
                'app_ios_testflight_url',
                'app_android_apk_url',
            ];

            foreach ($columns as $column) {
                if (Schema::hasColumn('app_settings', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};

