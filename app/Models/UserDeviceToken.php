<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserDeviceToken extends Model
{
    protected $fillable = [
        'user_id',
        'token',
        'platform',
        'apns_environment',
        'device_name',
        'notifications_enabled',
        'last_seen_at',
    ];

    protected $casts = [
        'notifications_enabled' => 'boolean',
        'last_seen_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
