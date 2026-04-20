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
        'status' => 'string',
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

    public function statusRelation()
    {
        return $this->belongsTo(OpportunityStatus::class, 'status', 'code');
    }

    /**
     * @return array{code: string, label: string, color_hex: string}
     */
    public function computedStatusPayload(): array
    {
        $statusCode = trim((string) ($this->status ?: ''));
        $status = $this->relationLoaded('statusRelation')
            ? $this->statusRelation
            : null;

        if (! $status && $statusCode !== '') {
            $status = OpportunityStatus::query()
                ->where('code', $statusCode)
                ->first();
        }

        if ($status) {
            return [
                'code' => (string) $status->code,
                'label' => (string) $status->name,
                'color_hex' => (string) ($status->color_hex ?: '#64748B'),
            ];
        }

        return [
            'code' => $statusCode !== '' ? $statusCode : 'open',
            'label' => $statusCode !== '' ? $statusCode : 'Đang mở',
            'color_hex' => '#64748B',
        ];
    }
}
