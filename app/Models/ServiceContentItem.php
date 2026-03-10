<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ServiceContentItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'task_id',
        'main_keyword',
        'secondary_keywords',
        'outline_status',
        'required_words',
        'actual_words',
        'seo_score',
        'duplicate_percent',
        'approval_status',
    ];
}
