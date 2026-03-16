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
            --primary: {{ $primaryColor ?? '#04BC5C' }};
            --bg: #f8fafc;
            --text: #0f172a;
            --muted: #64748b;
            --card: #ffffff;
            --border: #e2e8f0;
        }
        body {
            margin: 0;
            font-family: "Inter", system-ui, sans-serif;
            background: var(--bg);
            color: var(--text);
        }
        .wrapper {
            padding: 20px;
        }
        .card {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 20px;
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
        }
        h1 {
            font-size: 20px;
            margin: 0 0 6px;
        }
        p {
            margin: 0 0 16px;
            color: var(--muted);
            font-size: 14px;
        }
        label {
            font-size: 13px;
            color: var(--muted);
            display: block;
            margin-bottom: 6px;
        }
        input, textarea {
            width: 100%;
            padding: 10px 12px;
            border-radius: 12px;
            border: 1px solid var(--border);
            font-size: 14px;
            margin-bottom: 12px;
            outline: none;
        }
        textarea {
            resize: vertical;
            min-height: 90px;
        }
        button {
            background: var(--primary);
            color: #fff;
            border: none;
            border-radius: 12px;
            padding: 12px 14px;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
        }
        .success {
            background: #ecfdf3;
            color: #166534;
            padding: 8px 12px;
            border-radius: 10px;
            font-size: 13px;
            margin-bottom: 12px;
        }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="card">
            <h1>{{ $form->name }}</h1>
            <p>{{ $form->description ?: 'Gửi thông tin để đội ngũ tư vấn liên hệ nhanh nhất.' }}</p>

            @if (session('success'))
                <div class="success">{{ session('success') }}</div>
            @endif

            <form method="POST" action="{{ route('lead-forms.submit', $form->slug) }}">
                @csrf
                <label>Họ và tên *</label>
                <input name="name" required placeholder="Nhập họ tên" />

                <label>Công ty</label>
                <input name="company" placeholder="Tên công ty" />

                <label>Email</label>
                <input name="email" type="email" placeholder="Email liên hệ" />

                <label>Số điện thoại</label>
                <input name="phone" placeholder="Số điện thoại" />

                <label>Nội dung</label>
                <textarea name="message" placeholder="Nhu cầu của bạn..."></textarea>

                <button type="submit">Gửi thông tin</button>
            </form>
        </div>
    </div>
</body>
</html>
