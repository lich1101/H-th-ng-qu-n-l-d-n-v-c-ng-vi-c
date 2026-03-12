<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateDepartmentAssignmentsTable extends Migration
{
    public function up()
    {
        Schema::create('department_assignments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('client_id');
            $table->unsignedBigInteger('contract_id')->nullable();
            $table->unsignedBigInteger('department_id');
            $table->unsignedBigInteger('assigned_by')->nullable();
            $table->unsignedBigInteger('manager_id')->nullable();
            $table->string('status', 30)->default('new'); // new, in_progress, done
            $table->text('requirements')->nullable();
            $table->date('deadline')->nullable();
            $table->decimal('allocated_value', 15, 2)->nullable();
            $table->unsignedTinyInteger('progress_percent')->default(0);
            $table->text('progress_note')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->foreign('client_id')->references('id')->on('clients')->cascadeOnDelete();
            $table->foreign('contract_id')->references('id')->on('contracts')->nullOnDelete();
            $table->foreign('department_id')->references('id')->on('departments')->cascadeOnDelete();
            $table->foreign('assigned_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('manager_id')->references('id')->on('users')->nullOnDelete();
            $table->index(['department_id', 'status']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('department_assignments');
    }
}
