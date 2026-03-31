<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OpportunityReminderLog extends Model
{
    protected $fillable = [
        'opportunity_id',
        'user_id',
        'reminder_type',
        'reminder_date',
        'sent_at',
    ];

    protected $casts = [
        'reminder_date' => 'date',
        'sent_at' => 'datetime',
    ];
}

