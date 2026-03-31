<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DataTransferJob extends Model
{
    protected $fillable = [
        'user_id',
        'type',
        'module',
        'status',
        'disk',
        'file_path',
        'original_name',
        'total_rows',
        'processed_rows',
        'successful_rows',
        'failed_rows',
        'report',
        'error_message',
        'batch_id',
        'started_at',
        'finished_at',
    ];

    protected $casts = [
        'report' => 'array',
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
    ];

    protected $appends = [
        'progress_percent',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function getProgressPercentAttribute(): int
    {
        $total = (int) ($this->total_rows ?? 0);
        $processed = (int) ($this->processed_rows ?? 0);

        if ($total <= 0) {
            return in_array($this->status, ['completed', 'failed'], true) ? 100 : 0;
        }

        return (int) min(100, round(($processed / $total) * 100));
    }
}
