<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Contract extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'title',
        'client_id',
        'opportunity_id',
        'project_id',
        'value',
        'revenue',
        'debt',
        'cash_flow',
        'status',
        'approval_status',
        'approved_by',
        'approved_at',
        'approval_note',
        'signed_at',
        'start_date',
        'end_date',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'signed_at' => 'date',
        'start_date' => 'date',
        'end_date' => 'date',
        'value' => 'float',
        'revenue' => 'float',
        'debt' => 'float',
        'cash_flow' => 'float',
        'approved_at' => 'datetime',
    ];

    public function client()
    {
        return $this->belongsTo(Client::class);
    }

    public function opportunity()
    {
        return $this->belongsTo(Opportunity::class);
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function items()
    {
        return $this->hasMany(ContractItem::class);
    }
}
