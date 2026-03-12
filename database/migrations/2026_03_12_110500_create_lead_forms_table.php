<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateLeadFormsTable extends Migration
{
    public function up()
    {
        Schema::create('lead_forms', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->unsignedBigInteger('lead_type_id')->nullable();
            $table->unsignedBigInteger('department_id')->nullable();
            $table->string('public_key', 40)->unique();
            $table->boolean('is_active')->default(true);
            $table->string('redirect_url')->nullable();
            $table->text('description')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->foreign('lead_type_id')->references('id')->on('lead_types')->nullOnDelete();
            $table->foreign('department_id')->references('id')->on('departments')->nullOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down()
    {
        Schema::dropIfExists('lead_forms');
    }
}
