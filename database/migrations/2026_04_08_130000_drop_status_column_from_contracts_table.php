<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('contracts', 'status')) {
            return;
        }

        try {
            DB::statement('ALTER TABLE `contracts` ADD INDEX `contracts_client_id_index` (`client_id`)');
        } catch (\Throwable $e) {
            // Index riêng cho client_id có thể đã tồn tại.
        }

        try {
            DB::statement('ALTER TABLE `contracts` DROP INDEX `contracts_client_id_status_index`');
        } catch (\Throwable $e) {
            // Index ghép có thể không tồn tại trên một số môi trường cũ.
        }

        Schema::table('contracts', function (Blueprint $table) {
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
