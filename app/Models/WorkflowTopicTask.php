<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WorkflowTopicTask extends Model
{
    use HasFactory;

    protected $fillable = [
        'workflow_topic_id',
        'title',
        'description',
        'priority',
        'status',
        'weight_percent',
        'start_offset_days',
        'duration_days',
        'sort_order',
    ];

    public function topic()
    {
        return $this->belongsTo(WorkflowTopic::class, 'workflow_topic_id');
    }

    public function items()
    {
        return $this->hasMany(WorkflowTopicTaskItem::class)->orderBy('sort_order')->orderBy('id');
    }
}

