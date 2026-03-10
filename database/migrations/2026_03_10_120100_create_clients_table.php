<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateClientsTable extends Migration
{
    public function up()
    {
        Schema::create('clients', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('company')->nullable();
            $table->string('email')->nullable();
            $table->string('phone', 30)->nullable();
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('sales_owner_id')->nullable();
            $table->timestamps();

            $table->foreign('sales_owner_id')->references('id')->on('users')->nullOnDelete();
            $table->index('name');
        });
    }

    public function down()
    {
        Schema::dropIfExists('clients');
    }
}
