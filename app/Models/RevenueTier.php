<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RevenueTier extends Model
{
    protected $fillable = ['name', 'label', 'color_hex', 'min_amount', 'sort_order'];

    protected $casts = [
        'min_amount' => 'float',
    ];
}
