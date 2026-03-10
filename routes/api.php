<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\V1\ActivityLogController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CRMController;
use App\Http\Controllers\Api\V1\DeadlineReminderController;
use App\Http\Controllers\Api\V1\MeetingController;
use App\Http\Controllers\Api\V1\NotificationCenterController;
use App\Http\Controllers\Api\V1\ProjectController;
use App\Http\Controllers\Api\V1\PublicMobileController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\ServiceWorkflowController;
use App\Http\Controllers\Api\V1\SystemMetaController;
use App\Http\Controllers\Api\V1\TaskAttachmentController;
use App\Http\Controllers\Api\V1\TaskCommentController;
use App\Http\Controllers\Api\V1\TaskController;
use App\Http\Controllers\Api\V1\UserAccountController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| is assigned the "api" middleware group. Enjoy building your API!
|
*/

Route::middleware('auth:sanctum')->get('/user', function (Request $request) {
    return $request->user();
});

Route::prefix('v1')->group(function () {
    Route::get('/health', function () {
        return response()->json([
            'status' => 'ok',
            'service' => config('app.name'),
        ]);
    });

    Route::get('/meta', [SystemMetaController::class, 'index']);
    Route::get('/public/summary', [PublicMobileController::class, 'summary']);
    Route::get('/public/accounts-summary', [PublicMobileController::class, 'accountsSummary']);

    Route::post('/login', [AuthController::class, 'login']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);

        Route::get('/projects', [ProjectController::class, 'index']);
        Route::get('/projects/{project}', [ProjectController::class, 'show']);
        Route::post('/projects', [ProjectController::class, 'store'])
            ->middleware('role:admin,nhan_su_kinh_doanh,truong_phong_san_xuat');
        Route::put('/projects/{project}', [ProjectController::class, 'update'])
            ->middleware('role:admin,nhan_su_kinh_doanh,truong_phong_san_xuat');
        Route::delete('/projects/{project}', [ProjectController::class, 'destroy'])
            ->middleware('role:admin');

        Route::get('/tasks', [TaskController::class, 'index']);
        Route::get('/tasks/{task}', [TaskController::class, 'show']);
        Route::post('/tasks', [TaskController::class, 'store'])
            ->middleware('role:admin,truong_phong_san_xuat');
        Route::put('/tasks/{task}', [TaskController::class, 'update'])
            ->middleware('role:admin,truong_phong_san_xuat,nhan_su_san_xuat');
        Route::delete('/tasks/{task}', [TaskController::class, 'destroy'])
            ->middleware('role:admin,truong_phong_san_xuat');

        Route::get('/tasks/{task}/comments', [TaskCommentController::class, 'index']);
        Route::post('/tasks/{task}/comments', [TaskCommentController::class, 'store'])
            ->middleware('role:admin,truong_phong_san_xuat,nhan_su_san_xuat,nhan_su_kinh_doanh');
        Route::put('/tasks/{task}/comments/{comment}', [TaskCommentController::class, 'update'])
            ->middleware('role:admin,truong_phong_san_xuat,nhan_su_san_xuat,nhan_su_kinh_doanh');
        Route::delete('/tasks/{task}/comments/{comment}', [TaskCommentController::class, 'destroy'])
            ->middleware('role:admin,truong_phong_san_xuat,nhan_su_san_xuat,nhan_su_kinh_doanh');

        Route::get('/tasks/{task}/attachments', [TaskAttachmentController::class, 'index']);
        Route::post('/tasks/{task}/attachments', [TaskAttachmentController::class, 'store'])
            ->middleware('role:admin,truong_phong_san_xuat,nhan_su_san_xuat');
        Route::delete('/tasks/{task}/attachments/{attachment}', [TaskAttachmentController::class, 'destroy'])
            ->middleware('role:admin,truong_phong_san_xuat,nhan_su_san_xuat');

        Route::get('/tasks/{task}/reminders', [DeadlineReminderController::class, 'index']);
        Route::post('/tasks/{task}/reminders', [DeadlineReminderController::class, 'store'])
            ->middleware('role:admin,truong_phong_san_xuat');
        Route::put('/tasks/{task}/reminders/{reminder}', [DeadlineReminderController::class, 'update'])
            ->middleware('role:admin,truong_phong_san_xuat');
        Route::delete('/tasks/{task}/reminders/{reminder}', [DeadlineReminderController::class, 'destroy'])
            ->middleware('role:admin,truong_phong_san_xuat');

        Route::get('/activity-logs', [ActivityLogController::class, 'index'])
            ->middleware('role:admin,truong_phong_san_xuat');

        Route::get('/users/accounts', [UserAccountController::class, 'index'])
            ->middleware('role:admin,truong_phong_san_xuat');
        Route::get('/users/accounts/stats', [UserAccountController::class, 'stats'])
            ->middleware('role:admin,truong_phong_san_xuat');
        Route::post('/users/accounts', [UserAccountController::class, 'store'])
            ->middleware('role:admin');
        Route::put('/users/accounts/{user}', [UserAccountController::class, 'update'])
            ->middleware('role:admin');
        Route::delete('/users/accounts/{user}', [UserAccountController::class, 'destroy'])
            ->middleware('role:admin');

        Route::get('/meetings', [MeetingController::class, 'index']);
        Route::post('/meetings', [MeetingController::class, 'store'])
            ->middleware('role:admin,truong_phong_san_xuat,nhan_su_kinh_doanh');
        Route::put('/meetings/{meeting}', [MeetingController::class, 'update'])
            ->middleware('role:admin,truong_phong_san_xuat,nhan_su_kinh_doanh');
        Route::delete('/meetings/{meeting}', [MeetingController::class, 'destroy'])
            ->middleware('role:admin,truong_phong_san_xuat');

        Route::get('/crm/clients', [CRMController::class, 'clients']);
        Route::post('/crm/clients', [CRMController::class, 'storeClient'])
            ->middleware('role:admin,nhan_su_kinh_doanh');
        Route::put('/crm/clients/{client}', [CRMController::class, 'updateClient'])
            ->middleware('role:admin,nhan_su_kinh_doanh');
        Route::delete('/crm/clients/{client}', [CRMController::class, 'destroyClient'])
            ->middleware('role:admin');

        Route::get('/crm/payments', [CRMController::class, 'payments']);
        Route::post('/crm/payments', [CRMController::class, 'storePayment'])
            ->middleware('role:admin,nhan_su_kinh_doanh');
        Route::put('/crm/payments/{payment}', [CRMController::class, 'updatePayment'])
            ->middleware('role:admin,nhan_su_kinh_doanh');
        Route::delete('/crm/payments/{payment}', [CRMController::class, 'destroyPayment'])
            ->middleware('role:admin');

        Route::get('/reports/dashboard-summary', [ReportController::class, 'dashboardSummary']);

        Route::get('/services/{type}/items', [ServiceWorkflowController::class, 'index'])
            ->middleware('role:admin,truong_phong_san_xuat,nhan_su_san_xuat');
        Route::post('/services/{type}/items', [ServiceWorkflowController::class, 'store'])
            ->middleware('role:admin,truong_phong_san_xuat');
        Route::put('/services/{type}/items/{id}', [ServiceWorkflowController::class, 'update'])
            ->middleware('role:admin,truong_phong_san_xuat');
        Route::delete('/services/{type}/items/{id}', [ServiceWorkflowController::class, 'destroy'])
            ->middleware('role:admin');

        Route::get('/notifications/in-app', [NotificationCenterController::class, 'index']);
        Route::post('/notifications/in-app/read', [NotificationCenterController::class, 'markRead']);
        Route::post('/notifications/in-app/read-all', [NotificationCenterController::class, 'markAllRead']);
    });
});
