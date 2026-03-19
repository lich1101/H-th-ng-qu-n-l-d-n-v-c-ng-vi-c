<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TaskItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'task_id',
        'title',
        'description',
        'priority',
        'status',
        'progress_percent',
        'weight_percent',
        'start_date',
        'deadline',
        'assignee_id',
        'created_by',
        'assigned_by',
        'reviewer_id',
    ];

    protected $casts = [
        'start_date' => 'date',
        'deadline' => 'datetime',
        'progress_percent' => 'integer',
        'weight_percent' => 'integer',
    ];

    public function task()
    {
        return $this->belongsTo(Task::class);
    }

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assignee_id');
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewer_id');
    }

    public function updates()
    {
        return $this->hasMany(TaskItemUpdate::class);
    }
}
