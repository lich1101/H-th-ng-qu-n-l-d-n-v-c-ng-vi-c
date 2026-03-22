<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('chatbot_bots')) {
            return;
        }

        if (! Schema::hasColumn('chatbot_bots', 'avatar_url')) {
            Schema::table('chatbot_bots', function (Blueprint $table) {
                $table->string('avatar_url')->nullable()->after('icon');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('chatbot_bots')) {
            return;
        }

        if (Schema::hasColumn('chatbot_bots', 'avatar_url')) {
            Schema::table('chatbot_bots', function (Blueprint $table) {
                $table->dropColumn('avatar_url');
            });
        }
    }
};

