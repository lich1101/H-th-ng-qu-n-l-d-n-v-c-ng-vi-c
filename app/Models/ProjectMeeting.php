<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProjectMeeting extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'task_id',
        'title',
        'description',
        'scheduled_at',
        'meeting_link',
        'minutes',
        'created_by',
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
    ];

    public function attendees()
    {
        return $this->hasMany(MeetingAttendee::class, 'meeting_id');
    }
}
