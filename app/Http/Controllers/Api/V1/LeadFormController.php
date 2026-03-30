<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\Exceptions\HttpResponseException;
use App\Models\LeadForm;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class LeadFormController extends Controller
{
    private const FIELD_TYPES = ['text', 'textarea', 'email', 'phone', 'select'];
    private const FIELD_WIDTHS = ['full', 'half'];
    private const FIELD_MAPPINGS = ['ignore', 'name', 'company', 'email', 'phone', 'lead_message', 'notes'];
    private const LOGO_MODES = ['brand', 'custom', 'hidden'];
    private const BACKGROUND_STYLES = ['soft', 'clean', 'spotlight'];
    private const SURFACE_STYLES = ['soft', 'rounded', 'sharp'];

    public function index(Request $request): JsonResponse
    {
        $query = LeadForm::query()->with(['leadType', 'department', 'creator']);

        if ($request->filled('search')) {
            $search = (string) $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('slug', 'like', "%{$search}%");
            });
        }

        return response()->json(
            $query->orderByDesc('id')->paginate((int) $request->input('per_page', 20))
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validatePayload($request);
        $slug = $this->resolveUniqueSlug(
            (string) ($validated['slug'] ?? Str::slug($validated['name']))
        );

        $styleConfig = $this->normalizeStyleConfig(
            $validated['style_config'] ?? [],
            $request
        );

        $leadForm = LeadForm::create([
            'name' => $validated['name'],
            'slug' => $slug,
            'lead_type_id' => $validated['lead_type_id'] ?? null,
            'department_id' => $validated['department_id'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
            'redirect_url' => $validated['redirect_url'] ?? null,
            'description' => $validated['description'] ?? null,
            'created_by' => $request->user()->id,
            'public_key' => Str::random(32),
            'field_schema' => $this->normalizeFieldSchema($validated['field_schema'] ?? []),
            'style_config' => $styleConfig,
            'submission_mapping' => $this->normalizeSubmissionMapping($validated['submission_mapping'] ?? []),
        ]);

        return response()->json($leadForm->load(['leadType', 'department', 'creator']), 201);
    }

    public function update(Request $request, LeadForm $leadForm): JsonResponse
    {
        $validated = $this->validatePayload($request, $leadForm);

        $styleConfig = $this->normalizeStyleConfig(
            $validated['style_config'] ?? $leadForm->resolvedStyleConfig(),
            $request,
            $leadForm
        );

        $leadForm->update([
            'name' => $validated['name'],
            'slug' => $this->resolveUniqueSlug(
                (string) ($validated['slug'] ?? $leadForm->slug),
                $leadForm->id
            ),
            'lead_type_id' => $validated['lead_type_id'] ?? null,
            'department_id' => $validated['department_id'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
            'redirect_url' => $validated['redirect_url'] ?? null,
            'description' => $validated['description'] ?? null,
            'field_schema' => $this->normalizeFieldSchema($validated['field_schema'] ?? $leadForm->resolvedFieldSchema()),
            'style_config' => $styleConfig,
            'submission_mapping' => $this->normalizeSubmissionMapping($validated['submission_mapping'] ?? $leadForm->resolvedSubmissionMapping()),
        ]);

        return response()->json($leadForm->fresh()->load(['leadType', 'department', 'creator']));
    }

    public function destroy(LeadForm $leadForm): JsonResponse
    {
        $leadForm->delete();

        return response()->json(['message' => 'Đã xóa form.']);
    }

    private function validatePayload(Request $request, ?LeadForm $leadForm = null): array
    {
        $payload = $request->all();

        foreach (['field_schema', 'style_config', 'submission_mapping'] as $key) {
            if (! array_key_exists($key, $payload)) {
                continue;
            }

            $value = $payload[$key];
            if (is_string($value) && trim($value) !== '') {
                $decoded = json_decode($value, true);
                $payload[$key] = json_last_error() === JSON_ERROR_NONE ? $decoded : $value;
            }
        }

        $validator = Validator::make($payload, [
            'name' => ['required', 'string', 'max:120'],
            'slug' => [
                'nullable',
                'string',
                'max:120',
                'regex:/^[a-z0-9-]+$/',
                Rule::unique('lead_forms', 'slug')->ignore(optional($leadForm)->id),
            ],
            'lead_type_id' => ['nullable', 'integer', 'exists:lead_types,id'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'is_active' => ['nullable', 'boolean'],
            'redirect_url' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:1000'],
            'field_schema' => ['nullable', 'array', 'min:1'],
            'field_schema.*.label' => ['required', 'string', 'max:80'],
            'field_schema.*.type' => ['required', Rule::in(self::FIELD_TYPES)],
            'field_schema.*.placeholder' => ['nullable', 'string', 'max:160'],
            'field_schema.*.help_text' => ['nullable', 'string', 'max:200'],
            'field_schema.*.required' => ['nullable', 'boolean'],
            'field_schema.*.width' => ['nullable', Rule::in(self::FIELD_WIDTHS)],
            'field_schema.*.options' => ['nullable', 'array'],
            'field_schema.*.options.*' => ['nullable', 'string', 'max:80'],
            'field_schema.*.validation' => ['nullable', 'array'],
            'field_schema.*.validation.min_length' => ['nullable', 'integer', 'min:0', 'max:2000'],
            'field_schema.*.validation.max_length' => ['nullable', 'integer', 'min:1', 'max:5000'],
            'field_schema.*.map_to' => ['nullable', Rule::in(self::FIELD_MAPPINGS)],
            'style_config' => ['nullable', 'array'],
            'style_config.primary_color' => ['nullable', 'regex:/^#([0-9A-Fa-f]{6})$/'],
            'style_config.background_style' => ['nullable', Rule::in(self::BACKGROUND_STYLES)],
            'style_config.surface_style' => ['nullable', Rule::in(self::SURFACE_STYLES)],
            'style_config.submit_label' => ['nullable', 'string', 'max:60'],
            'style_config.success_message' => ['nullable', 'string', 'max:255'],
            'style_config.logo_mode' => ['nullable', Rule::in(self::LOGO_MODES)],
            'style_config.logo_url' => ['nullable', 'string', 'max:255'],
            'submission_mapping' => ['nullable', 'array'],
            'submission_mapping.target' => ['nullable', 'in:clients'],
            'submission_mapping.append_unmapped_to_notes' => ['nullable', 'boolean'],
            'submission_mapping.assigned_staff_id' => ['nullable', 'integer', 'exists:users,id'],
            'logo' => ['nullable', 'file', 'image', 'max:5120'],
        ]);

        $validated = $validator->validate();

        if ($error = $this->validateAssignedStaffId($validated['submission_mapping']['assigned_staff_id'] ?? null)) {
            throw new HttpResponseException(response()->json([
                'message' => $error,
                'errors' => [
                    'submission_mapping.assigned_staff_id' => [$error],
                ],
            ], 422));
        }

        if (empty($validated['field_schema'])) {
            $validated['field_schema'] = LeadForm::defaultFieldSchema();
        }

        return $validated;
    }

    private function resolveUniqueSlug(string $rawSlug, ?int $ignoreId = null): string
    {
        $slug = trim($rawSlug) !== '' ? $rawSlug : Str::slug($rawSlug);
        if ($slug === '') {
            $slug = Str::lower(Str::random(8));
        }

        $query = LeadForm::query()->where('slug', $slug);
        if ($ignoreId) {
            $query->where('id', '!=', $ignoreId);
        }

        if ($query->exists()) {
            return $this->resolveUniqueSlug($slug.'-'.Str::lower(Str::random(4)), $ignoreId);
        }

        return $slug;
    }

    private function normalizeFieldSchema(array $fields): array
    {
        $normalized = [];
        $usedKeys = [];

        foreach ($fields as $index => $field) {
            $label = trim((string) ($field['label'] ?? ''));
            if ($label === '') {
                continue;
            }

            $rawKey = (string) ($field['key'] ?? $label);
            $baseKey = LeadForm::makeFieldKey($rawKey, $index + 1);
            $key = $baseKey;
            $suffix = 2;

            while (in_array($key, $usedKeys, true)) {
                $key = Str::limit($baseKey, 34, '').'_'.$suffix;
                $suffix++;
            }

            $usedKeys[] = $key;

            $type = in_array(($field['type'] ?? 'text'), self::FIELD_TYPES, true)
                ? (string) $field['type']
                : 'text';

            $options = collect($field['options'] ?? [])
                ->map(function ($option) {
                    return trim((string) $option);
                })
                ->filter()
                ->values()
                ->all();

            $validation = is_array($field['validation'] ?? null) ? $field['validation'] : [];
            $minLength = isset($validation['min_length']) && $validation['min_length'] !== ''
                ? max(0, (int) $validation['min_length'])
                : null;
            $maxLength = isset($validation['max_length']) && $validation['max_length'] !== ''
                ? max(1, (int) $validation['max_length'])
                : null;

            $normalized[] = [
                'id' => (string) ($field['id'] ?? $key),
                'key' => $key,
                'label' => $label,
                'type' => $type,
                'placeholder' => trim((string) ($field['placeholder'] ?? '')),
                'help_text' => trim((string) ($field['help_text'] ?? '')),
                'required' => (bool) ($field['required'] ?? false),
                'width' => in_array(($field['width'] ?? 'full'), self::FIELD_WIDTHS, true)
                    ? (string) $field['width']
                    : 'full',
                'options' => $type === 'select' ? $options : [],
                'validation' => [
                    'min_length' => $minLength,
                    'max_length' => $maxLength,
                ],
                'map_to' => in_array(($field['map_to'] ?? 'ignore'), self::FIELD_MAPPINGS, true)
                    ? (string) $field['map_to']
                    : 'ignore',
            ];
        }

        return count($normalized) > 0 ? $normalized : LeadForm::defaultFieldSchema();
    }

    private function normalizeStyleConfig(array $style, Request $request, ?LeadForm $leadForm = null): array
    {
        $normalized = array_merge(LeadForm::defaultStyleConfig(), $style);
        $existingStyle = $leadForm ? $leadForm->resolvedStyleConfig() : LeadForm::defaultStyleConfig();

        $normalized['primary_color'] = $normalized['primary_color'] ?: null;
        $normalized['background_style'] = in_array($normalized['background_style'], self::BACKGROUND_STYLES, true)
            ? $normalized['background_style']
            : LeadForm::defaultStyleConfig()['background_style'];
        $normalized['surface_style'] = in_array($normalized['surface_style'], self::SURFACE_STYLES, true)
            ? $normalized['surface_style']
            : LeadForm::defaultStyleConfig()['surface_style'];
        $normalized['submit_label'] = trim((string) ($normalized['submit_label'] ?? '')) ?: LeadForm::defaultStyleConfig()['submit_label'];
        $normalized['success_message'] = trim((string) ($normalized['success_message'] ?? '')) ?: LeadForm::defaultStyleConfig()['success_message'];
        $normalized['logo_mode'] = in_array(($normalized['logo_mode'] ?? 'brand'), self::LOGO_MODES, true)
            ? (string) $normalized['logo_mode']
            : 'brand';
        $normalized['logo_url'] = trim((string) ($normalized['logo_url'] ?? $existingStyle['logo_url'] ?? '')) ?: null;

        if ($request->hasFile('logo')) {
            $stored = $request->file('logo')->store('lead-forms', 'public');
            $normalized['logo_url'] = Storage::url($stored);
            $normalized['logo_mode'] = 'custom';
        }

        if ($normalized['logo_mode'] !== 'custom') {
            $normalized['logo_url'] = $normalized['logo_mode'] === 'hidden' ? null : $normalized['logo_url'];
        }

        return $normalized;
    }

    private function normalizeSubmissionMapping(array $mapping): array
    {
        $normalized = array_merge(LeadForm::defaultSubmissionMapping(), $mapping);

        return [
            'target' => 'clients',
            'append_unmapped_to_notes' => (bool) ($normalized['append_unmapped_to_notes'] ?? true),
            'assigned_staff_id' => ! empty($normalized['assigned_staff_id'])
                ? (int) $normalized['assigned_staff_id']
                : null,
        ];
    }

    private function validateAssignedStaffId($assignedStaffId): ?string
    {
        $assignedStaffId = (int) ($assignedStaffId ?? 0);
        if ($assignedStaffId <= 0) {
            return null;
        }

        $staff = User::query()
            ->select(['id', 'role', 'is_active'])
            ->find($assignedStaffId);

        if (! $staff || ! $staff->is_active) {
            return 'Nhân sự phụ trách form không tồn tại hoặc đã ngưng hoạt động.';
        }

        if (! in_array((string) $staff->role, ['quan_ly', 'nhan_vien'], true)) {
            return 'Nhân sự phụ trách form chỉ được là quản lý hoặc nhân viên.';
        }

        return null;
    }
}
