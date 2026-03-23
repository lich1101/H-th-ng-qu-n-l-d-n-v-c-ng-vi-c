<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            if (! Schema::hasColumn('projects', 'website_url')) {
                $table->string('website_url', 255)
                    ->nullable()
                    ->after('repo_url');
            }
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            if (Schema::hasColumn('projects', 'website_url')) {
                $table->dropColumn('website_url');
            }
        });
    }
};

