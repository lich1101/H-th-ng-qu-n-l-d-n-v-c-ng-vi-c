<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('client_rotation_warning_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('client_id')->constrained('clients')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->date('warning_date');
            $table->unsignedInteger('days_until_rotation')->default(0);
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->unique(['client_id', 'user_id', 'warning_date'], 'client_rotation_warning_unique');
            $table->index('warning_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_rotation_warning_logs');
    }
};
