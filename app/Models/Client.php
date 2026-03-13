<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Client extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'company',
        'email',
        'phone',
        'notes',
        'sales_owner_id',
        'assigned_department_id',
        'assigned_staff_id',
        'lead_type_id',
        'revenue_tier_id',
        'total_revenue',
        'has_purchased',
        'lead_source',
        'lead_channel',
        'lead_message',
        'facebook_psid',
        'facebook_page_id',
    ];

    protected $casts = [
        'total_revenue' => 'float',
        'has_purchased' => 'boolean',
    ];

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
}
