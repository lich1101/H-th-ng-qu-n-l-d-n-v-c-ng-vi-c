<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ContractCareNote extends Model
{
    use HasFactory;

    protected $fillable = [
        'contract_id',
        'user_id',
        'title',
        'detail',
    ];

    public function contract()
    {
        return $this->belongsTo(Contract::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
