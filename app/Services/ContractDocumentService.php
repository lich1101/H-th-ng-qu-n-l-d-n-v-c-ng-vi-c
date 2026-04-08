<?php

namespace App\Services;

use App\Models\Contract;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use PhpOffice\PhpWord\Exception\Exception as PhpWordException;
use PhpOffice\PhpWord\TemplateProcessor;
use RuntimeException;

class ContractDocumentService
{
    /**
     * Thứ tự ưu tiên: cùng tên với route GET /tai-mau-hop-dong (web.php),
     * sau đó bản v2 nếu deploy riêng. Chỉ cần một trong hai file tồn tại trên server.
     *
     * @var list<string>
     */
    private const TEMPLATE_RELATIVE_CANDIDATES = [
        'templates/contracts/contract-template-basic-an-phat-379.docx',
        'templates/contracts/contract-template-basic-an-phat-379-template-v2.docx',
    ];

    /**
     * Các macro tên cũ (${service_name}, ${progress_label}, …) dùng cho đoạn mô tả (vd. Điều 2):
     * luôn để dòng chấm để ký nháy điền tay — không chèn dữ liệu CRM.
     * Dữ liệu thật nằm ở macro data_* và bảng item_* / tiền.
     */
    private function narrativeFieldDots(): array
    {
        return [
            'service_name' => $this->orDots('', 'xl'),
            'service_name_inline' => $this->orDots('', 'xl'),
            'progress_label' => $this->orDots('', 'm'),
            'website_host' => $this->orDots('', 'xxl'),
            'deployment_range' => $this->orDots('', 'xl'),
        ];
    }

    public function generate(Contract $contract, ?array $companyProfile = null): array
    {
        $templatePath = $this->resolveTemplatePath();

        $tmpDir = storage_path('app/tmp/contracts');
        if (! is_dir($tmpDir) && ! mkdir($tmpDir, 0755, true) && ! is_dir($tmpDir)) {
            throw new RuntimeException('Không tạo được thư mục tạm để xuất hợp đồng.');
        }

        $outputName = $this->buildOutputName($contract);
        $outputPath = $tmpDir . '/' . Str::uuid()->toString() . '.docx';

        $template = new TemplateProcessor($templatePath);
        $this->fillStaticContent($template, $contract, $companyProfile);
        $this->fillPricingRows($template, $contract);
        $template->saveAs($outputPath);

        return [
            'path' => $outputPath,
            'filename' => $outputName,
        ];
    }

    private function resolveTemplatePath(): string
    {
        foreach (self::TEMPLATE_RELATIVE_CANDIDATES as $relative) {
            $path = public_path($relative);
            if (file_exists($path)) {
                return $path;
            }
        }

        throw new RuntimeException(
            'Không tìm thấy file mẫu hợp đồng .docx. Đặt một trong các file vào public/templates/contracts/: '
            . implode(', ', self::TEMPLATE_RELATIVE_CANDIDATES)
        );
    }

