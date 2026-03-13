<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateContractCostsTable extends Migration
{
    public function up()
    {
        Schema::create('contract_costs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('contract_id');
            $table->string('cost_type', 120)->nullable();
            $table->decimal('amount', 15, 2)->default(0);
            $table->date('cost_date')->nullable();
            $table->text('note')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->foreign('contract_id')->references('id')->on('contracts')->cascadeOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->index(['contract_id', 'cost_date']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('contract_costs');
    }
}
