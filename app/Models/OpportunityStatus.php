<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OpportunityStatus extends Model
{
    protected $fillable = [
        'code',
        'name',
        'color_hex',
        'sort_order',
    ];

    public function opportunities()
    {
        return $this->hasMany(Opportunity::class, 'status', 'code');
    }
}

