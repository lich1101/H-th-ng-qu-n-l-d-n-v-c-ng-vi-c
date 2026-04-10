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

        // Index (client_id, status) có thể đang được MySQL dùng cho FK `client_id` — không drop index trực tiếp.
        if (Schema::hasColumn('opportunities', 'status')) {
            Schema::table('opportunities', function (Blueprint $table): void {
                $table->dropForeign(['client_id']);
            });

            Schema::table('opportunities', function (Blueprint $table): void {
                $table->dropColumn('status');
            });

            Schema::table('opportunities', function (Blueprint $table): void {
                $table->foreign('client_id')->references('id')->on('clients')->cascadeOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('opportunities', 'status')) {
            Schema::table('opportunities', function (Blueprint $table): void {
                $table->dropForeign(['client_id']);
            });

            Schema::table('opportunities', function (Blueprint $table): void {
                $table->string('status', 30)->default('open')->after('amount');
                $table->index(['client_id', 'status'], 'opportunities_client_id_status_index');
            });

            Schema::table('opportunities', function (Blueprint $table): void {
                $table->foreign('client_id')->references('id')->on('clients')->cascadeOnDelete();
            });
        }

        Schema::table('contracts', function (Blueprint $table): void {
            $table->dropUnique('contracts_opportunity_id_unique');
        });
    }
};
