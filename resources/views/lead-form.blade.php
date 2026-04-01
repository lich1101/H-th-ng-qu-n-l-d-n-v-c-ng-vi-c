@php
    $backgroundStyle = $style['background_style'] ?? 'soft';
    $surfaceStyle = $style['surface_style'] ?? 'soft';
    $logoMode = $style['logo_mode'] ?? 'brand';
    $customLogoUrl = $style['logo_url'] ?? null;
    $logoUrl = $logoMode === 'custom' && $customLogoUrl
        ? $customLogoUrl
        : ($logoMode === 'brand' ? $brandLogoUrl : null);
    $showLogo = $logoMode !== 'hidden' && !empty($logoUrl);
    $showCardBorder = !empty($style['show_card_border']);
    $showTitle = $style['show_title'] ?? true;
    $showDescription = ($style['show_description'] ?? true) && !empty($form->description);
    $showFooterNote = $style['show_footer_note'] ?? true;
    $showBackgroundEffects = $style['show_background_effects'] ?? true;
    $customCss = trim($style['custom_css'] ?? '');
    $customJs = trim($style['custom_js'] ?? '');

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
    <title>{{ $form->name }} - {{ config('app.name', 'Jobs ClickOn') }}</title>
    <style>
        html{ 
            height: 100%;
        }
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
            height: 100%;
            margin: 0;
            font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: var(--bg);
            color: var(--text);
        }
        .shell {
            height: 100%;
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
            @if (!$showBackgroundEffects)
            display: none;
            @endif
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
            height: 100%;
            background: var(--card);
            @if ($showCardBorder)
            border: 1px solid rgba(219, 228, 240, 0.88);
            box-shadow: 0 24px 60px rgba(15, 23, 42, 0.10);
            @else
            border: none;
            box-shadow: none;
            @endif
            border-radius: var(--radius);
            padding: 22px;
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
        .btn-loading {
            opacity: 0.7;
            pointer-events: none;
        }
        .success-state {
            text-align: center;
            padding: 40px 20px;
        }
        .success-state .icon {
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--primary), #34d399);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 18px;
            animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .success-state .icon svg {
            width: 32px;
            height: 32px;
            color: #fff;
        }
        .success-state .icon--custom {
            background: none;
            width: auto;
            height: auto;
        }
        .success-state .icon--custom img {
            width: 72px;
            height: 72px;
            object-fit: contain;
            border-radius: 16px;
        }
        .success-state h2 {
            font-size: 22px;
            margin: 0 0 10px;
            color: var(--text);
        }
        .success-state p {
            color: var(--muted);
            font-size: 15px;
            line-height: 1.6;
            margin: 0;
        }
        @keyframes popIn {
            0% { transform: scale(0); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
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
                <div id="form-content">
                    @if ($showLogo)
                        <div class="brand">
                            <img src="{{ $logoUrl }}" alt="{{ $brandName }}">
                            <span>{{ $brandName }}</span>
                        </div>
                    @endif

                    @if ($showTitle)
                    <h1>{{ $form->name }}</h1>
                    @endif
                    @if ($showDescription)
                    <p class="intro">{{ $form->description }}</p>
                    @endif

                    <div id="banner-area"></div>

                    <form id="lead-form" class="form-grid">
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
                                    ></textarea>
                                @elseif ($type === 'select')
                                    <select id="{{ $key }}" name="{{ $key }}" @if ($required) required @endif>
                                        <option value="">Chọn {{ mb_strtolower($field['label']) }}</option>
                                        @foreach ($options as $option)
                                            <option value="{{ $option }}">{{ $option }}</option>
                                        @endforeach
                                    </select>
                                @else
                                    <input
                                        id="{{ $key }}"
                                        name="{{ $key }}"
                                        type="{{ $type === 'phone' ? 'tel' : ($type === 'email' ? 'email' : 'text') }}"
                                        placeholder="{{ $field['placeholder'] ?? '' }}"
                                        @if ($required) required @endif
                                    />
                                @endif

                                @if (!empty($field['help_text']))
                                    <div class="help">{{ $field['help_text'] }}</div>
                                @endif

                                <div class="error" id="error-{{ $key }}" style="display:none;"></div>
                            </div>
                        @endforeach

                        <div class="actions">
                            <button type="submit" id="submit-btn">{{ $style['submit_label'] ?: 'Gửi thông tin' }}</button>
                            @if ($showFooterNote)
                            <div class="footer-note">
                                Dữ liệu từ form này sẽ được chuyển vào bảng khách hàng CRM để đội ngũ nội bộ tiếp nhận và xử lý.
                            </div>
                            @endif
                        </div>
                    </form>
                </div>

                <div id="success-state" class="success-state" style="display:none;">
                    @if (!empty($style['success_icon_url']))
                    <div class="icon icon--custom">
                        <img src="{{ $style['success_icon_url'] }}" alt="Success">
                    </div>
                    @else
                    <div class="icon">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                    </div>
                    @endif
                    <h2 id="success-title">{{ $style['success_title'] ?? 'Gửi thành công!' }}</h2>
                    <p id="success-message"></p>
                </div>
            </div>
        </div>
    </div>
    @if ($customCss)
    <style>{!! $customCss !!}</style>
    @endif
    <script>
    (function() {
        var form = document.getElementById('lead-form');
        var submitBtn = document.getElementById('submit-btn');
        var bannerArea = document.getElementById('banner-area');
        var formContent = document.getElementById('form-content');
        var successState = document.getElementById('success-state');
        var successMessage = document.getElementById('success-message');
        var submitUrl = @json(route('lead-forms.submit', $form->slug));
        var btnLabel = submitBtn.textContent;

        function clearErrors() {
            var errors = form.querySelectorAll('.error');
            for (var i = 0; i < errors.length; i++) {
                errors[i].style.display = 'none';
                errors[i].textContent = '';
            }
            bannerArea.innerHTML = '';
        }

        function showFieldErrors(errors) {
            for (var key in errors) {
                if (!errors.hasOwnProperty(key)) continue;
                var el = document.getElementById('error-' + key);
                if (el) {
                    el.textContent = errors[key][0];
                    el.style.display = 'block';
                }
            }
            bannerArea.innerHTML = '<div class="banner banner--error">Vui lòng kiểm tra lại các trường đang báo lỗi trước khi gửi.</div>';
        }

        function showSuccess(message) {
            successMessage.textContent = message;
            formContent.style.display = 'none';
            successState.style.display = 'block';
        }

        form.addEventListener('submit', function(e) {
            e.preventDefault();
            clearErrors();
            submitBtn.classList.add('btn-loading');
            submitBtn.textContent = @json($style['loading_text'] ?? 'Đang gửi...');

            var formData = new FormData(form);

            fetch(submitUrl, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: formData
            })
            .then(function(response) {
                return response.json().then(function(data) {
                    return { ok: response.ok, status: response.status, data: data };
                });
            })
            .then(function(result) {
                submitBtn.classList.remove('btn-loading');
                submitBtn.textContent = btnLabel;

                if (!result.ok) {
                    if (result.status === 422 && result.data.errors) {
                        showFieldErrors(result.data.errors);
                    } else {
                        bannerArea.innerHTML = '<div class="banner banner--error">' + (result.data.message || 'Đã có lỗi xảy ra. Vui lòng thử lại.') + '</div>';
                    }
                    return;
                }

                if (result.data.redirect_url) {
                    window.location.href = result.data.redirect_url;
                } else {
                    showSuccess(result.data.success_message || @json($style['success_message'] ?? 'Cảm ơn bạn đã gửi thông tin!'));
                }
            })
            .catch(function() {
                submitBtn.classList.remove('btn-loading');
                submitBtn.textContent = btnLabel;
                bannerArea.innerHTML = '<div class="banner banner--error">Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.</div>';
            });
        });
    })();
    </script>
    @if ($customJs)
    <script>{!! $customJs !!}</script>
    @endif
</body>
</html>
