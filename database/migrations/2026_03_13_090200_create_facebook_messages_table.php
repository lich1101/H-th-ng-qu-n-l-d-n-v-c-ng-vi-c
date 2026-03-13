<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('facebook_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('facebook_page_id')
                ->constrained('facebook_pages')
                ->cascadeOnDelete();
            $table->foreignId('client_id')
                ->nullable()
                ->constrained('clients')
                ->nullOnDelete();
            $table->string('sender_id', 100);
            $table->text('message_text')->nullable();
            $table->json('payload')->nullable();
            $table->timestamp('received_at')->nullable();
            $table->timestamps();

            $table->index(['sender_id', 'facebook_page_id'], 'fb_messages_sender_page_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('facebook_messages');
    }
};
