<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_gsc_daily_stats', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('project_id');
            $table->date('metric_date');
            $table->date('prior_date')->nullable();
            $table->string('site_url', 255);

            $table->unsignedInteger('prior_rows_count')->default(0);
            $table->unsignedInteger('last_rows_count')->default(0);
            $table->unsignedInteger('compared_rows_count')->default(0);

            $table->unsignedInteger('last_clicks')->default(0);
            $table->unsignedInteger('prior_clicks')->default(0);
            $table->integer('delta_clicks')->default(0);
            $table->decimal('delta_clicks_percent', 10, 2)->nullable();

            $table->unsignedInteger('last_impressions')->default(0);
            $table->unsignedInteger('prior_impressions')->default(0);
            $table->integer('delta_impressions')->default(0);

            $table->decimal('last_ctr', 10, 6)->nullable();
            $table->decimal('prior_ctr', 10, 6)->nullable();
            $table->decimal('delta_ctr', 10, 6)->nullable();

            $table->decimal('last_avg_position', 10, 3)->nullable();
            $table->decimal('prior_avg_position', 10, 3)->nullable();
            $table->decimal('delta_avg_position', 10, 3)->nullable();

            $table->unsignedInteger('alerts_brand')->default(0);
            $table->unsignedInteger('alerts_brand_recipes')->default(0);
            $table->unsignedInteger('alerts_recipes')->default(0);
            $table->unsignedInteger('alerts_nonbrand')->default(0);
            $table->unsignedInteger('alerts_total')->default(0);

            $table->json('segment_totals')->nullable();
            $table->json('top_movers')->nullable();

            $table->timestamps();

            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->unique(['project_id', 'metric_date']);
            $table->index(['project_id', 'created_at']);
            $table->index('metric_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_gsc_daily_stats');
    }
};

