<?php

namespace App\Observers;

use App\Models\ActivityLog;
use App\Models\Project;
use Illuminate\Support\Facades\Auth;

class ProjectObserver
{
    public function updated(Project $project)
    {
        $watchedFields = ['status', 'handover_status'];
        $changes = [];

        foreach ($watchedFields as $field) {
            if ($project->wasChanged($field)) {
                $changes[$field] = [
                    'old' => $project->getOriginal($field),
                    'new' => $project->{$field},
                ];
            }
        }

        if (empty($changes)) {
            return;
        }

        ActivityLog::create([
            'user_id' => Auth::id(),
            'action' => 'project_status_changed',
            'subject_type' => 'project',
            'subject_id' => $project->id,
            'changes' => $changes,
            'ip_address' => request() ? request()->ip() : null,
            'user_agent' => request() ? request()->userAgent() : null,
            'created_at' => now(),
        ]);
    }
}
