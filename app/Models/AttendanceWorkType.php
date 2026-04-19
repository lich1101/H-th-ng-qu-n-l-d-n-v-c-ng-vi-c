<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AttendanceWorkType extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'session',
        'default_work_units',
        'sort_order',
        'is_active',
        'is_system',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'default_work_units' => 'float',
        'sort_order' => 'integer',
        'is_active' => 'boolean',
        'is_system' => 'boolean',
    ];
}

