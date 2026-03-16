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
