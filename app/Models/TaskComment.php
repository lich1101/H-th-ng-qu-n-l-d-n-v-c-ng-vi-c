<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TaskComment extends Model
{
    use HasFactory;

    protected $fillable = [
        'task_id',
        'user_id',
        'content',
        'tagged_user_ids',
        'attachment_path',
        'is_recalled',
        'recalled_at',
    ];

    protected $casts = [
        'tagged_user_ids' => 'array',
        'is_recalled' => 'boolean',
        'recalled_at' => 'datetime',
    ];

    public function task()
    {
        return $this->belongsTo(Task::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
