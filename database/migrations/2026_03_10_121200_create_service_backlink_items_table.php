<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateServiceBacklinkItemsTable extends Migration
{
    public function up()
    {
        Schema::create('service_backlink_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('project_id');
            $table->unsignedBigInteger('task_id')->nullable();
            $table->string('target_url');
            $table->string('domain');
            $table->string('anchor_text');
            $table->string('status', 30)->default('pending');
            $table->date('report_date')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();

            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->foreign('task_id')->references('id')->on('tasks')->nullOnDelete();
            $table->index(['project_id', 'status']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('service_backlink_items');
    }
}
