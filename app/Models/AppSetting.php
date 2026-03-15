<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AppSetting extends Model
{
    protected $fillable = [
        'brand_name',
        'primary_color',
        'logo_url',
        'support_email',
        'support_phone',
        'support_address',
        'updated_by',
    ];

    public static function defaults(): array
    {
        return [
            'brand_name' => config('app.name', 'ClickOn'),
            'primary_color' => '#04BC5C',
            'logo_url' => null,
            'support_email' => null,
            'support_phone' => null,
            'support_address' => null,
        ];
    }
}
