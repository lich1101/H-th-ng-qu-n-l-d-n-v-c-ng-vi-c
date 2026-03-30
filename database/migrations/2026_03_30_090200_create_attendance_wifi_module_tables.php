<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendance_wifi_networks', function (Blueprint $table) {
            $table->id();
            $table->string('ssid', 120);
            $table->string('bssid', 64)->nullable();
            $table->string('note', 255)->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();

            $table->index(['ssid', 'is_active'], 'attendance_wifi_ssid_active_idx');
            $table->index('bssid', 'attendance_wifi_bssid_idx');
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('updated_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('attendance_devices', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->string('device_uuid', 191)->unique();
            $table->string('device_name', 191)->nullable();
            $table->string('device_platform', 32)->nullable();
            $table->string('device_model', 191)->nullable();
            $table->string('status', 32)->default('pending');
            $table->text('note')->nullable();
            $table->timestamp('requested_at')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('rejected_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->unsignedBigInteger('decided_by')->nullable();
            $table->timestamps();

            $table->unique('user_id', 'attendance_devices_user_unique');
            $table->index(['status', 'requested_at'], 'attendance_devices_status_requested_idx');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('decided_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('attendance_holidays', function (Blueprint $table) {
            $table->id();
            $table->date('holiday_date')->unique();
            $table->string('title', 191);
            $table->string('note', 255)->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->index(['holiday_date', 'is_active'], 'attendance_holiday_date_active_idx');
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('attendance_requests', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->string('request_type', 32)->default('late_arrival');
            $table->date('request_date');
            $table->string('expected_check_in_time', 5)->nullable();
            $table->string('title', 191);
            $table->text('content')->nullable();
            $table->string('status', 32)->default('pending');
            $table->string('approval_mode', 32)->nullable();
            $table->decimal('approved_work_units', 4, 2)->nullable();
            $table->text('decision_note')->nullable();
            $table->unsignedBigInteger('decided_by')->nullable();
            $table->timestamp('decided_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'request_date'], 'attendance_requests_user_date_idx');
            $table->index(['status', 'request_date'], 'attendance_requests_status_date_idx');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('decided_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('attendance_records', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->date('work_date');
            $table->timestamp('check_in_at')->nullable();
            $table->timestamp('required_start_at')->nullable();
            $table->timestamp('allowed_late_until')->nullable();
            $table->unsignedInteger('minutes_late')->default(0);
            $table->decimal('default_work_units', 4, 2)->default(1.00);
            $table->decimal('work_units', 4, 2)->default(0.00);
            $table->string('employment_type', 32)->default('full_time');
            $table->string('status', 32)->default('absent');
            $table->string('source', 32)->default('wifi');
            $table->string('wifi_ssid', 120)->nullable();
            $table->string('wifi_bssid', 64)->nullable();
            $table->string('device_uuid', 191)->nullable();
            $table->string('device_name', 191)->nullable();
            $table->string('device_platform', 32)->nullable();
            $table->text('note')->nullable();
            $table->unsignedBigInteger('attendance_request_id')->nullable();
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'work_date'], 'attendance_records_user_date_unique');
            $table->index(['work_date', 'status'], 'attendance_records_date_status_idx');
            $table->index(['user_id', 'status'], 'attendance_records_user_status_idx');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('attendance_request_id')->references('id')->on('attendance_requests')->nullOnDelete();
            $table->foreign('approved_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('attendance_reminder_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->date('reminder_date');
            $table->string('reminder_type', 32)->default('check_in');
            $table->timestamp('sent_at');
            $table->timestamps();

            $table->unique(['user_id', 'reminder_date', 'reminder_type'], 'attendance_reminder_logs_unique');
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_reminder_logs');
        Schema::dropIfExists('attendance_records');
        Schema::dropIfExists('attendance_requests');
        Schema::dropIfExists('attendance_holidays');
        Schema::dropIfExists('attendance_devices');
        Schema::dropIfExists('attendance_wifi_networks');
    }
};
