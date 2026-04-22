<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_settings', function (Blueprint $table): void {
            if (! Schema::hasColumn('app_settings', 'client_rotation_same_department_only')) {
                $table->boolean('client_rotation_same_department_only')
                    ->default(false)
                    ->after('client_rotation_participant_user_ids');
            }
        });
    }

    public function down(): void
    {
        Schema::table('app_settings', function (Blueprint $table): void {
            if (Schema::hasColumn('app_settings', 'client_rotation_same_department_only')) {
                $table->dropColumn('client_rotation_same_department_only');
            }
        });
    }
};