    private function fillStaticContent(TemplateProcessor $template, Contract $contract, ?array $companyProfile = null): void
    {
        $project = $contract->project ?: $contract->linkedProject;
        $signedAt = $contract->signed_at ? Carbon::parse((string) $contract->signed_at) : null;
        $startDate = $contract->start_date ? Carbon::parse((string) $contract->start_date) : null;
        $endDate = $contract->end_date ? Carbon::parse((string) $contract->end_date) : null;

        $serviceName = $this->resolveServiceName($contract);
        $website = $this->resolveWebsite($project);
        $fin = $this->resolveExportFinancials($contract);
        $subtotal = $fin['subtotal'];
        $vatAmount = $fin['vat_amount'];
        $total = $fin['total'];
        $amountWords = $this->numberToVietnameseWords($total);
        $vatLabel = $this->resolveVatLabel($contract);
        $profile = is_array($companyProfile) ? $companyProfile : [];
        $legalCompanyName = trim((string) data_get($profile, 'company_name', ''));
        $legalRepresentative = trim((string) data_get($profile, 'representative', ''));
        $legalPosition = trim((string) data_get($profile, 'position', ''));
        $legalAddress = trim((string) data_get($profile, 'address', ''));
        $legalTaxCode = trim((string) data_get($profile, 'tax_code', ''));
        $progressLabel = $this->resolveProgressLabel($startDate, $endDate);
        $deploymentRange = $this->resolveDeploymentRange($startDate, $endDate);

        $template->setValues(array_merge($this->narrativeFieldDots(), [
            'contract_code' => $this->orDots(trim((string) ($contract->code ?? '')), 'm'),
            'signed_day' => $signedAt ? $signedAt->format('d') : $this->orDots('', 'xs'),
            'signed_month' => $signedAt ? $signedAt->format('m') : $this->orDots('', 'xs'),
            'signed_year' => $signedAt ? $signedAt->format('Y') : $this->orDots('', 's'),
            // Giá trị từ CRM (dùng trong mẫu Word tại bảng giá / phụ lục — đặt ${data_service_name} v.v., không dùng trong đoạn Điều 2 nếu muốn chỉ đề mục)
            'data_service_name' => $this->orDots($serviceName, 'xl'),
            'data_progress_label' => $this->orDots($progressLabel, 'm'),
            'data_website_host' => $this->orDots($website, 'xxl'),
            'data_deployment_range' => $this->orDots($deploymentRange, 'xl'),
            'legal_company_name' => $this->orDots($legalCompanyName, 'xl'),
            'legal_representative' => $this->orDots($legalRepresentative, 'l'),
            'legal_position' => $this->orDots($legalPosition, 'm'),
            'legal_address' => $this->orDots($legalAddress, 'xxl'),
            'legal_tax_code' => $this->orDots($legalTaxCode, 's'),
            'vat_label' => $this->orDots($vatLabel, 's'),
            'subtotal_amount' => $this->formatCurrency($subtotal),
            'vat_amount' => $this->formatCurrency($vatAmount),
            'total_amount' => $this->formatCurrency($total),
            'amount_words' => $amountWords,
            'amount_words_inline' => $amountWords,
        ]));
    }

    /**
     * Chuỗi trống → dấu chấm với độ dài gợi ý chỗ điền tay; có dữ liệu → giữ nguyên.
     *
     * @param  non-empty-string  $size  xxs|xs|s|m|l|xl|xxl|money|qty
     */
    private function orDots(?string $value, string $size = 'm'): string
    {
        $t = trim((string) ($value ?? ''));
        if ($t !== '') {
            return $t;
        }

        return match ($size) {
            'xxs' => str_repeat('.', 6),
            'xs' => str_repeat('.', 10),
            's' => str_repeat('.', 18),
            'm' => str_repeat('.', 28),
            'l' => str_repeat('.', 42),
            'xl' => str_repeat('.', 56),
            'xxl' => str_repeat('.', 72),
            'money' => str_repeat('.', 24),
            'qty' => str_repeat('.', 12),
            default => str_repeat('.', 28),
        };
    }

    /**
     * Tên dịch vụ / hợp đồng: chỉ từ DB, không chèn chữ mặc định.
     */
    private function resolveServiceName(Contract $contract): string
    {
        $fromItem = trim((string) ($contract->items->first()->product_name ?? ''));
        if ($fromItem !== '') {
            return $fromItem;
        }

        return trim((string) ($contract->title ?? ''));
    }

    /**
     * Tiền xuất Word khớp với tổng dòng hàng + VAT (accessor), tránh lệch với màn hình khi cột contracts.value / vat_amount trong DB chưa đồng bộ.
     *
     * @return array{subtotal: float, vat_amount: float, total: float}
     */
    private function resolveExportFinancials(Contract $contract): array
    {
        $subtotal = (float) $contract->subtotal_value;
        $vatAmount = (float) $contract->resolved_vat_amount;
        $total = $subtotal + $vatAmount;

        return [
            'subtotal' => $subtotal,
            'vat_amount' => $vatAmount,
            'total' => $total,
        ];
    }

