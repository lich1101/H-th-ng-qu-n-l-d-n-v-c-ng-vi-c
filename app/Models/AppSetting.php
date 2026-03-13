<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AppSetting extends Model
{
    protected $fillable = [
        'brand_name',
        'primary_color',
        'logo_url',
        'updated_by',
    ];

    public static function defaults(): array
    {
        return [
            'brand_name' => config('app.name', 'Quản lý nội bộ'),
            'primary_color' => '#04BC5C',
            'logo_url' => null,
        ];
    }
}
