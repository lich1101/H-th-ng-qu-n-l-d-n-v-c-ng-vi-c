<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContractItem extends Model
{
    protected $fillable = [
        'contract_id',
        'product_id',
        'product_code',
        'product_name',
        'unit',
        'unit_price',
        'quantity',
        'discount_amount',
        'vat_amount',
        'total_price',
        'note',
    ];

    protected $casts = [
        'unit_price' => 'float',
        'total_price' => 'float',
        'discount_amount' => 'float',
        'vat_amount' => 'float',
        'quantity' => 'integer',
    ];

    public function contract()
    {
        return $this->belongsTo(Contract::class);
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}
