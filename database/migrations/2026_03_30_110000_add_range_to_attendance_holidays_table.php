<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance_holidays', function (Blueprint $table) {
            $table->date('start_date')->nullable()->after('holiday_date');
            $table->date('end_date')->nullable()->after('start_date');
            $table->index(['start_date', 'end_date', 'is_active'], 'attendance_holiday_range_active_idx');
        });

        DB::table('attendance_holidays')
            ->whereNull('start_date')
            ->update([
                'start_date' => DB::raw('holiday_date'),
                'end_date' => DB::raw('holiday_date'),
            ]);
    }

    public function down(): void
    {
        Schema::table('attendance_holidays', function (Blueprint $table) {
            $table->dropIndex('attendance_holiday_range_active_idx');
            $table->dropColumn(['start_date', 'end_date']);
        });
    }
};