    private function fillPricingRows(TemplateProcessor $template, Contract $contract): void
    {
        $fin = $this->resolveExportFinancials($contract);
        $itemRows = $contract->items->isNotEmpty()
            ? $contract->items->values()->all()
            : $this->syntheticItemRowWhenNoLines($contract, $fin);

        $duration = $this->resolveItemDuration($contract);
        $rows = [];
        foreach ($itemRows as $index => $item) {
            $rows[] = [
                'item_no' => (string) ($index + 1),
                'item_name' => $this->orDots(trim((string) ($item->product_name ?? '')), 'xl'),
                'item_qty' => $this->formatQuantityForExport($item->quantity ?? null),
                'item_duration' => $this->orDots($duration, 'm'),
                'item_unit_price' => $this->formatCurrencyOrDots($item->unit_price ?? null),
                'item_total' => $this->formatCurrencyOrDots($item->total_price ?? null),
            ];
        }

        try {
            $template->cloneRowAndSetValues('item_no', $rows);
        } catch (PhpWordException $e) {
            Log::warning('contract.document.pricing_clone_row_failed', [
                'message' => $e->getMessage(),
                'hint' => 'Mẫu Word cần ô ${item_no} trong một dòng bảng để nhân dòng, hoặc placeholder ${pricing_items_block}/${items_detail} cho danh sách dạng văn bản.',
            ]);
            $this->fillPricingRowsWithoutTableClone($template, $rows);
        }
    }

    /**
     * Dùng khi mẫu .docx không có ${item_no} (cloneRow lỗi). Đổ nội dung vào các macro tùy chọn:
     * ${pricing_items_block}, ${items_detail} — hoặc ${item_1_name}…${item_15_*} cho bảng tĩnh.
     *
     * @param  array<int, array<string, string>>  $rows
     */
    private function fillPricingRowsWithoutTableClone(TemplateProcessor $template, array $rows): void
    {
        $lines = [];
        foreach ($rows as $r) {
            $lines[] = sprintf(
                '%s. %s | SL: %s | Thời hạn: %s | Đơn giá: %s đ | Thành tiền: %s đ',
                $r['item_no'],
                $r['item_name'],
                $r['item_qty'],
                $r['item_duration'],
                $r['item_unit_price'],
                $r['item_total']
            );
        }

        $block = implode("\n", $lines);
        $values = [
            'pricing_items_block' => $block,
            'items_detail' => $block,
        ];

        foreach (array_slice($rows, 0, 15) as $i => $r) {
            $n = $i + 1;
            $values['item_'.$n.'_no'] = $r['item_no'];
            $values['item_'.$n.'_name'] = $r['item_name'];
            $values['item_'.$n.'_qty'] = $r['item_qty'];
            $values['item_'.$n.'_duration'] = $r['item_duration'];
            $values['item_'.$n.'_unit_price'] = $r['item_unit_price'];
            $values['item_'.$n.'_total'] = $r['item_total'];
        }

        $template->setValues($values);
    }

    /**
     * @return list<object>
     */
    private function syntheticItemRowWhenNoLines(Contract $contract, array $fin): array
    {
        $title = trim((string) ($contract->title ?? ''));
        if ($title === '' && (float) ($fin['subtotal'] ?? 0) <= 0) {
            return [(object) [
                'product_name' => '',
                'quantity' => null,
                'unit_price' => null,
                'total_price' => null,
            ]];
        }

        return [(object) [
            'product_name' => $title,
            'quantity' => 1,
            'unit_price' => $fin['subtotal'],
            'total_price' => $fin['subtotal'],
        ]];
    }

    private function formatQuantityForExport($quantity): string
    {
        if ($quantity === null || $quantity === '') {
            return $this->orDots('', 'qty');
        }

        $q = (int) $quantity;

        return $q > 0 ? (string) $q : $this->orDots('', 'qty');
    }

    private function formatCurrencyOrDots($value): string
    {
        if ($value === null || $value === '') {
            return $this->orDots('', 'money');
        }

        return $this->formatCurrency((float) $value);
    }

    private function resolveProgressLabel(?Carbon $startDate, ?Carbon $endDate): string
    {
        if ($startDate === null || $endDate === null) {
            return '';
        }

        $days = max(1, $startDate->diffInDays($endDate) + 1);

        return $days . ' ngày';
    }

