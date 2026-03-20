<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Inertia\Inertia;

class PasswordResetLinkController extends Controller
{
    /**
     * Display the password reset link request view.
     *
     * @return \Inertia\Response
     */
    public function create()
    {
        return Inertia::render('Auth/ForgotPassword', [
            'status' => session('status'),
        ]);
    }

    /**
     * Handle an incoming password reset link request.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\RedirectResponse
     *
     * @throws \Illuminate\Validation\ValidationException
     */
    public function store(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $email = Str::lower(trim((string) $request->input('email')));
        $genericMessage = 'Nếu email hợp lệ, hệ thống đã gửi mật khẩu mới về hộp thư của bạn.';

        $user = User::query()
            ->whereRaw('LOWER(email) = ?', [$email])
            ->first();

        if (! $user || ! $user->is_active) {
            return back()->with('status', $genericMessage);
        }

        $newPassword = $this->generateTemporaryPassword();

        try {
            $settings = $this->mailSettings();
            $this->applyMailConfiguration($settings);

            $brandName = (string) ($settings['brand_name'] ?: config('app.name', 'Jobs ClickOn'));
            $body = implode("\n\n", [
                'Xin chào '.$user->name.',',
                'Hệ thống '.$brandName.' đã tạo mật khẩu mới cho tài khoản của bạn.',
                'Email đăng nhập: '.$user->email,
                'Mật khẩu mới: '.$newPassword,
                'Vui lòng đăng nhập lại và đổi mật khẩu sau khi vào hệ thống.',
            ]);

            Mail::raw($body, function ($mail) use ($user, $brandName) {
                $mail->to($user->email, $user->name)
                    ->subject($brandName.' - Mật khẩu đăng nhập mới');
            });

            DB::transaction(function () use ($user, $newPassword) {
                $user->forceFill([
                    'password' => Hash::make($newPassword),
                ])->save();

                $user->tokens()->delete();
            });

            return back()->with('status', 'Đã gửi mật khẩu mới về email của bạn.');
        } catch (\Throwable $e) {
            report($e);

            return back()->withErrors([
                'email' => 'Không thể gửi email mật khẩu mới. Kiểm tra lại cấu hình SMTP.',
            ]);
        }
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
}
