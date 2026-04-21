<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientRotationHistory extends Model
{
    protected $fillable = [
        'client_id',
        'from_staff_id',
        'to_staff_id',
        'department_id',
        'lead_type_id',
        'triggered_by_user_id',
        'source_transfer_request_id',
        'action_type',
        'reason_code',
        'note',
        'metrics_snapshot',
        'transferred_at',
    ];

    protected $casts = [
        'metrics_snapshot' => 'array',
        'transferred_at' => 'datetime',
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

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function leadType(): BelongsTo
    {
        return $this->belongsTo(LeadType::class);
    }

    public function triggeredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'triggered_by_user_id');
    }

    public function sourceTransferRequest(): BelongsTo
    {
        return $this->belongsTo(ClientStaffTransferRequest::class, 'source_transfer_request_id');
    }
}
