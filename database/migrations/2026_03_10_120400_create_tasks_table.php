<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateTasksTable extends Migration
{
    public function up()
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('project_id');
            $table->string('title');
            $table->longText('description')->nullable();
            $table->string('priority', 20)->default('medium');
            $table->string('status', 50)->default('nhan_task');
            $table->dateTime('start_at')->nullable();
            $table->dateTime('deadline')->nullable();
            $table->dateTime('completed_at')->nullable();
            $table->unsignedTinyInteger('progress_percent')->default(0);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('assigned_by')->nullable();
            $table->unsignedBigInteger('assignee_id')->nullable();
            $table->unsignedBigInteger('reviewer_id')->nullable();
            $table->boolean('require_acknowledgement')->default(true);
            $table->timestamp('acknowledged_at')->nullable();
            $table->timestamps();

            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('assigned_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('assignee_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('reviewer_id')->references('id')->on('users')->nullOnDelete();

            $table->index(['project_id', 'status']);
            $table->index(['assignee_id', 'deadline']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('tasks');
    }
}
