<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            if (! Schema::hasColumn('contracts', 'handover_receive_status')) {
                $table->string('handover_receive_status', 40)
                    ->default('chua_nhan_ban_giao')
                    ->after('approval_note');
                $table->index('handover_receive_status');
            }

            if (! Schema::hasColumn('contracts', 'handover_received_by')) {
                $table->unsignedBigInteger('handover_received_by')
                    ->nullable()
                    ->after('handover_receive_status');
                $table->foreign('handover_received_by')
                    ->references('id')
                    ->on('users')
                    ->nullOnDelete();
                $table->index('handover_received_by');
            }

            if (! Schema::hasColumn('contracts', 'handover_received_at')) {
                $table->timestamp('handover_received_at')
                    ->nullable()
                    ->after('handover_received_by');
            }
        });
    }

    public function down(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            if (Schema::hasColumn('contracts', 'handover_received_by')) {
                $table->dropForeign(['handover_received_by']);
                $table->dropIndex(['handover_received_by']);
                $table->dropColumn('handover_received_by');
            }

            if (Schema::hasColumn('contracts', 'handover_received_at')) {
                $table->dropColumn('handover_received_at');
            }

            if (Schema::hasColumn('contracts', 'handover_receive_status')) {
                $table->dropIndex(['handover_receive_status']);
                $table->dropColumn('handover_receive_status');
            }
        });
    }
};
