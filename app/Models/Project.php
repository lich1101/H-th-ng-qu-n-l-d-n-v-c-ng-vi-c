<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Project extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'client_id',
        'contract_id',
        'service_type',
        'service_type_other',
        'workflow_topic_id',
        'start_date',
        'deadline',
        'budget',
        'status',
        'handover_status',
        'handover_requested_by',
        'handover_requested_at',
        'handover_review_note',
        'customer_requirement',
        'created_by',
        'approved_by',
        'approved_at',
        'owner_id',
        'repo_url',
        'website_url',
        'gsc_notify_enabled',
        'gsc_notify_last_error',
        'gsc_tracking_started_at',
        'gsc_last_synced_at',
        'progress_percent',
    ];

    protected $casts = [
        'start_date' => 'date',
        'deadline' => 'date',
        'handover_requested_at' => 'datetime',
        'approved_at' => 'datetime',
        'gsc_notify_enabled' => 'boolean',
        'gsc_tracking_started_at' => 'date',
        'gsc_last_synced_at' => 'datetime',
        'budget' => 'float',
        'progress_percent' => 'integer',
    ];

    public function tasks()
    {
        return $this->hasMany(Task::class);
    }

    public function meetings()
    {
        return $this->hasMany(ProjectMeeting::class);
    }

    public function client()
    {
        return $this->belongsTo(Client::class);
    }

    public function contract()
    {
        return $this->belongsTo(Contract::class);
    }

    public function linkedContract()
    {
        return $this->hasOne(Contract::class, 'project_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function workflowTopic()
    {
        return $this->belongsTo(WorkflowTopic::class, 'workflow_topic_id');
    }

    public function owner()
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function handoverRequester()
    {
        return $this->belongsTo(User::class, 'handover_requested_by');
    }

    public function gscDailyStats()
    {
        return $this->hasMany(ProjectGscDailyStat::class);
    }
}
