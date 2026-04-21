<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table): void {
            if (! Schema::hasColumn('clients', 'care_rotation_reset_at')) {
                $table->timestamp('care_rotation_reset_at')->nullable()->after('comments_history_json');
                $table->index('care_rotation_reset_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('clients', function (Blueprint $table): void {
            if (Schema::hasColumn('clients', 'care_rotation_reset_at')) {
                $table->dropIndex(['care_rotation_reset_at']);
                $table->dropColumn('care_rotation_reset_at');
            }
        });
    }
};
