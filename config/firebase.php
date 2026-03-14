<?php

return [
    'enabled' => env('FIREBASE_ENABLED', true),
    'project_id' => env('FIREBASE_PROJECT_ID'),
    'client_email' => env('FIREBASE_CLIENT_EMAIL'),
    'private_key' => env('FIREBASE_PRIVATE_KEY'),
    'database_url' => env('FIREBASE_DATABASE_URL'),
    'web' => [
        'apiKey' => env('FIREBASE_WEB_API_KEY'),
        'authDomain' => env('FIREBASE_WEB_AUTH_DOMAIN'),
        'projectId' => env('FIREBASE_PROJECT_ID'),
        'databaseURL' => env('FIREBASE_DATABASE_URL'),
        'storageBucket' => env('FIREBASE_WEB_STORAGE_BUCKET'),
        'messagingSenderId' => env('FIREBASE_WEB_SENDER_ID'),
        'appId' => env('FIREBASE_WEB_APP_ID'),
    ],
];
