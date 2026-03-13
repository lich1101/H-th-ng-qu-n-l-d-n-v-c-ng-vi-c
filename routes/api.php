<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\V1\ActivityLogController;
use App\Http\Controllers\Api\V1\AppSettingController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\ContractController;
use App\Http\Controllers\Api\V1\ContractCostController;
use App\Http\Controllers\Api\V1\ContractPaymentController;
use App\Http\Controllers\Api\V1\CRMController;
use App\Http\Controllers\Api\V1\DepartmentAssignmentController;
use App\Http\Controllers\Api\V1\DepartmentController;
use App\Http\Controllers\Api\V1\LeadCaptureController;
use App\Http\Controllers\Api\V1\LeadFormController;
use App\Http\Controllers\Api\V1\LeadTypeController;
use App\Http\Controllers\Api\V1\FacebookPageController;
use App\Http\Controllers\Api\V1\OpportunityController;
use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\RevenueTierController;
use App\Http\Controllers\Api\V1\DeadlineReminderController;
use App\Http\Controllers\Api\V1\MeetingController;
use App\Http\Controllers\Api\V1\NotificationCenterController;
use App\Http\Controllers\Api\V1\ProjectController;
use App\Http\Controllers\Api\V1\ImportController;
use App\Http\Controllers\Api\V1\PublicMobileController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\ServiceWorkflowController;
use App\Http\Controllers\Api\V1\SystemMetaController;
use App\Http\Controllers\Api\V1\TaskAttachmentController;
use App\Http\Controllers\Api\V1\TaskCommentController;
use App\Http\Controllers\Api\V1\TaskController;
use App\Http\Controllers\Api\V1\TaskItemController;
use App\Http\Controllers\Api\V1\TaskItemUpdateController;
use App\Http\Controllers\Api\V1\TaskUpdateController;
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
    Route::get('/settings', [AppSettingController::class, 'show']);
    Route::get('/public/summary', [PublicMobileController::class, 'summary']);
    Route::get('/public/accounts-summary', [PublicMobileController::class, 'accountsSummary']);

    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/leads/webhook', [LeadCaptureController::class, 'webhook']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::post('/settings', [AppSettingController::class, 'update'])
            ->middleware('role:admin');

        Route::get('/projects', [ProjectController::class, 'index']);
        Route::get('/projects/{project}', [ProjectController::class, 'show']);
        Route::post('/projects', [ProjectController::class, 'store'])
            ->middleware('role:admin,quan_ly');
        Route::put('/projects/{project}', [ProjectController::class, 'update'])
            ->middleware('role:admin,quan_ly');
        Route::delete('/projects/{project}', [ProjectController::class, 'destroy'])
            ->middleware('role:admin');

        Route::get('/tasks', [TaskController::class, 'index']);
        Route::get('/tasks/{task}', [TaskController::class, 'show']);
        Route::post('/tasks', [TaskController::class, 'store'])
            ->middleware('role:admin,quan_ly');
        Route::put('/tasks/{task}', [TaskController::class, 'update'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::delete('/tasks/{task}', [TaskController::class, 'destroy'])
            ->middleware('role:admin,quan_ly');

        Route::get('/tasks/{task}/comments', [TaskCommentController::class, 'index']);
        Route::post('/tasks/{task}/comments', [TaskCommentController::class, 'store'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::put('/tasks/{task}/comments/{comment}', [TaskCommentController::class, 'update'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::delete('/tasks/{task}/comments/{comment}', [TaskCommentController::class, 'destroy'])
            ->middleware('role:admin,quan_ly,nhan_vien');

        Route::get('/tasks/{task}/attachments', [TaskAttachmentController::class, 'index']);
        Route::post('/tasks/{task}/attachments', [TaskAttachmentController::class, 'store'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::delete('/tasks/{task}/attachments/{attachment}', [TaskAttachmentController::class, 'destroy'])
            ->middleware('role:admin,quan_ly,nhan_vien');

        Route::get('/tasks/{task}/updates', [TaskUpdateController::class, 'index']);
        Route::post('/tasks/{task}/updates', [TaskUpdateController::class, 'store'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::put('/tasks/{task}/updates/{update}', [TaskUpdateController::class, 'update'])
            ->middleware('role:admin,quan_ly');
        Route::post('/tasks/{task}/updates/{update}/approve', [TaskUpdateController::class, 'approve'])
            ->middleware('role:admin,quan_ly');
        Route::post('/tasks/{task}/updates/{update}/reject', [TaskUpdateController::class, 'reject'])
            ->middleware('role:admin,quan_ly');

        Route::get('/tasks/{task}/items', [TaskItemController::class, 'index']);
        Route::post('/tasks/{task}/items', [TaskItemController::class, 'store'])
            ->middleware('role:admin,quan_ly');
        Route::put('/tasks/{task}/items/{item}', [TaskItemController::class, 'update'])
            ->middleware('role:admin,quan_ly');
        Route::delete('/tasks/{task}/items/{item}', [TaskItemController::class, 'destroy'])
            ->middleware('role:admin,quan_ly');

        Route::get('/tasks/{task}/items/{item}/updates', [TaskItemUpdateController::class, 'index']);
        Route::post('/tasks/{task}/items/{item}/updates', [TaskItemUpdateController::class, 'store'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::put('/tasks/{task}/items/{item}/updates/{update}', [TaskItemUpdateController::class, 'update'])
            ->middleware('role:admin,quan_ly');
        Route::post('/tasks/{task}/items/{item}/updates/{update}/approve', [TaskItemUpdateController::class, 'approve'])
            ->middleware('role:admin,quan_ly');
        Route::post('/tasks/{task}/items/{item}/updates/{update}/reject', [TaskItemUpdateController::class, 'reject'])
            ->middleware('role:admin,quan_ly');

        Route::get('/tasks/{task}/reminders', [DeadlineReminderController::class, 'index']);
        Route::post('/tasks/{task}/reminders', [DeadlineReminderController::class, 'store'])
            ->middleware('role:admin,quan_ly');
        Route::put('/tasks/{task}/reminders/{reminder}', [DeadlineReminderController::class, 'update'])
            ->middleware('role:admin,quan_ly');
        Route::delete('/tasks/{task}/reminders/{reminder}', [DeadlineReminderController::class, 'destroy'])
            ->middleware('role:admin,quan_ly');

        Route::get('/activity-logs', [ActivityLogController::class, 'index'])
            ->middleware('role:admin,quan_ly');

        Route::get('/users/accounts', [UserAccountController::class, 'index'])
            ->middleware('role:admin');
        Route::get('/users/accounts/stats', [UserAccountController::class, 'stats'])
            ->middleware('role:admin');
        Route::post('/users/accounts', [UserAccountController::class, 'store'])
            ->middleware('role:admin');
        Route::put('/users/accounts/{user}', [UserAccountController::class, 'update'])
            ->middleware('role:admin');
        Route::delete('/users/accounts/{user}', [UserAccountController::class, 'destroy'])
            ->middleware('role:admin');

        Route::get('/meetings', [MeetingController::class, 'index']);
        Route::post('/meetings', [MeetingController::class, 'store'])
            ->middleware('role:admin,quan_ly');
        Route::put('/meetings/{meeting}', [MeetingController::class, 'update'])
            ->middleware('role:admin,quan_ly');
        Route::delete('/meetings/{meeting}', [MeetingController::class, 'destroy'])
            ->middleware('role:admin');

        Route::get('/crm/clients', [CRMController::class, 'clients']);
        Route::post('/crm/clients', [CRMController::class, 'storeClient'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::put('/crm/clients/{client}', [CRMController::class, 'updateClient'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::delete('/crm/clients/{client}', [CRMController::class, 'destroyClient'])
            ->middleware('role:admin');

        Route::get('/crm/payments', [CRMController::class, 'payments']);
        Route::post('/crm/payments', [CRMController::class, 'storePayment'])
            ->middleware('role:admin,ke_toan');
        Route::put('/crm/payments/{payment}', [CRMController::class, 'updatePayment'])
            ->middleware('role:admin,ke_toan');
        Route::delete('/crm/payments/{payment}', [CRMController::class, 'destroyPayment'])
            ->middleware('role:admin');

        Route::get('/contracts', [ContractController::class, 'index'])
            ->middleware('role:admin,quan_ly,nhan_vien,ke_toan');
        Route::get('/contracts/{contract}', [ContractController::class, 'show'])
            ->middleware('role:admin,quan_ly,nhan_vien,ke_toan');
        Route::post('/contracts', [ContractController::class, 'store'])
            ->middleware('role:admin,quan_ly,nhan_vien,ke_toan');
        Route::put('/contracts/{contract}', [ContractController::class, 'update'])
            ->middleware('role:admin,quan_ly,nhan_vien,ke_toan');
        Route::delete('/contracts/{contract}', [ContractController::class, 'destroy'])
            ->middleware('role:admin');
        Route::post('/contracts/{contract}/approve', [ContractController::class, 'approve'])
            ->middleware('role:admin,ke_toan');
        Route::get('/contracts/{contract}/payments', [ContractPaymentController::class, 'index'])
            ->middleware('role:admin,quan_ly,nhan_vien,ke_toan');
        Route::post('/contracts/{contract}/payments', [ContractPaymentController::class, 'store'])
            ->middleware('role:admin,ke_toan');
        Route::put('/contracts/{contract}/payments/{payment}', [ContractPaymentController::class, 'update'])
            ->middleware('role:admin,ke_toan');
        Route::delete('/contracts/{contract}/payments/{payment}', [ContractPaymentController::class, 'destroy'])
            ->middleware('role:admin,ke_toan');

        Route::get('/contracts/{contract}/costs', [ContractCostController::class, 'index'])
            ->middleware('role:admin,quan_ly,nhan_vien,ke_toan');
        Route::post('/contracts/{contract}/costs', [ContractCostController::class, 'store'])
            ->middleware('role:admin,ke_toan');
        Route::put('/contracts/{contract}/costs/{cost}', [ContractCostController::class, 'update'])
            ->middleware('role:admin,ke_toan');
        Route::delete('/contracts/{contract}/costs/{cost}', [ContractCostController::class, 'destroy'])
            ->middleware('role:admin,ke_toan');

        Route::get('/opportunities', [OpportunityController::class, 'index'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::post('/opportunities', [OpportunityController::class, 'store'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::get('/opportunities/{opportunity}', [OpportunityController::class, 'show'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::put('/opportunities/{opportunity}', [OpportunityController::class, 'update'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::delete('/opportunities/{opportunity}', [OpportunityController::class, 'destroy'])
            ->middleware('role:admin,quan_ly');

        Route::get('/products', [ProductController::class, 'index'])
            ->middleware('role:admin,quan_ly,nhan_vien,ke_toan');
        Route::post('/products', [ProductController::class, 'store'])
            ->middleware('role:admin,ke_toan');
        Route::get('/products/{product}', [ProductController::class, 'show']);
        Route::put('/products/{product}', [ProductController::class, 'update'])
            ->middleware('role:admin,ke_toan');
        Route::delete('/products/{product}', [ProductController::class, 'destroy'])
            ->middleware('role:admin');

        Route::get('/lead-types', [LeadTypeController::class, 'index']);
        Route::post('/lead-types', [LeadTypeController::class, 'store'])->middleware('role:admin');
        Route::put('/lead-types/{leadType}', [LeadTypeController::class, 'update'])->middleware('role:admin');
        Route::delete('/lead-types/{leadType}', [LeadTypeController::class, 'destroy'])->middleware('role:admin');

        Route::get('/revenue-tiers', [RevenueTierController::class, 'index']);
        Route::post('/revenue-tiers', [RevenueTierController::class, 'store'])->middleware('role:admin');
        Route::put('/revenue-tiers/{revenueTier}', [RevenueTierController::class, 'update'])->middleware('role:admin');
        Route::delete('/revenue-tiers/{revenueTier}', [RevenueTierController::class, 'destroy'])->middleware('role:admin');

        Route::get('/lead-forms', [LeadFormController::class, 'index'])
            ->middleware('role:admin');
        Route::post('/lead-forms', [LeadFormController::class, 'store'])
            ->middleware('role:admin');
        Route::put('/lead-forms/{leadForm}', [LeadFormController::class, 'update'])
            ->middleware('role:admin');
        Route::delete('/lead-forms/{leadForm}', [LeadFormController::class, 'destroy'])
            ->middleware('role:admin');

        Route::post('/imports/clients', [ImportController::class, 'importClients'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::post('/imports/contracts', [ImportController::class, 'importContracts'])
            ->middleware('role:admin,quan_ly,nhan_vien,ke_toan');
        Route::post('/imports/tasks', [ImportController::class, 'importTasks'])
            ->middleware('role:admin,quan_ly');

        Route::get('/facebook/pages', [FacebookPageController::class, 'index'])
            ->middleware('role:admin,quan_ly,nhan_vien,ke_toan');
        Route::post('/facebook/pages/sync', [FacebookPageController::class, 'sync'])
            ->middleware('role:admin,quan_ly,nhan_vien,ke_toan');
        Route::post('/facebook/pages/{page}/subscribe', [FacebookPageController::class, 'subscribe'])
            ->middleware('role:admin,quan_ly');
        Route::post('/facebook/pages/{page}/unsubscribe', [FacebookPageController::class, 'unsubscribe'])
            ->middleware('role:admin,quan_ly');

        Route::get('/departments', [DepartmentController::class, 'index'])
            ->middleware('role:admin,quan_ly');
        Route::post('/departments', [DepartmentController::class, 'store'])
            ->middleware('role:admin');
        Route::put('/departments/{department}', [DepartmentController::class, 'update'])
            ->middleware('role:admin');
        Route::delete('/departments/{department}', [DepartmentController::class, 'destroy'])
            ->middleware('role:admin');

        Route::get('/department-assignments', [DepartmentAssignmentController::class, 'index'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::post('/department-assignments', [DepartmentAssignmentController::class, 'store'])
            ->middleware('role:admin');
        Route::put('/department-assignments/{assignment}', [DepartmentAssignmentController::class, 'update'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::delete('/department-assignments/{assignment}', [DepartmentAssignmentController::class, 'destroy'])
            ->middleware('role:admin');

        Route::get('/reports/dashboard-summary', [ReportController::class, 'dashboardSummary']);
        Route::get('/reports/revenue', [ReportController::class, 'revenueByDepartment'])
            ->middleware('role:admin,quan_ly');
        Route::get('/reports/company', [ReportController::class, 'companyRevenue'])
            ->middleware('role:admin');

        Route::get('/services/{type}/items', [ServiceWorkflowController::class, 'index'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::post('/services/{type}/items', [ServiceWorkflowController::class, 'store'])
            ->middleware('role:admin,quan_ly');
        Route::put('/services/{type}/items/{id}', [ServiceWorkflowController::class, 'update'])
            ->middleware('role:admin,quan_ly');
        Route::delete('/services/{type}/items/{id}', [ServiceWorkflowController::class, 'destroy'])
            ->middleware('role:admin');

        Route::get('/notifications/in-app', [NotificationCenterController::class, 'index']);
        Route::post('/notifications/in-app/read', [NotificationCenterController::class, 'markRead']);
        Route::post('/notifications/in-app/read-all', [NotificationCenterController::class, 'markAllRead']);
    });
});
