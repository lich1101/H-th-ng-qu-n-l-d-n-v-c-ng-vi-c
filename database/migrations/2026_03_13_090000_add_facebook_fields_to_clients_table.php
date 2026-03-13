<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->string('facebook_psid', 100)->nullable()->after('lead_message');
            $table->string('facebook_page_id', 100)->nullable()->after('facebook_psid');
            $table->index(['facebook_psid', 'facebook_page_id'], 'clients_facebook_psid_page_idx');
        });
    }

    public function down(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->dropIndex('clients_facebook_psid_page_idx');
            $table->dropColumn(['facebook_psid', 'facebook_page_id']);
        });
    }
};
