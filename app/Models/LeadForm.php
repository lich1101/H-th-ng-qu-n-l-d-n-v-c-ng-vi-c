<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

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
        'field_schema',
        'style_config',
        'submission_mapping',
        'created_by',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'field_schema' => 'array',
        'style_config' => 'array',
        'submission_mapping' => 'array',
    ];

    public static function defaultFieldSchema(): array
    {
        return [
            [
                'id' => 'name',
                'key' => 'name',
                'label' => 'Họ và tên',
                'type' => 'text',
                'placeholder' => 'Nhập họ và tên',
                'help_text' => '',
                'required' => true,
                'width' => 'full',
                'options' => [],
                'validation' => [
                    'min_length' => null,
                    'max_length' => 255,
                ],
                'map_to' => 'name',
            ],
            [
                'id' => 'phone',
                'key' => 'phone',
                'label' => 'Số điện thoại',
                'type' => 'phone',
                'placeholder' => 'Nhập số điện thoại',
                'help_text' => '',
                'required' => true,
                'width' => 'half',
                'options' => [],
                'validation' => [
                    'min_length' => 8,
                    'max_length' => 30,
                ],
                'map_to' => 'phone',
            ],
            [
                'id' => 'email',
                'key' => 'email',
                'label' => 'Email',
                'type' => 'email',
                'placeholder' => 'Email liên hệ',
                'help_text' => '',
                'required' => false,
                'width' => 'half',
                'options' => [],
                'validation' => [
                    'min_length' => null,
                    'max_length' => 255,
                ],
                'map_to' => 'email',
            ],
            [
                'id' => 'company',
                'key' => 'company',
                'label' => 'Công ty',
                'type' => 'text',
                'placeholder' => 'Tên công ty / thương hiệu',
                'help_text' => '',
                'required' => false,
                'width' => 'full',
                'options' => [],
                'validation' => [
                    'min_length' => null,
                    'max_length' => 255,
                ],
                'map_to' => 'company',
            ],
            [
                'id' => 'message',
                'key' => 'message',
                'label' => 'Nhu cầu tư vấn',
                'type' => 'textarea',
                'placeholder' => 'Mô tả ngắn nhu cầu hoặc mục tiêu của bạn',
                'help_text' => '',
                'required' => false,
                'width' => 'full',
                'options' => [],
                'validation' => [
                    'min_length' => null,
                    'max_length' => 2000,
                ],
                'map_to' => 'lead_message',
            ],
        ];
    }

    public static function defaultStyleConfig(): array
    {
        return [
            'primary_color' => null,
            'background_style' => 'soft',
            'surface_style' => 'soft',
            'submit_label' => 'Gửi thông tin',
            'success_message' => 'Cảm ơn bạn đã gửi thông tin. Đội ngũ sẽ liên hệ sớm.',
            'logo_mode' => 'brand',
            'logo_url' => null,
        ];
    }

    public static function defaultSubmissionMapping(): array
    {
        return [
            'target' => 'clients',
            'append_unmapped_to_notes' => true,
            'assigned_staff_id' => null,
        ];
    }

    public function resolvedFieldSchema(): array
    {
        return is_array($this->field_schema) && count($this->field_schema) > 0
            ? $this->field_schema
            : static::defaultFieldSchema();
    }

    public function resolvedStyleConfig(): array
    {
        $style = is_array($this->style_config) ? $this->style_config : [];

        return array_merge(static::defaultStyleConfig(), $style);
    }

    public function resolvedSubmissionMapping(): array
    {
        $mapping = is_array($this->submission_mapping) ? $this->submission_mapping : [];

        return array_merge(static::defaultSubmissionMapping(), $mapping);
    }

    public static function makeFieldKey(string $label, int $index = 0): string
    {
        $base = (string) Str::of($label)->ascii()->snake()->trim('_');
        if ($base === '') {
            $base = 'field_'.$index;
        }

        if (preg_match('/^[0-9]/', $base)) {
            $base = 'field_'.$base;
        }

        return Str::limit($base, 40, '');
    }

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
