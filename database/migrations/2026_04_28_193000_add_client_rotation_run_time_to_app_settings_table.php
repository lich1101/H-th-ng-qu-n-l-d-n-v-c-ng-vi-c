<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            if (! Schema::hasColumn('app_settings', 'client_rotation_run_time')) {
                $table->string('client_rotation_run_time', 5)
                    ->default('12:00')
                    ->after('client_rotation_daily_receive_limit');
            }
        });
    }

    public function down(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            if (Schema::hasColumn('app_settings', 'client_rotation_run_time')) {
                $table->dropColumn('client_rotation_run_time');
            }
        });
    }
};
