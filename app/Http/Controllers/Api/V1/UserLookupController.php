<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserLookupController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = User::query()
            ->select(['id', 'name', 'email', 'role', 'department_id', 'avatar_url'])
            ->where('is_active', true);

        $purpose = (string) $request->input('purpose', '');

        if ($purpose === 'contract_collector') {
            if ($user && $user->role === 'nhan_vien') {
                $query->where('id', $user->id);
            } elseif ($user && $user->role === 'quan_ly') {
                $deptIds = $user->managedDepartments()->pluck('id');
                $query->where(function ($builder) use ($deptIds, $user) {
                    $builder->where('id', $user->id)
                        ->orWhere(function ($employeeBuilder) use ($deptIds) {
                            $employeeBuilder->where('role', 'nhan_vien')
                                ->whereIn('department_id', $deptIds);
                        });
                });
            } elseif ($user && in_array($user->role, ['admin', 'ke_toan'], true)) {
                $query->where('role', 'nhan_vien');
            } else {
                $query->whereRaw('1 = 0');
            }
        }

        if ($request->filled('role')) {
            $query->where('role', (string) $request->input('role'));
        }

        if ($user && $user->role === 'quan_ly') {
            $deptIds = $user->managedDepartments()->pluck('id');
            $query->where(function ($builder) use ($deptIds, $user) {
                $builder->whereIn('department_id', $deptIds)
                    ->orWhere('id', $user->id);
            });
        }

        if ($user && $user->role === 'nhan_vien') {
            $query->where('id', $user->id);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($builder) use ($search) {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $users = $query->orderBy('name')->get();

        return response()->json(['data' => $users]);
    }
}
