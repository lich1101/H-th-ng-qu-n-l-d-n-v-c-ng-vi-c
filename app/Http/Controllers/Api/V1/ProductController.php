<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Product::query();
        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%");
            });
        }
        if ($request->filled('is_active')) {
            $query->where('is_active', (bool) $request->input('is_active'));
        }
        return response()->json(
            $query->orderBy('name')->paginate((int) $request->input('per_page', 20))
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['nullable', 'string', 'max:40', 'unique:products,code'],
            'name' => ['required', 'string', 'max:255'],
            'unit' => ['nullable', 'string', 'max:20'],
            'unit_price' => ['nullable', 'numeric', 'min:0'],
            'description' => ['nullable', 'string'],
            'is_active' => ['nullable', 'boolean'],
        ]);
        if (empty($validated['code'])) {
            $validated['code'] = $this->generateCode();
        }
        $validated['is_active'] = $validated['is_active'] ?? true;

        $product = Product::create($validated);
        return response()->json($product, 201);
    }

    public function show(Product $product): JsonResponse
    {
        return response()->json($product);
    }

    public function update(Request $request, Product $product): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['sometimes', 'string', 'max:40', 'unique:products,code,' . $product->id],
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'unit' => ['nullable', 'string', 'max:20'],
            'unit_price' => ['nullable', 'numeric', 'min:0'],
            'description' => ['nullable', 'string'],
            'is_active' => ['nullable', 'boolean'],
        ]);
        $product->update($validated);
        return response()->json($product);
    }

    public function destroy(Product $product): JsonResponse
    {
        $product->delete();
        return response()->json(['message' => 'Đã xóa sản phẩm.']);
    }

    private function generateCode(): string
    {
        $prefix = 'SP-' . now()->format('Ymd');
        for ($i = 1; $i <= 9999; $i++) {
            $code = $prefix . '-' . str_pad((string) $i, 4, '0', STR_PAD_LEFT);
            if (! Product::where('code', $code)->exists()) {
                return $code;
            }
        }
        return $prefix . '-' . strtoupper(Str::random(4));
    }
}
