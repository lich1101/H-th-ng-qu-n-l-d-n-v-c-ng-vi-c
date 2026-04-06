<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateContractFinanceRequestsTable extends Migration
{
    public function up()
    {
        Schema::create('contract_finance_requests', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('contract_id');
            $table->string('request_type', 20); // payment|cost
            $table->string('request_action', 20)->default('create');
            $table->decimal('amount', 15, 2)->default(0);
            $table->date('transaction_date')->nullable(); // paid_at|cost_date
            $table->string('method', 120)->nullable();
            $table->string('cost_type', 120)->nullable();
            $table->text('note')->nullable();
            $table->string('status', 20)->default('pending'); // pending|approved|rejected
            $table->unsignedBigInteger('submitted_by')->nullable();
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_note')->nullable();
            $table->unsignedBigInteger('contract_payment_id')->nullable();
            $table->unsignedBigInteger('contract_cost_id')->nullable();
            $table->timestamps();

            $table->foreign('contract_id')->references('id')->on('contracts')->cascadeOnDelete();
            $table->foreign('submitted_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('reviewed_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('contract_payment_id')->references('id')->on('contract_payments')->nullOnDelete();
            $table->foreign('contract_cost_id')->references('id')->on('contract_costs')->nullOnDelete();

            $table->index(['contract_id', 'status']);
            $table->index(['request_type', 'status']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('contract_finance_requests');
    }
}

