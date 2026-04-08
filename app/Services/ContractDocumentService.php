<?php

namespace App\Services;

use App\Models\Contract;
use Carbon\Carbon;
use Illuminate\Support\Str;
use PhpOffice\PhpWord\TemplateProcessor;
use RuntimeException;

class ContractDocumentService
{
    private const TEMPLATE_RELATIVE_PATH = 'templates/contracts/contract-template-basic-an-phat-379-template-v2.docx';

    public function generate(Contract $contract, ?array $companyProfile = null): array
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

        $template = new TemplateProcessor($templatePath);
        $this->fillStaticContent($template, $contract, $companyProfile);
        $this->fillPricingRows($template, $contract);
        $template->saveAs($outputPath);

        return [
            'path' => $outputPath,
            'filename' => $outputName,
        ];
    }

    private function fillStaticContent(TemplateProcessor $template, Contract $contract, ?array $companyProfile = null): void
    {
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
        $legalCompanyName = trim((string) data_get($companyProfile, 'company_name', ''));
        $legalRepresentative = trim((string) data_get($companyProfile, 'representative', ''));
        $legalPosition = trim((string) data_get($companyProfile, 'position', ''));
        $legalAddress = trim((string) data_get($companyProfile, 'address', ''));
        $legalTaxCode = trim((string) data_get($companyProfile, 'tax_code', ''));
        $template->setValues([
            'contract_code' => $contract->code ?: ('HD-' . $contract->id),
            'signed_day' => $signedAt->format('d'),
            'signed_month' => $signedAt->format('m'),
            'signed_year' => $signedAt->format('Y'),
            'service_name' => $serviceName,
            'service_name_inline' => $serviceName,
            'progress_label' => $this->resolveProgressLabel($startDate, $endDate),
            'website_host' => $website,
            'deployment_range' => $this->resolveDeploymentRange($startDate, $endDate),
            'legal_company_name' => $this->resolveLegalPlaceholderValue($legalCompanyName, 'company_name'),
            'legal_representative' => $this->resolveLegalPlaceholderValue($legalRepresentative, 'representative'),
            'legal_position' => $this->resolveLegalPlaceholderValue($legalPosition, 'position'),
            'legal_address' => $this->resolveLegalPlaceholderValue($legalAddress, 'address'),
            'legal_tax_code' => $this->resolveLegalPlaceholderValue($legalTaxCode, 'tax_code'),
            'vat_label' => $vatLabel,
            'vat_amount' => $this->formatCurrency($vatAmount),
            'total_amount' => $this->formatCurrency($total),
            'amount_words' => $amountWords,
            'amount_words_inline' => $amountWords,
        ]);
    }

    private function fillPricingRows(TemplateProcessor $template, Contract $contract): void
    {
        $itemRows = $contract->items->isNotEmpty() ? $contract->items->values()->all() : [(object) [
            'product_name' => $contract->title ?: 'Dịch vụ',
            'quantity' => 1,
            'unit_price' => (float) ($contract->subtotal_value ?? $contract->value ?? 0),
            'total_price' => (float) ($contract->subtotal_value ?? $contract->value ?? 0),
        ]];

        $duration = $this->resolveItemDuration($contract);
        $rows = [];
        foreach ($itemRows as $index => $item) {
            $rows[] = [
                'item_no' => (string) ($index + 1),
                'item_name' => (string) ($item->product_name ?? 'Dịch vụ'),
                'item_qty' => (string) max(1, (int) ($item->quantity ?? 1)),
                'item_duration' => $duration,
                'item_unit_price' => $this->formatCurrency((float) ($item->unit_price ?? 0)),
                'item_total' => $this->formatCurrency((float) ($item->total_price ?? 0)),
            ];
        }

        $template->cloneRowAndSetValues('item_no', $rows);
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

    private function resolveLegalPlaceholderValue(string $value, string $field): string
    {
        $trimmed = trim($value);

        return $trimmed !== '' ? $trimmed : $this->blankPlaceholder($field);
    }

    private function blankPlaceholder(string $field): string
    {
        return match ($field) {
            'company_name' => '........................................................',
            'representative' => '................................',
            'position' => '........................',
            'tax_code' => '........................',
            'address' => '........................................................................',
            default => '................................',
        };
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
