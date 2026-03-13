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
        'payment_times',
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
        'payment_times' => 'integer',
        'revenue' => 'float',
        'debt' => 'float',
        'cash_flow' => 'float',
        'approved_at' => 'datetime',
    ];

    protected $appends = [
        'payments_total',
        'payments_count',
        'costs_total',
        'debt_outstanding',
        'debt_recovered',
        'net_revenue',
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

    public function payments()
    {
        return $this->hasMany(ContractPayment::class);
    }

    public function costs()
    {
        return $this->hasMany(ContractCost::class);
    }

    public function getPaymentsTotalAttribute(): float
    {
        $value = $this->attributes['payments_total'] ?? $this->attributes['payments_sum_amount'] ?? null;
        if ($value !== null) {
            return (float) $value;
        }
        if ($this->relationLoaded('payments')) {
            return (float) $this->payments->sum('amount');
        }
        return (float) $this->payments()->sum('amount');
    }

    public function getPaymentsCountAttribute(): int
    {
        $value = $this->attributes['payments_count'] ?? null;
        if ($value !== null) {
            return (int) $value;
        }
        if ($this->relationLoaded('payments')) {
            return (int) $this->payments->count();
        }
        return (int) $this->payments()->count();
    }

    public function getCostsTotalAttribute(): float
    {
        $value = $this->attributes['costs_total'] ?? $this->attributes['costs_sum_amount'] ?? null;
        if ($value !== null) {
            return (float) $value;
        }
        if ($this->relationLoaded('costs')) {
            return (float) $this->costs->sum('amount');
        }
        return (float) $this->costs()->sum('amount');
    }

    public function getDebtRecoveredAttribute(): float
    {
        return (float) $this->payments_total;
    }

    public function getDebtOutstandingAttribute(): float
    {
        $base = (float) ($this->value ?? 0);
        $outstanding = $base - $this->payments_total;
        return $outstanding > 0 ? $outstanding : 0.0;
    }

    public function getNetRevenueAttribute(): float
    {
        $base = (float) ($this->value ?? 0);
        return $base - $this->costs_total;
    }

    public function refreshFinancials(): void
    {
        $value = (float) ($this->value ?? 0);
        $payments = (float) $this->payments()->sum('amount');
        $costs = (float) $this->costs()->sum('amount');
        $this->update([
            'revenue' => $payments,
            'debt' => max(0, $value - $payments),
            'cash_flow' => $value - $costs,
        ]);
    }
}
