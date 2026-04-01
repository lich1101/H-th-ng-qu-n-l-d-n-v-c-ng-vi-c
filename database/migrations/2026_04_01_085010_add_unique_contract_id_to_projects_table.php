<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            // Enforce 1 contract = 1 project (nullable unique)
            $table->unique('contract_id', 'projects_contract_id_unique');
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropUnique('projects_contract_id_unique');
        });
    }
};
