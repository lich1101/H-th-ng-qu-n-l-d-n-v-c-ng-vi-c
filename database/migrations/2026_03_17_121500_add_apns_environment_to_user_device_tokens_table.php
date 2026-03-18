<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('user_device_tokens', 'apns_environment')) {
            Schema::table('user_device_tokens', function (Blueprint $table) {
                $table->string('apns_environment', 32)->nullable()->after('platform');
                $table->index(['platform', 'apns_environment'], 'user_device_tokens_platform_apns_env_index');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('user_device_tokens', 'apns_environment')) {
            Schema::table('user_device_tokens', function (Blueprint $table) {
                $table->dropIndex('user_device_tokens_platform_apns_env_index');
                $table->dropColumn('apns_environment');
            });
        }
    }
};
