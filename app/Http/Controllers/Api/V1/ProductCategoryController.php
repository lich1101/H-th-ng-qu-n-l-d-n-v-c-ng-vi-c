<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ProductCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ProductCategoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ProductCategory::query();
        if ($request->filled('search')) {
            $search = (string) $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%");
            });
        }
        if ($request->filled('is_active')) {
            $query->where('is_active', (bool) $request->input('is_active'));
        }

        return response()->json(
            $query->orderBy('name')->paginate((int) $request->input('per_page', 50))
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['nullable', 'string', 'max:40', 'unique:product_categories,code'],
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'is_active' => ['nullable', 'boolean'],
        ]);
        if (empty($validated['code'])) {
            $validated['code'] = $this->generateCode();
        }
        $validated['is_active'] = $validated['is_active'] ?? true;

        $category = ProductCategory::create($validated);

        return response()->json($category, 201);
    }

    public function update(Request $request, ProductCategory $productCategory): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['sometimes', 'string', 'max:40', 'unique:product_categories,code,' . $productCategory->id],
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'is_active' => ['nullable', 'boolean'],
        ]);
        $productCategory->update($validated);

        return response()->json($productCategory);
    }

    public function destroy(ProductCategory $productCategory): JsonResponse
    {
        $productCategory->delete();

        return response()->json(['message' => 'Đã xóa danh mục sản phẩm.']);
    }

    private function generateCode(): string
    {
        $prefix = 'DM-' . now()->format('Ymd');
        for ($i = 1; $i <= 9999; $i++) {
            $code = $prefix . '-' . str_pad((string) $i, 4, '0', STR_PAD_LEFT);
            if (! ProductCategory::where('code', $code)->exists()) {
                return $code;
            }
        }
        return $prefix . '-' . strtoupper(Str::random(4));
    }
}
