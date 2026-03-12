<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateRevenueTiersTable extends Migration
{
    public function up()
    {
        Schema::create('revenue_tiers', function (Blueprint $table) {
            $table->id();
            $table->string('name', 50); // bac, vang, kim_cuong
            $table->string('label', 80); // Bạc, Vàng, Kim cương
            $table->string('color_hex', 7)->default('#6B7280');
            $table->decimal('min_amount', 15, 2)->default(0);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('revenue_tiers');
    }
}
