<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TaskItemUpdate extends Model
{
    use HasFactory;

    protected $fillable = [
        'task_item_id',
        'submitted_by',
        'status',
        'progress_percent',
        'note',
        'attachment_path',
        'review_status',
        'review_note',
        'reviewed_by',
        'reviewed_at',
    ];

    protected $casts = [
        'reviewed_at' => 'datetime',
    ];

    public function taskItem()
    {
        return $this->belongsTo(TaskItem::class);
    }

    public function submitter()
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
