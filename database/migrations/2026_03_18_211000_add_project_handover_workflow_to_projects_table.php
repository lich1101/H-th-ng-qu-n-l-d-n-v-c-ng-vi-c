<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            if (! Schema::hasColumn('projects', 'handover_requested_by')) {
                $table->unsignedBigInteger('handover_requested_by')
                    ->nullable()
                    ->after('handover_status');
                $table->foreign('handover_requested_by')
                    ->references('id')
                    ->on('users')
                    ->nullOnDelete();
                $table->index('handover_requested_by');
            }

            if (! Schema::hasColumn('projects', 'handover_requested_at')) {
                $table->timestamp('handover_requested_at')
                    ->nullable()
                    ->after('handover_requested_by');
            }

            if (! Schema::hasColumn('projects', 'handover_review_note')) {
                $table->text('handover_review_note')
                    ->nullable()
                    ->after('handover_requested_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            if (Schema::hasColumn('projects', 'handover_requested_by')) {
                $table->dropForeign(['handover_requested_by']);
                $table->dropIndex(['handover_requested_by']);
                $table->dropColumn('handover_requested_by');
            }

            if (Schema::hasColumn('projects', 'handover_requested_at')) {
                $table->dropColumn('handover_requested_at');
            }

            if (Schema::hasColumn('projects', 'handover_review_note')) {
                $table->dropColumn('handover_review_note');
            }
        });
    }
};
