<?php

namespace App\Http\Controllers;

use App\Models\AppSetting;
use App\Models\Client;
use App\Models\LeadForm;
use App\Models\LeadType;
use App\Models\User;
use App\Services\LeadNotificationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class LeadFormPublicController extends Controller
{
    public function show(string $slug)
    {
        $form = LeadForm::query()
            ->where('slug', $slug)
            ->where('is_active', true)
            ->firstOrFail();

        $setting = AppSetting::query()->first();
        $defaultPrimaryColor = '#04BC5C';
        $style = $form->resolvedStyleConfig();

        return view('lead-form', [
            'form' => $form,
            'fields' => $form->resolvedFieldSchema(),
            'style' => $style,
            'mapping' => $form->resolvedSubmissionMapping(),
            'brandName' => optional($setting)->brand_name ?: config('app.name', 'Jobs ClickOn'),
            'primaryColor' => $style['primary_color'] ?: (optional($setting)->primary_color ?: $defaultPrimaryColor),
            'brandLogoUrl' => optional($setting)->logo_url ?: AppSetting::defaults()['logo_url'],
        ]);
    }

    public function submit(string $slug, Request $request): RedirectResponse
    {
        $form = LeadForm::query()
            ->where('slug', $slug)
            ->where('is_active', true)
            ->firstOrFail();

        $fields = $form->resolvedFieldSchema();
        $mapping = $form->resolvedSubmissionMapping();

        $validator = Validator::make(
            $request->all(),
            $this->buildValidationRules($fields),
            [],
            $this->attributeNames($fields)
        );

        $validated = $validator->validate();
        $clientPayload = $this->buildClientPayload($form, $fields, $mapping, $validated);

        $leadTypeId = $form->lead_type_id;
        if (! $leadTypeId) {
            $leadTypeId = LeadType::query()
                ->where('name', 'Khách hàng tiềm năng')
                ->value('id');
            if (! $leadTypeId) {
                $leadTypeId = LeadType::query()->orderBy('sort_order')->orderBy('id')->value('id');
            }
        }

        $assignedStaffId = ! empty($mapping['assigned_staff_id'])
            ? (int) $mapping['assigned_staff_id']
            : null;
        $assignedDepartmentId = $form->department_id;
        if ($assignedStaffId && ! $assignedDepartmentId) {
            $assignedDepartmentId = User::query()
                ->where('id', $assignedStaffId)
                ->value('department_id');
        }

        $client = Client::create([
            'name' => $clientPayload['name'],
            'company' => $clientPayload['company'],
            'email' => $clientPayload['email'],
            'phone' => $clientPayload['phone'],
            'lead_type_id' => $leadTypeId,
            'lead_source' => 'lead_form',
            'lead_channel' => 'iframe:'.$form->slug,
            'lead_message' => $clientPayload['lead_message'],
            'notes' => $clientPayload['notes'],
            'assigned_department_id' => $assignedDepartmentId,
            'assigned_staff_id' => $assignedStaffId,
        ]);

        app(LeadNotificationService::class)->notifyNewLead(
            $client,
            'Form: '.$form->name
        );

        if ($form->redirect_url) {
            return redirect($form->redirect_url);
        }

        $style = $form->resolvedStyleConfig();

        return redirect()
            ->back()
            ->with('success', $style['success_message'] ?: 'Cảm ơn bạn đã gửi thông tin!');
    }

    private function buildValidationRules(array $fields): array
    {
        $rules = [];

        foreach ($fields as $field) {
            $key = (string) ($field['key'] ?? '');
            if ($key === '') {
                continue;
            }

            $fieldRules = [];
            $required = (bool) ($field['required'] ?? false);
            $type = (string) ($field['type'] ?? 'text');
            $validation = is_array($field['validation'] ?? null) ? $field['validation'] : [];

            if ($required) {
                $fieldRules[] = 'required';
            } else {
                $fieldRules[] = 'nullable';
            }

            switch ($type) {
                case 'email':
                    $fieldRules[] = 'email';
                    $fieldRules[] = 'max:255';
                    break;

                case 'phone':
                    $fieldRules[] = 'string';
                    $fieldRules[] = 'regex:/^[0-9+\-\s().]{8,30}$/';
                    $fieldRules[] = 'max:30';
                    break;

                case 'select':
                    $options = collect($field['options'] ?? [])
                        ->map(function ($option) {
                            return trim((string) $option);
                        })
                        ->filter()
                        ->values()
                        ->all();

                    $fieldRules[] = 'string';
                    if (count($options) > 0) {
                        $fieldRules[] = Rule::in($options);
                    }
                    break;

                default:
                    $fieldRules[] = 'string';
                    break;
            }

            if ($type === 'textarea') {
                $fieldRules[] = 'max:5000';
            }

            if (isset($validation['min_length']) && $validation['min_length'] !== null && $validation['min_length'] !== '') {
                $fieldRules[] = 'min:'.max(0, (int) $validation['min_length']);
            }

            if (isset($validation['max_length']) && $validation['max_length'] !== null && $validation['max_length'] !== '') {
                $fieldRules[] = 'max:'.max(1, (int) $validation['max_length']);
            }

            $rules[$key] = $fieldRules;
        }

        return $rules;
    }

    private function attributeNames(array $fields): array
    {
        $attributes = [];

        foreach ($fields as $field) {
            $key = (string) ($field['key'] ?? '');
            $label = (string) ($field['label'] ?? $key);
            if ($key !== '') {
                $attributes[$key] = $label;
            }
        }

        return $attributes;
    }

    private function buildClientPayload(LeadForm $form, array $fields, array $mappingConfig, array $validated): array
    {
        $mapped = [
            'name' => null,
            'company' => null,
            'email' => null,
            'phone' => null,
        ];
        $leadMessageParts = [];
        $noteParts = [
            'Nguồn form: '.$form->name,
        ];
        $unmapped = [];

        foreach ($fields as $field) {
            $key = (string) ($field['key'] ?? '');
            if ($key === '' || ! array_key_exists($key, $validated)) {
                continue;
            }

            $rawValue = $validated[$key];
            if (is_array($rawValue)) {
                $value = implode(', ', array_filter($rawValue));
            } else {
                $value = trim((string) $rawValue);
            }

            if ($value === '') {
                continue;
            }

            $label = (string) ($field['label'] ?? $key);
            $mapTo = (string) ($field['map_to'] ?? 'ignore');

            switch ($mapTo) {
                case 'name':
                case 'company':
                case 'email':
                case 'phone':
                    if (empty($mapped[$mapTo])) {
                        $mapped[$mapTo] = $value;
                    }
                    break;

                case 'lead_message':
                    $leadMessageParts[] = $value;
                    break;

                case 'notes':
                    $noteParts[] = $label.': '.$value;
                    break;

                default:
                    $unmapped[] = $label.': '.$value;
                    break;
            }
        }

        if (! empty($mappingConfig['append_unmapped_to_notes']) && count($unmapped) > 0) {
            $noteParts[] = 'Thông tin bổ sung:';
            foreach ($unmapped as $row) {
                $noteParts[] = '- '.$row;
            }
        }

        $name = $mapped['name']
            ?: $mapped['company']
            ?: $mapped['email']
            ?: $mapped['phone']
            ?: 'Lead từ '.$form->name;

        return [
            'name' => $name,
            'company' => $mapped['company'],
            'email' => $mapped['email'],
            'phone' => $mapped['phone'],
            'lead_message' => count($leadMessageParts) > 0 ? implode("\n", $leadMessageParts) : null,
            'notes' => count($noteParts) > 0 ? implode("\n", $noteParts) : null,
        ];
    }
}
