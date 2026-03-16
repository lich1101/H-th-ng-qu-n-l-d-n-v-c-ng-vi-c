<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectFile extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'parent_id',
        'name',
        'path',
        'mime_type',
        'size',
        'is_folder',
        'is_deleted',
        'deleted_at',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'is_folder' => 'boolean',
        'is_deleted' => 'boolean',
        'deleted_at' => 'datetime',
        'size' => 'integer',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function parent()
    {
        return $this->belongsTo(ProjectFile::class, 'parent_id');
    }

    public function children()
    {
        return $this->hasMany(ProjectFile::class, 'parent_id');
    }
}
