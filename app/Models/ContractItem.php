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

    public function getTotalPriceAttribute($value): float
    {
        $stored = (float) ($value ?? 0);
        $unitPrice = (float) ($this->attributes['unit_price'] ?? 0);
        $quantity = max(1, (int) ($this->attributes['quantity'] ?? 1));
        $computed = $unitPrice * $quantity;

        if ($stored <= 0 && $computed > 0) {
            return $computed;
        }

        return $stored;
    }
}