    private function resolveDeploymentRange(?Carbon $startDate, ?Carbon $endDate): string
    {
        if ($startDate === null) {
            return '';
        }

        if ($endDate === null) {
            return 'Từ ngày '.$startDate->format('d/m/Y');
        }

        return 'Từ ngày '.$startDate->format('d/m/Y').' đến ngày '.$endDate->format('d/m/Y');
    }

    private function resolveItemDuration(Contract $contract): string
    {
        $durationMonths = (int) ($contract->duration_months ?? 0);
        if ($durationMonths > 0) {
            return $durationMonths . ' tháng';
        }

        if ($contract->start_date && $contract->end_date) {
            $startDate = Carbon::parse((string) $contract->start_date);
            $endDate = Carbon::parse((string) $contract->end_date);
            $days = max(1, $startDate->diffInDays($endDate) + 1);

            return $days . ' ngày';
        }

        return '';
    }

    private function resolveWebsite($project): string
    {
        $websiteUrl = trim((string) data_get($project, 'website_url', ''));
        if ($websiteUrl === '') {
            return '';
        }

        $host = parse_url($websiteUrl, PHP_URL_HOST);

        return $host ? (string) $host : $websiteUrl;
    }

    private function resolveVatLabel(Contract $contract): string
    {
        if (! $contract->vat_enabled) {
            return '';
        }

        if (($contract->vat_mode ?? '') === 'percent' && $contract->vat_rate !== null) {
            $rate = rtrim(rtrim(number_format((float) $contract->vat_rate, 2, '.', ''), '0'), '.');

            return 'VAT ('.$rate.'%)';
        }

        return 'VAT';
    }

    private function formatCurrency(float $value): string
    {
        return number_format(round($value), 0, ',', '.');
    }

    private function buildOutputName(Contract $contract): string
    {
        $base = $contract->code ?: ('hop-dong-' . $contract->id);
        return Str::slug($base) . '.docx';
    }

    private function numberToVietnameseWords(float $number): string
    {
        $number = (int) round($number);
        if ($number <= 0) {
            return 'Không đồng';
        }

        $units = ['', ' nghìn', ' triệu', ' tỷ', ' nghìn tỷ', ' triệu tỷ'];
        $parts = [];
        $unitIndex = 0;

        while ($number > 0) {
            $chunk = $number % 1000;
            if ($chunk > 0) {
                $parts[] = $this->readThreeDigits($chunk, ! empty($parts)) . $units[$unitIndex];
            }
            $number = intdiv($number, 1000);
            $unitIndex++;
        }

        $text = trim(implode(' ', array_reverse(array_filter($parts))));
        $text = preg_replace('/\s+/u', ' ', $text) ?: '';

        return Str::ucfirst(trim($text)) . ' đồng';
    }

    private function readThreeDigits(int $number, bool $full): string
    {
        $digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
        $hundreds = intdiv($number, 100);
        $tens = intdiv($number % 100, 10);
        $ones = $number % 10;
        $result = '';

        if ($full || $hundreds > 0) {
            $result .= $digits[$hundreds] . ' trăm';
            if ($tens === 0 && $ones > 0) {
                $result .= ' lẻ';
            }
        }

        if ($tens > 1) {
            $result .= ' ' . $digits[$tens] . ' mươi';
            if ($ones === 1) {
                $result .= ' mốt';
            } elseif ($ones === 5) {
                $result .= ' lăm';
            } elseif ($ones > 0) {
                $result .= ' ' . $digits[$ones];
            }
        } elseif ($tens === 1) {
            $result .= ' mười';
            if ($ones === 5) {
                $result .= ' lăm';
            } elseif ($ones > 0) {
                $result .= ' ' . $digits[$ones];
            }
        } elseif ($ones > 0 && ($hundreds > 0 || $full)) {
            $result .= ' ' . ($ones === 5 ? 'năm' : $digits[$ones]);
        } elseif ($ones > 0) {
            $result .= $digits[$ones];
        }

        return trim($result);
    }
}
