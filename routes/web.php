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
    })->name('projects.kanban')->middleware('role:admin,nhan_su_kinh_doanh,truong_phong_san_xuat');

    Route::get('/cong-viec', function () {
        return Inertia::render('TasksBoard');
    })->name('tasks.board')->middleware('role:admin,truong_phong_san_xuat,nhan_su_san_xuat');

    Route::get('/deadline', function () {
        return Inertia::render('DeadlineReminders');
    })->name('deadlines.index')->middleware('role:admin,truong_phong_san_xuat,nhan_su_san_xuat,nhan_su_kinh_doanh');

    Route::get('/ban-giao', function () {
        return Inertia::render('HandoverCenter');
    })->name('handover.index')->middleware('role:admin,truong_phong_san_xuat,nhan_su_san_xuat,nhan_su_kinh_doanh');

    Route::get('/bao-cao-kpi', function () {
        return Inertia::render('ReportsKPI');
    })->name('reports.kpi')->middleware('role:admin,truong_phong_san_xuat');

    Route::get('/quy-trinh-dich-vu', function () {
        return Inertia::render('ServiceWorkflows');
    })->name('services.workflows')->middleware('role:admin,truong_phong_san_xuat,nhan_su_san_xuat');

    Route::get('/lich-hop', function () {
        return Inertia::render('Meetings');
    })->name('meetings.index')->middleware('role:admin,truong_phong_san_xuat,nhan_su_kinh_doanh');

    Route::get('/chat-noi-bo', function () {
        return Inertia::render('InternalChat');
    })->name('chat.internal');

    Route::get('/thong-bao', function () {
        return Inertia::render('NotificationCenter');
    })->name('notifications.center');

    Route::get('/nhat-ky-he-thong', function () {
        return Inertia::render('ActivityLogs');
    })->name('activity.logs')->middleware('role:admin,truong_phong_san_xuat');

    Route::get('/crm-mini', function () {
        return Inertia::render('CRM');
    })->name('crm.index')->middleware('role:admin,nhan_su_kinh_doanh');

    Route::get('/tai-khoan', function () {
        return Inertia::render('UserAccountsDashboard');
    })->name('accounts.dashboard')->middleware('role:admin,truong_phong_san_xuat');

    Route::get('/phan-quyen', function () {
        return Inertia::render('RolesPermissions');
    })->name('roles.permissions')->middleware('role:admin');
});

require __DIR__.'/auth.php';
