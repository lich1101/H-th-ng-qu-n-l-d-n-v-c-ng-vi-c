<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ChatbotBot extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'description',
        'provider',
        'model',
        'api_key',
        'system_message_markdown',
        'history_pairs',
        'accent_color',
        'icon',
        'sort_order',
        'is_active',
        'is_default',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'history_pairs' => 'integer',
        'sort_order' => 'integer',
        'is_active' => 'boolean',
        'is_default' => 'boolean',
        'created_by' => 'integer',
        'updated_by' => 'integer',
    ];

    public function messages()
    {
        return $this->hasMany(ChatbotMessage::class, 'bot_id');
    }

    public function states()
    {
        return $this->hasMany(ChatbotUserState::class, 'bot_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
