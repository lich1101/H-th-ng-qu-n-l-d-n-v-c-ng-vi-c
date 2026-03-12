<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Opportunity extends Model
{
    protected $fillable = [
        'title',
        'client_id',
        'amount',
        'status',
        'assigned_to',
        'expected_close_date',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'amount' => 'float',
        'expected_close_date' => 'date',
    ];

    public function client()
    {
        return $this->belongsTo(Client::class);
    }

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function contracts()
    {
        return $this->hasMany(Contract::class, 'opportunity_id');
    }
}
