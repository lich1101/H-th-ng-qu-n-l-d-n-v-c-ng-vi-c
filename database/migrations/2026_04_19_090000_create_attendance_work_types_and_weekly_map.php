<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendance_work_types', function (Blueprint $table) {
            $table->id();
            $table->string('code', 64)->unique();
            $table->string('name', 120);
            $table->string('session', 32)->default('full_day');
            $table->decimal('default_work_units', 4, 2)->default(1.00);
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->boolean('is_system')->default(false);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();

            $table->index(['is_active', 'sort_order'], 'attendance_work_types_active_sort_idx');
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('updated_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'attendance_weekday_work_types')) {
                $table->json('attendance_weekday_work_types')
                    ->nullable()
                    ->after('attendance_shift_weekdays');
            }
        });

        $defaults = [
            [
                'code' => 'full_time',
                'name' => 'Toàn thời gian',
                'session' => 'full_day',
                'default_work_units' => 1.0,
                'sort_order' => 10,
            ],
            [
                'code' => 'half_day_morning',
                'name' => 'Mỗi sáng',
                'session' => 'morning',
                'default_work_units' => 0.5,
                'sort_order' => 20,
            ],
            [
                'code' => 'half_day_afternoon',
                'name' => 'Mỗi chiều',
                'session' => 'afternoon',
                'default_work_units' => 0.5,
                'sort_order' => 30,
            ],
            [
                'code' => 'off_day',
                'name' => 'Nghỉ',
                'session' => 'off',
                'default_work_units' => 0.0,
                'sort_order' => 40,
            ],
        ];

        foreach ($defaults as $row) {
            DB::table('attendance_work_types')->updateOrInsert(
                ['code' => $row['code']],
                [
                    'name' => $row['name'],
                    'session' => $row['session'],
                    'default_work_units' => $row['default_work_units'],
                    'sort_order' => $row['sort_order'],
                    'is_active' => true,
                    'is_system' => true,
                    'updated_at' => now(),
                    'created_at' => now(),
                ]
            );
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'attendance_weekday_work_types')) {
                $table->dropColumn('attendance_weekday_work_types');
            }
        });

        Schema::dropIfExists('attendance_work_types');
    }
};

