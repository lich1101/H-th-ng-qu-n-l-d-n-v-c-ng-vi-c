@php
    $backgroundStyle = $style['background_style'] ?? 'soft';
    $surfaceStyle = $style['surface_style'] ?? 'soft';
    $logoMode = $style['logo_mode'] ?? 'brand';
    $customLogoUrl = $style['logo_url'] ?? null;
    $logoUrl = $logoMode === 'custom' && $customLogoUrl
        ? $customLogoUrl
        : ($logoMode === 'brand' ? $brandLogoUrl : null);
    $showLogo = $logoMode !== 'hidden' && !empty($logoUrl);

    $pageBackground = '#f8fafc';
    $heroGlow = 'rgba(15, 23, 42, 0.06)';

    if ($backgroundStyle === 'clean') {
        $pageBackground = '#ffffff';
        $heroGlow = 'rgba(15, 23, 42, 0.03)';
    } elseif ($backgroundStyle === 'spotlight') {
        $pageBackground = 'linear-gradient(180deg, rgba(4, 188, 92, 0.12) 0%, #f8fafc 42%, #ffffff 100%)';
        $heroGlow = 'rgba(4, 188, 92, 0.18)';
    }

    $radius = '18px';
    if ($surfaceStyle === 'rounded') {
        $radius = '24px';
    } elseif ($surfaceStyle === 'sharp') {
        $radius = '12px';
    }
@endphp
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" type="image/png" href="/brand/favicon-32x32.png">
    <link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">
    <title>{{ $form->name }} - {{ config('app.name', 'Job ClickOn') }}</title>
    <style>
        :root {
            color-scheme: light;
            --primary: {{ $primaryColor ?: '#04BC5C' }};
            --bg: {!! $pageBackground !!};
            --glow: {{ $heroGlow }};
            --text: #0f172a;
            --muted: #64748b;
            --card: rgba(255, 255, 255, 0.95);
            --border: #dbe4f0;
            --radius: {{ $radius }};
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: var(--bg);
            color: var(--text);
        }
        .shell {
            min-height: 100vh;
            position: relative;
            overflow: hidden;
        }
        .shell::before,
        .shell::after {
            content: "";
            position: absolute;
            border-radius: 999px;
            filter: blur(28px);
            pointer-events: none;
        }
        .shell::before {
            width: 240px;
            height: 240px;
            left: -60px;
            top: 36px;
            background: var(--glow);
        }
        .shell::after {
            width: 220px;
            height: 220px;
            right: -70px;
            bottom: 32px;
            background: rgba(59, 130, 246, 0.10);
        }
        .wrapper {
            max-width: 760px;
            margin: 0 auto;
            padding: 28px 18px 40px;
            position: relative;
            z-index: 1;
        }
        .card {
            background: var(--card);
            border: 1px solid rgba(219, 228, 240, 0.88);
            border-radius: var(--radius);
            padding: 22px;
            box-shadow: 0 24px 60px rgba(15, 23, 42, 0.10);
            backdrop-filter: blur(16px);
        }
        .brand {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 8px 12px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.92);
            border: 1px solid rgba(219, 228, 240, 0.88);
            margin-bottom: 16px;
            font-size: 13px;
            font-weight: 700;
            color: var(--text);
        }
        .brand img {
            width: 34px;
            height: 34px;
            object-fit: contain;
            border-radius: 10px;
            background: #fff;
        }
        h1 {
            font-size: 28px;
            line-height: 1.2;
            margin: 0 0 10px;
        }
        .intro {
            margin: 0 0 18px;
            color: var(--muted);
            font-size: 15px;
            line-height: 1.55;
        }
        .banner {
            border-radius: calc(var(--radius) - 4px);
            padding: 12px 14px;
            font-size: 14px;
            margin-bottom: 14px;
        }
        .banner--success {
            background: #ecfdf3;
            color: #166534;
            border: 1px solid rgba(34, 197, 94, 0.18);
        }
        .banner--error {
            background: #fef2f2;
            color: #b91c1c;
            border: 1px solid rgba(239, 68, 68, 0.18);
        }
        .form-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
        }
        .field {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .field--full {
            grid-column: 1 / -1;
        }
        label {
            font-size: 13px;
            font-weight: 600;
            color: var(--text);
        }
        label span {
            color: #ef4444;
        }
        input,
        textarea,
        select {
            width: 100%;
            border-radius: calc(var(--radius) - 6px);
            border: 1px solid var(--border);
            padding: 13px 14px;
            font-size: 14px;
            background: #fff;
            color: var(--text);
            outline: none;
            transition: border-color .18s ease, box-shadow .18s ease;
        }
        input:focus,
        textarea:focus,
        select:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 4px rgba(4, 188, 92, 0.10);
        }
        textarea {
            resize: vertical;
            min-height: 112px;
        }
        .help,
        .error {
            font-size: 12px;
            line-height: 1.45;
        }
        .help {
            color: var(--muted);
        }
        .error {
            color: #dc2626;
            font-weight: 600;
        }
        .actions {
            grid-column: 1 / -1;
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: 4px;
        }
        button {
            border: none;
            border-radius: calc(var(--radius) - 4px);
            background: var(--primary);
            color: #fff;
            padding: 14px 18px;
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
            box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
        }
        .footer-note {
            color: var(--muted);
            font-size: 12px;
            line-height: 1.6;
        }
        @media (max-width: 680px) {
            .wrapper {
                padding: 18px 12px 32px;
            }
            .card {
                padding: 18px;
            }
            h1 {
                font-size: 24px;
            }
            .form-grid {
                grid-template-columns: 1fr;
            }
            .field--half {
                grid-column: auto;
            }
        }
    </style>
