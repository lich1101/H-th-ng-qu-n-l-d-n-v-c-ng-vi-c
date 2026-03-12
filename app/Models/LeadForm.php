<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LeadForm extends Model
{
    protected $fillable = [
        'name',
        'slug',
        'lead_type_id',
        'department_id',
        'public_key',
        'is_active',
        'redirect_url',
        'description',
        'created_by',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function leadType()
    {
        return $this->belongsTo(LeadType::class);
    }

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
