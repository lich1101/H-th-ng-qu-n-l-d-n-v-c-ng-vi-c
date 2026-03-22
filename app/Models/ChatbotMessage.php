<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ChatbotMessage extends Model
{
    use HasFactory;

    public const ROLE_USER = 'user';
    public const ROLE_ASSISTANT = 'assistant';

    public const STATUS_QUEUED = 'queued';
    public const STATUS_PROCESSING = 'processing';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_FAILED = 'failed';
    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'user_id',
        'bot_id',
        'parent_id',
        'role',
        'status',
        'content',
        'attachment_path',
        'attachment_url',
        'attachment_name',
        'attachment_mime',
        'attachment_size',
        'model',
        'error_message',
        'meta',
        'queued_at',
        'started_at',
        'completed_at',
        'cancelled_at',
    ];

    protected $casts = [
        'meta' => 'array',
        'attachment_size' => 'integer',
        'queued_at' => 'datetime',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function parent()
    {
        return $this->belongsTo(ChatbotMessage::class, 'parent_id');
    }

    public function bot()
    {
        return $this->belongsTo(ChatbotBot::class, 'bot_id');
    }

    public function replies()
    {
        return $this->hasMany(ChatbotMessage::class, 'parent_id');
    }
}
