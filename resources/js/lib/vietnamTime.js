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
