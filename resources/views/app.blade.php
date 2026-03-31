<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="icon" type="image/png" href="/brand/favicon-32x32.png">
        <link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">
        <link rel="shortcut icon" href="/brand/icon.png" type="image/x-icon">
        <title inertia>{{ config('app.name', 'Jobs ClickOn') }}</title>
        @php
            $assetVersion = max(
                @filemtime(public_path('js/app.js')) ?: 0,
                @filemtime(public_path('css/app.css')) ?: 0
            );
        @endphp

        <!-- Fonts -->
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap">

        <!-- Scripts -->
        @routes
        <link rel="stylesheet" href="{{ mix('/css/app.css') }}?v={{ $assetVersion }}">
        <script>
            window.__FIREBASE__ = @json(config('firebase.web'));
        </script>
        <script src="{{ mix('/js/app.js') }}?v={{ $assetVersion }}" defer></script>
        @inertiaHead
    </head>
    <body class="font-sans antialiased">
        @inertia
    </body>
</html>
