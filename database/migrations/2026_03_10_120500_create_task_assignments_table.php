<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateTaskAssignmentsTable extends Migration
{
    public function up()
    {
        Schema::create('task_assignments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('task_id');
            $table->unsignedBigInteger('assigned_to');
            $table->unsignedBigInteger('assigned_by')->nullable();
            $table->string('assignment_flow', 30)->default('leader_to_staff');
            $table->string('status', 30)->default('pending_acceptance');
            $table->timestamp('assigned_at')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('auto_remind_at')->nullable();
            $table->timestamps();

            $table->foreign('task_id')->references('id')->on('tasks')->cascadeOnDelete();
            $table->foreign('assigned_to')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('assigned_by')->references('id')->on('users')->nullOnDelete();

            $table->index(['assigned_to', 'status']);
            $table->index('assignment_flow');
        });
    }

    public function down()
    {
        Schema::dropIfExists('task_assignments');
    }
}
