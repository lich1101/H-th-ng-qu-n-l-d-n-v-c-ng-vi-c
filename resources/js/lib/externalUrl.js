/**
 * Chuẩn hóa chuỗi thành URL dùng cho thẻ <a href target="_blank">.
 * Domain không có giao thức (vd. autodoorvietnam.com) bị trình duyệt hiểu là đường dẫn tương đối → gắn https://
 *
 * @param {string|null|undefined} input
 * @returns {string} Rỗng nếu không có dữ liệu
 */
export function absoluteHttpUrl(input) {
    const raw = String(input ?? '').trim();
    if (!raw) {
        return '';
    }
    // Đã có scheme: http:, https:, mailto:, tel:, ...
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
        return raw;
    }
    // Protocol-relative
    if (raw.startsWith('//')) {
        return `https:${raw}`;
    }
    // Đường dẫn nội bộ site hoặc hash — giữ nguyên
    if (raw.startsWith('/') || raw.startsWith('#') || raw.startsWith('?')) {
        return raw;
    }
    return `https://${raw}`;
}
