<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AttendanceRecord extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'work_date',
        'check_in_at',
        'required_start_at',
        'allowed_late_until',
        'minutes_late',
        'default_work_units',
        'work_units',
        'employment_type',
        'status',
        'source',
        'wifi_ssid',
        'wifi_bssid',
        'device_uuid',
        'device_name',
        'device_platform',
        'note',
        'attendance_request_id',
        'approved_by',
        'edited_after_wifi',
    ];

    protected $casts = [
        'work_date' => 'date',
        'check_in_at' => 'datetime',
        'required_start_at' => 'datetime',
        'allowed_late_until' => 'datetime',
        'minutes_late' => 'integer',
        'default_work_units' => 'float',
        'work_units' => 'float',
        'edited_after_wifi' => 'boolean',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function attendanceRequest()
    {
        return $this->belongsTo(AttendanceRequest::class, 'attendance_request_id');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function editLogs()
    {
        return $this->hasMany(AttendanceRecordEditLog::class, 'attendance_record_id')->orderByDesc('created_at');
    }
}
