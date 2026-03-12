<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddOpportunityFinancialsToContractsTable extends Migration
{
    public function up()
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->unsignedBigInteger('opportunity_id')->nullable()->after('client_id');
            $table->decimal('revenue', 15, 2)->nullable()->after('value');
            $table->decimal('debt', 15, 2)->nullable()->after('revenue');
            $table->decimal('cash_flow', 15, 2)->nullable()->after('debt');
        });
        Schema::table('contracts', function (Blueprint $table) {
            $table->foreign('opportunity_id')->references('id')->on('opportunities')->nullOnDelete();
        });
    }

    public function down()
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->dropForeign(['opportunity_id']);
            $table->dropColumn(['opportunity_id', 'revenue', 'debt', 'cash_flow']);
        });
    }
}
