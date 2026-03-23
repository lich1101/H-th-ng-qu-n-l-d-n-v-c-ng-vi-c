<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectGscDailyStat extends Model
{
    protected $fillable = [
        'project_id',
        'metric_date',
        'prior_date',
        'site_url',
        'prior_rows_count',
        'last_rows_count',
        'compared_rows_count',
        'last_clicks',
        'prior_clicks',
        'delta_clicks',
        'delta_clicks_percent',
        'last_impressions',
        'prior_impressions',
        'delta_impressions',
        'last_ctr',
        'prior_ctr',
        'delta_ctr',
        'last_avg_position',
        'prior_avg_position',
        'delta_avg_position',
        'alerts_brand',
        'alerts_brand_recipes',
        'alerts_recipes',
        'alerts_nonbrand',
        'alerts_total',
        'segment_totals',
        'top_movers',
    ];

    protected $casts = [
        'metric_date' => 'date',
        'prior_date' => 'date',
        'delta_clicks_percent' => 'float',
        'last_ctr' => 'float',
        'prior_ctr' => 'float',
        'delta_ctr' => 'float',
        'last_avg_position' => 'float',
        'prior_avg_position' => 'float',
        'delta_avg_position' => 'float',
        'segment_totals' => 'array',
        'top_movers' => 'array',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }
}

