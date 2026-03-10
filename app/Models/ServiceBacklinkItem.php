<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ServiceBacklinkItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'task_id',
        'target_url',
        'domain',
        'anchor_text',
        'status',
        'report_date',
        'note',
    ];
}
