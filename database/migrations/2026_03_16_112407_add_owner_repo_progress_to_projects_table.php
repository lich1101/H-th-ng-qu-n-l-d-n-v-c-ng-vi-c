<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->unsignedBigInteger('owner_id')->nullable()->after('approved_at');
            $table->string('repo_url')->nullable()->after('owner_id');
            $table->unsignedTinyInteger('progress_percent')->default(0)->after('repo_url');

            $table->foreign('owner_id')->references('id')->on('users')->nullOnDelete();
            $table->index('owner_id');
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropForeign(['owner_id']);
            $table->dropIndex(['owner_id']);
            $table->dropColumn(['owner_id', 'repo_url', 'progress_percent']);
        });
    }
};
