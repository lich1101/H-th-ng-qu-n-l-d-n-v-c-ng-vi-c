<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('contracts', 'status')) {
            return;
        }

        Schema::table('contracts', function (Blueprint $table) {
            try {
                $table->dropIndex('contracts_client_id_status_index');
            } catch (\Throwable $e) {
                // Index có thể không tồn tại trên một số môi trường cũ.
            }

            $table->dropColumn('status');
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('contracts', 'status')) {
            return;
        }

        Schema::table('contracts', function (Blueprint $table) {
            $table->string('status', 30)->default('draft')->after('value');
            $table->index(['client_id', 'status']);
        });
    }
};
