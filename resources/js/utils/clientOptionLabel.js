/**
 * Hiển thị một dòng: Tên . SĐT . Email . Ghi chú (cách nhau bởi " . ").
 * @param {object} client
 * @param {{ maxLength?: number }} opts
 */
export function formatClientOptionLabel(client, opts = {}) {
    const maxLength = opts.maxLength ?? 140;
    if (!client || typeof client !== 'object') {
        return '';
    }
    const name = String(client.name ?? '').trim() || `KH #${client.id ?? ''}`;
    const phone = String(client.phone ?? '').trim();
    const email = String(client.email ?? '').trim();
    const note = String(client.notes ?? '')
        .trim()
        .replace(/\s+/g, ' ');
    const parts = [name, phone, email, note].filter((p) => p.length > 0);
    const raw = parts.join(' . ');
    if (raw.length <= maxLength) {
        return raw;
    }
    return `${raw.slice(0, Math.max(0, maxLength - 3))}...`;
}

/**
 * Lọc client đã có trong bộ nhớ (khi không gọi API).
 */
export function clientMatchesQuery(client, query) {
    const q = String(query ?? '')
        .trim()
        .toLowerCase();
    if (!q) {
        return true;
    }
    const hay = [
        client?.name,
        client?.phone,
        client?.email,
        client?.notes,
    ]
        .map((x) => String(x ?? ''))
        .join(' ')
        .toLowerCase();
    return hay.includes(q);
}
