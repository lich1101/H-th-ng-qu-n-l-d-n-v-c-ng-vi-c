<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DepartmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Department::query()->with(['manager', 'staff']);
        if ($request->filled('search')) {
            $search = (string) $request->input('search');
            $query->where('name', 'like', "%{$search}%");
        }
        return response()->json($query->orderBy('name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'manager_id' => ['nullable', 'integer', 'exists:users,id'],
            'staff_ids' => ['nullable', 'array'],
            'staff_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $department = Department::create([
            'name' => $validated['name'],
            'manager_id' => $validated['manager_id'] ?? null,
        ]);

        if (! empty($validated['staff_ids'])) {
            User::whereIn('id', $validated['staff_ids'])->update([
                'department_id' => $department->id,
            ]);
        }

        return response()->json($department->load(['manager', 'staff']), 201);
    }

    public function update(Request $request, Department $department): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'manager_id' => ['nullable', 'integer', 'exists:users,id'],
            'staff_ids' => ['nullable', 'array'],
            'staff_ids.*' => ['integer', 'exists:users,id'],
            'remove_staff_ids' => ['nullable', 'array'],
            'remove_staff_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $department->update([
            'name' => $validated['name'] ?? $department->name,
            'manager_id' => $validated['manager_id'] ?? $department->manager_id,
        ]);

        if (! empty($validated['staff_ids'])) {
            User::whereIn('id', $validated['staff_ids'])->update([
                'department_id' => $department->id,
            ]);
        }

        if (! empty($validated['remove_staff_ids'])) {
            User::whereIn('id', $validated['remove_staff_ids'])->update([
                'department_id' => null,
            ]);
        }

        return response()->json($department->load(['manager', 'staff']));
    }

    public function destroy(Department $department): JsonResponse
    {
        User::where('department_id', $department->id)->update(['department_id' => null]);
        $department->delete();
        return response()->json(['message' => 'Đã xóa phòng ban.']);
    }
}
