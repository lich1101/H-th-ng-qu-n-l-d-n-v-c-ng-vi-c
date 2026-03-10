<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateServiceAuditItemsTable extends Migration
{
    public function up()
    {
        Schema::create('service_audit_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('project_id');
            $table->unsignedBigInteger('task_id')->nullable();
            $table->string('url');
            $table->string('issue_type', 120)->nullable();
            $table->text('issue_description')->nullable();
            $table->text('suggestion')->nullable();
            $table->string('priority', 20)->default('medium');
            $table->string('status', 30)->default('open');
            $table->timestamps();

            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->foreign('task_id')->references('id')->on('tasks')->nullOnDelete();
            $table->index(['project_id', 'status']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('service_audit_items');
    }
}
