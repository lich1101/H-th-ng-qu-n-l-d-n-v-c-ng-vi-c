<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateCustomerPaymentsTable extends Migration
{
    public function up()
    {
        Schema::create('customer_payments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('project_id')->nullable();
            $table->unsignedBigInteger('client_id');
            $table->decimal('amount', 15, 2);
            $table->date('due_date')->nullable();
            $table->date('paid_at')->nullable();
            $table->string('status', 20)->default('pending');
            $table->string('invoice_no', 60)->nullable();
            $table->text('note')->nullable();
            $table->timestamps();

            $table->foreign('project_id')->references('id')->on('projects')->nullOnDelete();
            $table->foreign('client_id')->references('id')->on('clients')->cascadeOnDelete();
            $table->index(['client_id', 'status']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('customer_payments');
    }
}
