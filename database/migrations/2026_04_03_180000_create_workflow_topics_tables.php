<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workflow_topics', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('code', 80)->nullable()->index();
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('workflow_topic_tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workflow_topic_id')->constrained('workflow_topics')->cascadeOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('priority', 20)->default('medium');
            $table->string('status', 20)->default('todo');
            $table->unsignedTinyInteger('weight_percent')->default(1);
            $table->integer('start_offset_days')->default(0);
            $table->integer('duration_days')->default(1);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('workflow_topic_task_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workflow_topic_task_id')->constrained('workflow_topic_tasks')->cascadeOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('priority', 20)->default('medium');
            $table->string('status', 20)->default('todo');
            $table->unsignedTinyInteger('weight_percent')->default(1);
            $table->integer('start_offset_days')->default(0);
            $table->integer('duration_days')->default(1);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::table('projects', function (Blueprint $table) {
            $table->foreignId('workflow_topic_id')
                ->nullable()
                ->after('service_type_other')
                ->constrained('workflow_topics')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropConstrainedForeignId('workflow_topic_id');
        });

        Schema::dropIfExists('workflow_topic_task_items');
        Schema::dropIfExists('workflow_topic_tasks');
        Schema::dropIfExists('workflow_topics');
    }
};
