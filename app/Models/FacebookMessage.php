<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FacebookMessage extends Model
{
    use HasFactory;

    protected $fillable = [
        'facebook_page_id',
        'client_id',
        'sender_id',
        'message_text',
        'payload',
        'received_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'received_at' => 'datetime',
    ];

    public function page()
    {
        return $this->belongsTo(FacebookPage::class, 'facebook_page_id');
    }

    public function client()
    {
        return $this->belongsTo(Client::class);
    }
}
