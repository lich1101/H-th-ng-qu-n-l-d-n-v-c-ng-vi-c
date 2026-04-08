<?php

namespace App\Console\Commands;

use App\Models\AppSetting;
use App\Models\Contract;
use App\Models\ContractReminderLog;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class SendContractReminders extends Command
{
    protected $signature = 'contracts:send-reminders';
    protected $description = 'Gửi nhắc nợ và nhắc hết hạn hợp đồng cho admin và nhân sự phụ trách.';

    public function handle(): int
    {
        $now = Carbon::now('Asia/Ho_Chi_Minh');
        $today = $now->copy()->startOfDay();
        $setting = AppSetting::query()->first();
        $defaults = AppSetting::defaults();

        if ($this->matchesTime($now, $setting ? $setting->contract_unpaid_reminder_time : $defaults['contract_unpaid_reminder_time'])) {
            if (! $setting || $setting->contract_unpaid_reminder_enabled !== false) {
                $this->sendUnpaidReminders($today);
            }
        }

        if ($this->matchesTime($now, $setting ? $setting->contract_expiry_reminder_time : $defaults['contract_expiry_reminder_time'])) {
            if (! $setting || $setting->contract_expiry_reminder_enabled !== false) {
                $daysBefore = $setting
                    ? (int) ($setting->contract_expiry_reminder_days_before ?? $defaults['contract_expiry_reminder_days_before'])
                    : (int) $defaults['contract_expiry_reminder_days_before'];
                $this->sendExpiryReminders($today, max(1, $daysBefore));
            }
        }

        return self::SUCCESS;
    }

    private function sendUnpaidReminders(Carbon $today): void
    {
        $contracts = Contract::query()
            ->with(['client.assignedStaff', 'collector'])
            ->withSum('payments as payments_total', 'amount')
            ->where('approval_status', 'approved')
            ->get();

        $notifier = app(NotificationService::class);
        foreach ($contracts as $contract) {
            $outstanding = max(0, (float) ($contract->value ?? 0) - (float) ($contract->payments_total ?? 0));
            if ($outstanding <= 0) {
                continue;
            }

            $targets = $this->reminderTargets($contract);
            if (empty($targets)) {
                continue;
            }

            $body = sprintf(
                '%s • Cần thanh toán thêm %s • Phụ trách: %s',
                (string) $contract->title,
                number_format($outstanding, 0, ',', '.').' VNĐ',
                $this->collectorName($contract)
            );

            foreach ($targets as $userId) {
                if ($this->alreadySent($contract->id, $userId, 'contract_unpaid', $today)) {
                    continue;
                }

                $notifier->notifyUsers(
                    [$userId],
                    'Hợp đồng cần thanh toán thêm',
                    $body,
                    [
                        'type' => 'contract_unpaid_reminder',
                        'category' => 'crm_realtime',
                        'contract_id' => (int) $contract->id,
                        'outstanding_amount' => $outstanding,
                    ]
                );

                ContractReminderLog::create([
                    'contract_id' => (int) $contract->id,
                    'user_id' => (int) $userId,
                    'reminder_type' => 'contract_unpaid',
                    'reminder_date' => $today->toDateString(),
                ]);
            }
        }
    }

    private function sendExpiryReminders(Carbon $today, int $daysBefore): void
    {
        $endLimit = $today->copy()->addDays($daysBefore)->endOfDay();
        $contracts = Contract::query()
            ->with(['client.assignedStaff', 'collector'])
            ->withSum('payments as payments_total', 'amount')
            ->where('approval_status', 'approved')
            ->whereNotNull('end_date')
            ->whereBetween('end_date', [$today->toDateString(), $endLimit->toDateString()])
            ->get();

        $notifier = app(NotificationService::class);
        foreach ($contracts as $contract) {
            $endDate = $contract->end_date ? Carbon::parse($contract->end_date) : null;
            if (! $endDate) {
                continue;
            }

            $daysLeft = $today->diffInDays($endDate, false);
            if ($daysLeft < 0 || $daysLeft > $daysBefore) {
                continue;
            }

            $outstanding = max(0, (float) ($contract->value ?? 0) - (float) ($contract->payments_total ?? 0));
            $targets = $this->reminderTargets($contract);
            if (empty($targets)) {
                continue;
            }

            $body = sprintf(
                '%s • Còn %d ngày đến hạn • Cần thanh toán thêm %s • Phụ trách: %s',
                (string) $contract->title,
                (int) $daysLeft,
                number_format($outstanding, 0, ',', '.').' VNĐ',
                $this->collectorName($contract)
            );

            foreach ($targets as $userId) {
                if ($this->alreadySent($contract->id, $userId, 'contract_expiry', $today)) {
                    continue;
                }

                $notifier->notifyUsers(
                    [$userId],
                    'Hợp đồng sắp hết hạn',
                    $body,
                    [
                        'type' => 'contract_expiry_reminder',
                        'category' => 'crm_realtime',
                        'contract_id' => (int) $contract->id,
                        'days_left' => (int) $daysLeft,
                        'outstanding_amount' => $outstanding,
                    ]
                );

                ContractReminderLog::create([
                    'contract_id' => (int) $contract->id,
                    'user_id' => (int) $userId,
                    'reminder_type' => 'contract_expiry',
                    'reminder_date' => $today->toDateString(),
                ]);
            }
        }
    }

    private function reminderTargets(Contract $contract): array
    {
        $adminIds = User::query()
            ->whereIn('role', ['admin', 'administrator'])
            ->where('is_active', true)
            ->pluck('id')
            ->map(function ($id) {
                return (int) $id;
            })
            ->all();

        $collectorId = null;
        if ($contract->collector && $contract->collector->is_active) {
            $collectorId = (int) $contract->collector->id;
        } elseif ($contract->client && $contract->client->assignedStaff && $contract->client->assignedStaff->is_active) {
            $collectorId = (int) $contract->client->assignedStaff->id;
        }

        $targets = $adminIds;
        if ($collectorId) {
            $targets[] = $collectorId;
        }

        return array_values(array_unique(array_filter($targets)));
    }

    private function collectorName(Contract $contract): string
    {
        if ($contract->collector && $contract->collector->name) {
            return (string) $contract->collector->name;
        }
        if ($contract->client && $contract->client->assignedStaff && $contract->client->assignedStaff->name) {
            return (string) $contract->client->assignedStaff->name;
        }

        return 'Chưa phân công';
    }

    private function alreadySent(int $contractId, int $userId, string $type, Carbon $today): bool
    {
        return ContractReminderLog::query()
            ->where('contract_id', $contractId)
            ->where('user_id', $userId)
            ->where('reminder_type', $type)
            ->whereDate('reminder_date', $today->toDateString())
            ->exists();
    }

    private function matchesTime(Carbon $now, ?string $time): bool
    {
        $value = trim((string) $time);
        if (! preg_match('/^\d{2}:\d{2}$/', $value)) {
            return false;
        }

        return $now->format('H:i') === $value;
    }
}
