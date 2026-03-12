<?php

namespace App\Http\Controllers;

use App\Models\Client;
use App\Models\LeadForm;
use App\Models\LeadType;
use Illuminate\Http\Request;

class LeadFormPublicController extends Controller
{
    public function show(string $slug)
    {
        $form = LeadForm::query()
            ->where('slug', $slug)
            ->where('is_active', true)
            ->firstOrFail();

        return view('lead-form', ['form' => $form]);
    }

    public function submit(string $slug, Request $request)
    {
        $form = LeadForm::query()
            ->where('slug', $slug)
            ->where('is_active', true)
            ->firstOrFail();

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'message' => ['nullable', 'string'],
        ]);

        $leadTypeId = $form->lead_type_id;
        if (! $leadTypeId) {
            $leadTypeId = LeadType::query()
                ->where('name', 'Khách hàng tiềm năng')
                ->value('id');
            if (! $leadTypeId) {
                $leadTypeId = LeadType::query()->orderBy('sort_order')->orderBy('id')->value('id');
            }
        }

        Client::create([
            'name' => $validated['name'],
            'company' => $validated['company'] ?? null,
            'email' => $validated['email'] ?? null,
            'phone' => $validated['phone'] ?? null,
            'lead_type_id' => $leadTypeId,
            'lead_source' => 'lead_form',
            'lead_channel' => 'iframe',
            'lead_message' => $validated['message'] ?? null,
            'notes' => $validated['message'] ?? null,
            'assigned_department_id' => $form->department_id,
        ]);

        if ($form->redirect_url) {
            return redirect($form->redirect_url);
        }

        return redirect()->back()->with('success', 'Cảm ơn bạn đã gửi thông tin!');
    }
}
