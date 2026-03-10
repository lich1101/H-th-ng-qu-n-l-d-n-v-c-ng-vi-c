<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateProjectsTable extends Migration
{
    public function up()
    {
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name');
            $table->unsignedBigInteger('client_id')->nullable();
            $table->string('service_type', 80);
            $table->date('start_date')->nullable();
            $table->date('deadline')->nullable();
            $table->decimal('budget', 15, 2)->nullable();
            $table->string('status', 50)->default('moi_tao');
            $table->string('handover_status', 50)->default('chua_ban_giao');
            $table->text('customer_requirement')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();

            $table->foreign('client_id')->references('id')->on('clients')->nullOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('approved_by')->references('id')->on('users')->nullOnDelete();

            $table->index(['service_type', 'status']);
            $table->index('deadline');
        });
    }

    public function down()
    {
        Schema::dropIfExists('projects');
    }
}
