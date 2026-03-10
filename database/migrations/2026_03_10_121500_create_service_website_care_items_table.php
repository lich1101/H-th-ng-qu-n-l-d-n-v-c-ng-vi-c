<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateServiceWebsiteCareItemsTable extends Migration
{
    public function up()
    {
        Schema::create('service_website_care_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('project_id');
            $table->unsignedBigInteger('task_id')->nullable();
            $table->date('check_date')->nullable();
            $table->string('technical_issue')->nullable();
            $table->string('index_status', 30)->nullable();
            $table->unsignedInteger('traffic')->nullable();
            $table->unsignedTinyInteger('ranking_delta')->nullable();
            $table->text('monthly_report')->nullable();
            $table->timestamps();

            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->foreign('task_id')->references('id')->on('tasks')->nullOnDelete();
            $table->index(['project_id', 'check_date']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('service_website_care_items');
    }
}
