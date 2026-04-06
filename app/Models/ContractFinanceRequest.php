<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContractFinanceRequest extends Model
{
    protected $fillable = [
        'contract_id',
        'request_type',
        'request_action',
        'amount',
        'transaction_date',
        'method',
        'cost_type',
        'note',
        'status',
        'submitted_by',
        'reviewed_by',
        'reviewed_at',
        'review_note',
        'contract_payment_id',
        'contract_cost_id',
    ];

    protected $casts = [
        'amount' => 'float',
        'transaction_date' => 'date',
        'reviewed_at' => 'datetime',
    ];

    public function contract()
    {
        return $this->belongsTo(Contract::class);
    }

    public function submitter()
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function payment()
    {
        return $this->belongsTo(ContractPayment::class, 'contract_payment_id');
    }

    public function cost()
    {
        return $this->belongsTo(ContractCost::class, 'contract_cost_id');
    }
}

