<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Department;
use App\Models\DepartmentAssignment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DepartmentAssignmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = DepartmentAssignment::query()->with(['client', 'contract', 'department', 'manager', 'assigner']);

        if ($user->role === 'quan_ly') {
            $deptIds = $user->managedDepartments()->pluck('id');
            $query->whereIn('department_id', $deptIds);
        } elseif ($user->role === 'nhan_vien') {
            if ($user->department_id) {
                $query->where('department_id', $user->department_id);
            } else {
                $query->whereRaw('1 = 0');
            }
        }

        if ($request->filled('department_id')) {
            $query->where('department_id', (int) $request->input('department_id'));
        }
        if ($request->filled('status')) {
            $query->where('status', (string) $request->input('status'));
        }
        if ($request->filled('client_id')) {
            $query->where('client_id', (int) $request->input('client_id'));
        }

        return response()->json($query->orderByDesc('id')->paginate((int) $request->input('per_page', 20)));
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'contract_id' => ['nullable', 'integer', 'exists:contracts,id'],
            'department_id' => ['required', 'integer', 'exists:departments,id'],
            'requirements' => ['nullable', 'string'],
            'deadline' => ['nullable', 'date'],
            'allocated_value' => ['nullable', 'numeric', 'min:0'],
        ]);

        $department = Department::find($validated['department_id']);
        $assignment = DepartmentAssignment::create([
            'client_id' => $validated['client_id'],
            'contract_id' => $validated['contract_id'] ?? null,
            'department_id' => $validated['department_id'],
            'assigned_by' => $request->user()->id,
            'manager_id' => $department ? $department->manager_id : null,
            'requirements' => $validated['requirements'] ?? null,
            'deadline' => $validated['deadline'] ?? null,
            'allocated_value' => $validated['allocated_value'] ?? null,
            'status' => 'new',
        ]);

        $assignment->client()->update([
            'assigned_department_id' => $assignment->department_id,
        ]);

        ActivityLog::create([
            'user_id' => $request->user()->id,
            'action' => 'department_assignment_created',
            'subject_type' => 'department_assignment',
            'subject_id' => $assignment->id,
            'changes' => [
                'department_id' => $assignment->department_id,
                'manager_id' => $assignment->manager_id,
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'created_at' => now(),
        ]);

        return response()->json($assignment->load(['client', 'contract', 'department', 'manager', 'assigner']), 201);
    }

    public function update(Request $request, DepartmentAssignment $assignment): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'requirements' => ['nullable', 'string'],
            'deadline' => ['nullable', 'date'],
            'allocated_value' => ['nullable', 'numeric', 'min:0'],
            'status' => ['nullable', 'string', 'in:new,in_progress,done'],
            'progress_percent' => ['nullable', 'integer', 'min:0', 'max:100'],
            'progress_note' => ['nullable', 'string'],
        ]);

        if ($user->role !== 'admin') {
            $validated = array_intersect_key($validated, array_flip([
                'status',
                'progress_percent',
                'progress_note',
            ]));
        }

        if ($user->role === 'admin' && isset($validated['department_id'])) {
            $department = Department::find($validated['department_id']);
            $validated['manager_id'] = $department ? $department->manager_id : null;
        }

        if (isset($validated['status'])) {
            if ($validated['status'] === 'in_progress' && ! $assignment->accepted_at) {
                $validated['accepted_at'] = now();
            }
            if ($validated['status'] === 'done') {
                $validated['completed_at'] = now();
            }
        }

        $assignment->update($validated);

        if (isset($validated['department_id'])) {
            $assignment->client()->update([
                'assigned_department_id' => $assignment->department_id,
            ]);
        }

        return response()->json($assignment->load(['client', 'contract', 'department', 'manager', 'assigner']));
    }

    public function destroy(DepartmentAssignment $assignment): JsonResponse
    {
        $assignment->delete();
        return response()->json(['message' => 'Đã xóa điều phối phòng ban.']);
    }
}
