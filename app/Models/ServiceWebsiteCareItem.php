<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ServiceWebsiteCareItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'task_id',
        'check_date',
        'technical_issue',
        'index_status',
        'traffic',
        'ranking_delta',
        'monthly_report',
    ];
}
