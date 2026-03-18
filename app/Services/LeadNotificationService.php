<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\Client;
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

        $client->loadMissing(['assignedStaff']);
        $responsible = $client->assignedStaff;
        $adminIds = User::query()
            ->where('role', 'admin')
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

        $payload = [
            'type' => 'crm_new_lead',
            'category' => 'crm_realtime',
            'client_id' => (int) $client->id,
            'responsible_user_id' => $responsible ? (int) $responsible->id : null,
            'source_label' => $source,
        ];

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
}
