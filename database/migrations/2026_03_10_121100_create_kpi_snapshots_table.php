<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateKpiSnapshotsTable extends Migration
{
    public function up()
    {
        Schema::create('kpi_snapshots', function (Blueprint $table) {
            $table->id();
            $table->string('scope', 30)->default('user');
            $table->unsignedBigInteger('user_id')->nullable();
            $table->unsignedBigInteger('project_id')->nullable();
            $table->string('service_type', 80)->nullable();
            $table->date('period_date');
            $table->unsignedInteger('total_tasks')->default(0);
            $table->unsignedInteger('completed_tasks')->default(0);
            $table->unsignedInteger('overdue_tasks')->default(0);
            $table->unsignedInteger('on_time_tasks')->default(0);
            $table->decimal('on_time_rate', 5, 2)->default(0);
            $table->unsignedInteger('avg_processing_hours')->default(0);
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('project_id')->references('id')->on('projects')->nullOnDelete();
            $table->index(['scope', 'period_date']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('kpi_snapshots');
    }
}
