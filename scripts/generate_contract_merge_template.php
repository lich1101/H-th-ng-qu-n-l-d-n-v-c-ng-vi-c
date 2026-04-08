<?php

/**
 * Tạo public/templates/contracts/contract-template-merge-fields.docx
 * — chỉ gồm macro ${...} và một dòng bảng có ${item_no} để cloneRow hoạt động.
 *
 * Chạy: php scripts/generate_contract_merge_template.php (từ thư mục web)
 */
declare(strict_types=1);

use PhpOffice\PhpWord\IOFactory;
use PhpOffice\PhpWord\PhpWord;
use PhpOffice\PhpWord\SimpleType\Jc;
use PhpOffice\PhpWord\TemplateProcessor;

$root = dirname(__DIR__);
require $root.'/vendor/autoload.php';

$relative = 'templates/contracts/contract-template-merge-fields.docx';
$outPath = $root.'/public/'.$relative;
$dir = dirname($outPath);
if (! is_dir($dir)) {
    mkdir($dir, 0755, true);
}

$word = new PhpWord();
$word->setDefaultFontName('Times New Roman');
$word->setDefaultFontSize(12);

$section = $word->addSection();

$section->addText('HỢP ĐỒNG DỊCH VỤ TRỰC TUYẾN', ['bold' => true, 'size' => 14], ['alignment' => Jc::CENTER]);
$section->addText('Số: ${contract_code}', [], ['alignment' => Jc::CENTER]);
$section->addTextBreak(2);

$section->addText(
    'Hôm nay, ngày ${signed_day} tháng ${signed_month} năm ${signed_year}, các bên thống nhất ký kết hợp đồng với các điều khoản sau:',
    [],
    ['alignment' => Jc::BOTH]
);
$section->addTextBreak(1);

$section->addText('BÊN A (khách hàng)', ['bold' => true]);
$section->addText('Tên: ${legal_company_name}');
$section->addText('Người đại diện: ${legal_representative}');
$section->addText('Chức vụ: ${legal_position}');
$section->addText('Địa chỉ: ${legal_address}');
$section->addText('Mã số thuế: ${legal_tax_code}');
$section->addTextBreak(1);

$section->addText('ĐIỀU 2: NỘI DUNG HỢP ĐỒNG', ['bold' => true]);
$section->addText('2.2.1. Gói dịch vụ: ${service_name}');
$section->addText('2.2.2. Tiến độ thực hiện: ${progress_label}');
$section->addText('2.2.3. Triển khai cho website: ${website_host}');
$section->addText('2.2.4. Thời gian triển khai: ${deployment_range}');
$section->addTextBreak(1);

$section->addText('ĐIỀU 3: PHÍ DỊCH VỤ VÀ THANH TOÁN', ['bold' => true]);
$section->addText('3.1. Phí dịch vụ', ['bold' => true]);
$section->addTextBreak(1);

$table = $section->addTable(['borderSize' => 6, 'borderColor' => '666666']);
$table->addRow();
$table->addCell(800)->addText('STT', ['bold' => true]);
$table->addCell(2800)->addText('Hạng mục', ['bold' => true]);
$table->addCell(900)->addText('SL', ['bold' => true]);
$table->addCell(1400)->addText('Thời gian đặt link', ['bold' => true]);
$table->addCell(1400)->addText('Đơn giá (VNĐ)', ['bold' => true]);
$table->addCell(1600)->addText('Thành tiền (VNĐ)', ['bold' => true]);
$table->addRow();
$table->addCell(800)->addText('${item_no}');
$table->addCell(2800)->addText('${item_name}');
$table->addCell(900)->addText('${item_qty}');
$table->addCell(1400)->addText('${item_duration}');
$table->addCell(1400)->addText('${item_unit_price}');
$table->addCell(1600)->addText('${item_total}');

$section->addTextBreak(1);
$section->addText('Cộng tiền hàng (trước thuế): ${subtotal_amount}');
$section->addText('${vat_label} ${vat_amount}');
$section->addText('Tổng thanh toán: ${total_amount}');
$section->addText('Bằng chữ: ${amount_words}');
$section->addText('Bằng chữ (dòng ngắn): ${amount_words_inline}');

$writer = IOFactory::createWriter($word, 'Word2007');
$writer->save($outPath);

echo "Đã ghi: {$outPath}\n";

$tp = new TemplateProcessor($outPath);
$vars = $tp->getVariables();
sort($vars);
echo 'Số macro: '.count($vars)."\n";
echo in_array('item_no', $vars, true) ? "OK: có item_no (cloneRow).\n" : "LỖI: không thấy item_no.\n";
