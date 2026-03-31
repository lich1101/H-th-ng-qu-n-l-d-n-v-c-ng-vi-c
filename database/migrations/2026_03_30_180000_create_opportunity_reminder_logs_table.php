<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('opportunity_reminder_logs', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('opportunity_id');
            $table->unsignedBigInteger('user_id');
            $table->string('reminder_type', 40);
            $table->date('reminder_date');
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->foreign('opportunity_id', 'opp_rmdr_opp_fk')
                ->references('id')
                ->on('opportunities')
                ->cascadeOnDelete();
            $table->foreign('user_id', 'opp_rmdr_user_fk')
                ->references('id')
                ->on('users')
                ->cascadeOnDelete();

            $table->unique(
                ['opportunity_id', 'user_id', 'reminder_type', 'reminder_date'],
                'opp_rmdr_unique'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('opportunity_reminder_logs');
    }
};

