<?php

use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Illuminate\Support\Carbon;
use App\Http\Controllers\LeadFormPublicController;
use App\Http\Controllers\FacebookAuthController;
use App\Http\Controllers\Webhooks\FacebookWebhookController;
use App\Models\Client;

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

Route::get('/lead-forms/{slug}', [LeadFormPublicController::class, 'show'])->name('lead-forms.public');
Route::post('/lead-forms/{slug}/submit', [LeadFormPublicController::class, 'submit'])->name('lead-forms.submit');
Route::get('/chinh-sach-quyen-rieng-tu', function () {
    return Inertia::render('PrivacyPolicy');
})->name('privacy.policy');

Route::get('/webhook/facebook', [FacebookWebhookController::class, 'verify'])->name('facebook.webhook.verify');
Route::post('/webhook/facebook', [FacebookWebhookController::class, 'handle'])->name('facebook.webhook.handle');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('/du-an', function () {
        return Inertia::render('ProjectsKanban');
    })->name('projects.kanban')->middleware('role:admin,quan_ly');

    Route::get('/du-an/{project}', function (App\Models\Project $project) {
        return Inertia::render('ProjectDetail', [
            'projectId' => $project->id,
        ]);
    })->name('projects.detail')->middleware('role:admin,quan_ly,nhan_vien');

    Route::get('/du-an/{project}/luong', function (App\Models\Project $project) {
        return Inertia::render('ProjectFlow', [
            'projectId' => $project->id,
        ]);
    })->name('projects.flow')->middleware('role:admin,quan_ly,nhan_vien');

    Route::get('/du-an/{project}/kho', function (App\Models\Project $project) {
        return Inertia::render('ProjectFiles', [
            'projectId' => $project->id,
        ]);
    })->name('projects.files')->middleware('role:admin,quan_ly,nhan_vien');

    Route::get('/cong-viec', function () {
        return Inertia::render('TasksBoard');
    })->name('tasks.board')->middleware('role:admin,quan_ly,nhan_vien');

    Route::get('/cong-viec-theo-nhan-su', function () {
        return Inertia::render('TasksByStaff');
    })->name('tasks.by-staff')->middleware('role:admin,quan_ly,nhan_vien');

    Route::get('/dau-viec', function () {
        return Inertia::render('TaskItemsBoard');
    })->name('task-items.board')->middleware('role:admin,quan_ly,nhan_vien');

    Route::get('/cong-viec/{task}', function (App\Models\Task $task) {
        return Inertia::render('TaskDetail', [
            'taskId' => $task->id,
        ]);
    })->name('tasks.detail')->middleware('role:admin,quan_ly,nhan_vien');

    Route::get('/deadline', function () {
        return Inertia::render('DeadlineReminders');
    })->name('deadlines.index')->middleware('role:admin,quan_ly,nhan_vien');

    Route::get('/ban-giao', function () {
        return Inertia::render('HandoverCenter');
    })->name('handover.index')->middleware('role:admin,quan_ly,nhan_vien');

    Route::get('/bao-cao-kpi', function () {
        return Inertia::render('ReportsKPI');
    })->name('reports.kpi')->middleware('role:admin,quan_ly');

    Route::get('/bao-cao-doanh-thu', function () {
        return redirect()->route('reports.company');
    })->name('reports.revenue')->middleware('role:admin');

    Route::get('/bao-cao-doanh-thu-cong-ty', function () {
        return Inertia::render('CompanyRevenueReport');
    })->name('reports.company')->middleware('role:admin');

    Route::get('/quy-trinh-dich-vu', function () {
        return Inertia::render('ServiceWorkflows');
    })->name('services.workflows')->middleware('role:admin,quan_ly,nhan_vien');

    Route::get('/lich-hop', function () {
        return Inertia::render('Meetings');
    })->name('meetings.index')->middleware('role:admin,quan_ly');

    Route::get('/thong-bao', function () {
        return Inertia::render('NotificationCenter');
    })->name('notifications.center');

    Route::get('/nhat-ky-he-thong', function () {
        return Inertia::render('ActivityLogs');
    })->name('activity.logs')->middleware('role:admin,quan_ly');

    Route::get('/crm-mini', function () {
        return Inertia::render('CRM');
    })->name('crm.index')->middleware('role:admin,quan_ly,nhan_vien,ke_toan');

    Route::get('/khach-hang/{client}/luong', function (Client $client) {
        return Inertia::render('ClientFlow', [
            'clientId' => $client->id,
        ]);
    })->name('crm.flow')->middleware('role:admin,quan_ly,nhan_vien,ke_toan');

    Route::get('/co-hoi', function () {
        return Inertia::render('Opportunities');
    })->name('opportunities.index')->middleware('role:admin,quan_ly,nhan_vien');

    Route::get('/hop-dong', function () {
        return Inertia::render('Contracts');
    })->name('contracts.index')->middleware('role:admin,quan_ly,nhan_vien,ke_toan');

    Route::get('/san-pham', function () {
        return Inertia::render('Products');
    })->name('products.index')->middleware('role:admin,ke_toan,quan_ly,nhan_vien');

    Route::get('/form-tu-van', function () {
        return Inertia::render('LeadForms');
    })->name('lead-forms.index')->middleware('role:admin');

    Route::get('/facebook/login', [FacebookAuthController::class, 'redirect'])
        ->name('facebook.login')
        ->middleware('role:admin,quan_ly');
    Route::get('/facebook/callback', [FacebookAuthController::class, 'callback'])
        ->name('facebook.callback')
        ->middleware('role:admin,quan_ly');
    Route::post('/facebook/disconnect', [FacebookAuthController::class, 'disconnect'])
        ->name('facebook.disconnect')
        ->middleware('role:admin,quan_ly');

    Route::get('/facebook-pages', function () {
        $user = request()->user();
        $expiresAt = $user->facebook_user_token_expires_at;
        $connected = ! empty($user->facebook_user_access_token)
            && (! $expiresAt || Carbon::parse($expiresAt)->isFuture());

        return Inertia::render('FacebookPages', [
            'facebookConnected' => $connected,
            'facebookTokenExpiresAt' => optional($expiresAt)->toIso8601String(),
        ]);
    })->name('facebook.pages')->middleware('role:admin,quan_ly');

    Route::get('/trang-thai-khach-hang', function () {
        return Inertia::render('LeadTypes');
    })->name('lead-types.index')->middleware('role:admin');

    Route::get('/hang-doanh-thu', function () {
        return Inertia::render('RevenueTiers');
    })->name('revenue-tiers.index')->middleware('role:admin');

    Route::get('/phong-ban', function () {
        return Inertia::render('Departments');
    })->name('departments.index')->middleware('role:admin,quan_ly');

    Route::get('/dieu-phoi-phong-ban', function () {
        return Inertia::render('DepartmentAssignments');
    })->name('department-assignments.index')->middleware('role:admin,quan_ly,nhan_vien');

    Route::get('/tai-khoan', function () {
        return Inertia::render('UserAccountsDashboard');
    })->name('accounts.dashboard')->middleware('role:admin');

    Route::get('/phan-quyen', function () {
        return Inertia::render('RolesPermissions');
    })->name('roles.permissions')->middleware('role:admin');

    Route::get('/cai-dat-he-thong', function () {
        return Inertia::render('SystemSettings');
    })->name('settings.system')->middleware('role:admin');
});

require __DIR__.'/auth.php';
