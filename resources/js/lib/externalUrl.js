/**
 * Chuỗi lưu có thể là domain thuần (vd. biihappy.com) — khi mở link thêm https:// nếu chưa có scheme.
 * Không sửa git@, ssh:, file:.
 *
 * @param {string|null|undefined} input
 * @returns {string} Rỗng nếu không có dữ liệu
 */
export function absoluteHttpUrl(input) {
    const s = String(input ?? '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (/^(git@|ssh:|file:)/i.test(s)) return s;
    return `https://${s}`;
}
