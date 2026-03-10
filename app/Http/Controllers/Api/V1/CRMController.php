<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\CustomerPayment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CRMController extends Controller
{
    public function clients(Request $request): JsonResponse
    {
        $query = Client::query();
        if ($request->filled('search')) {
            $search = (string) $request->input('search');
            $query->where(function ($builder) use ($search) {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('company', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }
        return response()->json($query->orderByDesc('id')->paginate((int) $request->input('per_page', 10)));
    }

    public function storeClient(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'notes' => ['nullable', 'string'],
            'sales_owner_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $client = Client::create($validated);

        return response()->json($client, 201);
    }

    public function updateClient(Request $request, Client $client): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'notes' => ['nullable', 'string'],
            'sales_owner_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);
        $client->update($validated);
        return response()->json($client);
    }

    public function destroyClient(Client $client): JsonResponse
    {
        $client->delete();
        return response()->json(['message' => 'Xóa khách hàng thành công.']);
    }

    public function payments(Request $request): JsonResponse
    {
        $query = CustomerPayment::query()->with('client');
        if ($request->filled('status')) {
            $query->where('status', (string) $request->input('status'));
        }
        return response()->json($query->orderByDesc('id')->paginate((int) $request->input('per_page', 10)));
    }

    public function storePayment(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'amount' => ['required', 'numeric', 'min:0'],
            'due_date' => ['nullable', 'date'],
            'paid_at' => ['nullable', 'date'],
            'status' => ['required', 'in:pending,paid,overdue'],
            'invoice_no' => ['nullable', 'string', 'max:60'],
            'note' => ['nullable', 'string'],
        ]);
        $payment = CustomerPayment::create($validated);
        return response()->json($payment, 201);
    }

    public function updatePayment(Request $request, CustomerPayment $payment): JsonResponse
    {
        $validated = $request->validate([
            'project_id' => ['nullable', 'integer', 'exists:projects,id'],
            'client_id' => ['required', 'integer', 'exists:clients,id'],
            'amount' => ['required', 'numeric', 'min:0'],
            'due_date' => ['nullable', 'date'],
            'paid_at' => ['nullable', 'date'],
            'status' => ['required', 'in:pending,paid,overdue'],
            'invoice_no' => ['nullable', 'string', 'max:60'],
            'note' => ['nullable', 'string'],
        ]);
        $payment->update($validated);
        return response()->json($payment);
    }

    public function destroyPayment(CustomerPayment $payment): JsonResponse
    {
        $payment->delete();
        return response()->json(['message' => 'Xóa thanh toán thành công.']);
    }
}
