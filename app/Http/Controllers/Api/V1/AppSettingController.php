<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class AppSettingController extends Controller
{
    public function show(): JsonResponse
    {
        $setting = AppSetting::query()->first();
        if (! $setting) {
            return response()->json(AppSetting::defaults());
        }

        return response()->json([
            'brand_name' => $setting->brand_name ?: config('app.name', 'job clickon'),
            'primary_color' => $setting->primary_color ?: '#04BC5C',
            'logo_url' => $setting->logo_url ?: AppSetting::defaults()['logo_url'],
            'support_email' => $setting->support_email,
            'support_phone' => $setting->support_phone,
            'support_address' => $setting->support_address,
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        if (! $request->user() || $request->user()->role !== 'admin') {
            return response()->json(['message' => 'Không có quyền cập nhật cài đặt.'], 403);
        }

        $validated = $request->validate([
            'brand_name' => ['nullable', 'string', 'max:120'],
            'primary_color' => ['nullable', 'regex:/^#([0-9A-Fa-f]{6})$/'],
            'logo_url' => ['nullable', 'string', 'max:255'],
            'support_email' => ['nullable', 'email', 'max:120'],
            'support_phone' => ['nullable', 'string', 'max:40'],
            'support_address' => ['nullable', 'string', 'max:255'],
            'logo' => ['nullable', 'file', 'max:5120'],
        ]);

        $setting = AppSetting::query()->first();
        if (! $setting) {
            $setting = AppSetting::create(AppSetting::defaults());
        }

        $logoUrl = $validated['logo_url'] ?? $setting->logo_url ?? AppSetting::defaults()['logo_url'];
        if ($request->hasFile('logo')) {
            $stored = $request->file('logo')->store('brand', 'public');
            $logoUrl = Storage::url($stored);
        }

        $setting->update([
            'brand_name' => $validated['brand_name'] ?? $setting->brand_name,
            'primary_color' => $validated['primary_color'] ?? $setting->primary_color,
            'logo_url' => $logoUrl,
            'support_email' => $validated['support_email'] ?? $setting->support_email,
            'support_phone' => $validated['support_phone'] ?? $setting->support_phone,
            'support_address' => $validated['support_address'] ?? $setting->support_address,
            'updated_by' => $request->user()->id,
        ]);

        return response()->json([
            'brand_name' => $setting->brand_name ?: config('app.name', 'job clickon'),
            'primary_color' => $setting->primary_color,
            'logo_url' => $setting->logo_url ?: AppSetting::defaults()['logo_url'],
            'support_email' => $setting->support_email,
            'support_phone' => $setting->support_phone,
            'support_address' => $setting->support_address,
        ]);
    }
}
