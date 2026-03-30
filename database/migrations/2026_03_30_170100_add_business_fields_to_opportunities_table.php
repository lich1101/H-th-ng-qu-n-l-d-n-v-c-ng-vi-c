<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('opportunities', function (Blueprint $table): void {
            $table->string('opportunity_type', 120)->nullable()->after('title');
            $table->string('source', 120)->nullable()->after('status');
            $table->unsignedTinyInteger('success_probability')->nullable()->after('source');
            $table->unsignedBigInteger('product_id')->nullable()->after('success_probability');
            $table->json('watcher_ids')->nullable()->after('assigned_to');

            $table->foreign('product_id')->references('id')->on('products')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('opportunities', function (Blueprint $table): void {
            $table->dropForeign(['product_id']);
            $table->dropColumn([
                'opportunity_type',
                'source',
                'success_probability',
                'product_id',
                'watcher_ids',
            ]);
        });
    }
};

