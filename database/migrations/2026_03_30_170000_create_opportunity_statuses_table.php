<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('opportunity_statuses', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 32)->unique();
            $table->string('name', 80);
            $table->string('color_hex', 7)->default('#6B7280');
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        DB::table('opportunity_statuses')->insert([
            [
                'code' => 'open',
                'name' => 'Đang mở',
                'color_hex' => '#0EA5E9',
                'sort_order' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'won',
                'name' => 'Thành công',
                'color_hex' => '#22C55E',
                'sort_order' => 2,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'code' => 'lost',
                'name' => 'Thất bại',
                'color_hex' => '#EF4444',
                'sort_order' => 3,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('opportunity_statuses');
    }
};

