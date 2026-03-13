<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddRecipientIdToFacebookMessagesTable extends Migration
{
    public function up(): void
    {
        Schema::table('facebook_messages', function (Blueprint $table) {
            $table->string('recipient_id')->nullable()->after('sender_id');
            $table->index('recipient_id');
        });
    }

    public function down(): void
    {
        Schema::table('facebook_messages', function (Blueprint $table) {
            $table->dropIndex(['recipient_id']);
            $table->dropColumn('recipient_id');
        });
    }
}
