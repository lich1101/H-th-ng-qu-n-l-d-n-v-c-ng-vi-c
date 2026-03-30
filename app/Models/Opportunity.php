<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Opportunity extends Model
{
    protected $fillable = [
        'title',
        'opportunity_type',
        'client_id',
        'amount',
        'status',
        'source',
        'success_probability',
        'product_id',
        'assigned_to',
        'watcher_ids',
        'expected_close_date',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'amount' => 'float',
        'success_probability' => 'integer',
        'watcher_ids' => 'array',
        'expected_close_date' => 'date',
    ];

    public function client()
    {
        return $this->belongsTo(Client::class);
    }

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function product()
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function statusConfig()
    {
        return $this->belongsTo(OpportunityStatus::class, 'status', 'code');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function contracts()
    {
        return $this->hasMany(Contract::class, 'opportunity_id');
    }
}
