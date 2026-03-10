<?php

namespace App\Observers;

use App\Models\ActivityLog;
use App\Models\Task;
use Illuminate\Support\Facades\Auth;

class TaskObserver
{
    public function updated(Task $task)
    {
        if (! $task->wasChanged('status')) {
            return;
        }

        ActivityLog::create([
            'user_id' => Auth::id(),
            'action' => 'task_status_changed',
            'subject_type' => 'task',
            'subject_id' => $task->id,
            'changes' => [
                'status' => [
                    'old' => $task->getOriginal('status'),
                    'new' => $task->status,
                ],
            ],
            'ip_address' => request() ? request()->ip() : null,
            'user_agent' => request() ? request()->userAgent() : null,
            'created_at' => now(),
        ]);
    }
}
