<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_settings', function (Blueprint $table): void {
            if (! Schema::hasColumn('app_settings', 'client_rotation_enabled')) {
                $table->boolean('client_rotation_enabled')->default(false)->after('attendance_reminder_minutes_before');
            }
            if (! Schema::hasColumn('app_settings', 'client_rotation_comment_stale_days')) {
                $table->unsignedInteger('client_rotation_comment_stale_days')->default(3)->after('client_rotation_enabled');
            }
            if (! Schema::hasColumn('app_settings', 'client_rotation_opportunity_stale_days')) {
                $table->unsignedInteger('client_rotation_opportunity_stale_days')->default(30)->after('client_rotation_comment_stale_days');
            }
            if (! Schema::hasColumn('app_settings', 'client_rotation_contract_stale_days')) {
                $table->unsignedInteger('client_rotation_contract_stale_days')->default(90)->after('client_rotation_opportunity_stale_days');
            }
            if (! Schema::hasColumn('app_settings', 'client_rotation_warning_days')) {
                $table->unsignedInteger('client_rotation_warning_days')->default(3)->after('client_rotation_contract_stale_days');
            }
            if (! Schema::hasColumn('app_settings', 'client_rotation_daily_receive_limit')) {
                $table->unsignedInteger('client_rotation_daily_receive_limit')->default(5)->after('client_rotation_warning_days');
            }
            if (! Schema::hasColumn('app_settings', 'client_rotation_lead_type_ids')) {
                $table->json('client_rotation_lead_type_ids')->nullable()->after('client_rotation_daily_receive_limit');
            }
            if (! Schema::hasColumn('app_settings', 'client_rotation_participant_user_ids')) {
                $table->json('client_rotation_participant_user_ids')->nullable()->after('client_rotation_lead_type_ids');
            }
        });
    }

    public function down(): void
    {
        Schema::table('app_settings', function (Blueprint $table): void {
            foreach ([
                'client_rotation_participant_user_ids',
                'client_rotation_lead_type_ids',
                'client_rotation_daily_receive_limit',
                'client_rotation_warning_days',
                'client_rotation_contract_stale_days',
                'client_rotation_opportunity_stale_days',
                'client_rotation_comment_stale_days',
                'client_rotation_enabled',
            ] as $column) {
                if (Schema::hasColumn('app_settings', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
