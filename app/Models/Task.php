<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Task extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'department_id',
        'title',
        'description',
        'priority',
        'status',
        'start_at',
        'deadline',
        'completed_at',
        'progress_percent',
        'created_by',
        'assigned_by',
        'assignee_id',
        'reviewer_id',
        'require_acknowledgement',
        'acknowledged_at',
    ];

    protected $casts = [
        'start_at' => 'datetime',
        'deadline' => 'datetime',
        'completed_at' => 'datetime',
        'acknowledged_at' => 'datetime',
        'require_acknowledgement' => 'boolean',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function department()
    {
        return $this->belongsTo(Department::class, 'department_id');
    }

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assignee_id');
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewer_id');
    }

    public function comments()
    {
        return $this->hasMany(TaskComment::class);
    }

    public function latestComment()
    {
        return $this->hasOne(TaskComment::class)->latestOfMany();
    }

    public function attachments()
    {
        return $this->hasMany(TaskAttachment::class);
    }

    public function reminders()
    {
        return $this->hasMany(DeadlineReminder::class);
    }

    public function updates()
    {
        return $this->hasMany(TaskUpdate::class);
    }

    public function items()
    {
        return $this->hasMany(TaskItem::class);
    }
}
