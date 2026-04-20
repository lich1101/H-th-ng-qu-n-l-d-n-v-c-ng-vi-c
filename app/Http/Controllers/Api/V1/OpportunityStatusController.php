<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\OpportunityStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class OpportunityStatusController extends Controller
{
    public function index(): JsonResponse
    {
        $items = OpportunityStatus::query()
            ->withCount('opportunities')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json($items);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'color_hex' => ['nullable', 'regex:/^#[A-Fa-f0-9]{6}$/'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $status = OpportunityStatus::query()->create([
            'code' => $this->generateUniqueCode((string) $validated['name']),
            'name' => trim((string) $validated['name']),
            'color_hex' => (string) ($validated['color_hex'] ?? '#6B7280'),
            'sort_order' => (int) ($validated['sort_order'] ?? 0),
        ]);

        return response()->json($status, 201);
    }

    public function update(Request $request, OpportunityStatus $opportunityStatus): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:80'],
            'color_hex' => ['nullable', 'regex:/^#[A-Fa-f0-9]{6}$/'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $opportunityStatus->update($validated);

        return response()->json($opportunityStatus);
    }

    public function destroy(OpportunityStatus $opportunityStatus): JsonResponse
    {
        if ($opportunityStatus->opportunities()->exists()) {
            return response()->json([
                'message' => 'Trạng thái đang được dùng trong cơ hội, không thể xóa.',
            ], 422);
        }

        if (OpportunityStatus::query()->count() <= 1) {
            return response()->json([
                'message' => 'Hệ thống cần tối thiểu 1 trạng thái cơ hội.',
            ], 422);
        }

        $opportunityStatus->delete();

        return response()->json(['message' => 'Đã xóa trạng thái cơ hội.']);
    }

    private function generateUniqueCode(string $name): string
    {
        $base = Str::slug(trim($name), '_');
        if ($base === '') {
            $base = 'status';
        }
        $base = Str::limit($base, 24, '');

        $candidate = $base;
        $index = 1;
        while (OpportunityStatus::query()->where('code', $candidate)->exists()) {
            $candidate = Str::limit($base, 24, '').'_'.$index;
            $candidate = Str::limit($candidate, 32, '');
            $index++;
        }

        return $candidate;
    }
}
