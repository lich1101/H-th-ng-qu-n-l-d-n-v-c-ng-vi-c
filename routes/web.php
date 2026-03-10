<?php

use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| contains the "web" middleware group. Now create something great!
|
*/

Route::get('/', function () {
    if (Auth::check()) {
        return redirect()->route('dashboard');
    }

    return redirect()->route('login');
});

Route::get('/dashboard', function () {
    return Inertia::render('Dashboard');
})->middleware(['auth', 'verified'])->name('dashboard');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('/du-an', function () {
        return Inertia::render('ProjectsKanban');
    })->name('projects.kanban');

    Route::get('/cong-viec', function () {
        return Inertia::render('TasksBoard');
    })->name('tasks.board');

    Route::get('/deadline', function () {
        return Inertia::render('DeadlineReminders');
    })->name('deadlines.index');

    Route::get('/ban-giao', function () {
        return Inertia::render('HandoverCenter');
    })->name('handover.index');

    Route::get('/bao-cao-kpi', function () {
        return Inertia::render('ReportsKPI');
    })->name('reports.kpi');

    Route::get('/quy-trinh-dich-vu', function () {
        return Inertia::render('ServiceWorkflows');
    })->name('services.workflows');

    Route::get('/lich-hop', function () {
        return Inertia::render('Meetings');
    })->name('meetings.index');

    Route::get('/chat-noi-bo', function () {
        return Inertia::render('InternalChat');
    })->name('chat.internal');

    Route::get('/nhat-ky-he-thong', function () {
        return Inertia::render('ActivityLogs');
    })->name('activity.logs');

    Route::get('/crm-mini', function () {
        return Inertia::render('CRM');
    })->name('crm.index');

    Route::get('/phan-quyen', function () {
        return Inertia::render('RolesPermissions');
    })->name('roles.permissions');
});

require __DIR__.'/auth.php';
