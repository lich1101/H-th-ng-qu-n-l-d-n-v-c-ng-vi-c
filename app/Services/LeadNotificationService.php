<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\Client;
use App\Models\LeadForm;
use App\Models\User;

class LeadNotificationService
{
    private $notifier;

    public function __construct(NotificationService $notifier)
    {
        $this->notifier = $notifier;
    }

    public function notifyNewLead(Client $client, ?string $sourceLabel = null, bool $afterResponse = true): void
    {
        $setting = AppSetting::query()->first();
        if ($setting && $setting->lead_capture_notification_enabled === false) {
            return;
        }

        $client->loadMissing(['assignedStaff.departmentRelation.manager']);
        $responsible = $client->assignedStaff;
        $manager = optional(optional($responsible)->departmentRelation)->manager;
        $adminIds = User::query()
            ->whereIn('role', ['admin', 'administrator'])
            ->where('is_active', true)
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->all();

        $userIds = $adminIds;
        if ($responsible && $responsible->id) {
            $userIds[] = (int) $responsible->id;
        }
        if ($manager && $manager->id && $manager->is_active) {
            $userIds[] = (int) $manager->id;
        }
        $userIds = array_values(array_unique(array_filter($userIds)));
        if (empty($userIds)) {
            return;
        }

        $source = $sourceLabel ?: $this->makeSourceLabel($client);
        $customerName = trim((string) ($client->name ?: 'Khách hàng mới'));
        $phone = trim((string) ($client->phone ?: 'Chưa có SĐT'));
        $responsibleName = $responsible
            ? trim((string) $responsible->name)
            : 'Chưa phân công';

        $body = sprintf(
            '%s • %s • Nguồn: %s • Phụ trách: %s',
            $customerName,
            $phone,
            $source,
            $responsibleName
        );

        $leadFormId = $this->resolveLeadFormId($client);
        $payload = [
            'type' => $leadFormId ? 'lead_form_new_lead' : 'crm_new_lead',
            'category' => 'crm_realtime',
            'client_id' => (int) $client->id,
            'responsible_user_id' => $responsible ? (int) $responsible->id : null,
            'source_label' => $source,
        ];
        if ($leadFormId) {
            $payload['lead_form_id'] = $leadFormId;
        }

        if ($afterResponse) {
            $this->notifier->notifyUsersAfterResponse(
                $userIds,
                'Khách hàng mới',
                $body,
                $payload
            );
            return;
        }

        $this->notifier->notifyUsers(
            $userIds,
            'Khách hàng mới',
            $body,
            $payload
        );
    }

    /**
     * Trùng SĐT từ form công khai / fanpage: đã gộp tên — báo admin + người phụ trách (và quản lý phòng nếu có).
     */
    public function notifyPhoneDuplicateMerged(
        Client $client,
        string $submittedName,
        string $sourceLabel,
        ?int $formAssignedStaffId = null,
        bool $afterResponse = true
    ): void {
        $setting = AppSetting::query()->first();
        if ($setting && $setting->lead_capture_notification_enabled === false) {
            return;
        }

        $client->loadMissing(['assignedStaff.departmentRelation.manager']);
        $adminIds = User::query()
            ->whereIn('role', ['admin', 'administrator'])
            ->where('is_active', true)
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->all();

        $userIds = $adminIds;
        $responsible = $client->assignedStaff;
        if ($responsible && $responsible->id) {
            $userIds[] = (int) $responsible->id;
        }
        if ($formAssignedStaffId) {
            $userIds[] = (int) $formAssignedStaffId;
        }
        $manager = optional(optional($responsible)->departmentRelation)->manager;
        if ($manager && $manager->id && $manager->is_active) {
            $userIds[] = (int) $manager->id;
        }
        $userIds = array_values(array_unique(array_filter($userIds)));
        if (empty($userIds)) {
            return;
        }

        $mergedName = trim((string) ($client->name ?: ''));
        $phone = trim((string) ($client->phone ?: 'Chưa có SĐT'));
        $body = sprintf(
            'Trùng số điện thoại — đã gộp tên gửi lên ("%s") với hồ sơ #%d. Tên sau gộp: %s • SĐT: %s • Nguồn: %s',
            trim($submittedName),
            (int) $client->id,
            $mergedName !== '' ? $mergedName : '(trống)',
            $phone,
            $sourceLabel
        );

        $payload = [
            'type' => 'crm_phone_duplicate_merged',
            'category' => 'crm_realtime',
            'client_id' => (int) $client->id,
            'source_label' => $sourceLabel,
        ];

        if ($afterResponse) {
            $this->notifier->notifyUsersAfterResponse(
                $userIds,
                'Trùng SĐT — đã gộp tên khách hàng',
                $body,
                $payload
            );

            return;
        }

        $this->notifier->notifyUsers(
            $userIds,
            'Trùng SĐT — đã gộp tên khách hàng',
            $body,
            $payload
        );
    }

    public function makeSourceLabel(Client $client): string
    {
        $source = trim((string) ($client->lead_source ?: 'crm'));
        $channel = trim((string) ($client->lead_channel ?: ''));

        if ($source === 'lead_form') {
            return $channel !== '' ? 'Form: '.$channel : 'Form tư vấn';
        }
        if ($source === 'page_message') {
            return $channel !== '' ? 'Page: '.$channel : 'Facebook Page';
        }
        if ($source === 'manual_entry') {
            return 'Nhân viên thêm thủ công';
        }

        if ($channel !== '') {
            return $source.' / '.$channel;
        }

        return $source !== '' ? $source : 'CRM';
    }

    /**
     * Gắn id form tư vấn khi khách gửi từ form công khai (lead_channel dạng iframe:slug).
     */
    private function resolveLeadFormId(Client $client): ?int
    {
        if (trim((string) ($client->lead_source ?? '')) !== 'lead_form') {
            return null;
        }
        $channel = trim((string) ($client->lead_channel ?? ''));
        if ($channel === '') {
            return null;
        }
        $slug = null;
        if (preg_match('/^iframe:(.+)$/i', $channel, $m)) {
            $slug = trim((string) ($m[1]));
        } else {
            $slug = $channel;
        }
        if ($slug === '') {
            return null;
        }
        $id = LeadForm::query()->where('slug', $slug)->value('id');

        return $id ? (int) $id : null;
    }
}
