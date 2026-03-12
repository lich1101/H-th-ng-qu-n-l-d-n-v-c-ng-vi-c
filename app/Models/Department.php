<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Department extends Model
{
    protected $fillable = ['name', 'manager_id'];

    public function manager()
    {
        return $this->belongsTo(User::class, 'manager_id');
    }

    public function staff()
    {
        return $this->hasMany(User::class, 'department_id');
    }

    public function assignments()
    {
        return $this->hasMany(DepartmentAssignment::class);
    }
}
