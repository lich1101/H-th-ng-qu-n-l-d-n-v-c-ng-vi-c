/**
 * Chuỗi URL lưu trữ — chỉ trim, không tự thêm https:// hay sửa / cuối (khớp backend ExternalUrl).
 * Dùng cho href/text hiển thị website_url, repo_url.
 *
 * @param {string|null|undefined} input
 * @returns {string} Rỗng nếu không có dữ liệu
 */
export function absoluteHttpUrl(input) {
    return String(input ?? '').trim();
}
