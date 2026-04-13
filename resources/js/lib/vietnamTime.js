/**
 * Hiển thị ngày trong app: chỉ dùng `formatVietnamDate`, `formatVietnamDateTime`; khi chỗ hẹp dùng `formatVietnamDateShort`.
 * Không tự split/slice chuỗi ngày để hiển thị.
 */
export const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;
const TZ_SUFFIX_PATTERN = /(Z|[+-]\d{2}:\d{2})$/i;

const getFormatter = (options) => new Intl.DateTimeFormat('vi-VN', {
    timeZone: VIETNAM_TIME_ZONE,
    ...options,
});

export const normalizeVietnamDateInput = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;

    const raw = String(value).trim();
    if (!raw) return null;

    if (DATE_ONLY_PATTERN.test(raw)) {
        return new Date(`${raw}T00:00:00+07:00`);
    }

    let normalized = raw.includes(' ') ? raw.replace(' ', 'T') : raw;
    if (DATE_TIME_PATTERN.test(normalized) && !TZ_SUFFIX_PATTERN.test(normalized)) {
        normalized = `${normalized}+07:00`;
    }

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatParts = (value) => {
    const date = normalizeVietnamDateInput(value);
    if (!date) return null;
    const map = {};
    for (const part of getFormatter({
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date)) {
        if (part.type !== 'literal') map[part.type] = part.value;
    }
    return map;
};

/**
 * Giá trị cho input type="date" (yyyy-MM-DD) — theo lịch Việt Nam.
 * Không dùng String(...).slice(0,10) với ISO có Z (sẽ lệch 1 ngày).
 */
export const toDateInputValue = (value) => {
    if (value === null || value === undefined) return '';
    const raw = String(value).trim();
    if (!raw) return '';

    if (DATE_ONLY_PATTERN.test(raw)) {
        return raw.slice(0, 10);
    }

    const date = normalizeVietnamDateInput(raw);
    if (!date) return '';

    const parts = {};
    for (const part of getFormatter({
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date)) {
        if (part.type !== 'literal') {
            parts[part.type] = part.value;
        }
    }
    if (!parts.year || !parts.month || !parts.day) {
        return '';
    }
    return `${parts.year}-${parts.month}-${parts.day}`;
};

export const todayIsoVietnam = () => {
    const parts = formatParts(new Date());
    if (!parts) return '';
    return `${parts.year}-${parts.month}-${parts.day}`;
};

export const monthStartIsoVietnam = () => {
    const parts = formatParts(new Date());
    if (!parts) return '';
    return `${parts.year}-${parts.month}-01`;
};

export const formatVietnamDate = (value, fallback = '—') => {
    const date = normalizeVietnamDateInput(value);
    if (!date) return fallback;
    return getFormatter({
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(date);
};

/** Nhãn ngắn dd/MM (không năm); dùng `title`/`tooltip` với `formatVietnamDate` đầy đủ khi cần. */
export const formatVietnamDateShort = (value, fallback = '—') => {
    const date = normalizeVietnamDateInput(value);
    if (!date) return fallback;
    return getFormatter({
        day: '2-digit',
        month: '2-digit',
    }).format(date);
};

/**
 * Kiểm tra thứ tự ngày hợp đồng (cùng logic API): start ≥ signed, end > start.
 * @returns {string|null} Chuỗi lỗi tiếng Việt hoặc null nếu hợp lệ.
 */
export const validateContractDateOrder = (signedAt, startDate, endDate) => {
    const s = String(signedAt ?? '').trim().slice(0, 10);
    const a = String(startDate ?? '').trim().slice(0, 10);
    const e = String(endDate ?? '').trim().slice(0, 10);
    if (!s || !a || !e) return null;
    if (a < s) return 'Ngày bắt đầu hiệu lực phải từ ngày ký trở đi.';
    if (e <= a) return 'Ngày kết thúc phải sau ngày bắt đầu hiệu lực.';
    return null;
};

export const formatVietnamTime = (value, fallback = '—') => {
    const date = normalizeVietnamDateInput(value);
    if (!date) return fallback;
    return getFormatter({
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date);
};

export const formatVietnamDateTime = (value, fallback = '—') => {
    const date = normalizeVietnamDateInput(value);
    if (!date) return fallback;
    return getFormatter({
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date);
};
