<?php

namespace App\Services;

use App\Models\Contract;
use App\Models\ContractActivityLog;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class ContractActivityLogService
{
    /**
     * Ghi nhận thao tác trên hợp đồng đã duyệt (chỉ khi approval_status = approved tại thời điểm gọi).
     */
    public function logIfApproved(Contract $contract, User $user, string $summary, ?array $meta = null): void
    {
        if (($contract->approval_status ?? '') !== 'approved') {
            return;
        }

        ContractActivityLog::query()->create([
            'contract_id' => $contract->id,
            'user_id' => $user->id,
            'summary' => $summary,
            'meta' => $meta,
        ]);
    }

    /**
     * So sánh trước/sau khi lưu form hợp đồng (chỉ khi $wasApproved).
     */
    public function logContractFormChanges(
        User $user,
        Contract $before,
        Contract $after,
        bool $itemsSynced,
        bool $careStaffChanged
    ): void {
        if (($before->approval_status ?? '') !== 'approved') {
            return;
        }

        $parts = $this->describeScalarChanges($before, $after);

        if ($careStaffChanged) {
            $parts[] = 'cập nhật nhóm nhân sự chăm sóc';
        }

        if ($itemsSynced) {
            $parts[] = 'cập nhật danh sách dòng hàng (sản phẩm/dịch vụ)';
        }

        if ($parts === []) {
            return;
        }

        $name = $user->name ?? 'Người dùng';
        $summary = $name.' đã sửa: '.implode('; ', $parts);

        $this->logIfApproved($after, $user, $summary, ['type' => 'contract_update']);
    }

    /**
     * @return list<string>
     */
    private function describeScalarChanges(Contract $before, Contract $after): array
    {
        $keys = [
            'title' => 'tiêu đề',
            'code' => 'mã',
            'client_id' => 'khách hàng (ID)',
            'opportunity_id' => 'cơ hội',
            'project_id' => 'dự án',
            'value' => 'giá trị',
            'subtotal_value' => 'tạm tính',
            'vat_enabled' => 'VAT bật/tắt',
            'vat_mode' => 'kiểu VAT',
            'vat_rate' => '% VAT',
            'vat_amount' => 'tiền VAT',
            'payment_times' => 'số đợt thanh toán',
            'signed_at' => 'ngày ký',
            'start_date' => 'ngày bắt đầu hiệu lực',
            'end_date' => 'ngày kết thúc hiệu lực',
            'notes' => 'ghi chú',
            'collector_user_id' => 'nhân viên thu',
            'care_schedule' => 'lịch chăm sóc',
            'contract_type' => 'loại hợp đồng',
            'duration_months' => 'thời hạn (tháng)',
            'payment_cycle' => 'chu kỳ thanh toán',
            'handover_receive_status' => 'trạng thái bàn giao',
        ];

        $parts = [];
        foreach ($keys as $attr => $label) {
            if (! array_key_exists($attr, $before->getAttributes()) && ! array_key_exists($attr, $after->getAttributes())) {
                continue;
            }
            $b = $before->getAttribute($attr);
            $a = $after->getAttribute($attr);
            if ($this->valuesEqual($b, $a)) {
                continue;
            }
            $parts[] = $label.': «'.$this->formatValue($b).'» → «'.$this->formatValue($a).'»';
        }

        return $parts;
    }

    private function valuesEqual(mixed $b, mixed $a): bool
    {
        if ($b instanceof Carbon && $a instanceof Carbon) {
            return $b->toDateString() === $a->toDateString();
        }
        if ($b instanceof Carbon || $a instanceof Carbon) {
            $b = $b instanceof Carbon ? $b->toDateString() : $b;
            $a = $a instanceof Carbon ? $a->toDateString() : $a;
        }

        if (is_numeric($b) && is_numeric($a)) {
            return abs((float) $b - (float) $a) < 0.005;
        }

        return (string) json_encode($b) === (string) json_encode($a);
    }

    private function formatValue(mixed $v): string
    {
        if ($v === null || $v === '') {
            return '—';
        }
        if ($v instanceof Carbon) {
            return $v->format('d/m/Y');
        }
        if (is_bool($v)) {
            return $v ? 'có' : 'không';
        }
        if (is_float($v) || is_int($v)) {
            return is_float($v)
                ? number_format($v, 0, ',', '.')
                : (string) $v;
        }

        return Str::limit((string) $v, 120);
    }
}
