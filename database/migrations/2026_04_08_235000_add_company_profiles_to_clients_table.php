<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->json('company_profiles')->nullable()->after('company');
        });
    }

    public function down(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->dropColumn('company_profiles');
        });
    }
};
