<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lead_forms', function (Blueprint $table) {
            $table->json('field_schema')->nullable()->after('description');
            $table->json('style_config')->nullable()->after('field_schema');
            $table->json('submission_mapping')->nullable()->after('style_config');
        });
    }

    public function down(): void
    {
        Schema::table('lead_forms', function (Blueprint $table) {
            $table->dropColumn(['field_schema', 'style_config', 'submission_mapping']);
        });
    }
};
