<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CustomerPayment extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'client_id',
        'amount',
        'due_date',
        'paid_at',
        'status',
        'invoice_no',
        'note',
    ];

    protected $casts = [
        'amount' => 'float',
        'due_date' => 'date',
        'paid_at' => 'date',
    ];

    public function client()
    {
        return $this->belongsTo(Client::class);
    }
}
