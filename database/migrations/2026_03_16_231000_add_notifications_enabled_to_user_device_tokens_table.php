<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_device_tokens', function (Blueprint $table) {
            $table->boolean('notifications_enabled')
                ->nullable()
                ->after('device_name');
        });
    }

    public function down(): void
    {
        Schema::table('user_device_tokens', function (Blueprint $table) {
            $table->dropColumn('notifications_enabled');
        });
    }
};
