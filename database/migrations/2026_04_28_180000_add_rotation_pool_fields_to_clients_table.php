<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table): void {
            if (! Schema::hasColumn('clients', 'is_in_rotation_pool')) {
                $table->boolean('is_in_rotation_pool')
                    ->default(false)
                    ->after('care_rotation_reset_at')
                    ->index();
            }
            if (! Schema::hasColumn('clients', 'rotation_pool_entered_at')) {
                $table->dateTime('rotation_pool_entered_at')
                    ->nullable()
                    ->after('is_in_rotation_pool')
                    ->index();
            }
            if (! Schema::hasColumn('clients', 'rotation_pool_reason')) {
                $table->string('rotation_pool_reason', 120)
                    ->nullable()
                    ->after('rotation_pool_entered_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('clients', function (Blueprint $table): void {
            if (Schema::hasColumn('clients', 'rotation_pool_reason')) {
                $table->dropColumn('rotation_pool_reason');
            }
            if (Schema::hasColumn('clients', 'rotation_pool_entered_at')) {
                $table->dropColumn('rotation_pool_entered_at');
            }
            if (Schema::hasColumn('clients', 'is_in_rotation_pool')) {
                $table->dropColumn('is_in_rotation_pool');
            }
        });
    }
};
