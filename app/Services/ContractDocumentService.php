<?php

namespace App\Services;

use App\Models\Contract;
use Carbon\Carbon;
use Illuminate\Support\Str;
use RuntimeException;
use ZipArchive;

class ContractDocumentService
{
    private const TEMPLATE_RELATIVE_PATH = 'templates/contracts/contract-template-basic-an-phat-379.docx';

    public function generate(Contract $contract): array
    {
        $templatePath = public_path(self::TEMPLATE_RELATIVE_PATH);
        if (! file_exists($templatePath)) {
            throw new RuntimeException('Không tìm thấy file mẫu hợp đồng .docx.');
        }

        $tmpDir = storage_path('app/tmp/contracts');
        if (! is_dir($tmpDir) && ! mkdir($tmpDir, 0755, true) && ! is_dir($tmpDir)) {
            throw new RuntimeException('Không tạo được thư mục tạm để xuất hợp đồng.');
        }

        $outputName = $this->buildOutputName($contract);
        $outputPath = $tmpDir . '/' . Str::uuid()->toString() . '.docx';
        if (! copy($templatePath, $outputPath)) {
            throw new RuntimeException('Không sao chép được file mẫu hợp đồng.');
        }

        $zip = new ZipArchive();
        if ($zip->open($outputPath) !== true) {
            @unlink($outputPath);
            throw new RuntimeException('Không mở được file hợp đồng tạm.');
        }

        $documentXml = $zip->getFromName('word/document.xml');
        if (! is_string($documentXml) || $documentXml === '') {
            $zip->close();
            @unlink($outputPath);
            throw new RuntimeException('Không đọc được nội dung file hợp đồng mẫu.');
        }

        $documentXml = $this->replacePricingTable($documentXml, $contract);
        $documentXml = $this->replaceStaticContent($documentXml, $contract);

        $zip->addFromString('word/document.xml', $documentXml);
        $zip->close();

        return [
            'path' => $outputPath,
            'filename' => $outputName,
        ];
    }

    private function replaceStaticContent(string $xml, Contract $contract): string
    {
        $client = $contract->client;
        $project = $contract->project ?: $contract->linkedProject;
        $signedAt = $contract->signed_at ? Carbon::parse((string) $contract->signed_at) : Carbon::today();
        $startDate = $contract->start_date ? Carbon::parse((string) $contract->start_date) : $signedAt->copy();
        $endDate = $contract->end_date ? Carbon::parse((string) $contract->end_date) : null;

        $serviceName = trim((string) (($contract->items->first()->product_name ?? '') ?: ($contract->title ?? 'Dịch vụ')));
        $website = $this->resolveWebsite($project);
        $subtotal = (float) ($contract->subtotal_value ?? 0);
        $vatAmount = (float) ($contract->vat_amount ?? 0);
        $total = (float) ($contract->value ?? 0);
        $amountWords = $this->numberToVietnameseWords($total);
        $vatLabel = $this->resolveVatLabel($contract);

        $replacements = [
            'Số:180326HĐKT/AĐT-AP379' => 'Số:' . ($contract->code ?: ('HD-' . $contract->id)),
            'Hôm nay, ngày 18 tháng 03 năm 2026 tại Hà Nội, chúng tôi gồm có:' => sprintf(
                'Hôm nay, ngày %s tháng %s năm %s tại Hà Nội, chúng tôi gồm có:',
                $signedAt->format('d'),
                $signedAt->format('m'),
                $signedAt->format('Y')
            ),
            'CÔNG TY TNHH AN PHÁT 379' => $client->company ?: $client->name ?: '................................',
            'Ông Trần Đăng An' => $client->name ?: '................................',
            'Số 1 Đông Hồ, Phường Hạ Long, Tỉnh Quảng Ninh, Việt Nam' => '................................',
            '5702086504' => '................................',
            '2.2.1. Gói dịch vụ: Dịch vụ Backlink Báo Basic' => '2.2.1. Gói dịch vụ: ' . $serviceName,
            '2.2.2. Tiến độ thực hiện: 7 ngày' => '2.2.2. Tiến độ thực hiện: ' . $this->resolveProgressLabel($startDate, $endDate),
            '2.2.3 Triển khai cho website: ahalong.vn' => '2.2.3 Triển khai cho website: ' . $website,
            '2.2.4. Thời gian triển khai: Từ ngày 18/03/2026 đến ngày 25/3/2026' => '2.2.4. Thời gian triển khai: ' . $this->resolveDeploymentRange($startDate, $endDate),
            'Gói Backlink Báo Basic' => $serviceName,
            'VAT (8%)' => $vatLabel,
            'Bằng chữ : Mười triệu bốn trăm sáu mươi lăm nghìn hai trăm đồng ./.'
                => 'Bằng chữ : ' . $amountWords . ' ./.',
            'Sau khi hợp đồng được ký kết, Bên A thanh toán cho Bên B giá trị hợp đồng, tương ứng với số tiền: 10.465.200 VND (Bằng chữ: Mười triệu bốn trăm sáu mươi lăm nghìn hai trăm đồng ./.)'
                => 'Sau khi hợp đồng được ký kết, Bên A thanh toán cho Bên B giá trị hợp đồng, tương ứng với số tiền: '
                    . $this->formatCurrency($total) . ' VND (Bằng chữ: ' . $amountWords . ' ./.)',
        ];

        foreach ($replacements as $search => $replace) {
            $xml = str_replace($this->escapeXmlText($search), $this->escapeXmlText($replace), $xml);
        }

        if ($subtotal > 0) {
            $xml = str_replace(
                $this->escapeXmlText('Số lượng link sẽ được cung cấp tương ứng với giá trị hợp đồ ng'),
                $this->escapeXmlText('Số lượng link sẽ được cung cấp tương ứng với giá trị hợp đồng'),
                $xml
            );
        }

        return $xml;
    }

