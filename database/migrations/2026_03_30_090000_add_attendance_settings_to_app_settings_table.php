<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            if (! Schema::hasColumn('app_settings', 'attendance_enabled')) {
                $table->boolean('attendance_enabled')->default(true)->after('gsc_sync_time');
            }
            if (! Schema::hasColumn('app_settings', 'attendance_work_start_time')) {
                $table->string('attendance_work_start_time', 5)->default('08:30')->after('attendance_enabled');
            }
            if (! Schema::hasColumn('app_settings', 'attendance_work_end_time')) {
                $table->string('attendance_work_end_time', 5)->default('17:30')->after('attendance_work_start_time');
            }
            if (! Schema::hasColumn('app_settings', 'attendance_afternoon_start_time')) {
                $table->string('attendance_afternoon_start_time', 5)->default('13:30')->after('attendance_work_end_time');
            }
            if (! Schema::hasColumn('app_settings', 'attendance_late_grace_minutes')) {
                $table->unsignedSmallInteger('attendance_late_grace_minutes')->default(10)->after('attendance_afternoon_start_time');
            }
            if (! Schema::hasColumn('app_settings', 'attendance_reminder_enabled')) {
                $table->boolean('attendance_reminder_enabled')->default(true)->after('attendance_late_grace_minutes');
            }
            if (! Schema::hasColumn('app_settings', 'attendance_reminder_minutes_before')) {
                $table->unsignedSmallInteger('attendance_reminder_minutes_before')->default(10)->after('attendance_reminder_enabled');
            }
        });
    }

    public function down(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            foreach ([
                'attendance_reminder_minutes_before',
                'attendance_reminder_enabled',
                'attendance_late_grace_minutes',
                'attendance_afternoon_start_time',
                'attendance_work_end_time',
                'attendance_work_start_time',
                'attendance_enabled',
            ] as $column) {
                if (Schema::hasColumn('app_settings', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
