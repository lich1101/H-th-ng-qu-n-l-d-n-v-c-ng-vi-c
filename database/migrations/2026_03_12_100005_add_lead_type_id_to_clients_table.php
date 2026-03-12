<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddLeadTypeIdToClientsTable extends Migration
{
    public function up()
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->unsignedBigInteger('lead_type_id')->nullable()->after('sales_owner_id');
            $table->foreign('lead_type_id')->references('id')->on('lead_types')->nullOnDelete();
        });
    }

    public function down()
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->dropForeign(['lead_type_id']);
        });
    }
}
