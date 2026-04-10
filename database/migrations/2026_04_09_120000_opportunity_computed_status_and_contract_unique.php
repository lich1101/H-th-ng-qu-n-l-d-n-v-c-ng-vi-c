<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contracts', function (Blueprint $table): void {
            $table->unique('opportunity_id', 'contracts_opportunity_id_unique');
        });

        Schema::table('opportunities', function (Blueprint $table): void {
            if (Schema::hasColumn('opportunities', 'status')) {
                $table->dropIndex(['client_id', 'status']);
            }
        });

        Schema::table('opportunities', function (Blueprint $table): void {
            if (Schema::hasColumn('opportunities', 'status')) {
                $table->dropColumn('status');
            }
        });
    }

    public function down(): void
    {
        Schema::table('opportunities', function (Blueprint $table): void {
            if (! Schema::hasColumn('opportunities', 'status')) {
                $table->string('status', 30)->default('open')->after('amount');
                $table->index(['client_id', 'status'], 'opportunities_client_id_status_index');
            }
        });

        Schema::table('contracts', function (Blueprint $table): void {
            $table->dropUnique('contracts_opportunity_id_unique');
        });
    }
};
