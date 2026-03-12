<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    protected $fillable = ['code', 'name', 'unit', 'unit_price', 'description', 'is_active'];

    protected $casts = [
        'unit_price' => 'float',
        'is_active' => 'boolean',
    ];
}
