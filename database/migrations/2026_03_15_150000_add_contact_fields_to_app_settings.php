<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddContactFieldsToAppSettings extends Migration
{
    public function up()
    {
        Schema::table('app_settings', function (Blueprint $table) {
            $table->string('support_email', 120)->nullable()->after('logo_url');
            $table->string('support_phone', 40)->nullable()->after('support_email');
            $table->string('support_address', 255)->nullable()->after('support_phone');
        });
    }

    public function down()
    {
        Schema::table('app_settings', function (Blueprint $table) {
            $table->dropColumn(['support_email', 'support_phone', 'support_address']);
        });
    }
}
