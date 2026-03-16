<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserNotificationPreference extends Model
{
    protected $fillable = [
        'user_id',
        'notifications_enabled',
        'category_system_enabled',
        'category_crm_realtime_enabled',
    ];

    protected $casts = [
        'notifications_enabled' => 'boolean',
        'category_system_enabled' => 'boolean',
        'category_crm_realtime_enabled' => 'boolean',
    ];

    public static function defaults(): array
    {
        return [
            'notifications_enabled' => true,
            'category_system_enabled' => true,
            'category_crm_realtime_enabled' => true,
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
