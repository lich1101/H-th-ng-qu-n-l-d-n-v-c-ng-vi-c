<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientRotationWarningLog extends Model
{
    protected $fillable = [
        'client_id',
        'user_id',
        'warning_date',
        'days_until_rotation',
        'payload',
    ];

    protected $casts = [
        'warning_date' => 'date',
        'payload' => 'array',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
