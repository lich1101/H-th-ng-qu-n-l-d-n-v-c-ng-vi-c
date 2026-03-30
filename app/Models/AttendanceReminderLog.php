<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AttendanceReminderLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'reminder_date',
        'reminder_type',
        'sent_at',
    ];

    protected $casts = [
        'reminder_date' => 'date',
        'sent_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
