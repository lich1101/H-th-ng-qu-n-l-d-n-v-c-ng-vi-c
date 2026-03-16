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

    protected $appends = [
        'attachment_name',
    ];

    public function task()
    {
        return $this->belongsTo(Task::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function getAttachmentNameAttribute(): ?string
    {
        if (empty($this->attachment_path)) {
            return null;
        }

        $path = parse_url((string) $this->attachment_path, PHP_URL_PATH) ?: (string) $this->attachment_path;
        $name = basename($path);

        return $name === '' ? null : $name;
    }
}
