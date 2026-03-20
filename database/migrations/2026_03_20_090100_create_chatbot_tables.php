<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chatbot_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('parent_id')->nullable()->constrained('chatbot_messages')->nullOnDelete();
            $table->string('role', 20)->default('user'); // user | assistant
            $table->string('status', 20)->default('queued'); // queued | processing | completed | failed | cancelled
            $table->longText('content');
            $table->string('model', 120)->nullable();
            $table->text('error_message')->nullable();
            $table->json('meta')->nullable();
            $table->timestamp('queued_at')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'id']);
            $table->index(['user_id', 'status']);
            $table->index(['user_id', 'role']);
        });

        Schema::create('chatbot_user_states', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->boolean('is_processing')->default(false);
            $table->foreignId('current_message_id')->nullable()->constrained('chatbot_messages')->nullOnDelete();
            $table->boolean('stop_requested')->default(false);
            $table->text('last_error')->nullable();
            $table->timestamp('processing_started_at')->nullable();
            $table->timestamps();

            $table->unique('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chatbot_user_states');
        Schema::dropIfExists('chatbot_messages');
    }
};

