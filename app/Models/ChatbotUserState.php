<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ChatbotUserState extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'bot_id',
        'is_processing',
        'current_message_id',
        'stop_requested',
        'last_error',
        'processing_started_at',
    ];

    protected $casts = [
        'is_processing' => 'boolean',
        'stop_requested' => 'boolean',
        'processing_started_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function currentMessage()
    {
        return $this->belongsTo(ChatbotMessage::class, 'current_message_id');
    }

    public function bot()
    {
        return $this->belongsTo(ChatbotBot::class, 'bot_id');
    }
}
