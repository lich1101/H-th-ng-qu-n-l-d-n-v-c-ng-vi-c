<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddClientRevenueFieldsTable extends Migration
{
    public function up()
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->unsignedBigInteger('revenue_tier_id')->nullable()->after('lead_type_id');
            $table->decimal('total_revenue', 15, 2)->default(0)->after('revenue_tier_id');
            $table->boolean('has_purchased')->default(false)->after('total_revenue');
            $table->string('lead_source', 100)->nullable()->after('has_purchased');
            $table->string('lead_channel', 50)->nullable()->after('lead_source');
            $table->text('lead_message')->nullable()->after('lead_channel');
            $table->foreign('revenue_tier_id')->references('id')->on('revenue_tiers')->nullOnDelete();
        });
    }

    public function down()
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->dropForeign(['revenue_tier_id']);
            $table->dropColumn([
                'revenue_tier_id',
                'total_revenue',
                'has_purchased',
                'lead_source',
                'lead_channel',
                'lead_message',
            ]);
        });
    }
}
