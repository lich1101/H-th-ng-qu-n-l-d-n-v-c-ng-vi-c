<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'attendance_shift_weekdays')) {
                $table->json('attendance_shift_weekdays')->nullable()->after('attendance_employment_type');
            }
            if (! Schema::hasColumn('users', 'attendance_earliest_checkin_time')) {
                $table->string('attendance_earliest_checkin_time', 5)->nullable()->after('attendance_shift_weekdays');
            }
        });

        Schema::table('attendance_requests', function (Blueprint $table) {
            if (! Schema::hasColumn('attendance_requests', 'request_end_date')) {
                $table->date('request_end_date')->nullable()->after('request_date');
            }
        });

        Schema::table('attendance_records', function (Blueprint $table) {
            if (! Schema::hasColumn('attendance_records', 'edited_after_wifi')) {
                $table->boolean('edited_after_wifi')->default(false)->after('approved_by');
            }
        });

        Schema::create('attendance_record_edit_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('attendance_record_id');
            $table->unsignedBigInteger('actor_id')->nullable();
            $table->string('action', 64);
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->index(['attendance_record_id', 'created_at'], 'attendance_edit_logs_record_created_idx');
            $table->foreign('attendance_record_id')->references('id')->on('attendance_records')->cascadeOnDelete();
            $table->foreign('actor_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_record_edit_logs');

        Schema::table('attendance_records', function (Blueprint $table) {
            if (Schema::hasColumn('attendance_records', 'edited_after_wifi')) {
                $table->dropColumn('edited_after_wifi');
            }
        });

        Schema::table('attendance_requests', function (Blueprint $table) {
            if (Schema::hasColumn('attendance_requests', 'request_end_date')) {
                $table->dropColumn('request_end_date');
            }
        });

        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'attendance_shift_weekdays')) {
                $table->dropColumn('attendance_shift_weekdays');
            }
            if (Schema::hasColumn('users', 'attendance_earliest_checkin_time')) {
                $table->dropColumn('attendance_earliest_checkin_time');
            }
        });
    }
};