    private function replacePricingTable(string $xml, Contract $contract): string
    {
        if (! preg_match('/(<w:tr[\s\S]*?<w:t>1<\/w:t>[\s\S]*?Gói Backlink Báo Basic[\s\S]*?<\/w:tr>)/u', $xml, $itemMatch)) {
            return $xml;
        }
        if (! preg_match('/(<w:tr[\s\S]*?VAT \(8%\)[\s\S]*?<\/w:tr>)/u', $xml, $vatMatch)) {
            return $xml;
        }
        if (! preg_match('/(<w:tr[\s\S]*?Thanh toán[\s\S]*?<\/w:tr>)/u', $xml, $totalMatch)) {
            return $xml;
        }

        $itemTemplate = $itemMatch[1];
        $vatTemplate = $vatMatch[1];
        $totalTemplate = $totalMatch[1];

        $itemRows = $contract->items->isNotEmpty() ? $contract->items->values()->all() : [(object) [
            'product_name' => $contract->title ?: 'Dịch vụ',
            'quantity' => 1,
            'unit_price' => (float) ($contract->subtotal_value ?? $contract->value ?? 0),
            'total_price' => (float) ($contract->subtotal_value ?? $contract->value ?? 0),
        ]];

        $builtRows = [];
        foreach ($itemRows as $index => $item) {
            $rowXml = $itemTemplate;
            $rowXml = preg_replace('/<w:t>1<\/w:t>/u', '<w:t>'.$this->escapeXmlText((string) ($index + 1)).'</w:t>', $rowXml, 1);
            $rowXml = preg_replace('/<w:t>Gói Backlink Báo Basic<\/w:t>/u', '<w:t>'.$this->escapeXmlText((string) ($item->product_name ?? 'Dịch vụ')).'</w:t>', $rowXml, 1);
            $rowXml = preg_replace('/<w:t>1<\/w:t>/u', '<w:t>'.$this->escapeXmlText((string) max(1, (int) ($item->quantity ?? 1))).'</w:t>', $rowXml, 1);
            $rowXml = preg_replace('/<w:t>12 tháng<\/w:t>/u', '<w:t>'.$this->escapeXmlText($this->resolveItemDuration($contract)).'</w:t>', $rowXml, 1);
            $rowXml = preg_replace('/<w:t>9\.690\.000<\/w:t>/u', '<w:t>'.$this->escapeXmlText($this->formatCurrency((float) ($item->unit_price ?? 0))).'</w:t>', $rowXml, 1);
            $rowXml = preg_replace('/<w:t>9\.690\.000<\/w:t>/u', '<w:t>'.$this->escapeXmlText($this->formatCurrency((float) ($item->total_price ?? 0))).'</w:t>', $rowXml, 1);
            $builtRows[] = $rowXml;
        }

        $vatAmount = (float) ($contract->vat_amount ?? 0);
        $vatRow = str_replace(
            [
                $this->escapeXmlText('VAT (8%)'),
                $this->escapeXmlText('775.200'),
            ],
            [
                $this->escapeXmlText($this->resolveVatLabel($contract)),
                $this->escapeXmlText($this->formatCurrency($vatAmount)),
            ],
            $vatTemplate
        );

        $totalRow = str_replace(
            $this->escapeXmlText('10.465.200'),
            $this->escapeXmlText($this->formatCurrency((float) ($contract->value ?? 0))),
            $totalTemplate
        );

        $replacementBlock = implode('', $builtRows) . $vatRow . $totalRow;
        $originalBlock = $itemTemplate . $vatTemplate . $totalTemplate;

        return str_replace($originalBlock, $replacementBlock, $xml);
    }

    private function resolveProgressLabel(Carbon $startDate, ?Carbon $endDate): string
    {
        if (! $endDate) {
            return 'Theo thời gian hợp đồng';
        }

        $days = max(1, $startDate->diffInDays($endDate) + 1);

        return $days . ' ngày';
    }

    private function resolveDeploymentRange(Carbon $startDate, ?Carbon $endDate): string
    {
        if (! $endDate) {
            return 'Từ ngày ' . $startDate->format('d/m/Y');
        }

        return 'Từ ngày ' . $startDate->format('d/m/Y') . ' đến ngày ' . $endDate->format('d/m/Y');
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

        return 'Theo hợp đồng';
    }

    private function resolveWebsite($project): string
    {
        $websiteUrl = trim((string) data_get($project, 'website_url', ''));
        if ($websiteUrl === '') {
            return '................................';
        }

        $host = parse_url($websiteUrl, PHP_URL_HOST);
        return $host ?: $websiteUrl;
    }

    private function resolveVatLabel(Contract $contract): string
    {
        if (! $contract->vat_enabled) {
            return 'VAT';
        }

        if (($contract->vat_mode ?? '') === 'percent' && $contract->vat_rate !== null) {
            $rate = rtrim(rtrim(number_format((float) $contract->vat_rate, 2, '.', ''), '0'), '.');
            return 'VAT (' . $rate . '%)';
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

    private function escapeXmlText(string $value): string
    {
        return htmlspecialchars($value, ENT_XML1 | ENT_COMPAT, 'UTF-8');
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
