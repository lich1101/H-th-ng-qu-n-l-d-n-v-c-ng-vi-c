<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContractReminderLog extends Model
{
    protected $fillable = [
        'contract_id',
        'user_id',
        'reminder_type',
        'reminder_date',
    ];

    protected $casts = [
        'reminder_date' => 'date',
    ];
}
