<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContractCost extends Model
{
    protected $fillable = [
        'contract_id',
        'cost_type',
        'amount',
        'cost_date',
        'note',
        'created_by',
    ];

    protected $casts = [
        'amount' => 'float',
        'cost_date' => 'date',
    ];

    public function contract()
    {
        return $this->belongsTo(Contract::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
