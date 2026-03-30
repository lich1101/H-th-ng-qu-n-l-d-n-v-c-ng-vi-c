<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'attendance_employment_type')) {
                $table->string('attendance_employment_type', 32)
                    ->default('full_time')
                    ->after('workload_capacity');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'attendance_employment_type')) {
                $table->dropColumn('attendance_employment_type');
            }
        });
    }
};
