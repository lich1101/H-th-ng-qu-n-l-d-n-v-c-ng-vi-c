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
        'progress_percent',
    ];

    protected $casts = [
        'start_date' => 'date',
        'deadline' => 'date',
        'handover_requested_at' => 'datetime',
        'approved_at' => 'datetime',
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

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
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
}
