<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateLeadTypesTable extends Migration
{
    public function up()
    {
        Schema::create('lead_types', function (Blueprint $table) {
            $table->id();
            $table->string('name', 80);
            $table->string('color_hex', 7)->default('#6B7280');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('lead_types');
    }
}
