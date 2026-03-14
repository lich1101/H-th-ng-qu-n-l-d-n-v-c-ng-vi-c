<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DeadlineReminder extends Model
{
    use HasFactory;

    protected $fillable = [
        'task_id',
        'task_item_id',
        'channel',
        'trigger_type',
        'scheduled_at',
        'sent_at',
        'status',
        'payload',
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
        'sent_at' => 'datetime',
    ];

    public function task()
    {
        return $this->belongsTo(Task::class);
    }

    public function taskItem()
    {
        return $this->belongsTo(TaskItem::class, 'task_item_id');
    }
}
