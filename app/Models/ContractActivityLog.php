<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContractActivityLog extends Model
{
    protected $fillable = [
        'contract_id',
        'user_id',
        'summary',
        'meta',
    ];

    protected $casts = [
        'meta' => 'array',
    ];

    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
