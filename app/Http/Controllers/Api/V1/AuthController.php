<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\User;
use App\Models\UserDeviceToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:120'],
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            return response()->json([
                'message' => 'Invalid credentials.',
            ], 422);
        }

        if (! $user->is_active) {
            return response()->json([
                'message' => 'Account is disabled.',
            ], 403);
        }

        $deviceName = trim((string) ($validated['device_name'] ?? 'mobile-app'));
        if ($deviceName === '') {
            $deviceName = 'mobile-app';
        }

        $token = DB::transaction(function () use ($user, $deviceName) {
            // Mobile app is limited to one active device session per account.
            $user->tokens()->delete();

            return $user->createToken('mobile:'.$deviceName, ['mobile'])->plainTextToken;
        });

        return response()->json([
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => $user,
        ]);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
        ]);

        $email = Str::lower(trim((string) $validated['email']));
        $genericMessage = 'Nếu email hợp lệ, hệ thống đã gửi mật khẩu mới về hộp thư của bạn.';

        $user = User::query()
            ->whereRaw('LOWER(email) = ?', [$email])
            ->first();

        if (! $user || ! $user->is_active) {
            return response()->json([
                'message' => $genericMessage,
            ]);
        }

        $newPassword = $this->generateTemporaryPassword();

        try {
            $settings = $this->mailSettings();
            $this->applyMailConfiguration($settings);

            $brandName = (string) ($settings['brand_name'] ?: config('app.name', 'Jobs ClickOn'));
            $body = implode("\n\n", [
                'Xin chào ' . $user->name . ',',
                'Hệ thống ' . $brandName . ' đã tạo mật khẩu mới cho tài khoản của bạn.',
                'Email đăng nhập: ' . $user->email,
                'Mật khẩu mới: ' . $newPassword,
                'Vui lòng đăng nhập lại và đổi mật khẩu sau khi vào hệ thống.',
            ]);

            Mail::raw($body, function ($mail) use ($user, $brandName) {
                $mail->to($user->email, $user->name)
                    ->subject($brandName . ' - Mật khẩu đăng nhập mới');
            });

            DB::transaction(function () use ($user, $newPassword) {
                $user->forceFill([
                    'password' => Hash::make($newPassword),
                ])->save();

                $user->tokens()->delete();
            });

            return response()->json([
                'message' => 'Đã gửi mật khẩu mới về email của bạn.',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'Không thể gửi email mật khẩu mới. Kiểm tra lại cấu hình SMTP.',
            ], 500);
        }
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user('sanctum') ?? $request->user();
        if (! $user) {
            return response()->json([
                'message' => 'Unauthenticated.',
            ], 401);
        }

        if (! $user->is_active) {
            $token = $request->user()?->currentAccessToken();
            if ($token) {
                $token->delete();
            }

            return response()->json([
                'message' => 'Account is disabled.',
            ], 403);
        }

        try {
            return response()->json(
                $this->normalizeUtf8Payload($user->fresh()->toArray())
            );
        } catch (\Throwable $e) {
            report($e);

            return response()->json($this->normalizeUtf8Payload([
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'department' => $user->department,
                'department_id' => $user->department_id,
                'phone' => $user->phone,
                'avatar_url' => $user->avatar_url,
                'workload_capacity' => $user->workload_capacity,
                'is_active' => (bool) $user->is_active,
                'attendance_employment_type' => $user->attendance_employment_type,
                'created_at' => $user->created_at,
                'updated_at' => $user->updated_at,
            ]));
        }
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user) {
            UserDeviceToken::query()
                ->where('user_id', $user->id)
                ->delete();
        }

        $currentToken = $request->user()->currentAccessToken();
        if ($currentToken) {
            $currentToken->delete();
        }

        return response()->json([
            'message' => 'Logged out successfully.',
        ]);
    }

    private function generateTemporaryPassword(): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
        $password = '';

        for ($i = 0; $i < 10; $i++) {
            $password .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }

        return $password;
    }

    private function mailSettings(): array
    {
        $defaults = AppSetting::defaults();
        $setting = AppSetting::query()->first();

        return [
            'smtp_custom_enabled' => $setting ? (bool) ($setting->smtp_custom_enabled ?? false) : false,
            'smtp_mailer' => $setting && $setting->smtp_mailer ? (string) $setting->smtp_mailer : (string) $defaults['smtp_mailer'],
            'smtp_host' => $setting ? $setting->smtp_host : null,
            'smtp_port' => $setting && $setting->smtp_port ? (int) $setting->smtp_port : (int) $defaults['smtp_port'],
            'smtp_encryption' => $setting && $setting->smtp_encryption ? (string) $setting->smtp_encryption : (string) $defaults['smtp_encryption'],
            'smtp_username' => $setting ? $setting->smtp_username : null,
            'smtp_password' => $setting ? $setting->smtp_password : null,
            'smtp_from_address' => $setting ? $setting->smtp_from_address : null,
            'smtp_from_name' => $setting ? $setting->smtp_from_name : null,
            'brand_name' => $setting && $setting->brand_name ? (string) $setting->brand_name : (string) $defaults['brand_name'],
        ];
    }

    private function applyMailConfiguration(array $settings): void
    {
        if (! ($settings['smtp_custom_enabled'] ?? false)) {
            return;
        }

        config([
            'mail.default' => $settings['smtp_mailer'] ?: 'smtp',
            'mail.mailers.smtp.transport' => 'smtp',
            'mail.mailers.smtp.host' => $settings['smtp_host'] ?: config('mail.mailers.smtp.host'),
            'mail.mailers.smtp.port' => (int) ($settings['smtp_port'] ?: config('mail.mailers.smtp.port', 587)),
            'mail.mailers.smtp.encryption' => $settings['smtp_encryption'] ?: null,
            'mail.mailers.smtp.username' => $settings['smtp_username'] ?: null,
            'mail.mailers.smtp.password' => $settings['smtp_password'] ?: null,
            'mail.from.address' => $settings['smtp_from_address'] ?: config('mail.from.address'),
            'mail.from.name' => $settings['smtp_from_name']
                ?: ($settings['brand_name'] ?: config('mail.from.name')),
        ]);

        $app = app();
        if ($app->resolved('mail.manager')) {
            $app->forgetInstance('mail.manager');
        }
        if ($app->resolved('mailer')) {
            $app->forgetInstance('mailer');
        }
    }

    private function normalizeUtf8Payload(mixed $payload): mixed
    {
        if (is_array($payload)) {
            foreach ($payload as $key => $value) {
                $payload[$key] = $this->normalizeUtf8Payload($value);
            }

            return $payload;
        }

        if (is_string($payload)) {
            if (mb_check_encoding($payload, 'UTF-8')) {
                return $payload;
            }

            $converted = @iconv('UTF-8', 'UTF-8//IGNORE', $payload);

            return $converted === false ? '' : $converted;
        }

        return $payload;
    }
}
