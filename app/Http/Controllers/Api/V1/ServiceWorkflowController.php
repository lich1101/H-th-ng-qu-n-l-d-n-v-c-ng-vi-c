<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ServiceAuditItem;
use App\Models\ServiceBacklinkItem;
use App\Models\ServiceContentItem;
use App\Models\ServiceWebsiteCareItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ServiceWorkflowController extends Controller
{
    public function index(string $type, Request $request): JsonResponse
    {
        $model = $this->resolveModel($type);
        if (!$model) {
            return response()->json(['message' => 'Loai dich vu khong hop le.'], 422);
        }

        $query = $model::query();
        if ($request->filled('project_id')) {
            $query->where('project_id', (int) $request->input('project_id'));
        }

        return response()->json(
            $query->orderByDesc('id')->paginate((int) $request->input('per_page', 10))
        );
    }

    public function store(string $type, Request $request): JsonResponse
    {
        $model = $this->resolveModel($type);
        if (!$model) {
            return response()->json(['message' => 'Loai dich vu khong hop le.'], 422);
        }

        $validated = $request->validate($this->rules($type));
        $item = $model::create($validated);

        return response()->json($item, 201);
    }

    public function update(string $type, int $id, Request $request): JsonResponse
    {
        $model = $this->resolveModel($type);
        if (!$model) {
            return response()->json(['message' => 'Loai dich vu khong hop le.'], 422);
        }

        $validated = $request->validate($this->rules($type));
        $item = $model::findOrFail($id);
        $item->update($validated);

        return response()->json($item);
    }

    public function destroy(string $type, int $id): JsonResponse
    {
        $model = $this->resolveModel($type);
        if (!$model) {
            return response()->json(['message' => 'Loai dich vu khong hop le.'], 422);
        }

        $item = $model::findOrFail($id);
        $item->delete();

        return response()->json(['message' => 'Xoa ban ghi dich vu thanh cong.']);
    }

    private function resolveModel(string $type): ?string
    {
        return [
            'backlinks' => ServiceBacklinkItem::class,
            'content' => ServiceContentItem::class,
            'audit' => ServiceAuditItem::class,
            'website-care' => ServiceWebsiteCareItem::class,
        ][$type] ?? null;
    }

    private function rules(string $type): array
    {
        $base = [
            'project_id' => ['required', 'integer', 'exists:projects,id'],
            'task_id' => ['nullable', 'integer', 'exists:tasks,id'],
        ];

        if ($type === 'backlinks') {
            return $base + [
                'target_url' => ['required', 'url', 'max:500'],
                'domain' => ['required', 'string', 'max:255'],
                'anchor_text' => ['required', 'string', 'max:255'],
                'status' => ['required', 'string', 'max:30'],
                'report_date' => ['nullable', 'date'],
                'note' => ['nullable', 'string'],
            ];
        }

        if ($type === 'content') {
            return $base + [
                'main_keyword' => ['required', 'string', 'max:255'],
                'secondary_keywords' => ['nullable', 'string', 'max:500'],
                'outline_status' => ['required', 'string', 'max:30'],
                'required_words' => ['nullable', 'integer', 'min:0'],
                'actual_words' => ['nullable', 'integer', 'min:0'],
                'seo_score' => ['nullable', 'integer', 'min:0', 'max:100'],
                'duplicate_percent' => ['nullable', 'integer', 'min:0', 'max:100'],
                'approval_status' => ['required', 'string', 'max:30'],
            ];
        }

        if ($type === 'audit') {
            return $base + [
                'url' => ['required', 'url', 'max:500'],
                'issue_type' => ['nullable', 'string', 'max:120'],
                'issue_description' => ['nullable', 'string'],
                'suggestion' => ['nullable', 'string'],
                'priority' => ['required', 'string', 'max:20'],
                'status' => ['required', 'string', 'max:30'],
            ];
        }

        return $base + [
            'check_date' => ['nullable', 'date'],
            'technical_issue' => ['nullable', 'string', 'max:255'],
            'index_status' => ['nullable', 'string', 'max:30'],
            'traffic' => ['nullable', 'integer', 'min:0'],
            'ranking_delta' => ['nullable', 'integer', 'min:-100', 'max:100'],
            'monthly_report' => ['nullable', 'string'],
        ];
    }
}
