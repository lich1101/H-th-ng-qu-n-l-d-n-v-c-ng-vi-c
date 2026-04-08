<?php

namespace App\Models;

use App\Services\ContractLifecycleStatusService;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Contract extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'title',
        'contract_type',
        'care_schedule',
        'duration_months',
        'payment_cycle',
        'imported_paid_periods',
        'client_id',
        'opportunity_id',
        'project_id',
        'value',
        'subtotal_value',
        'vat_enabled',
        'vat_mode',
        'vat_rate',
        'vat_amount',
        'payment_times',
        'revenue',
        'debt',
        'cash_flow',
        'approval_status',
        'approved_by',
        'approved_at',
        'approval_note',
        'handover_receive_status',
        'handover_received_by',
        'handover_received_at',
        'signed_at',
        'start_date',
        'end_date',
        'notes',
        'created_by',
        'collector_user_id',
    ];

    protected $casts = [
        'signed_at' => 'date',
        'start_date' => 'date',
        'end_date' => 'date',
        'value' => 'float',
        'subtotal_value' => 'float',
        'vat_enabled' => 'boolean',
        'vat_rate' => 'float',
        'vat_amount' => 'float',
        'payment_times' => 'integer',
        'revenue' => 'float',
        'debt' => 'float',
        'cash_flow' => 'float',
        'duration_months' => 'integer',
        'imported_paid_periods' => 'integer',
        'approved_at' => 'datetime',
        'handover_received_at' => 'datetime',
    ];

    protected $appends = [
        'status',
        'items_total_value',
        'effective_value',
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

    /**
     * Dự án trỏ ngược về hợp đồng qua projects.contract_id (khi chưa có contracts.project_id).
     */
    public function linkedProject()
    {
        return $this->hasOne(Project::class, 'contract_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function collector()
    {
        return $this->belongsTo(User::class, 'collector_user_id');
    }

    public function handoverReceiver()
    {
        return $this->belongsTo(User::class, 'handover_received_by');
    }

    public function items()
    {
        return $this->hasMany(ContractItem::class);
    }

    public function careStaffUsers()
    {
        return $this->belongsToMany(User::class, 'contract_care_staff')
            ->withPivot('assigned_by')
            ->withTimestamps();
    }

    public function careNotes()
    {
        return $this->hasMany(ContractCareNote::class)->latest();
    }

    public function payments()
    {
        return $this->hasMany(ContractPayment::class);
    }

    public function costs()
    {
        return $this->hasMany(ContractCost::class);
    }

    public function financeRequests()
    {
        return $this->hasMany(ContractFinanceRequest::class)->latest();
    }

    public function getItemsTotalValueAttribute(): float
    {
        $value = $this->attributes['items_total_value'] ?? null;
        if ($value !== null) {
            return (float) $value;
        }
        if ($this->relationLoaded('items')) {
            return (float) $this->items->sum('total_price');
        }
        return (float) $this->items()->sum('total_price');
    }

    public function getEffectiveValueAttribute(): float
    {
        $storedValue = $this->attributes['value'] ?? null;
        if ($storedValue !== null && $storedValue !== '') {
            return (float) $storedValue;
        }

        return $this->subtotal_value + $this->resolved_vat_amount;
    }

    public function getValueAttribute($value): float
    {
        return $this->effective_value;
    }

    public function getStatusAttribute($value): string
    {
        if (is_string($value) && $value !== '') {
            return $value;
        }

        return app(ContractLifecycleStatusService::class)->compute($this);
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
        $base = (float) $this->effective_value;
        $outstanding = $base - $this->payments_total;
        return $outstanding > 0 ? $outstanding : 0.0;
    }

    public function getNetRevenueAttribute(): float
    {
        $base = (float) $this->effective_value;
        return $base - $this->costs_total;
    }

    public function getSubtotalValueAttribute($value): float
    {
        if ($value !== null && $value !== '') {
            return (float) $value;
        }

        if ($this->relationLoaded('items') && $this->items->isNotEmpty()) {
            return (float) $this->items->sum('total_price');
        }

        if ($this->items()->exists()) {
            return (float) $this->items()->sum('total_price');
        }

        return (float) ($this->attributes['value'] ?? 0);
    }

    public function getResolvedVatAmountAttribute(): float
    {
        if (! (bool) ($this->attributes['vat_enabled'] ?? false)) {
            return 0.0;
        }

        $subtotal = (float) $this->subtotal_value;
        $mode = (string) ($this->attributes['vat_mode'] ?? '');
        $rate = (float) ($this->attributes['vat_rate'] ?? 0);
        $amount = (float) ($this->attributes['vat_amount'] ?? 0);

        if ($mode === 'percent') {
            return max(0, $subtotal * max(0, $rate) / 100);
        }

        return max(0, $amount);
    }

    public function refreshFinancials(): void
    {
        $subtotal = (float) $this->subtotal_value;
        $vatAmount = (float) $this->resolved_vat_amount;
        $value = $subtotal + $vatAmount;
        $payments = (float) $this->payments()->sum('amount');
        $costs = (float) $this->costs()->sum('amount');
        $this->update([
            'subtotal_value' => $subtotal,
            'vat_amount' => $vatAmount,
            'value' => $value,
            'revenue' => $payments,
            'debt' => max(0, $value - $payments),
            'cash_flow' => $payments - $costs,
        ]);
    }
}
