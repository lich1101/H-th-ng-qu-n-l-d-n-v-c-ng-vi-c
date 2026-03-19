<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            if (! Schema::hasColumn('app_settings', 'project_handover_min_progress_percent')) {
                $table->unsignedTinyInteger('project_handover_min_progress_percent')
                    ->default(90)
                    ->after('contract_expiry_reminder_days_before');
            }
        });
    }

    public function down(): void
    {
        Schema::table('app_settings', function (Blueprint $table) {
            if (Schema::hasColumn('app_settings', 'project_handover_min_progress_percent')) {
                $table->dropColumn('project_handover_min_progress_percent');
            }
        });
    }
};
