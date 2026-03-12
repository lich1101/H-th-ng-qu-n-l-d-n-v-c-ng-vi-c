<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DepartmentAssignment extends Model
{
    protected $fillable = [
        'client_id',
        'contract_id',
        'department_id',
        'assigned_by',
        'manager_id',
        'status',
        'requirements',
        'deadline',
        'allocated_value',
        'progress_percent',
        'progress_note',
        'accepted_at',
        'completed_at',
    ];

    protected $casts = [
        'deadline' => 'date',
        'allocated_value' => 'float',
        'progress_percent' => 'integer',
        'accepted_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function client()
    {
        return $this->belongsTo(Client::class);
    }

    public function contract()
    {
        return $this->belongsTo(Contract::class);
    }

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function manager()
    {
        return $this->belongsTo(User::class, 'manager_id');
    }

    public function assigner()
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }
}
