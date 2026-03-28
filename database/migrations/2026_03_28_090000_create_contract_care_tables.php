<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contract_care_staff', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('contract_id');
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('assigned_by')->nullable();
            $table->timestamps();

            $table->foreign('contract_id')->references('id')->on('contracts')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('assigned_by')->references('id')->on('users')->nullOnDelete();
            $table->unique(['contract_id', 'user_id']);
            $table->index(['user_id', 'created_at']);
        });

        Schema::create('contract_care_notes', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('contract_id');
            $table->unsignedBigInteger('user_id');
            $table->string('title', 255);
            $table->text('detail');
            $table->timestamps();

            $table->foreign('contract_id')->references('id')->on('contracts')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->index(['contract_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contract_care_notes');
        Schema::dropIfExists('contract_care_staff');
    }
};
