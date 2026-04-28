<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_settings', function (Blueprint $table): void {
            if (! Schema::hasColumn('app_settings', 'client_rotation_scope_mode')) {
                $table->string('client_rotation_scope_mode', 40)
                    ->default('global_staff')
                    ->after('client_rotation_same_department_only');
            }

            if (! Schema::hasColumn('app_settings', 'client_rotation_participant_modes')) {
                $table->json('client_rotation_participant_modes')
                    ->nullable()
                    ->after('client_rotation_scope_mode');
            }
        });
    }

    public function down(): void
    {
        Schema::table('app_settings', function (Blueprint $table): void {
            if (Schema::hasColumn('app_settings', 'client_rotation_participant_modes')) {
                $table->dropColumn('client_rotation_participant_modes');
            }

            if (Schema::hasColumn('app_settings', 'client_rotation_scope_mode')) {
                $table->dropColumn('client_rotation_scope_mode');
            }
        });
    }
};
