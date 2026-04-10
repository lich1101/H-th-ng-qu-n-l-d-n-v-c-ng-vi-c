<?php

namespace App\Models;

use App\Support\OpportunityComputedStatus;
use Illuminate\Database\Eloquent\Model;

class Opportunity extends Model
{
    protected $fillable = [
        'title',
        'opportunity_type',
        'client_id',
        'amount',
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

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Quan hệ 1-1: tối đa một hợp đồng gắn cơ hội (contracts.opportunity_id).
     */
    public function contract()
    {
        return $this->hasOne(Contract::class, 'opportunity_id');
    }

    /**
     * @return array{code: string, label: string}
     */
    public function computedStatusPayload(): array
    {
        return OpportunityComputedStatus::compute($this);
    }
}
