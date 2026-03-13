<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('facebook_pages', function (Blueprint $table) {
            $table->id();
            $table->string('page_id', 100)->unique();
            $table->string('name');
            $table->string('category')->nullable();
            $table->text('access_token');
            $table->unsignedBigInteger('user_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_subscribed')->default(false);
            $table->timestamp('connected_at')->nullable();
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            $table->index('page_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('facebook_pages');
    }
};
