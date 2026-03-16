<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TaskItemReminderLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'task_item_id',
        'user_id',
        'reminder_date',
    ];

    protected $casts = [
        'reminder_date' => 'date',
    ];

    public function item()
    {
        return $this->belongsTo(TaskItem::class, 'task_item_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
