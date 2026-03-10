<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TaskAttachment extends Model
{
    use HasFactory;

    protected $fillable = [
        'task_id',
        'uploaded_by',
        'type',
        'title',
        'file_path',
        'external_url',
        'version',
        'is_handover',
        'note',
    ];

    protected $casts = [
        'is_handover' => 'boolean',
    ];

    public function task()
    {
        return $this->belongsTo(Task::class);
    }
}
