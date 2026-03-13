<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddFacebookTokenToUsersTable extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('facebook_user_access_token')->nullable()->after('remember_token');
            $table->timestamp('facebook_user_token_expires_at')->nullable()->after('facebook_user_access_token');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['facebook_user_access_token', 'facebook_user_token_expires_at']);
        });
    }
}
