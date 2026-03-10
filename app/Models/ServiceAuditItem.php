<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ServiceAuditItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'task_id',
        'url',
        'issue_type',
        'issue_description',
        'suggestion',
        'priority',
        'status',
    ];
}
