<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TaskItemProgressDailyDigestLog extends Model
{
    protected $table = 'task_item_progress_daily_digest_logs';

    protected $fillable = [
        'user_id',
        'reminder_date',
    ];

    protected $casts = [
        'reminder_date' => 'date',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
