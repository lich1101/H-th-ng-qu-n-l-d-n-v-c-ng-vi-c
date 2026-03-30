<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

class AttendanceHoliday extends Model
{
    use HasFactory;

    protected $fillable = [
        'holiday_date',
        'start_date',
        'end_date',
        'title',
        'note',
        'is_active',
        'created_by',
    ];

    protected $casts = [
        'holiday_date' => 'date',
        'start_date' => 'date',
        'end_date' => 'date',
        'is_active' => 'boolean',
    ];

    public function scopeCoveringDate($query, $date)
    {
        $dateString = $date instanceof Carbon ? $date->toDateString() : (string) $date;

        return $query->where(function ($builder) use ($dateString) {
            $builder->where(function ($rangeQuery) use ($dateString) {
                $rangeQuery->whereNotNull('start_date')
                    ->whereNotNull('end_date')
                    ->whereDate('start_date', '<=', $dateString)
                    ->whereDate('end_date', '>=', $dateString);
            })->orWhere(function ($legacyQuery) use ($dateString) {
                $legacyQuery->whereNull('start_date')
                    ->whereNull('end_date')
                    ->whereDate('holiday_date', $dateString);
            });
        });
    }

    public function scopeOverlappingRange($query, $startDate, $endDate)
    {
        $start = $startDate instanceof Carbon ? $startDate->toDateString() : (string) $startDate;
        $end = $endDate instanceof Carbon ? $endDate->toDateString() : (string) $endDate;

        return $query->where(function ($builder) use ($start, $end) {
            $builder->where(function ($rangeQuery) use ($start, $end) {
                $rangeQuery->whereNotNull('start_date')
                    ->whereNotNull('end_date')
                    ->whereDate('start_date', '<=', $end)
                    ->whereDate('end_date', '>=', $start);
            })->orWhere(function ($legacyQuery) use ($start, $end) {
                $legacyQuery->whereNull('start_date')
                    ->whereNull('end_date')
                    ->whereDate('holiday_date', '>=', $start)
                    ->whereDate('holiday_date', '<=', $end);
            });
        });
    }

    public function resolvedStartDate(): ?Carbon
    {
        if ($this->start_date instanceof Carbon) {
            return $this->start_date->copy();
        }

        return $this->holiday_date instanceof Carbon ? $this->holiday_date->copy() : null;
    }

    public function resolvedEndDate(): ?Carbon
    {
        if ($this->end_date instanceof Carbon) {
            return $this->end_date->copy();
        }

        return $this->holiday_date instanceof Carbon ? $this->holiday_date->copy() : null;
    }

    public function durationDays(): int
    {
        $start = $this->resolvedStartDate();
        $end = $this->resolvedEndDate();
        if (! $start || ! $end) {
            return 1;
        }

        return max(1, $start->diffInDays($end) + 1);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
