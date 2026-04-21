<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('client_rotation_histories', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('client_id')->constrained('clients')->cascadeOnDelete();
            $table->foreignId('from_staff_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('to_staff_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('department_id')->nullable()->constrained('departments')->nullOnDelete();
            $table->foreignId('lead_type_id')->nullable()->constrained('lead_types')->nullOnDelete();
            $table->foreignId('triggered_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('source_transfer_request_id')->nullable()->constrained('client_staff_transfer_requests')->nullOnDelete();
            $table->string('action_type', 80);
            $table->string('reason_code', 120)->nullable();
            $table->text('note')->nullable();
            $table->json('metrics_snapshot')->nullable();
            $table->timestamp('transferred_at');
            $table->timestamps();

            $table->index(['client_id', 'transferred_at']);
            $table->index(['to_staff_id', 'transferred_at']);
            $table->index(['action_type', 'transferred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_rotation_histories');
    }
};
