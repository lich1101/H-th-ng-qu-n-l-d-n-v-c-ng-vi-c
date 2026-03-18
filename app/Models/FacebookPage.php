<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FacebookPage extends Model
{
    use HasFactory;

    protected $fillable = [
        'page_id',
        'name',
        'category',
        'access_token',
        'user_id',
        'assigned_staff_id',
        'is_active',
        'is_subscribed',
        'connected_at',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'is_subscribed' => 'boolean',
        'connected_at' => 'datetime',
    ];

    protected $hidden = [
        'access_token',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function messages()
    {
        return $this->hasMany(FacebookMessage::class);
    }

    public function assignedStaff()
    {
        return $this->belongsTo(User::class, 'assigned_staff_id');
    }
}
