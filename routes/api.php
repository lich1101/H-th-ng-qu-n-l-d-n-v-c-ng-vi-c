<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\V1\ActivityLogController;
use App\Http\Controllers\Api\V1\AttendanceController;
use App\Http\Controllers\Api\V1\AppSettingController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\ChatbotController;
use App\Http\Controllers\Api\V1\ContractController;
use App\Http\Controllers\Api\V1\ContractCostController;
use App\Http\Controllers\Api\V1\ContractPaymentController;
use App\Http\Controllers\Api\V1\ContractFinanceRequestController;
use App\Http\Controllers\Api\V1\CRMController;
use App\Http\Controllers\Api\V1\ClientFlowController;
use App\Http\Controllers\Api\V1\ClientStaffTransferController;
use App\Http\Controllers\Api\V1\DepartmentAssignmentController;
use App\Http\Controllers\Api\V1\DepartmentController;
use App\Http\Controllers\Api\V1\LeadCaptureController;
use App\Http\Controllers\Api\V1\LeadFormController;
use App\Http\Controllers\Api\V1\LeadTypeController;
use App\Http\Controllers\Api\V1\FacebookPageController;
use App\Http\Controllers\Api\V1\FirebaseTokenController;
use App\Http\Controllers\Api\V1\OpportunityController;
use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\ProductCategoryController;
use App\Http\Controllers\Api\V1\PushTestController;
use App\Http\Controllers\Api\V1\RevenueTierController;
use App\Http\Controllers\Api\V1\DeadlineReminderController;
use App\Http\Controllers\Api\V1\DeviceTokenController;
use App\Http\Controllers\Api\V1\MeetingController;
use App\Http\Controllers\Api\V1\NotificationCenterController;
use App\Http\Controllers\Api\V1\OpportunityStatusController;
use App\Http\Controllers\Api\V1\ProjectController;
use App\Http\Controllers\Api\V1\ProjectDashboardController;
use App\Http\Controllers\Api\V1\ProjectFileController;
use App\Http\Controllers\Api\V1\ProjectFlowController;
use App\Http\Controllers\Api\V1\ProjectSearchConsoleController;
use App\Http\Controllers\Api\V1\SearchConsoleSitesController;
use App\Http\Controllers\Api\V1\ImportController;
use App\Http\Controllers\Api\V1\ProfileController;
use App\Http\Controllers\Api\V1\PublicMobileController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\StaffFilterOptionsController;
use App\Http\Controllers\Api\V1\ServiceWorkflowController;
use App\Http\Controllers\Api\V1\SystemMetaController;
use App\Http\Controllers\Api\V1\SystemStatusController;
use App\Http\Controllers\Api\V1\TaskAttachmentController;
use App\Http\Controllers\Api\V1\TaskCommentController;
use App\Http\Controllers\Api\V1\TaskController;
use App\Http\Controllers\Api\V1\TaskItemController;
use App\Http\Controllers\Api\V1\TaskItemUpdateController;
use App\Http\Controllers\Api\V1\UserLookupController;
use App\Http\Controllers\Api\V1\TaskUpdateController;
use App\Http\Controllers\Api\V1\UserAccountController;
use App\Http\Controllers\Api\V1\UserNotificationPreferenceController;
use App\Http\Controllers\Api\V1\WorkflowTopicController;

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
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('/leads/webhook', [LeadCaptureController::class, 'webhook']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::post('/profile/avatar', [ProfileController::class, 'updateAvatar']);
        Route::get('/device-tokens', [DeviceTokenController::class, 'index'])
            ->middleware('role:administrator');
        Route::post('/device-tokens', [DeviceTokenController::class, 'store']);
        Route::get('/settings/admin', [AppSettingController::class, 'adminShow'])
            ->middleware('role:administrator');
        Route::get('/notification-preferences', [UserNotificationPreferenceController::class, 'show']);
        Route::put('/notification-preferences', [UserNotificationPreferenceController::class, 'update']);
        Route::get('/firebase/token', [FirebaseTokenController::class, 'show']);
        Route::get('/attendance/dashboard', [AttendanceController::class, 'dashboard']);
        Route::get('/attendance/records/my', [AttendanceController::class, 'myRecords']);
        Route::get('/attendance/requests', [AttendanceController::class, 'requests']);
        Route::post('/attendance/requests', [AttendanceController::class, 'submitRequest']);
        Route::post('/attendance/devices/request', [AttendanceController::class, 'submitDevice']);
        Route::post('/attendance/check-in', [AttendanceController::class, 'checkIn']);
        Route::get('/attendance/settings', [AttendanceController::class, 'settingsShow'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::put('/attendance/settings', [AttendanceController::class, 'settingsUpdate'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::get('/attendance/wifi', [AttendanceController::class, 'wifiIndex'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::post('/attendance/wifi', [AttendanceController::class, 'wifiStore'])
            ->middleware('role:administrator');
        Route::put('/attendance/wifi/{attendanceWifiNetwork}', [AttendanceController::class, 'wifiUpdate'])
            ->middleware('role:administrator');
        Route::delete('/attendance/wifi/{attendanceWifiNetwork}', [AttendanceController::class, 'wifiDestroy'])
            ->middleware('role:administrator');
        Route::get('/attendance/staff', [AttendanceController::class, 'staffIndex'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::put('/attendance/staff/{user}', [AttendanceController::class, 'staffUpdate'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::get('/attendance/work-types', [AttendanceController::class, 'workTypes'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::post('/attendance/work-types', [AttendanceController::class, 'workTypeStore'])
            ->middleware('role:administrator');
        Route::put('/attendance/work-types/{attendanceWorkType}', [AttendanceController::class, 'workTypeUpdate'])
            ->middleware('role:administrator');
        Route::delete('/attendance/work-types/{attendanceWorkType}', [AttendanceController::class, 'workTypeDestroy'])
            ->middleware('role:administrator');
        Route::get('/attendance/devices', [AttendanceController::class, 'devices'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::post('/attendance/devices/{attendanceDevice}/review', [AttendanceController::class, 'reviewDevice'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::delete('/attendance/devices/{attendanceDevice}', [AttendanceController::class, 'revokeDevice'])
            ->middleware('role:administrator');
        Route::post('/attendance/requests/{attendanceRequest}/review', [AttendanceController::class, 'reviewRequest'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::post('/attendance/records/manual', [AttendanceController::class, 'manualUpdateRecord'])
            ->middleware('role:administrator');
        Route::get('/attendance/holidays', [AttendanceController::class, 'holidays'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::post('/attendance/holidays', [AttendanceController::class, 'holidayStore'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::put('/attendance/holidays/{attendanceHoliday}', [AttendanceController::class, 'holidayUpdate'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::delete('/attendance/holidays/{attendanceHoliday}', [AttendanceController::class, 'holidayDestroy'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::get('/attendance/report', [AttendanceController::class, 'report']);
        Route::get('/attendance/export', [AttendanceController::class, 'export'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::get('/attendance/records/{attendanceRecord}', [AttendanceController::class, 'recordShow']);
        Route::post('/push/test', [PushTestController::class, 'store'])
            ->middleware('role:administrator');
        Route::get('/system/status', [SystemStatusController::class, 'show'])
            ->middleware('role:administrator');
        Route::post('/settings', [AppSettingController::class, 'update'])
            ->middleware('role:administrator');
        Route::post('/notifications/in-app/read-task-chat', [NotificationCenterController::class, 'markTaskChatRead']);

        Route::get('/search-console/sites', [SearchConsoleSitesController::class, 'index'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien');
        Route::get('/projects', [ProjectController::class, 'index']);
        Route::get('/project-dashboard/overview', [ProjectDashboardController::class, 'overview'])
            ->middleware('role:admin,administrator');
        Route::get('/projects/{project}', [ProjectController::class, 'show']);
        Route::get('/projects/{project}/approval-queue', [ProjectController::class, 'approvalQueue']);
        Route::get('/projects/{project}/search-console', [ProjectSearchConsoleController::class, 'show']);
        Route::put('/projects/{project}/search-console/notification', [ProjectSearchConsoleController::class, 'updateNotification']);
        Route::post('/projects/{project}/search-console/sync', [ProjectSearchConsoleController::class, 'sync'])
            ->middleware('role:admin,quan_ly');
        Route::get('/project-handovers', [ProjectController::class, 'handoverQueue'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::post('/projects/{project}/handover-submit', [ProjectController::class, 'submitHandover'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::post('/projects/{project}/handover-review', [ProjectController::class, 'reviewHandover'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::post('/projects', [ProjectController::class, 'store'])
            ->middleware('role:admin,administrator,quan_ly');
        Route::post('/projects/from-contract', [ProjectController::class, 'createFromContract'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::post('/projects/bulk-sync-contract-dates', [ProjectController::class, 'bulkSyncContractDates'])
            ->middleware('role:admin,administrator,quan_ly');
        Route::put('/projects/{project}', [ProjectController::class, 'update'])
            ->middleware('role:admin,administrator,quan_ly');
        Route::delete('/projects/{project}', [ProjectController::class, 'destroy'])
            ->middleware('role:admin');
        Route::get('/projects/{project}/flow', [ProjectFlowController::class, 'show']);
        Route::get('/projects/{project}/files', [ProjectFileController::class, 'index']);
        Route::post('/projects/{project}/files/folder', [ProjectFileController::class, 'createFolder'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::post('/projects/{project}/files/upload', [ProjectFileController::class, 'upload'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::put('/projects/{project}/files/{file}', [ProjectFileController::class, 'update'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::post('/projects/{project}/files/{file}/duplicate', [ProjectFileController::class, 'duplicate'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::post('/projects/{project}/files/{file}/trash', [ProjectFileController::class, 'trash'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::post('/projects/{project}/files/{file}/restore', [ProjectFileController::class, 'restore'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::delete('/projects/{project}/files/{file}', [ProjectFileController::class, 'destroy'])
            ->middleware('role:admin,quan_ly,nhan_vien');

        Route::get('/tasks', [TaskController::class, 'index']);
        Route::get('/tasks/{task}', [TaskController::class, 'show']);
        Route::post('/tasks', [TaskController::class, 'store'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::put('/tasks/{task}', [TaskController::class, 'update'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::delete('/tasks/{task}', [TaskController::class, 'destroy'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::get('/task-conversations', [TaskCommentController::class, 'threads']);

        Route::get('/tasks/{task}/comments', [TaskCommentController::class, 'index']);
        Route::get('/tasks/{task}/chat-participants', [TaskCommentController::class, 'participants']);
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
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::post('/tasks/{task}/updates/{update}/approve', [TaskUpdateController::class, 'approve'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::post('/tasks/{task}/updates/{update}/reject', [TaskUpdateController::class, 'reject'])
            ->middleware('role:admin,quan_ly,nhan_vien');

        Route::get('/tasks/{task}/items', [TaskItemController::class, 'index']);
        Route::get('/task-items', [TaskItemController::class, 'globalIndex'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::get('/task-items/{id}', [TaskItemController::class, 'show'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::post('/tasks/{task}/items', [TaskItemController::class, 'store'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::put('/tasks/{task}/items/{item}', [TaskItemController::class, 'update'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::delete('/tasks/{task}/items/{item}', [TaskItemController::class, 'destroy'])
            ->middleware('role:admin,quan_ly,nhan_vien');

        Route::get('/tasks/{task}/items/{item}/updates', [TaskItemUpdateController::class, 'index']);
        Route::get('/tasks/{task}/items/{item}/progress-insight', [TaskItemUpdateController::class, 'insight'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::post('/tasks/{task}/items/{item}/updates', [TaskItemUpdateController::class, 'store'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::put('/tasks/{task}/items/{item}/updates/{update}', [TaskItemUpdateController::class, 'update'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::post('/tasks/{task}/items/{item}/updates/{update}/approve', [TaskItemUpdateController::class, 'approve'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::post('/tasks/{task}/items/{item}/updates/{update}/reject', [TaskItemUpdateController::class, 'reject'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::delete('/tasks/{task}/items/{item}/updates/{update}', [TaskItemUpdateController::class, 'destroy'])
            ->middleware('role:admin,quan_ly,nhan_vien');

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
        Route::get('/users/lookup', [UserLookupController::class, 'index'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::get('/staff-filter-options', [StaffFilterOptionsController::class, 'index'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
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
        Route::get('/crm/client-pool', [CRMController::class, 'rotationPool']);
        Route::post('/crm/client-pool', [CRMController::class, 'storeRotationPoolClient'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien');
        Route::post('/crm/client-pool/{client}/claim', [CRMController::class, 'claimRotationPoolClient'])
            ->middleware('role:quan_ly,nhan_vien');
        Route::get('/crm/staff-transfer-requests', [ClientStaffTransferController::class, 'index']);
        Route::get('/crm/staff-transfer-requests/{transfer}', [ClientStaffTransferController::class, 'show']);
        Route::post('/crm/staff-transfer-requests/{transfer}/accept', [ClientStaffTransferController::class, 'accept'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien');
        Route::post('/crm/staff-transfer-requests/{transfer}/reject', [ClientStaffTransferController::class, 'reject'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien');
        Route::post('/crm/staff-transfer-requests/{transfer}/cancel', [ClientStaffTransferController::class, 'cancel'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien');
        Route::get('/crm/clients/{client}/staff-transfer/eligible-users', [ClientStaffTransferController::class, 'eligibleTargets']);
        Route::post('/crm/clients/{client}/staff-transfer-requests', [ClientStaffTransferController::class, 'store'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien');
        Route::get('/crm/clients/{client}/flow', [ClientFlowController::class, 'show']);
        Route::get('/crm/clients/{client}/comments', [ClientFlowController::class, 'comments']);
        Route::get('/crm/clients/{client}', [CRMController::class, 'showClient']);
        Route::post('/crm/clients/{client}/comments', [ClientFlowController::class, 'storeComment'])
            ->middleware('role:admin,quan_ly,nhan_vien');
        Route::delete('/crm/clients/{client}/comments/{commentId}', [ClientFlowController::class, 'destroyComment'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien');
        Route::post('/crm/clients/{client}/care-notes', [ClientFlowController::class, 'storeCareNote'])
            ->middleware('role:admin,quan_ly,nhan_vien');
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
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::post('/contracts/export-selected', [ContractController::class, 'exportSelected'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::get('/contracts/{contract}', [ContractController::class, 'show'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::get('/contracts/{contract}/files', [ContractController::class, 'contractFiles'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::post('/contracts/{contract}/files', [ContractController::class, 'storeContractFile'])
            ->middleware('role:admin,administrator,quan_ly,ke_toan');
        Route::get('/contracts/{contract}/files/{contractFile}/download', [ContractController::class, 'downloadContractFile'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::delete('/contracts/{contract}/files/{contractFile}', [ContractController::class, 'destroyContractFile'])
            ->middleware('role:admin,administrator,quan_ly,ke_toan');
        Route::post('/contracts', [ContractController::class, 'store'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::post('/contracts/sync-dates', [ContractController::class, 'syncDates'])
            ->middleware('role:admin,administrator,quan_ly,ke_toan');
        Route::put('/contracts/{contract}', [ContractController::class, 'update'])
            ->middleware('role:admin,administrator,quan_ly,ke_toan');
        Route::delete('/contracts/{contract}', [ContractController::class, 'destroy'])
            ->middleware('role:admin,administrator,quan_ly,ke_toan');
        Route::post('/contracts/{contract}/care-notes', [ContractController::class, 'storeCareNote'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::post('/contracts/{contract}/approve', [ContractController::class, 'approve'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::post('/contracts/{contract}/cancel', [ContractController::class, 'cancel'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::get('/contracts/{contract}/payments', [ContractPaymentController::class, 'index'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::post('/contracts/{contract}/payments', [ContractPaymentController::class, 'store'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::put('/contracts/{contract}/payments/{payment}', [ContractPaymentController::class, 'update'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::delete('/contracts/{contract}/payments/{payment}', [ContractPaymentController::class, 'destroy'])
            ->middleware('role:admin,administrator,ke_toan');

        Route::get('/contracts/{contract}/costs', [ContractCostController::class, 'index'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::post('/contracts/{contract}/costs', [ContractCostController::class, 'store'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::put('/contracts/{contract}/costs/{cost}', [ContractCostController::class, 'update'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::delete('/contracts/{contract}/costs/{cost}', [ContractCostController::class, 'destroy'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::get('/contracts/{contract}/finance-requests', [ContractFinanceRequestController::class, 'index'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::post('/contracts/{contract}/finance-requests/{financeRequest}/approve', [ContractFinanceRequestController::class, 'approve'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::post('/contracts/{contract}/finance-requests/{financeRequest}/reject', [ContractFinanceRequestController::class, 'reject'])
            ->middleware('role:admin,administrator,ke_toan');

        Route::get('/opportunities', [OpportunityController::class, 'index'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien');
        Route::post('/opportunities', [OpportunityController::class, 'store'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien');
        Route::get('/opportunities/{opportunity}', [OpportunityController::class, 'show'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien');
        Route::put('/opportunities/{opportunity}', [OpportunityController::class, 'update'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien');
        Route::delete('/opportunities/{opportunity}', [OpportunityController::class, 'destroy'])
            ->middleware('role:admin,administrator');
        Route::get('/opportunity-statuses', [OpportunityStatusController::class, 'index'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien');
        Route::post('/opportunity-statuses', [OpportunityStatusController::class, 'store'])
            ->middleware('role:admin,administrator');
        Route::put('/opportunity-statuses/{opportunityStatus}', [OpportunityStatusController::class, 'update'])
            ->middleware('role:admin,administrator');
        Route::delete('/opportunity-statuses/{opportunityStatus}', [OpportunityStatusController::class, 'destroy'])
            ->middleware('role:admin,administrator');

        Route::get('/products', [ProductController::class, 'index'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::get('/product-categories', [ProductCategoryController::class, 'index'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::post('/products', [ProductController::class, 'store'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::post('/product-categories', [ProductCategoryController::class, 'store'])
            ->middleware('role:admin,administrator');
        Route::get('/products/{product}', [ProductController::class, 'show']);
        Route::put('/products/{product}', [ProductController::class, 'update'])
            ->middleware('role:admin,administrator,ke_toan');
        Route::put('/product-categories/{productCategory}', [ProductCategoryController::class, 'update'])
            ->middleware('role:admin,administrator');
        Route::delete('/products/{product}', [ProductController::class, 'destroy'])
            ->middleware('role:admin,administrator');
        Route::delete('/product-categories/{productCategory}', [ProductCategoryController::class, 'destroy'])
            ->middleware('role:admin,administrator');

        Route::get('/lead-types', [LeadTypeController::class, 'index']);
        Route::post('/lead-types', [LeadTypeController::class, 'store'])->middleware('role:admin');
        Route::put('/lead-types/{leadType}', [LeadTypeController::class, 'update'])->middleware('role:admin');
        Route::delete('/lead-types/{leadType}', [LeadTypeController::class, 'destroy'])->middleware('role:admin');

        Route::get('/revenue-tiers', [RevenueTierController::class, 'index']);
        Route::post('/revenue-tiers', [RevenueTierController::class, 'store'])->middleware('role:admin');
        Route::put('/revenue-tiers/{revenueTier}', [RevenueTierController::class, 'update'])->middleware('role:admin');
        Route::delete('/revenue-tiers/{revenueTier}', [RevenueTierController::class, 'destroy'])->middleware('role:admin');

        Route::get('/lead-forms', [LeadFormController::class, 'index'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::post('/lead-forms', [LeadFormController::class, 'store'])
            ->middleware('role:admin,administrator');
        Route::put('/lead-forms/{leadForm}', [LeadFormController::class, 'update'])
            ->middleware('role:admin,administrator');
        Route::delete('/lead-forms/{leadForm}', [LeadFormController::class, 'destroy'])
            ->middleware('role:admin,administrator');
        Route::post('/lead-forms/{leadForm}/duplicate', [LeadFormController::class, 'duplicate'])
            ->middleware('role:admin,administrator');

        Route::post('/imports/clients', [ImportController::class, 'importClients'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien');
        Route::post('/imports/client-pool', [ImportController::class, 'importRotationPoolClients'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien');
        Route::get('/imports/jobs/{dataTransferJob}', [ImportController::class, 'showImportJob'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::post('/exports/clients', [ImportController::class, 'queueClientExport'])
            ->middleware('role:admin,administrator');
        Route::get('/exports/clients/jobs/{dataTransferJob}/download', [ImportController::class, 'downloadClientExport'])
            ->middleware('role:admin,administrator');
        Route::get('/imports/clients/template', [ImportController::class, 'downloadClientsTemplate'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien');
        Route::get('/imports/client-pool/template', [ImportController::class, 'downloadRotationPoolClientsTemplate'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien');
        Route::post('/imports/contracts', [ImportController::class, 'importContracts'])
            ->middleware('role:admin,quan_ly,nhan_vien,ke_toan');
        Route::get('/imports/contracts/template', [ImportController::class, 'downloadContractsTemplate'])
            ->middleware('role:admin,quan_ly,nhan_vien,ke_toan');
        Route::post('/imports/tasks', [ImportController::class, 'importTasks'])
            ->middleware('role:admin,quan_ly');
        Route::get('/imports/tasks/template', [ImportController::class, 'downloadTasksTemplate'])
            ->middleware('role:admin,quan_ly');
        Route::post('/imports/users', [ImportController::class, 'importUsers'])
            ->middleware('role:admin');
        Route::get('/imports/users/template', [ImportController::class, 'downloadUsersTemplate'])
            ->middleware('role:admin');

        Route::get('/facebook/pages', [FacebookPageController::class, 'index'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::post('/facebook/pages/sync', [FacebookPageController::class, 'sync'])
            ->middleware('role:admin,administrator');
        Route::put('/facebook/pages/{page}', [FacebookPageController::class, 'update'])
            ->middleware('role:admin,administrator');
        Route::post('/facebook/pages/{page}/subscribe', [FacebookPageController::class, 'subscribe'])
            ->middleware('role:admin,administrator');
        Route::post('/facebook/pages/{page}/unsubscribe', [FacebookPageController::class, 'unsubscribe'])
            ->middleware('role:admin,administrator');

        Route::get('/departments', [DepartmentController::class, 'index'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
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
            ->middleware('role:admin');
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

        Route::get('/workflow-topics', [WorkflowTopicController::class, 'index'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien');
        Route::post('/workflow-topics', [WorkflowTopicController::class, 'store'])
            ->middleware('role:admin,administrator,quan_ly');
        Route::put('/workflow-topics/{workflowTopic}', [WorkflowTopicController::class, 'update'])
            ->middleware('role:admin,administrator,quan_ly');
        Route::delete('/workflow-topics/{workflowTopic}', [WorkflowTopicController::class, 'destroy'])
            ->middleware('role:admin,administrator');

        Route::get('/notifications/in-app', [NotificationCenterController::class, 'index']);
        Route::post('/notifications/in-app/read', [NotificationCenterController::class, 'markRead']);
        Route::post('/notifications/in-app/read-all', [NotificationCenterController::class, 'markAllRead']);
        Route::post('/notifications/in-app/clear-read', [NotificationCenterController::class, 'clearRead']);

        Route::get('/chatbot/messages', [ChatbotController::class, 'index'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::post('/chatbot/messages', [ChatbotController::class, 'store'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::get('/chatbot/bots', [ChatbotController::class, 'bots'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::get('/chatbot/bots/manage', [ChatbotController::class, 'manageBots'])
            ->middleware('role:administrator');
        Route::post('/chatbot/models', [ChatbotController::class, 'models'])
            ->middleware('role:administrator');
        Route::post('/chatbot/bots', [ChatbotController::class, 'storeBot'])
            ->middleware('role:administrator');
        Route::put('/chatbot/bots/{bot}', [ChatbotController::class, 'updateBot'])
            ->middleware('role:administrator');
        Route::delete('/chatbot/bots/{bot}', [ChatbotController::class, 'destroyBot'])
            ->middleware('role:administrator');
        Route::put('/chatbot/messages/{message}', [ChatbotController::class, 'updateQueued'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::delete('/chatbot/messages/{message}', [ChatbotController::class, 'destroyQueued'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::post('/chatbot/stop', [ChatbotController::class, 'stop'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
        Route::get('/chatbot/history', [ChatbotController::class, 'history'])
            ->middleware('role:admin,administrator,quan_ly,nhan_vien,ke_toan');
    });
});
