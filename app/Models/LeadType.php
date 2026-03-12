<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LeadType extends Model
{
    protected $fillable = ['name', 'color_hex', 'sort_order'];

    public function clients()
    {
        return $this->hasMany(Client::class, 'lead_type_id');
    }
}
