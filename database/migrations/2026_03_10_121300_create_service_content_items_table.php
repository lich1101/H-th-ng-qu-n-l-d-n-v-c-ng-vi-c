<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateServiceContentItemsTable extends Migration
{
    public function up()
    {
        Schema::create('service_content_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('project_id');
            $table->unsignedBigInteger('task_id')->nullable();
            $table->string('main_keyword');
            $table->string('secondary_keywords')->nullable();
            $table->string('outline_status', 30)->default('pending');
            $table->unsignedInteger('required_words')->nullable();
            $table->unsignedInteger('actual_words')->nullable();
            $table->unsignedTinyInteger('seo_score')->nullable();
            $table->unsignedTinyInteger('duplicate_percent')->nullable();
            $table->string('approval_status', 30)->default('pending');
            $table->timestamps();

            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->foreign('task_id')->references('id')->on('tasks')->nullOnDelete();
            $table->index(['project_id', 'approval_status']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('service_content_items');
    }
}
