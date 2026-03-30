<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AttendanceRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'request_type',
        'request_date',
        'expected_check_in_time',
        'title',
        'content',
        'status',
        'approval_mode',
        'approved_work_units',
        'decision_note',
        'decided_by',
        'decided_at',
    ];

    protected $casts = [
        'request_date' => 'date',
        'approved_work_units' => 'float',
        'decided_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function decider()
    {
        return $this->belongsTo(User::class, 'decided_by');
    }
}
