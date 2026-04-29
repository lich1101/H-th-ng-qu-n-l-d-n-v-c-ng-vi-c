<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            if (! Schema::hasColumn('app_settings', 'client_rotation_pool_claim_daily_limit')) {
                $table->unsignedInteger('client_rotation_pool_claim_daily_limit')
                    ->default(5)
                    ->after('client_rotation_daily_receive_limit');
            }
        });
    }

    public function down(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            if (Schema::hasColumn('app_settings', 'client_rotation_pool_claim_daily_limit')) {
                $table->dropColumn('client_rotation_pool_claim_daily_limit');
            }
        });
    }
};
