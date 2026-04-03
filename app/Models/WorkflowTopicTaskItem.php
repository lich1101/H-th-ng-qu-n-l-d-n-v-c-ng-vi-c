<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WorkflowTopicTaskItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'workflow_topic_task_id',
        'title',
        'description',
        'priority',
        'status',
        'weight_percent',
        'start_offset_days',
        'duration_days',
        'sort_order',
    ];

    public function topicTask()
    {
        return $this->belongsTo(WorkflowTopicTask::class, 'workflow_topic_task_id');
    }
}