</head>
<body>
    <div class="shell">
        <div class="wrapper">
            <div class="card">
                @if ($showLogo)
                    <div class="brand">
                        <img src="{{ $logoUrl }}" alt="{{ $brandName }}">
                        <span>{{ $brandName }}</span>
                    </div>
                @endif

                <h1>{{ $form->name }}</h1>
                <p class="intro">{{ $form->description ?: 'Điền nhanh thông tin bên dưới để đội ngũ tư vấn liên hệ lại đúng nhu cầu của bạn.' }}</p>

                @if (session('success'))
                    <div class="banner banner--success">{{ session('success') }}</div>
                @endif

                @if ($errors->any())
                    <div class="banner banner--error">Vui lòng kiểm tra lại các trường đang báo lỗi trước khi gửi.</div>
                @endif

                <form method="POST" action="{{ route('lead-forms.submit', $form->slug) }}" class="form-grid">
                    @csrf

                    @foreach ($fields as $field)
                        @php
                            $key = $field['key'];
                            $type = $field['type'] ?? 'text';
                            $width = $field['width'] === 'half' ? 'half' : 'full';
                            $required = !empty($field['required']);
                            $options = $field['options'] ?? [];
                        @endphp
                        <div class="field field--{{ $width }}">
                            <label for="{{ $key }}">
                                {{ $field['label'] }}
                                @if ($required)
                                    <span>*</span>
                                @endif
                            </label>

                            @if ($type === 'textarea')
                                <textarea
                                    id="{{ $key }}"
                                    name="{{ $key }}"
                                    placeholder="{{ $field['placeholder'] ?? '' }}"
                                    @if ($required) required @endif
                                >{{ old($key) }}</textarea>
                            @elseif ($type === 'select')
                                <select id="{{ $key }}" name="{{ $key }}" @if ($required) required @endif>
                                    <option value="">Chọn {{ mb_strtolower($field['label']) }}</option>
                                    @foreach ($options as $option)
                                        <option value="{{ $option }}" @selected(old($key) == $option)>{{ $option }}</option>
                                    @endforeach
                                </select>
                            @else
                                <input
                                    id="{{ $key }}"
                                    name="{{ $key }}"
                                    type="{{ $type === 'phone' ? 'tel' : ($type === 'email' ? 'email' : 'text') }}"
                                    value="{{ old($key) }}"
                                    placeholder="{{ $field['placeholder'] ?? '' }}"
                                    @if ($required) required @endif
                                />
                            @endif

                            @if (!empty($field['help_text']))
                                <div class="help">{{ $field['help_text'] }}</div>
                            @endif

                            @error($key)
                                <div class="error">{{ $message }}</div>
                            @enderror
                        </div>
                    @endforeach

                    <div class="actions">
                        <button type="submit">{{ $style['submit_label'] ?: 'Gửi thông tin' }}</button>
                        <div class="footer-note">
                            Dữ liệu từ form này sẽ được chuyển vào bảng khách hàng CRM để đội ngũ nội bộ tiếp nhận và xử lý.
                        </div>
                    </div>
                </form>
            </div>
        </div>
    </div>
</body>
</html>
