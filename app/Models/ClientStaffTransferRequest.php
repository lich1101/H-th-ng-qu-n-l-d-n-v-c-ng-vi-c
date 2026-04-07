<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientStaffTransferRequest extends Model
{
    protected $fillable = [
        'client_id',
        'from_staff_id',
        'to_staff_id',
        'requested_by_user_id',
        'status',
        'note',
        'rejection_note',
        'responded_by_user_id',
        'responded_at',
        'cancelled_by_user_id',
        'cancelled_at',
    ];

    protected $casts = [
        'responded_at' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function fromStaff(): BelongsTo
    {
        return $this->belongsTo(User::class, 'from_staff_id');
    }

    public function toStaff(): BelongsTo
    {
        return $this->belongsTo(User::class, 'to_staff_id');
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    public function respondedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responded_by_user_id');
    }

    public function cancelledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by_user_id');
    }
}
