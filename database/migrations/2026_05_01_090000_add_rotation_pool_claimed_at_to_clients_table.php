<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table): void {
            if (! Schema::hasColumn('clients', 'rotation_pool_claimed_at')) {
                $table->dateTime('rotation_pool_claimed_at')
                    ->nullable()
                    ->after('rotation_pool_reason')
                    ->index();
            }
        });
    }

    public function down(): void
    {
        Schema::table('clients', function (Blueprint $table): void {
            if (Schema::hasColumn('clients', 'rotation_pool_claimed_at')) {
                $table->dropIndex(['rotation_pool_claimed_at']);
                $table->dropColumn('rotation_pool_claimed_at');
            }
        });
    }
};
