<?php

namespace App\Models;

use App\Services\ClientPhoneDuplicateService;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Client extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'external_code',
        'company',
        'company_profiles',
        'email',
        'phone',
        'notes',
        'comments_history_json',
        'care_rotation_reset_at',
        'is_in_rotation_pool',
        'rotation_pool_entered_at',
        'rotation_pool_reason',
        'rotation_pool_claimed_at',
        'sales_owner_id',
        'assigned_department_id',
        'assigned_staff_id',
        'lead_type_id',
        'revenue_tier_id',
        'total_revenue',
        'total_debt_amount',
        'total_cash_flow',
        'has_purchased',
        'lead_source',
        'lead_channel',
        'lead_message',
        'customer_status_label',
        'customer_level',
        'legacy_debt_amount',
        'company_size',
        'product_categories',
        'facebook_psid',
        'facebook_page_id',
    ];

    protected $casts = [
        'total_revenue' => 'float',
        'total_debt_amount' => 'float',
        'total_cash_flow' => 'float',
        'legacy_debt_amount' => 'float',
        'has_purchased' => 'boolean',
        'company_profiles' => 'array',
        'comments_history_json' => 'array',
        'care_rotation_reset_at' => 'datetime',
        'is_in_rotation_pool' => 'boolean',
        'rotation_pool_entered_at' => 'datetime',
        'rotation_pool_claimed_at' => 'datetime',
    ];

    public function scopeWithoutRotationPool($query)
    {
        return $query->where(function ($builder) {
            $builder->whereNull('is_in_rotation_pool')
                ->orWhere('is_in_rotation_pool', false);
        });
    }

    public function scopeOnlyRotationPool($query)
    {
        return $query->where('is_in_rotation_pool', true);
    }

    public function inRotationPool(): bool
    {
        return (bool) ($this->is_in_rotation_pool ?? false);
    }

    public function setPhoneAttribute($value): void
    {
        if ($value === null || $value === '') {
            $this->attributes['phone'] = null;

            return;
        }
        $n = app(ClientPhoneDuplicateService::class)->normalizeDigits((string) $value);
        $this->attributes['phone'] = $n === '' ? null : $n;
    }

    public function leadType()
    {
        return $this->belongsTo(LeadType::class);
    }

    public function salesOwner()
    {
        return $this->belongsTo(User::class, 'sales_owner_id');
    }

    public function revenueTier()
    {
        return $this->belongsTo(RevenueTier::class, 'revenue_tier_id');
    }

    public function assignedDepartment()
    {
        return $this->belongsTo(Department::class, 'assigned_department_id');
    }

    public function assignedStaff()
    {
        return $this->belongsTo(User::class, 'assigned_staff_id');
    }

    public function careStaffUsers()
    {
        return $this->belongsToMany(User::class, 'client_care_staff')
            ->withPivot('assigned_by')
            ->withTimestamps();
    }

    public function careNotes()
    {
        return $this->hasMany(ClientCareNote::class)->latest();
    }

    public function opportunities()
    {
        return $this->hasMany(Opportunity::class);
    }

    public function contracts()
    {
        return $this->hasMany(Contract::class);
    }

    public function departmentAssignments()
    {
        return $this->hasMany(DepartmentAssignment::class);
    }

    public function facebookMessages()
    {
        return $this->hasMany(FacebookMessage::class);
    }

    public function facebookPage()
    {
        return $this->belongsTo(FacebookPage::class, 'facebook_page_id', 'page_id');
    }

    public function staffTransferRequests()
    {
        return $this->hasMany(ClientStaffTransferRequest::class)->orderByDesc('id');
    }

    public function rotationHistories()
    {
        return $this->hasMany(ClientRotationHistory::class)->orderByDesc('transferred_at');
    }

    public function rotationWarningLogs()
    {
        return $this->hasMany(ClientRotationWarningLog::class)->orderByDesc('warning_date');
    }
}
