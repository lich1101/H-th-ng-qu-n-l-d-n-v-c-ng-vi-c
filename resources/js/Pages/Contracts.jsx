import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import AutoCodeBadge from '@/Components/AutoCodeBadge';
import FilterToolbar, {
    FILTER_GRID_RESPONSIVE,
    FILTER_GRID_SUBMIT_ROW,
    FILTER_SUBMIT_BUTTON_CLASS,
    FilterActionGroup,
    FilterField,
    filterControlClass,
} from '@/Components/FilterToolbar';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import AppIcon from '@/Components/AppIcon';
import FilterDateInput from '@/Components/FilterDateInput';
import PaginationControls from '@/Components/PaginationControls';
import FilterStatusHelpIcon from '@/Components/FilterStatusHelpIcon';
import ClientSelect from '@/Components/ClientSelect';
import TagMultiSelect from '@/Components/TagMultiSelect';
import { usersToStaffTagOptions } from '@/lib/staffFilterOptions';
import { useToast } from '@/Contexts/ToastContext';
import { formatVietnamDate, toDateInputValue, validateContractDateOrder } from '@/lib/vietnamTime';

const STATUS_OPTIONS = [
    { value: 'draft', label: 'Nháp' },
    { value: 'signed', label: 'Đã ký' },
    { value: 'success', label: 'Thành công' },
    { value: 'active', label: 'Đang hiệu lực' },
    { value: 'expired', label: 'Hết hạn' },
    { value: 'cancelled', label: 'Hủy' },
];

/** Giải thích lọc trạng thái (vòng đời hợp đồng trên hệ thống) */
const CONTRACT_STATUS_FILTER_HELP = [
    { value: 'draft', label: 'Nháp', description: 'Đang soạn, chưa ghi nhận ký kết.' },
    { value: 'signed', label: 'Đã ký', description: 'Đã ký nhưng chưa vào giai đoạn hiệu lực đầy đủ (theo quy tắc tính trạng thái).' },
    { value: 'success', label: 'Thành công', description: 'Hoàn tất / đạt mục tiêu (doanh thu, bàn giao…) theo cấu hình vòng đời.' },
    { value: 'active', label: 'Đang hiệu lực', description: 'Đang trong thời gian thực hiện và được coi là hiệu lực.' },
    { value: 'expired', label: 'Hết hạn', description: 'Quá ngày kết thúc hoặc hết hiệu lực theo điều khoản.' },
    { value: 'cancelled', label: 'Hủy', description: 'Đã hủy, không còn thực hiện.' },
];

/** Trạng thái dự án (lọc / hiển thị cột dự án liên kết) */
const PROJECT_STATUS_LABELS = {
    moi_tao: 'Mới tạo',
    dang_trien_khai: 'Đang triển khai',
    cho_duyet: 'Chờ duyệt',
    hoan_thanh: 'Hoàn thành',
    tam_dung: 'Tạm dừng',
};

const PROJECT_STATUS_OPTIONS = Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => ({ value, label }));

const resolveLinkedProject = (contract) => contract?.project || contract?.linked_project || null;

const APPROVAL_LABELS = {
    pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Từ chối',
};

const HANDOVER_RECEIVE_LABELS = {
    chua_nhan_ban_giao: 'Chưa nhận bàn giao',
    da_nhan_ban_giao: 'Đã nhận bàn giao',
};

const approvalLabel = (value) => APPROVAL_LABELS[value] || APPROVAL_LABELS.pending;
const formatCurrency = (value) => Number(value || 0).toLocaleString('vi-VN');
const formatDateDisplay = (value) => formatVietnamDate(value);
const emptyContractYearComparison = () => ({
    mode: 'year',
    current_label: 'Năm nay',
    previous_label: 'Năm trước',
    current: {
        contracts_count: 0,
        clients_count: 0,
        sales_total: 0,
        revenue_total: 0,
    },
    previous: {
        contracts_count: 0,
        clients_count: 0,
        sales_total: 0,
        revenue_total: 0,
    },
    change_percent: {
        contracts_count: 0,
        clients_count: 0,
        sales_total: 0,
        revenue_total: 0,
    },
});

const toSignedPercent = (value) => {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) return '0%';
    const rounded = Math.round(parsed * 100) / 100;
    if (rounded > 0) return `+${rounded}%`;
    return `${rounded}%`;
};

const percentBadgeClass = (value) => {
    const parsed = Number(value ?? 0);
    if (parsed > 0) return 'bg-emerald-100 text-emerald-700';
    if (parsed < 0) return 'bg-rose-100 text-rose-700';
    return 'bg-slate-100 text-slate-600';
};

const parseNumberInput = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

    let raw = String(value)
        .trim()
        .replace(/\s+/g, '')
        .replace(/₫|đ|VNĐ|VND/gi, '');

    if (!raw) return 0;

    const hasComma = raw.includes(',');
    const hasDot = raw.includes('.');

    if (hasComma && hasDot) {
        raw = raw.replace(/\./g, '').replace(/,/g, '.');
    } else if (hasComma) {
        const parts = raw.split(',');
        raw = parts.length > 2 || parts[1]?.length === 3 ? raw.replace(/,/g, '') : raw.replace(',', '.');
    } else if (hasDot) {
        const parts = raw.split('.');
        raw = parts.length > 2 || parts[1]?.length === 3 ? raw.replace(/\./g, '') : raw;
    }

    raw = raw.replace(/[^\d.-]/g, '');
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
};
const formatMoneyInput = (value) => {
    if (value === null || value === undefined || value === '') return '';
    const digitsOnly = String(value).replace(/[^\d]/g, '');
    if (!digitsOnly) return '';
    return Number(digitsOnly).toLocaleString('vi-VN');
};
const todayInputValue = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 10);
};

/** Mặc định ngày kết thúc hợp đồng mới (N ngày sau hôm nay). */
const dateInputAddDays = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + Number(days));
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
};

const CONTRACT_DATE_FIELD_OPTIONS = [
    { value: 'created_at', label: 'Ngày tạo' },
    { value: 'signed_at', label: 'Ngày ký' },
    { value: 'approved_at', label: 'Ngày duyệt' },
    { value: 'start_date', label: 'Ngày bắt đầu hiệu lực' },
    { value: 'end_date', label: 'Ngày kết thúc' },
];
const CONTRACT_EXPORT_FIELD_GROUPS = [
    {
        key: 'contract_core',
        title: 'Thông tin hợp đồng',
        fields: [
            { key: 'contract_id', label: 'ID hợp đồng' },
            { key: 'contract_code', label: 'Mã hợp đồng' },
            { key: 'contract_title', label: 'Tên hợp đồng' },
            { key: 'contract_type', label: 'Loại hợp đồng' },
            { key: 'care_schedule', label: 'Lịch chăm sóc' },
            { key: 'duration_months', label: 'Thời hạn (tháng)' },
            { key: 'payment_cycle', label: 'Chu kỳ thanh toán' },
            { key: 'imported_paid_periods', label: 'Số kỳ đã thu khi import' },
            { key: 'signed_at', label: 'Ngày ký' },
            { key: 'start_date', label: 'Ngày bắt đầu hiệu lực' },
            { key: 'end_date', label: 'Ngày kết thúc' },
            { key: 'contract_notes', label: 'Ghi chú hợp đồng' },
            { key: 'created_at', label: 'Ngày tạo' },
            { key: 'updated_at', label: 'Ngày cập nhật' },
        ],
    },
    {
        key: 'client',
        title: 'Khách hàng',
        fields: [
            { key: 'client_id', label: 'ID khách hàng' },
            { key: 'client_code', label: 'Mã khách hàng' },
            { key: 'client_name', label: 'Tên khách hàng' },
            { key: 'client_company', label: 'Công ty' },
            { key: 'client_email', label: 'Email khách hàng' },
            { key: 'client_phone', label: 'SĐT khách hàng' },
            { key: 'client_lead_source', label: 'Nguồn khách' },
            { key: 'client_lead_channel', label: 'Kênh khách' },
            { key: 'client_status_label', label: 'Trạng thái khách' },
            { key: 'client_level', label: 'Cấp độ khách' },
            { key: 'client_lead_type', label: 'Loại khách' },
            { key: 'client_assigned_staff', label: 'Nhân viên phụ trách khách' },
            { key: 'client_sales_owner', label: 'Sales owner khách' },
            { key: 'client_care_staff', label: 'Nhóm chăm sóc khách' },
        ],
    },
    {
        key: 'opportunity_project',
        title: 'Cơ hội và dự án',
        fields: [
            { key: 'opportunity_id', label: 'ID cơ hội' },
            { key: 'opportunity_title', label: 'Tên cơ hội' },
            { key: 'opportunity_status', label: 'Trạng thái cơ hội' },
            { key: 'opportunity_amount', label: 'Giá trị cơ hội' },
            { key: 'opportunity_assignee', label: 'Phụ trách cơ hội' },
            { key: 'project_id', label: 'ID dự án' },
            { key: 'project_code', label: 'Mã dự án' },
            { key: 'project_name', label: 'Tên dự án' },
            { key: 'project_website', label: 'Website dự án' },
            { key: 'project_status', label: 'Trạng thái dự án' },
        ],
    },
    {
        key: 'finance',
        title: 'Tài chính',
        fields: [
            { key: 'effective_value', label: 'Giá trị hợp đồng' },
            { key: 'subtotal_value', label: 'Giá trị trước VAT' },
            { key: 'vat_enabled', label: 'Có VAT' },
            { key: 'vat_mode', label: 'Kiểu VAT' },
            { key: 'vat_rate', label: 'Tỷ lệ VAT (%)' },
            { key: 'vat_amount', label: 'Tiền VAT' },
            { key: 'items_total_value', label: 'Tổng dòng sản phẩm' },
            { key: 'payment_times', label: 'Số lần thanh toán' },
            { key: 'payments_count', label: 'Số lần đã thu' },
            { key: 'payments_total', label: 'Đã thu' },
            { key: 'debt_outstanding', label: 'Công nợ' },
            { key: 'costs_total', label: 'Chi phí' },
            { key: 'net_revenue', label: 'Doanh thu ròng' },
            { key: 'stored_revenue', label: 'Doanh thu lưu trong hợp đồng' },
            { key: 'stored_debt', label: 'Công nợ lưu trong hợp đồng' },
            { key: 'stored_cash_flow', label: 'Dòng tiền lưu trong hợp đồng' },
        ],
    },
    {
        key: 'workflow',
        title: 'Duyệt và vận hành',
        fields: [
            { key: 'contract_status_label', label: 'Trạng thái vòng đời' },
            { key: 'contract_status_code', label: 'Trạng thái vòng đời (mã)' },
            { key: 'approval_status_label', label: 'Trạng thái duyệt' },
            { key: 'approval_status_code', label: 'Trạng thái duyệt (mã)' },
            { key: 'approver_name', label: 'Người duyệt' },
            { key: 'approver_email', label: 'Email người duyệt' },
            { key: 'approved_at', label: 'Ngày duyệt' },
            { key: 'approval_note', label: 'Ghi chú duyệt' },
            { key: 'handover_receive_label', label: 'Trạng thái nhận bàn giao' },
            { key: 'handover_receive_code', label: 'Trạng thái nhận bàn giao (mã)' },
            { key: 'handover_receiver_name', label: 'Người nhận bàn giao' },
            { key: 'handover_received_at', label: 'Ngày nhận bàn giao' },
        ],
    },
    {
        key: 'people',
        title: 'Nhân sự và tổng quan',
        fields: [
            { key: 'creator_name', label: 'Người tạo' },
            { key: 'creator_email', label: 'Email người tạo' },
            { key: 'collector_name', label: 'Nhân viên thu' },
            { key: 'collector_email', label: 'Email nhân viên thu' },
            { key: 'contract_care_staff', label: 'Nhân viên chăm sóc hợp đồng' },
            { key: 'items_count', label: 'Số dòng sản phẩm' },
            { key: 'files_count', label: 'Số file đính kèm' },
        ],
    },
];
const CONTRACT_EXPORT_SHEET_OPTIONS = [
    { key: 'items', label: 'Dòng sản phẩm' },
    { key: 'payments', label: 'Thanh toán' },
    { key: 'costs', label: 'Chi phí' },
    { key: 'finance_requests', label: 'Phiếu tài chính' },
    { key: 'care_staff', label: 'Nhân sự chăm sóc' },
    { key: 'care_notes', label: 'Ghi chú chăm sóc' },
    { key: 'files', label: 'File đính kèm' },
];
const DEFAULT_CONTRACT_EXPORT_FIELD_KEYS = CONTRACT_EXPORT_FIELD_GROUPS.flatMap((group) => group.fields.map((field) => field.key));
const DEFAULT_CONTRACT_EXPORT_SHEET_KEYS = CONTRACT_EXPORT_SHEET_OPTIONS.map((item) => item.key);
const CONTRACT_EXPORT_STORAGE_KEY = 'contracts-export-config-v2';
const CONTRACT_EXPORT_PRESETS = {
    basic: [
        'contract_code',
        'contract_title',
        'client_name',
        'client_phone',
        'project_name',
        'collector_name',
        'effective_value',
        'payments_total',
        'debt_outstanding',
        'approval_status_label',
        'contract_status_label',
        'signed_at',
        'start_date',
        'end_date',
    ],
    finance: [
        'contract_code',
        'contract_title',
        'client_name',
        'effective_value',
        'subtotal_value',
        'vat_enabled',
        'vat_mode',
        'vat_rate',
        'vat_amount',
        'items_total_value',
        'payment_times',
        'payments_count',
        'payments_total',
        'debt_outstanding',
        'costs_total',
        'net_revenue',
        'stored_revenue',
        'stored_debt',
        'stored_cash_flow',
        'collector_name',
        'approved_at',
    ],
    operations: [
        'contract_code',
        'contract_title',
        'client_name',
        'client_assigned_staff',
        'client_care_staff',
        'project_name',
        'project_website',
        'project_status',
        'contract_status_label',
        'approval_status_label',
        'handover_receive_label',
        'creator_name',
        'collector_name',
        'contract_care_staff',
        'signed_at',
        'start_date',
        'end_date',
        'created_at',
        'updated_at',
    ],
};
const sanitizeContractExportFieldKeys = (value) => {
    const allowed = new Set(DEFAULT_CONTRACT_EXPORT_FIELD_KEYS);
    if (!Array.isArray(value)) return DEFAULT_CONTRACT_EXPORT_FIELD_KEYS;
    const normalized = value
        .map((item) => String(item || ''))
        .filter((item) => allowed.has(item));
    return normalized.length > 0 ? Array.from(new Set(normalized)) : DEFAULT_CONTRACT_EXPORT_FIELD_KEYS;
};
const sanitizeContractExportSheetKeys = (value) => {
    const allowed = new Set(DEFAULT_CONTRACT_EXPORT_SHEET_KEYS);
    if (!Array.isArray(value)) return DEFAULT_CONTRACT_EXPORT_SHEET_KEYS;
    return Array.from(new Set(value.map((item) => String(item || '')).filter((item) => allowed.has(item))));
};
const readStoredContractExportConfig = () => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(CONTRACT_EXPORT_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return {
            contract_fields: sanitizeContractExportFieldKeys(parsed?.contract_fields),
            include_sheets: sanitizeContractExportSheetKeys(parsed?.include_sheets),
        };
    } catch {
        return null;
    }
};
const emptyContractDateRanges = () => CONTRACT_DATE_FIELD_OPTIONS.reduce((accumulator, field) => ({
    ...accumulator,
    [`${field.value}_from`]: '',
    [`${field.value}_to`]: '',
}), {});
const defaultContractDateFilters = () => ({
    ...emptyContractDateRanges(),
});
const buildContractDateFilterParams = (source = {}) => CONTRACT_DATE_FIELD_OPTIONS.reduce((accumulator, field) => {
    const fromKey = `${field.value}_from`;
    const toKey = `${field.value}_to`;

    if (source[fromKey]) accumulator[fromKey] = source[fromKey];
    if (source[toKey]) accumulator[toKey] = source[toKey];

    return accumulator;
}, {});
const findContractDateFieldLabel = (field) => (
    CONTRACT_DATE_FIELD_OPTIONS.find((item) => item.value === field)?.label || field
);
const CONTRACT_TEXT_FILTER_FIELDS = [
    { key: 'contract_query', label: 'Hợp đồng', placeholder: 'Mã hoặc tên hợp đồng' },
    { key: 'client_query', label: 'Khách hàng', placeholder: 'Tên, công ty hoặc email' },
    { key: 'client_phone', label: 'SĐT khách hàng', placeholder: 'Số điện thoại' },
    { key: 'opportunity_query', label: 'Cơ hội', placeholder: 'Mã CH hoặc tên cơ hội' },
    { key: 'project_query', label: 'Dự án liên kết', placeholder: 'Mã hoặc tên dự án' },
    { key: 'notes_query', label: 'Ghi chú', placeholder: 'Ghi chú / ghi chú duyệt' },
];
const CONTRACT_NUMERIC_RANGE_FIELDS = [
    { key: 'value', label: 'Giá trị' },
    { key: 'payments_total', label: 'Đã thu' },
    { key: 'debt_outstanding', label: 'Công nợ' },
    { key: 'costs_total', label: 'Chi phí' },
    { key: 'payments_count', label: 'Số lần đã TT' },
    { key: 'payment_times', label: 'Số kỳ TT' },
];
const emptyContractColumnFilters = () => ({
    ...CONTRACT_TEXT_FILTER_FIELDS.reduce((accumulator, field) => ({
        ...accumulator,
        [field.key]: '',
    }), {}),
    ...CONTRACT_NUMERIC_RANGE_FIELDS.reduce((accumulator, field) => ({
        ...accumulator,
        [`${field.key}_min`]: '',
        [`${field.key}_max`]: '',
    }), {}),
});
const buildContractColumnFilterParams = (source = {}) => {
    const params = {};

    CONTRACT_TEXT_FILTER_FIELDS.forEach((field) => {
        const value = String(source[field.key] || '').trim();
        if (value) params[field.key] = value;
    });

    CONTRACT_NUMERIC_RANGE_FIELDS.forEach((field) => {
        const minKey = `${field.key}_min`;
        const maxKey = `${field.key}_max`;
        if (source[minKey] !== undefined && source[minKey] !== null && String(source[minKey]).trim() !== '') {
            params[minKey] = source[minKey];
        }
        if (source[maxKey] !== undefined && source[maxKey] !== null && String(source[maxKey]).trim() !== '') {
            params[maxKey] = source[maxKey];
        }
    });

    return params;
};
const emptyContractFilters = () => ({
    search: '',
    ...emptyContractColumnFilters(),
    status: '',
    client_id: '',
    approval_status: '',
    handover_receive_status: '',
    has_project: '',
    project_status: '',
    staff_ids: [],
    per_page: 20,
    page: 1,
    sort_by: 'created_at',
    sort_dir: 'desc',
    ...defaultContractDateFilters(),
});
const parseContractMultiIdsFromSearchParams = (params, keys) => (
    Array.from(new Set(
        keys
            .flatMap((key) => [params.get(key), ...params.getAll(`${key}[]`)])
            .flatMap((value) => String(value || '').split(/[\s,;|]+/))
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0)
    ))
);
const readInitialContractFilters = () => {
    const params = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    const base = emptyContractFilters();
    const perPage = Number(params.get('per_page') || base.per_page);
    const page = Number(params.get('page') || base.page);

    CONTRACT_TEXT_FILTER_FIELDS.forEach((field) => {
        base[field.key] = String(params.get(field.key) || '').trim();
    });
    CONTRACT_NUMERIC_RANGE_FIELDS.forEach((field) => {
        const minKey = `${field.key}_min`;
        const maxKey = `${field.key}_max`;
        base[minKey] = String(params.get(minKey) || '').trim();
        base[maxKey] = String(params.get(maxKey) || '').trim();
    });
    CONTRACT_DATE_FIELD_OPTIONS.forEach((field) => {
        const fromKey = `${field.value}_from`;
        const toKey = `${field.value}_to`;
        base[fromKey] = String(params.get(fromKey) || '').trim();
        base[toKey] = String(params.get(toKey) || '').trim();
    });

    return {
        ...base,
        search: String(params.get('search') || '').trim(),
        status: String(params.get('status') || '').trim(),
        client_id: String(params.get('client_id') || '').trim(),
        approval_status: String(params.get('approval_status') || '').trim(),
        handover_receive_status: String(params.get('handover_receive_status') || '').trim(),
        has_project: String(params.get('has_project') || '').trim(),
        project_status: String(params.get('project_status') || '').trim(),
        staff_ids: parseContractMultiIdsFromSearchParams(params, ['staff_ids', 'staff_id']),
        per_page: Number.isInteger(perPage) && perPage > 0 ? perPage : base.per_page,
        page: Number.isInteger(page) && page > 0 ? page : base.page,
        sort_by: String(params.get('sort_by') || base.sort_by).trim() || base.sort_by,
        sort_dir: String(params.get('sort_dir') || '').trim().toLowerCase() === 'asc' ? 'asc' : base.sort_dir,
    };
};
const syncContractFiltersToUrl = (filtersArg, page = 1) => {
    if (typeof window === 'undefined') return;

    const defaults = emptyContractFilters();
    const params = new URLSearchParams();
    const put = (key, value, defaultValue = '') => {
        const normalized = String(value ?? '').trim();
        if (normalized !== '' && normalized !== String(defaultValue ?? '').trim()) {
            params.set(key, normalized);
        }
    };

    put('search', filtersArg.search);
    put('status', filtersArg.status);
    put('client_id', filtersArg.client_id);
    put('approval_status', filtersArg.approval_status);
    put('handover_receive_status', filtersArg.handover_receive_status);
    put('has_project', filtersArg.has_project);
    put('project_status', filtersArg.project_status);

    CONTRACT_TEXT_FILTER_FIELDS.forEach((field) => put(field.key, filtersArg[field.key]));
    CONTRACT_NUMERIC_RANGE_FIELDS.forEach((field) => {
        put(`${field.key}_min`, filtersArg[`${field.key}_min`]);
        put(`${field.key}_max`, filtersArg[`${field.key}_max`]);
    });
    CONTRACT_DATE_FIELD_OPTIONS.forEach((field) => {
        put(`${field.value}_from`, filtersArg[`${field.value}_from`]);
        put(`${field.value}_to`, filtersArg[`${field.value}_to`]);
    });

    const staffIds = Array.isArray(filtersArg.staff_ids)
        ? filtersArg.staff_ids
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0)
        : [];
    if (staffIds.length > 0) params.set('staff_ids', staffIds.join(','));
    if (Number(filtersArg.per_page) !== defaults.per_page) params.set('per_page', String(Number(filtersArg.per_page) || defaults.per_page));
    if (Number(page) > 1) params.set('page', String(Number(page) || 1));
    put('sort_by', filtersArg.sort_by, defaults.sort_by);
    if (String(filtersArg.sort_dir || '').trim().toLowerCase() === 'asc') params.set('sort_dir', 'asc');

    const query = params.toString();
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(window.history.state || {}, document.title, nextUrl);
};
const BULK_DATE_SYNC_BATCH_SIZE = 250;
const chunkArray = (items = [], size = BULK_DATE_SYNC_BATCH_SIZE) => {
    const normalizedSize = Math.max(1, Number(size) || BULK_DATE_SYNC_BATCH_SIZE);
    const chunks = [];
    for (let index = 0; index < items.length; index += normalizedSize) {
        chunks.push(items.slice(index, index + normalizedSize));
    }
    return chunks;
};
const calculateItemTotal = (item) => {
    const price = parseNumberInput(item?.unit_price);
    const quantity = Math.max(1, parseNumberInput(item?.quantity) || 1);
    return price * quantity;
};
const resolveContractSubtotal = (contract) => {
    if (!contract) return 0;
    if (hasInputValue(contract.subtotal_value)) {
        return parseNumberInput(contract.subtotal_value);
    }
    if (Array.isArray(contract.items) && contract.items.length) {
        return contract.items.reduce((sum, item) => sum + calculateItemTotal(item), 0);
    }
    return parseNumberInput(contract.value ?? contract.effective_value ?? contract.items_total_value);
};
const resolveContractValue = (contract) => {
    if (!contract) return 0;
    return parseNumberInput(contract.value ?? contract.effective_value ?? contract.items_total_value ?? contract.subtotal_value);
};
const hasInputValue = (value) => value !== null && value !== undefined && String(value).trim() !== '';
const statusBadgeClass = (value) => ({
    draft: 'border border-slate-200 bg-slate-100 text-slate-700',
    signed: 'border border-violet-200 bg-violet-100 text-violet-700',
    active: 'border border-sky-200 bg-sky-100 text-sky-700',
    success: 'border border-emerald-200 bg-emerald-100 text-emerald-700',
    expired: 'border border-amber-200 bg-amber-100 text-amber-700',
    cancelled: 'border border-rose-200 bg-rose-100 text-rose-700',
}[value] || 'border border-slate-200 bg-slate-100 text-slate-700');
const approvalBadgeClass = (value) => ({
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-rose-100 text-rose-700',
    pending: 'bg-amber-100 text-amber-700',
}[value] || 'bg-amber-100 text-amber-700');
const handoverReceiveBadgeClass = (value) => ({
    da_nhan_ban_giao: 'bg-emerald-100 text-emerald-700',
    chua_nhan_ban_giao: 'bg-slate-100 text-slate-700',
}[value] || 'bg-slate-100 text-slate-700');
const handoverReceiveLabel = (value) => HANDOVER_RECEIVE_LABELS[value] || HANDOVER_RECEIVE_LABELS.chua_nhan_ban_giao;

function LabeledField({ label, required = false, hint = '', className = '', children }) {
    return (
        <div className={className}>
            <label className="mb-3.5 block text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                {label}{required ? ' *' : ''}
            </label>
            {children}
            {hint ? <p className="mt-1.5 text-xs text-text-muted">{hint}</p> : null}
        </div>
    );
}

function DetailMetric({ label, value, tone = 'slate' }) {
    const toneClass = {
        slate: 'bg-slate-50',
        emerald: 'bg-emerald-50',
        amber: 'bg-amber-50',
        sky: 'bg-sky-50',
    };

    return (
        <div className={`rounded-2xl border border-slate-200/80 px-4 py-3 ${toneClass[tone] || toneClass.slate}`}>
            <div className="text-xs uppercase tracking-[0.16em] text-text-subtle">{label}</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
        </div>
    );
}

export default function Contracts(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const currentUserId = Number(props?.auth?.user?.id || 0) || null;
    const canCreate = ['admin', 'administrator', 'quan_ly', 'nhan_vien', 'ke_toan'].includes(userRole);
    const canManage = ['admin', 'administrator', 'quan_ly', 'ke_toan'].includes(userRole);
    const canDelete = ['admin', 'administrator'].includes(userRole);
    const canApprove = ['admin', 'administrator', 'ke_toan'].includes(userRole);
    const canFinance = ['admin', 'administrator', 'ke_toan'].includes(userRole);
    const canBulkActions = canApprove || canDelete;
    const canExportContracts = ['admin', 'administrator', 'quan_ly', 'nhan_vien', 'ke_toan'].includes(userRole);
    const canSelectContracts = canBulkActions || canExportContracts;
    const isEmployee = userRole === 'nhan_vien';
    const canChooseCollector = ['admin', 'administrator', 'quan_ly', 'ke_toan'].includes(userRole);
    /** Mặc định khi tạo mới: người đang đăng nhập (có thể đổi nếu được phép). */
    const defaultCollectorUserId = currentUserId ? String(currentUserId) : '';

    const [contracts, setContracts] = useState([]);
    const [projects, setProjects] = useState([]);
    const [products, setProducts] = useState([]);
    const [collectors, setCollectors] = useState([]);
    const [hasAssignableClients, setHasAssignableClients] = useState(!isEmployee);
    const [loading, setLoading] = useState(false);
    const [savingContract, setSavingContract] = useState(false);
    const [savingPayment, setSavingPayment] = useState(false);
    const [savingCost, setSavingCost] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [contractClientPreview, setContractClientPreview] = useState(null);
    const [linkableOpportunities, setLinkableOpportunities] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [showDetail, setShowDetail] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailContract, setDetailContract] = useState(null);
    const [careNoteForm, setCareNoteForm] = useState({ title: '', detail: '' });
    const [savingCareNote, setSavingCareNote] = useState(false);
    const [contractMeta, setContractMeta] = useState({
        current_page: 1,
        last_page: 1,
        total: 0,
        per_page: 20,
        from: null,
        to: null,
    });
    const [listAggregates, setListAggregates] = useState({
        revenue_total: 0,
        cashflow_total: 0,
        debt_total: 0,
        costs_total: 0,
        comparison: emptyContractYearComparison(),
    });
    const [filters, setFilters] = useState(() => readInitialContractFilters());
    const [form, setForm] = useState({
        title: '',
        client_id: '',
        collector_user_id: defaultCollectorUserId,
        care_staff_ids: [],
        value: '',
        subtotal_value: '',
        payment_times: '1',
        /** Chỉ để hiển thị (đồng bộ từ API), không gửi khi lưu */
        status_display: '',
        signed_at: todayInputValue(),
        start_date: todayInputValue(),
        end_date: dateInputAddDays(30),
        notes: '',
        opportunity_id: '',
    });
    const [items, setItems] = useState([]);
    const [payments, setPayments] = useState([]);
    const [costs, setCosts] = useState([]);
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [editingPaymentId, setEditingPaymentId] = useState(null);
    const [paymentForm, setPaymentForm] = useState({
        amount: '',
        paid_at: '',
        method: '',
        note: '',
    });
    const [showCostForm, setShowCostForm] = useState(false);
    const [editingCostId, setEditingCostId] = useState(null);
    const [costForm, setCostForm] = useState({
        amount: '',
        cost_date: '',
        cost_type: '',
        note: '',
    });
    const [showImport, setShowImport] = useState(false);
    const [importFile, setImportFile] = useState(null);
    const [importing, setImporting] = useState(false);
    const [importReport, setImportReport] = useState(null);
    const [importJob, setImportJob] = useState(null);
    const [editingCanManage, setEditingCanManage] = useState(true);
    const [editingFinancePerms, setEditingFinancePerms] = useState({
        can_manage_finance: false,
        can_review_finance_request: false,
        can_submit_finance_request: true,
    });
    const [reviewingRequestId, setReviewingRequestId] = useState(null);
    const [selectedContractIds, setSelectedContractIds] = useState([]);
    const [showExportModal, setShowExportModal] = useState(false);
    const storedExportConfig = readStoredContractExportConfig();
    const [contractExportFieldKeys, setContractExportFieldKeys] = useState(
        () => storedExportConfig?.contract_fields || DEFAULT_CONTRACT_EXPORT_FIELD_KEYS,
    );
    const [contractExportSheetKeys, setContractExportSheetKeys] = useState(
        () => storedExportConfig?.include_sheets || DEFAULT_CONTRACT_EXPORT_SHEET_KEYS,
    );
    const [bulkLoading, setBulkLoading] = useState(false);
    const [showBulkDateSyncModal, setShowBulkDateSyncModal] = useState(false);
    const [bulkDateSyncForm, setBulkDateSyncForm] = useState({
        target_date_field: 'approved_at',
        reference_date_field: 'signed_at',
    });
    const contractTableRef = useRef(null);
    const bulkSyncTargetOptions = useMemo(() => (
        CONTRACT_DATE_FIELD_OPTIONS.filter((item) => {
            if (item.value === 'approved_at') return canApprove;
            if (item.value === 'created_at') return canDelete;
            return true;
        })
    ), [canApprove, canDelete]);
    const bulkSyncTargetLabel = useMemo(
        () => findContractDateFieldLabel(bulkDateSyncForm.target_date_field),
        [bulkDateSyncForm.target_date_field]
    );
    const bulkSyncReferenceOptions = useMemo(() => (
        CONTRACT_DATE_FIELD_OPTIONS.filter((item) => item.value !== bulkDateSyncForm.target_date_field)
    ), [bulkDateSyncForm.target_date_field]);
    const bulkSyncReferenceLabel = useMemo(
        () => findContractDateFieldLabel(bulkDateSyncForm.reference_date_field),
        [bulkDateSyncForm.reference_date_field]
    );

    const extractValidationMessages = (error) => {
        const errors = error?.response?.data?.errors;
        if (!errors || typeof errors !== 'object') return [];

        return Object.values(errors)
            .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
            .map((message) => String(message || '').trim())
            .filter(Boolean);
    };

    const getErrorMessage = (error, fallback) => {
        const validationMessages = extractValidationMessages(error);
        if (validationMessages.length > 0) {
            return validationMessages[0];
        }

        const message = error?.response?.data?.message;
        if (message && message !== 'The given data was invalid.') {
            return message;
        }

        return fallback;
    };

    const getBlobErrorMessage = async (error, fallback) => {
        const blob = error?.response?.data;
        if (blob instanceof Blob) {
            try {
                const text = await blob.text();
                if (text) {
                    const parsed = JSON.parse(text);
                    return parsed?.message || fallback;
                }
            } catch {
                return fallback;
            }
        }

        return getErrorMessage(error, fallback);
    };

    const filenameFromDisposition = (disposition, fallback) => {
        if (!disposition) return fallback;
        const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
        if (utf8Match?.[1]) {
            return decodeURIComponent(utf8Match[1].replace(/"/g, ''));
        }
        const asciiMatch = disposition.match(/filename="?([^"]+)"?/i);
        return asciiMatch?.[1] || fallback;
    };

    const readBoolean = (raw) => {
        if (typeof raw === 'boolean') return raw;
        if (typeof raw === 'number') return raw !== 0;
        if (typeof raw === 'string') {
            const normalized = raw.trim().toLowerCase();
            if (['1', 'true', 'yes'].includes(normalized)) return true;
            if (['0', 'false', 'no'].includes(normalized)) return false;
        }
        return null;
    };

    const canManageContract = (contract) => {
        const apiPermission = readBoolean(contract?.can_manage);
        if (apiPermission !== null) {
            return apiPermission;
        }

        if (['admin', 'administrator', 'quan_ly', 'ke_toan'].includes(userRole)) {
            return true;
        }

        if (userRole !== 'nhan_vien') {
            return false;
        }

        const uid = Number(currentUserId || 0);
        if (!uid) return false;

        const client = contract?.client || {};
        return Number(client?.assigned_staff_id || 0) === uid;
    };

    const canDeleteContract = (contract) => {
        if (!canDelete) return false;
        const apiPermission = readBoolean(contract?.can_delete);
        if (apiPermission !== null) {
            return apiPermission;
        }

        if (['admin', 'administrator', 'quan_ly', 'ke_toan'].includes(userRole)) {
            return canManageContract(contract);
        }

        if (userRole === 'nhan_vien') {
            return canManageContract(contract);
        }

        return false;
    };

    const collectorFilterOptions = useMemo(() => usersToStaffTagOptions(collectors), [collectors]);

    const normalizeCareStaffIds = (values) => {
        return Array.from(new Set((values || [])
            .map((value) => Number(typeof value === 'object' && value !== null ? value.id : value))
            .filter((value) => Number.isInteger(value) && value > 0)));
    };

    const itemsTotal = useMemo(() => {
        return items.reduce((sum, item) => {
            return sum + calculateItemTotal(item);
        }, 0);
    }, [items]);

    const contractSubtotal = useMemo(() => (
        items.length ? itemsTotal : 0
    ), [items.length, itemsTotal]);

    const contractValueTotal = useMemo(() => contractSubtotal, [contractSubtotal]);

    const paymentBaseTotal = useMemo(() => {
        return payments.reduce((sum, payment) => {
            if (editingPaymentId && String(payment.id) === String(editingPaymentId)) {
                return sum;
            }
            const isPending = payment.row_type === 'pending_request';
            const isCreateDraft = payment.row_type === 'create_draft';
            const isRecord = payment.row_type === 'record' || !payment.row_type;
            if (!isPending && !isRecord && !isCreateDraft) {
                return sum;
            }
            return sum + parseNumberInput(payment.amount);
        }, 0);
    }, [payments, editingPaymentId]);

    const paymentRemaining = useMemo(
        () => Math.max(0, contractValueTotal - paymentBaseTotal),
        [contractValueTotal, paymentBaseTotal]
    );

    const paymentProjectedTotal = useMemo(
        () => paymentBaseTotal + parseNumberInput(paymentForm.amount),
        [paymentBaseTotal, paymentForm.amount]
    );

    const fetchProjects = async () => {
        try {
            const res = await axios.get('/api/v1/projects', { params: { per_page: 200 } });
            setProjects(res.data?.data || []);
        } catch {
            // ignore
        }
    };

    const fetchProducts = async () => {
        try {
            const res = await axios.get('/api/v1/products', { params: { per_page: 200 } });
            setProducts(res.data?.data || []);
        } catch {
            // ignore
        }
    };

    const fetchCollectors = async () => {
        try {
            const res = await axios.get('/api/v1/users/lookup', {
                params: { purpose: 'contract_collector' },
            });
            setCollectors(res.data?.data || []);
        } catch {
            setCollectors([]);
        }
    };

    const fetchAssignableClientAvailability = async () => {
        if (!isEmployee) {
            setHasAssignableClients(true);
            return;
        }
        try {
            const res = await axios.get('/api/v1/crm/clients', {
                params: {
                    per_page: 1,
                    page: 1,
                    assigned_only: 1,
                },
            });
            setHasAssignableClients(Number(res.data?.total || 0) > 0);
        } catch {
            setHasAssignableClients(false);
        }
    };

    const handleContractSearch = (val) => {
        const next = { ...filters, search: val, page: 1 };
        setFilters(next);
    };

    const fetchContracts = async (pageOrFilters = filters.page, maybeFilters = filters) => {
        const nextFilters = typeof pageOrFilters === 'object' && pageOrFilters !== null
            ? pageOrFilters
            : maybeFilters;
        const nextPage = typeof pageOrFilters === 'object' && pageOrFilters !== null
            ? Number(pageOrFilters.page || 1)
            : Number(pageOrFilters || 1);
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/contracts', {
                params: {
                    per_page: nextFilters.per_page || 20,
                    page: nextPage,
                    with_items: true,
                    ...(nextFilters.search ? { search: nextFilters.search } : {}),
                    ...(nextFilters.status ? { status: nextFilters.status } : {}),
                    ...(nextFilters.client_id ? { client_id: nextFilters.client_id } : {}),
                    ...(nextFilters.approval_status ? { approval_status: nextFilters.approval_status } : {}),
                    ...(nextFilters.handover_receive_status ? { handover_receive_status: nextFilters.handover_receive_status } : {}),
                    ...(nextFilters.has_project ? { has_project: nextFilters.has_project } : {}),
                    ...(nextFilters.project_status ? { project_status: nextFilters.project_status } : {}),
                    ...(Array.isArray(nextFilters.staff_ids) && nextFilters.staff_ids.length > 0 ? { staff_ids: nextFilters.staff_ids } : {}),
                    ...buildContractColumnFilterParams(nextFilters),
                    ...buildContractDateFilterParams(nextFilters),
                    sort_by: nextFilters.sort_by || 'created_at',
                    sort_dir: nextFilters.sort_dir || 'desc',
                },
            });
            const rows = res.data?.data || [];
            setContracts(rows);
            const agg = res.data?.aggregates;
            setListAggregates({
                revenue_total: Number(agg?.revenue_total ?? 0),
                cashflow_total: Number(agg?.cashflow_total ?? 0),
                debt_total: Number(agg?.debt_total ?? 0),
                costs_total: Number(agg?.costs_total ?? 0),
                comparison: (agg?.comparison && typeof agg.comparison === 'object')
                    ? {
                        ...emptyContractYearComparison(),
                        ...agg.comparison,
                        current: {
                            ...emptyContractYearComparison().current,
                            ...(agg.comparison.current || {}),
                        },
                        previous: {
                            ...emptyContractYearComparison().previous,
                            ...(agg.comparison.previous || {}),
                        },
                        change_percent: {
                            ...emptyContractYearComparison().change_percent,
                            ...(agg.comparison.change_percent || {}),
                        },
                    }
                    : emptyContractYearComparison(),
            });
            const visibleIds = new Set(rows.map((row) => Number(row.id)));
            setSelectedContractIds((prev) => prev.filter((id) => visibleIds.has(Number(id))));
            const metaPerPage = Number(res.data?.per_page) || nextFilters.per_page || 20;
            const syncedFilters = {
                ...nextFilters,
                page: res.data?.current_page || nextPage,
                per_page: metaPerPage,
            };
            setContractMeta({
                current_page: res.data?.current_page || 1,
                last_page: res.data?.last_page || 1,
                total: res.data?.total || 0,
                per_page: metaPerPage,
                from: res.data?.from ?? null,
                to: res.data?.to ?? null,
            });
            setFilters((prev) => ({
                ...prev,
                page: syncedFilters.page,
                per_page: syncedFilters.per_page,
            }));
            syncContractFiltersToUrl(syncedFilters, syncedFilters.page);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được danh sách hợp đồng.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
        fetchProducts();
        fetchCollectors();
        fetchAssignableClientAvailability();
        fetchContracts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!bulkSyncTargetOptions.some((item) => item.value === bulkDateSyncForm.target_date_field)) {
            setBulkDateSyncForm((prev) => ({
                ...prev,
                target_date_field: bulkSyncTargetOptions[0]?.value || 'start_date',
            }));
        }
    }, [bulkDateSyncForm.target_date_field, bulkSyncTargetOptions]);

    useEffect(() => {
        if (!bulkSyncReferenceOptions.some((item) => item.value === bulkDateSyncForm.reference_date_field)) {
            setBulkDateSyncForm((prev) => ({
                ...prev,
                reference_date_field: bulkSyncReferenceOptions[0]?.value || 'signed_at',
            }));
        }
    }, [bulkDateSyncForm.reference_date_field, bulkSyncReferenceOptions]);

    useEffect(() => {
        const clientId = Number(form.client_id || 0);
        if (!clientId || !showForm) {
            setLinkableOpportunities([]);
            return undefined;
        }
        let cancelled = false;
        (async () => {
            try {
                const params = {
                    linkable_for_contract: 1,
                    client_id: clientId,
                    per_page: 80,
                    page: 1,
                };
                if (editingId) {
                    params.exclude_contract_id = editingId;
                }
                const res = await axios.get('/api/v1/opportunities', { params });
                if (cancelled) return;
                setLinkableOpportunities(res.data?.data || []);
            } catch {
                if (!cancelled) setLinkableOpportunities([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [form.client_id, showForm, editingId]);

    useEffect(() => {
        const table = contractTableRef.current;
        if (!table) return undefined;

        const handleRemoteSort = (event) => {
            const sortBy = String(event?.detail?.sortBy || '').trim();
            const sortDir = String(event?.detail?.sortDir || '').toLowerCase() === 'asc' ? 'asc' : 'desc';
            if (!sortBy) return;

            const nextFilters = {
                ...filters,
                sort_by: sortBy,
                sort_dir: sortDir,
                page: 1,
            };
            setFilters(nextFilters);
            fetchContracts(1, nextFilters);
        };

        table.addEventListener('table:remote-sort', handleRemoteSort);
        return () => {
            table.removeEventListener('table:remote-sort', handleRemoteSort);
        };
    }, [filters]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(CONTRACT_EXPORT_STORAGE_KEY, JSON.stringify({
                contract_fields: contractExportFieldKeys,
                include_sheets: contractExportSheetKeys,
            }));
        } catch {
            // ignore storage failures
        }
    }, [contractExportFieldKeys, contractExportSheetKeys]);

    const stats = useMemo(() => {
        const total = contractMeta.total || contracts.length;
        const active = contracts.filter((c) => c.status === 'active').length;
        const signed = contracts.filter((c) => c.status === 'signed').length;
        const pendingApproval = contracts.filter((c) => c.approval_status === 'pending').length;
        return [
            { label: 'Tổng hợp đồng', value: String(total) },
            { label: 'Đang hiệu lực', value: String(active) },
            { label: 'Đã ký', value: String(signed) },
            { label: 'Chờ duyệt', value: String(pendingApproval) },
        ];
    }, [contractMeta.total, contracts]);

    const yearComparison = useMemo(() => {
        if (!listAggregates?.comparison || typeof listAggregates.comparison !== 'object') {
            return emptyContractYearComparison();
        }

        return {
            ...emptyContractYearComparison(),
            ...listAggregates.comparison,
            current: {
                ...emptyContractYearComparison().current,
                ...(listAggregates.comparison.current || {}),
            },
            previous: {
                ...emptyContractYearComparison().previous,
                ...(listAggregates.comparison.previous || {}),
            },
            change_percent: {
                ...emptyContractYearComparison().change_percent,
                ...(listAggregates.comparison.change_percent || {}),
            },
        };
    }, [listAggregates?.comparison]);

    const visibleContractIds = useMemo(
        () => contracts.map((contract) => Number(contract.id)).filter((id) => id > 0),
        [contracts]
    );
    const selectedContractSet = useMemo(
        () => new Set(selectedContractIds.map((id) => Number(id))),
        [selectedContractIds]
    );
    const selectedExportFieldSet = useMemo(
        () => new Set(contractExportFieldKeys.map((key) => String(key))),
        [contractExportFieldKeys]
    );
    const selectedExportSheetSet = useMemo(
        () => new Set(contractExportSheetKeys.map((key) => String(key))),
        [contractExportSheetKeys]
    );
    const allVisibleSelected = visibleContractIds.length > 0
        && visibleContractIds.every((id) => selectedContractSet.has(id));

    const toggleContractSelection = (contractId) => {
        const normalizedId = Number(contractId || 0);
        if (normalizedId <= 0) return;
        setSelectedContractIds((prev) => (
            prev.includes(normalizedId)
                ? prev.filter((id) => id !== normalizedId)
                : [...prev, normalizedId]
        ));
    };

    const toggleSelectAllVisible = () => {
        if (allVisibleSelected) {
            setSelectedContractIds((prev) => prev.filter((id) => !visibleContractIds.includes(Number(id))));
            return;
        }

        setSelectedContractIds((prev) => {
            const set = new Set(prev.map((id) => Number(id)));
            visibleContractIds.forEach((id) => set.add(id));
            return Array.from(set.values());
        });
    };

    const bulkApproveContracts = async () => {
        if (!canApprove) {
            toast.error('Bạn không có quyền duyệt hợp đồng.');
            return;
        }
        if (!selectedContractIds.length) {
            toast.error('Vui lòng chọn hợp đồng cần duyệt.');
            return;
        }

        setBulkLoading(true);
        try {
            await Promise.all(selectedContractIds.map((id) => axios.post(`/api/v1/contracts/${id}/approve`, {})));
            toast.success(`Đã duyệt ${selectedContractIds.length} hợp đồng đã chọn.`);
            setSelectedContractIds([]);
            await fetchContracts(filters);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Không thể duyệt hàng loạt hợp đồng.'));
        } finally {
            setBulkLoading(false);
        }
    };

    const bulkDeleteContracts = async () => {
        if (!canDelete) {
            toast.error('Bạn không có quyền xóa hợp đồng.');
            return;
        }
        if (!selectedContractIds.length) {
            toast.error('Vui lòng chọn hợp đồng cần xóa.');
            return;
        }
        if (!confirm(`Xóa ${selectedContractIds.length} hợp đồng đã chọn?`)) return;

        setBulkLoading(true);
        try {
            await Promise.all(selectedContractIds.map((id) => axios.delete(`/api/v1/contracts/${id}`)));
            toast.success(`Đã xóa ${selectedContractIds.length} hợp đồng đã chọn.`);
            setSelectedContractIds([]);
            await fetchContracts(filters);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Không thể xóa hàng loạt hợp đồng.'));
        } finally {
            setBulkLoading(false);
        }
    };

    const openBulkDateSyncModal = () => {
        if (!canManage) {
            toast.error('Bạn không có quyền cập nhật hợp đồng.');
            return;
        }
        if (!selectedContractIds.length) {
            toast.error('Vui lòng chọn ít nhất một hợp đồng.');
            return;
        }

        setShowBulkDateSyncModal(true);
    };

    const openExportModal = () => {
        if (!canExportContracts) {
            toast.error('Bạn không có quyền xuất danh sách hợp đồng.');
            return;
        }
        if (!selectedContractIds.length) {
            toast.error('Vui lòng chọn hợp đồng cần xuất.');
            return;
        }

        setShowExportModal(true);
    };

    const toggleContractExportField = (fieldKey) => {
        const normalized = String(fieldKey || '');
        if (!normalized) return;
        setContractExportFieldKeys((prev) => (
            prev.includes(normalized)
                ? prev.filter((item) => item !== normalized)
                : [...prev, normalized]
        ));
    };

    const toggleContractExportSheet = (sheetKey) => {
        const normalized = String(sheetKey || '');
        if (!normalized) return;
        setContractExportSheetKeys((prev) => (
            prev.includes(normalized)
                ? prev.filter((item) => item !== normalized)
                : [...prev, normalized]
        ));
    };

    const applyContractExportPreset = (presetKey) => {
        const preset = CONTRACT_EXPORT_PRESETS[presetKey];
        if (!Array.isArray(preset) || !preset.length) return;
        setContractExportFieldKeys(Array.from(new Set(preset)));
    };

    const selectAllContractExportFields = () => {
        setContractExportFieldKeys(DEFAULT_CONTRACT_EXPORT_FIELD_KEYS);
    };

    const clearAllContractExportFields = () => {
        setContractExportFieldKeys([]);
    };

    const selectAllContractExportSheets = () => {
        setContractExportSheetKeys(DEFAULT_CONTRACT_EXPORT_SHEET_KEYS);
    };

    const clearAllContractExportSheets = () => {
        setContractExportSheetKeys([]);
    };

    const restoreDefaultContractExportConfig = () => {
        setContractExportFieldKeys(DEFAULT_CONTRACT_EXPORT_FIELD_KEYS);
        setContractExportSheetKeys(DEFAULT_CONTRACT_EXPORT_SHEET_KEYS);
    };

    const bulkSyncContractDates = async () => {
        if (!canManage) {
            toast.error('Bạn không có quyền cập nhật hợp đồng.');
            return;
        }
        if (!selectedContractIds.length) {
            toast.error('Vui lòng chọn ít nhất một hợp đồng.');
            return;
        }
        if (bulkDateSyncForm.target_date_field === bulkDateSyncForm.reference_date_field) {
            toast.error('Trường cần đồng bộ phải khác ngày tham chiếu.');
            return;
        }

        const targetLabel = findContractDateFieldLabel(bulkDateSyncForm.target_date_field);
        const referenceLabel = findContractDateFieldLabel(bulkDateSyncForm.reference_date_field);
        const msg = [
            'Đồng bộ ngày cho các hợp đồng đã chọn:',
            '',
            `• Trường cần cập nhật: ${targetLabel}.`,
            `• Ngày tham chiếu: ${referenceLabel}.`,
            `• Hệ thống sẽ tự chia thành từng đợt ${BULK_DATE_SYNC_BATCH_SIZE} hợp đồng để tránh lỗi khi chọn quá nhiều.`,
            '• Hệ thống sẽ ghi đè giá trị ngày đích theo ngày tham chiếu nếu hợp đồng có đủ dữ liệu.',
            '• Hợp đồng thiếu ngày tham chiếu hoặc làm sai thứ tự ngày sẽ được giữ nguyên và báo lý do.',
            '',
            `Thực hiện cho ${selectedContractIds.length} hợp đồng đã chọn?`,
        ].join('\n');
        if (!window.confirm(msg)) return;

        setBulkLoading(true);
        try {
            const batches = chunkArray(
                selectedContractIds.map((id) => Number(id)),
                BULK_DATE_SYNC_BATCH_SIZE,
            );
            const merged = {
                updated: [],
                skipped: [],
                failed: [],
            };

            for (const batchIds of batches) {
                const res = await axios.post('/api/v1/contracts/sync-dates', {
                    contract_ids: batchIds,
                    target_date_field: bulkDateSyncForm.target_date_field,
                    reference_date_field: bulkDateSyncForm.reference_date_field,
                });
                const data = res?.data || {};
                merged.updated.push(...(Array.isArray(data.updated) ? data.updated : []));
                merged.skipped.push(...(Array.isArray(data.skipped) ? data.skipped : []));
                merged.failed.push(...(Array.isArray(data.failed) ? data.failed : []));
            }

            const parts = [];
            if (merged.updated.length > 0) {
                parts.push(`Đã đồng bộ ${merged.updated.length} hợp đồng.`);
            }
            if (merged.skipped.length > 0) {
                parts.push(`Giữ nguyên ${merged.skipped.length} hợp đồng chưa phù hợp điều kiện.`);
            }
            if (merged.failed.length > 0) {
                parts.push(`${merged.failed.length} hợp đồng lỗi xử lý.`);
            }
            toast.success(parts.join(' ') || 'Đã đồng bộ.');

            if (merged.failed.length > 0) {
                const first = merged.failed[0];
                toast.error(
                    `Một số hợp đồng không xử lý được (ví dụ #${first.id ?? '?'}): ${first.message || 'Lỗi'}.`,
                );
            }
            if (merged.skipped.length > 0) {
                const first = merged.skipped[0];
                toast.error(
                    `Một số hợp đồng được giữ nguyên (ví dụ #${first.id ?? '?'}): ${first.message || first.reason || 'Không đủ điều kiện đồng bộ'}.`,
                );
            }
            setShowBulkDateSyncModal(false);
            setSelectedContractIds([]);
            await fetchContracts(filters);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Không thể đồng bộ ngày hợp đồng.'));
        } finally {
            setBulkLoading(false);
        }
    };

    const exportSelectedContracts = async () => {
        if (!canExportContracts) {
            toast.error('Bạn không có quyền xuất danh sách hợp đồng.');
            return;
        }
        if (!selectedContractIds.length) {
            toast.error('Vui lòng chọn hợp đồng cần xuất.');
            return;
        }
        if (!contractExportFieldKeys.length) {
            toast.error('Vui lòng chọn ít nhất một cột ở sheet hợp đồng.');
            return;
        }

        setBulkLoading(true);
        try {
            const res = await axios.post('/api/v1/contracts/export-selected', {
                contract_ids: selectedContractIds.map((id) => Number(id)).filter((id) => id > 0),
                contract_fields: contractExportFieldKeys,
                include_sheets: contractExportSheetKeys,
            }, {
                responseType: 'blob',
            });
            const blob = new Blob([res.data], {
                type: res.headers?.['content-type'] || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filenameFromDisposition(
                res.headers?.['content-disposition'],
                `danh-sach-hop-dong-da-chon-${new Date().toISOString().slice(0, 10)}.xlsx`,
            );
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success(`Đã xuất ${selectedContractIds.length} hợp đồng ra file XLSX.`);
            setShowExportModal(false);
        } catch (error) {
            toast.error(await getBlobErrorMessage(error, 'Không thể xuất danh sách hợp đồng đã chọn.'));
        } finally {
            setBulkLoading(false);
        }
    };

    const resetForm = () => {
        setEditingId(null);
        setContractClientPreview(null);
        setEditingCanManage(true);
        setForm({
            title: '',
            client_id: '',
            collector_user_id: defaultCollectorUserId,
            care_staff_ids: [],
            value: '',
            subtotal_value: '',
            payment_times: '1',
            status_display: '',
            signed_at: todayInputValue(),
            start_date: todayInputValue(),
            end_date: dateInputAddDays(30),
            notes: '',
            opportunity_id: '',
        });
        setItems([]);
        setPayments([]);
        setCosts([]);
        setEditingFinancePerms({
            can_manage_finance: false,
            can_review_finance_request: false,
            can_submit_finance_request: true,
        });
        setReviewingRequestId(null);
    };

    const startEdit = async (c) => {
        if (!canManageContract(c)) {
            toast.error('Bạn chỉ có quyền xem hợp đồng này.');
            return;
        }

        setEditingId(c.id);
        try {
            const res = await axios.get(`/api/v1/contracts/${c.id}`);
            const detail = res.data || c;
            const canManageDetail = canManageContract(detail);
            if (!canManageDetail) {
                setEditingCanManage(false);
                setEditingId(null);
                toast.error('Bạn chỉ có quyền xem hợp đồng này.');
                return;
            }
            setEditingCanManage(true);
            setContractClientPreview(detail.client || null);
            setForm({
                title: detail.title || '',
                client_id: detail.client_id || '',
                collector_user_id: detail.collector_user_id ? String(detail.collector_user_id) : (currentUserId ? String(currentUserId) : ''),
                care_staff_ids: normalizeCareStaffIds(detail.care_staff_users || []),
                value: String(resolveContractValue(detail)),
                subtotal_value: String(resolveContractSubtotal(detail)),
                payment_times: String(detail.payment_times ?? 1),
                status_display: detail.status || 'draft',
                signed_at: toDateInputValue(detail.signed_at),
                start_date: toDateInputValue(detail.start_date),
                end_date: toDateInputValue(detail.end_date),
                notes: detail.notes || '',
                opportunity_id: detail.opportunity_id ? String(detail.opportunity_id) : '',
            });
            setItems(
                (detail.items || []).map((item) => ({
                    id: item.id,
                    product_id: item.product_id || '',
                    product_name: item.product_name || '',
                    unit: item.unit || '',
                    unit_price: item.unit_price ?? '',
                    quantity: item.quantity ?? 1,
                    note: item.note || '',
                }))
            );
            setPayments(detail.payments_display || detail.payments || []);
            setCosts(detail.costs_display || detail.costs || []);
            setEditingFinancePerms({
                can_manage_finance: readBoolean(detail.can_manage_finance) === true,
                can_review_finance_request: readBoolean(detail.can_review_finance_request) === true,
                can_submit_finance_request: readBoolean(detail.can_submit_finance_request) !== false,
            });
            setShowForm(true);
        } catch (e) {
            setEditingId(null);
            toast.error(getErrorMessage(e, 'Không tải được chi tiết hợp đồng.'));
        }
    };

    const openCreate = () => {
        if (canCreate && isEmployee && !hasAssignableClients) {
            toast.error('Bạn chưa có khách hàng phụ trách trực tiếp để tạo hợp đồng.');
            return;
        }
        resetForm();
        setContractClientPreview(null);
        setShowForm(true);
    };

    const closeForm = () => {
        if (savingContract) return;
        setShowForm(false);
        resetForm();
    };

    const openDetail = (contractId) => {
        window.location.href = `/hop-dong/${contractId}`;
    };

    const addItem = () => {
        setItems((prev) => {
            const nextItems = [
                ...prev,
                { product_id: '', product_name: '', unit: '', unit_price: '', quantity: 1, note: '' },
            ];
            return nextItems;
        });
    };

    const updateItem = (index, changes) => {
        setItems((prev) => {
            return prev.map((item, idx) => {
                if (idx !== index) return item;
                return { ...item, ...changes };
            });
        });
    };

    const removeItem = (index) => {
        setItems((prev) => prev.filter((_, idx) => idx !== index));
    };

    const refreshContractExtras = async () => {
        if (!editingId) return;
        try {
            const res = await axios.get(`/api/v1/contracts/${editingId}`);
            const detail = res.data || {};
            setPayments(detail.payments_display || detail.payments || []);
            setCosts(detail.costs_display || detail.costs || []);
            setEditingFinancePerms({
                can_manage_finance: readBoolean(detail.can_manage_finance) === true,
                can_review_finance_request: readBoolean(detail.can_review_finance_request) === true,
                can_submit_finance_request: readBoolean(detail.can_submit_finance_request) !== false,
            });
        } catch {
            // ignore
        }
    };

    const openPaymentCreate = () => {
        if (!editingFinancePerms.can_submit_finance_request) {
            toast.error('Bạn không có quyền gửi phiếu thanh toán cho hợp đồng này.');
            return;
        }
        setEditingPaymentId(null);
        setPaymentForm({ amount: '', paid_at: todayInputValue(), method: '', note: '' });
        setShowPaymentForm(true);
    };

    const editPayment = (payment) => {
        if (payment.row_type === 'pending_request') {
            toast.error('Không sửa trực tiếp phiếu đang chờ duyệt.');
            return;
        }
        if (payment.row_type === 'create_draft') {
        setEditingPaymentId(payment.id);
        setPaymentForm({
                amount: formatMoneyInput(payment.amount),
                paid_at: toDateInputValue(payment.paid_at),
                method: payment.method || '',
                note: payment.note || '',
            });
            setShowPaymentForm(true);
            return;
        }
        setEditingPaymentId(payment.id);
        setPaymentForm({
            amount: formatMoneyInput(payment.amount),
            paid_at: toDateInputValue(payment.paid_at),
            method: payment.method || '',
            note: payment.note || '',
        });
        setShowPaymentForm(true);
    };

    const submitPayment = async (e) => {
        e.preventDefault();
        if (savingPayment) return;
        if (paymentProjectedTotal > contractValueTotal + 0.0001) {
            toast.error(`Số tiền thanh toán vượt giá trị hợp đồng. Chỉ còn tối đa ${formatCurrency(paymentRemaining)} VNĐ.`);
            return;
        }
        if (!editingId) {
            setSavingPayment(true);
            try {
                const payload = {
                    id: editingPaymentId && String(editingPaymentId).startsWith('local-pay-')
                        ? editingPaymentId
                        : `local-pay-${Date.now()}`,
                    row_type: 'create_draft',
                    amount: parseNumberInput(paymentForm.amount),
                    paid_at: paymentForm.paid_at || null,
                    method: paymentForm.method || null,
                    note: paymentForm.note || null,
                };
                if (editingPaymentId && String(editingPaymentId).startsWith('local-pay-')) {
                    setPayments((prev) => prev.map((p) => (String(p.id) === String(editingPaymentId) ? { ...payload, id: editingPaymentId } : p)));
                    toast.success('Đã cập nhật dòng thanh toán (gửi duyệt khi tạo hợp đồng).');
                } else {
                    setPayments((prev) => [...prev, payload]);
                    toast.success('Đã thêm dòng thanh toán (gửi duyệt khi tạo hợp đồng).');
                }
                setShowPaymentForm(false);
                setEditingPaymentId(null);
            } finally {
                setSavingPayment(false);
            }
            return;
        }
        setSavingPayment(true);
        try {
            const payload = {
                amount: parseNumberInput(paymentForm.amount),
                paid_at: paymentForm.paid_at || null,
                method: paymentForm.method || null,
                note: paymentForm.note || null,
            };
            if (editingPaymentId) {
                await axios.put(`/api/v1/contracts/${editingId}/payments/${editingPaymentId}`, payload);
                toast.success('Đã cập nhật thanh toán.');
            } else {
                const payRes = await axios.post(`/api/v1/contracts/${editingId}/payments`, payload);
                const payReq = payRes?.data?.requires_approval === true;
                toast.success(
                    payRes?.data?.message
                    || (payReq ? 'Đã gửi phiếu duyệt thanh toán.' : 'Đã thêm thanh toán.'),
                );
            }
            setShowPaymentForm(false);
            setEditingPaymentId(null);
            await refreshContractExtras();
            await fetchContracts(filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu thanh toán thất bại.');
        } finally {
            setSavingPayment(false);
        }
    };

    const removePayment = async (id) => {
        if (!editingId) {
            if (String(id).startsWith('local-pay-')) {
                if (!confirm('Xóa dòng thanh toán nháp này?')) return;
                setPayments((prev) => prev.filter((p) => p.id !== id));
            }
            return;
        }
        if (!confirm('Xóa thanh toán này?')) return;
        try {
            await axios.delete(`/api/v1/contracts/${editingId}/payments/${id}`);
            toast.success('Đã xóa thanh toán.');
            await refreshContractExtras();
            await fetchContracts(filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa thanh toán thất bại.');
        }
    };

    const openCostCreate = () => {
        if (!editingFinancePerms.can_submit_finance_request) {
            toast.error('Bạn không có quyền gửi phiếu chi phí cho hợp đồng này.');
            return;
        }
        setEditingCostId(null);
        setCostForm({ amount: '', cost_date: todayInputValue(), cost_type: '', note: '' });
        setShowCostForm(true);
    };

    const editCost = (cost) => {
        if (cost.row_type === 'pending_request') {
            toast.error('Không sửa trực tiếp phiếu đang chờ duyệt.');
            return;
        }
        if (cost.row_type === 'create_draft') {
        setEditingCostId(cost.id);
        setCostForm({
                amount: formatMoneyInput(cost.amount),
                cost_date: toDateInputValue(cost.cost_date),
                cost_type: cost.cost_type || '',
                note: cost.note || '',
            });
            setShowCostForm(true);
            return;
        }
        setEditingCostId(cost.id);
        setCostForm({
            amount: formatMoneyInput(cost.amount),
            cost_date: toDateInputValue(cost.cost_date),
            cost_type: cost.cost_type || '',
            note: cost.note || '',
        });
        setShowCostForm(true);
    };

    const submitCost = async (e) => {
        e.preventDefault();
        if (savingCost) return;
        if (!editingId) {
            setSavingCost(true);
            try {
                const payload = {
                    id: editingCostId && String(editingCostId).startsWith('local-cost-')
                        ? editingCostId
                        : `local-cost-${Date.now()}`,
                    row_type: 'create_draft',
                    amount: parseNumberInput(costForm.amount),
                    cost_date: costForm.cost_date || null,
                    cost_type: costForm.cost_type || null,
                    note: costForm.note || null,
                };
                if (editingCostId && String(editingCostId).startsWith('local-cost-')) {
                    setCosts((prev) => prev.map((c) => (String(c.id) === String(editingCostId) ? { ...payload, id: editingCostId } : c)));
                    toast.success('Đã cập nhật dòng chi phí (gửi duyệt khi tạo hợp đồng).');
                } else {
                    setCosts((prev) => [...prev, payload]);
                    toast.success('Đã thêm dòng chi phí (gửi duyệt khi tạo hợp đồng).');
                }
                setShowCostForm(false);
                setEditingCostId(null);
            } finally {
                setSavingCost(false);
            }
            return;
        }
        setSavingCost(true);
        try {
            const payload = {
                amount: parseNumberInput(costForm.amount),
                cost_date: costForm.cost_date || null,
                cost_type: costForm.cost_type || null,
                note: costForm.note || null,
            };
            if (editingCostId) {
                await axios.put(`/api/v1/contracts/${editingId}/costs/${editingCostId}`, payload);
                toast.success('Đã cập nhật chi phí.');
            } else {
                const costRes = await axios.post(`/api/v1/contracts/${editingId}/costs`, payload);
                const costReq = costRes?.data?.requires_approval === true;
                toast.success(
                    costRes?.data?.message
                    || (costReq ? 'Đã gửi phiếu duyệt chi phí.' : 'Đã thêm chi phí.'),
                );
            }
            setShowCostForm(false);
            setEditingCostId(null);
            await refreshContractExtras();
            await fetchContracts(filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu chi phí thất bại.');
        } finally {
            setSavingCost(false);
        }
    };

    const removeCost = async (id) => {
        if (!editingId) {
            if (String(id).startsWith('local-cost-')) {
                if (!confirm('Xóa dòng chi phí nháp này?')) return;
                setCosts((prev) => prev.filter((c) => c.id !== id));
            }
            return;
        }
        if (!confirm('Xóa chi phí này?')) return;
        try {
            await axios.delete(`/api/v1/contracts/${editingId}/costs/${id}`);
            toast.success('Đã xóa chi phí.');
            await refreshContractExtras();
            await fetchContracts(filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa chi phí thất bại.');
        }
    };

    const approveFinanceRequest = async (requestId) => {
        if (!editingId || !requestId) return;
        if (!confirm('Duyệt ghi nhận thu/chi này?')) return;
        setReviewingRequestId(requestId);
        try {
            const response = await axios.post(`/api/v1/contracts/${editingId}/finance-requests/${requestId}/approve`, {});
            toast.success(response?.data?.message || 'Đã duyệt phiếu tài chính.');
            await refreshContractExtras();
            await fetchContracts(filters);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không thể duyệt phiếu tài chính.');
        } finally {
            setReviewingRequestId(null);
        }
    };

    const rejectFinanceRequest = async (requestId) => {
        if (!editingId || !requestId) return;
        const reason = window.prompt('Lý do từ chối phiếu:');
        if (reason === null) return;
        if (!String(reason).trim()) {
            toast.error('Vui lòng nhập lý do từ chối.');
            return;
        }
        setReviewingRequestId(requestId);
        try {
            const response = await axios.post(`/api/v1/contracts/${editingId}/finance-requests/${requestId}/reject`, {
                review_note: String(reason).trim(),
            });
            toast.success(response?.data?.message || 'Đã từ chối phiếu tài chính.');
            await refreshContractExtras();
            await fetchContracts(filters);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không thể từ chối phiếu tài chính.');
        } finally {
            setReviewingRequestId(null);
        }
    };

    const submitImport = async (e) => {
        e.preventDefault();
        if (!importFile) {
            toast.error('Vui lòng chọn file Excel.');
            return;
        }
        setImporting(true);
        try {
            const formData = new FormData();
            formData.append('file', importFile);
            const res = await axios.post('/api/v1/imports/contracts', formData);
            setImportJob(res.data?.job || null);
            setImportReport(null);
            toast.success('Đã đưa file import hợp đồng vào hàng đợi xử lý.');
        } catch (e) {
            const validationMessages = extractValidationMessages(e);
            const fallbackMessage = getErrorMessage(e, 'Import thất bại.');
            setImportJob(null);
            setImporting(false);
            setImportReport({
                created: 0,
                updated: 0,
                skipped: 0,
                warnings: [],
                errors: validationMessages.length > 0
                    ? validationMessages.map((message) => ({ row: '-', message }))
                    : [{ row: '-', message: fallbackMessage }],
            });
            toast.error(fallbackMessage);
        }
    };

    useEffect(() => {
        if (!showImport || !importJob?.id) return undefined;

        const poll = async () => {
            try {
                const res = await axios.get(`/api/v1/imports/jobs/${importJob.id}`);
                const nextJob = res.data || null;
                setImportJob(nextJob);

                if (nextJob?.status === 'completed') {
                    window.clearInterval(timer);
                    const report = nextJob.report || {};
                    setImporting(false);
                    setImportReport(report);
                    toast.success(
                        `Import hoàn tất: ${report.created || 0} tạo mới, ${report.updated || 0} cập nhật, ${report.skipped || 0} bỏ qua.`
                    );
                    await fetchContracts();
                } else if (nextJob?.status === 'failed') {
                    window.clearInterval(timer);
                    setImporting(false);
                    setImportReport(nextJob.report || {
                        created: 0,
                        updated: 0,
                        skipped: 0,
                        warnings: [],
                        errors: [{ row: '-', message: nextJob.error_message || 'Import thất bại.' }],
                    });
                    toast.error(nextJob?.error_message || 'Import thất bại.');
                }
            } catch (error) {
                setImporting(false);
                toast.error(getErrorMessage(error, 'Không kiểm tra được tiến trình import hợp đồng.'));
            }
        };

        const timer = window.setInterval(poll, 1500);
        poll();

        return () => window.clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showImport, importJob?.id]);

    const save = async (createAndApprove = false) => {
        if (savingContract) return;
        if (!editingId && !canCreate) return toast.error('Bạn không có quyền tạo hợp đồng.');
        if (editingId && !editingCanManage) {
            return toast.error('Bạn chỉ có quyền xem hợp đồng này.');
        }
        if (!form.title?.trim() || !form.client_id) {
            return toast.error('Vui lòng chọn khách hàng và nhập tiêu đề hợp đồng.');
        }
        if (!form.signed_at?.trim() || !form.start_date?.trim() || !form.end_date?.trim()) {
            return toast.error('Vui lòng nhập đủ ngày ký, ngày bắt đầu hiệu lực và ngày kết thúc.');
        }
        const dateOrderError = validateContractDateOrder(form.signed_at, form.start_date, form.end_date);
        if (dateOrderError) {
            return toast.error(dateOrderError);
        }
        const validProductLines = items.filter((item) => {
            const pid = item.product_id ? Number(item.product_id) : null;
            const name = String(item.product_name ?? '').trim();
            return (Number.isFinite(pid) && pid > 0) || name.length > 0;
        }).length;
        if (validProductLines < 1) {
            return toast.error('Vui lòng thêm ít nhất một dòng sản phẩm hoặc dịch vụ vào hợp đồng.');
        }
        const payload = {
            title: form.title,
            client_id: Number(form.client_id),
            collector_user_id: form.collector_user_id ? Number(form.collector_user_id) : null,
            subtotal_value: contractSubtotal,
            value: contractValueTotal,
            vat_enabled: false,
            vat_mode: null,
            vat_rate: null,
            vat_amount: 0,
            payment_times: form.payment_times === '' ? 1 : Number(form.payment_times),
            signed_at: form.signed_at,
            start_date: form.start_date,
            end_date: form.end_date,
            notes: form.notes || null,
            opportunity_id: form.opportunity_id ? Number(form.opportunity_id) : null,
            items: items.map((item) => ({
                ...(item.id ? { id: Number(item.id) } : {}),
                product_id: item.product_id ? Number(item.product_id) : null,
                product_name: item.product_name || null,
                unit: item.unit || null,
                unit_price: parseNumberInput(item.unit_price),
                quantity: item.quantity === '' ? 1 : Math.max(1, parseNumberInput(item.quantity)),
                note: item.note || null,
            })),
        };
        if (!editingId) {
            payload.pending_payment_requests = payments
                .filter((p) => p.row_type === 'create_draft')
                .map((p) => ({
                    amount: parseNumberInput(p.amount),
                    paid_at: p.paid_at || null,
                    method: p.method || null,
                    note: p.note || null,
                }));
            payload.pending_cost_requests = costs
                .filter((c) => c.row_type === 'create_draft')
                .map((c) => ({
                    amount: parseNumberInput(c.amount),
                    cost_date: c.cost_date || null,
                    cost_type: c.cost_type || null,
                    note: c.note || null,
                }));
        }
        setSavingContract(true);
        try {
            if (editingId) {
                await axios.put(`/api/v1/contracts/${editingId}`, payload);
                toast.success('Đã cập nhật hợp đồng.');
            } else {
                await axios.post('/api/v1/contracts', {
                    ...payload,
                    create_and_approve: createAndApprove,
                });
                toast.success(createAndApprove ? 'Đã tạo và duyệt hợp đồng.' : 'Đã tạo hợp đồng.');
            }
            setShowForm(false);
            resetForm();
            await fetchContracts();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu hợp đồng thất bại.');
        } finally {
            setSavingContract(false);
        }
    };

    const rejectContract = async (contract) => {
        const contractId = contract?.id || editingId;
        if (!contractId || savingContract) return;
        if (!canApprove) {
            toast.error('Bạn không có quyền từ chối duyệt.');
            return;
        }
        if ((contract?.approval_status || '') === 'rejected' || form.status_display === 'cancelled') {
            toast.error('Hợp đồng đã ở trạng thái không duyệt.');
            return;
        }
        if (!window.confirm('Từ chối duyệt hợp đồng này? Trạng thái sẽ chuyển sang «Hủy».')) return;
        const note = window.prompt('Lý do không duyệt (tuỳ chọn):') || '';
        setSavingContract(true);
        try {
            await axios.post(`/api/v1/contracts/${contractId}/cancel`, { note: note.trim() || null });
            toast.success('Đã từ chối duyệt hợp đồng.');
            if (!contract) {
                setShowForm(false);
                resetForm();
            }
            await fetchContracts(filters);
        } catch (e) {
            toast.error(getErrorMessage(e, 'Không thể từ chối duyệt hợp đồng.'));
        } finally {
            setSavingContract(false);
        }
    };

    const remove = async (id) => {
        if (!canDelete) return toast.error('Bạn không có quyền xóa hợp đồng.');
        if (!confirm('Xóa hợp đồng này?')) return;
        try {
            await axios.delete(`/api/v1/contracts/${id}`);
            toast.success('Đã xóa hợp đồng.');
            await fetchContracts();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa hợp đồng thất bại.');
        }
    };

    const approve = async (contract) => {
        if (!canApprove) return toast.error('Bạn không có quyền duyệt.');
        try {
            await axios.post(`/api/v1/contracts/${contract.id}/approve`, {});
            toast.success('Đã duyệt hợp đồng.');
            await fetchContracts(filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Duyệt hợp đồng thất bại.');
        }
    };

    const applyFilters = () => {
        setFilters((prev) => {
            const next = { ...prev, page: 1 };
            fetchContracts(1, next);
            return next;
        });
    };

    const resetFilters = () => {
        const next = emptyContractFilters();
        setFilters(next);
        fetchContracts(1, next);
    };

    const submitCareNote = async () => {
        if (!detailContract) return;
        if (!careNoteForm.title.trim() || !careNoteForm.detail.trim()) {
            toast.error('Vui lòng nhập tiêu đề và nội dung chăm sóc.');
            return;
        }

        setSavingCareNote(true);
        try {
            const res = await axios.post(`/api/v1/contracts/${detailContract.id}/care-notes`, {
                title: careNoteForm.title.trim(),
                detail: careNoteForm.detail.trim(),
            });
            const note = res.data?.note || null;
            if (note) {
                setDetailContract((current) => current ? ({
                    ...current,
                    care_notes: [note, ...(current.care_notes || [])],
                }) : current);
            }
            setCareNoteForm({ title: '', detail: '' });
            toast.success('Đã cập nhật tiến độ chăm sóc hợp đồng.');
        } catch (e) {
            toast.error(getErrorMessage(e, 'Không thể thêm ghi chú chăm sóc.'));
        } finally {
            setSavingCareNote(false);
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Quản lý hợp đồng"
            description="Theo dõi hợp đồng, duyệt kế toán và quản lý sản phẩm kèm theo."
            stats={stats}
        >
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
                    {canCreate && (!isEmployee || hasAssignableClients) && (
                        <button
                            type="button"
                            className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm"
                            onClick={openCreate}
                        >
                            Thêm mới
                        </button>
                    )}
                    {canManage && (
                        <button
                            type="button"
                            className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                            onClick={() => {
                                setImportFile(null);
                                setImportReport(null);
                                setShowImport(true);
                            }}
                        >
                            Import Excel
                        </button>
                    )}
                </div>
                <FilterToolbar enableSearch
                    className="mb-4 border-0 p-0 shadow-none"
                    title="Danh sách hợp đồng"
                    description="Tìm kiếm nhanh hoặc lọc chi tiết theo từng cột hợp đồng. Danh sách ban đầu không tự áp dụng khoảng ngày trong tháng hiện tại."
                    searchValue={filters.search}
                    onSearch={handleContractSearch}
                    onSubmitFilters={applyFilters}
                    collapsible
                    defaultCollapsed
                    collapseLabel="bộ lọc hợp đồng"
                    collapseHint="Bộ lọc đang thu gọn. Mở bộ lọc để lọc theo từng cột, tiền, số lần thanh toán và các mốc ngày."
                >
                    <div className={FILTER_GRID_RESPONSIVE}>
                        {CONTRACT_TEXT_FILTER_FIELDS.map((field) => (
                            <FilterField key={field.key} label={field.label}>
                                <input
                                    className={filterControlClass}
                                    value={filters[field.key] || ''}
                                    onChange={(e) => setFilters((s) => ({ ...s, [field.key]: e.target.value }))}
                                    placeholder={field.placeholder}
                                />
                            </FilterField>
                        ))}
                        <FilterField
                            label={(
                                <span className="inline-flex items-center gap-1.5">
                                    Trạng thái
                                    <FilterStatusHelpIcon items={CONTRACT_STATUS_FILTER_HELP} ariaLabel="Giải thích trạng thái hợp đồng" />
                                </span>
                            )}
                        >
                            <select className={filterControlClass} value={filters.status} onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}>
                                <option value="">Tất cả trạng thái</option>
                                {STATUS_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </FilterField>
                        <FilterField label="Duyệt">
                            <select className={filterControlClass} value={filters.approval_status} onChange={(e) => setFilters((s) => ({ ...s, approval_status: e.target.value }))}>
                                <option value="">Tất cả duyệt</option>
                                <option value="pending">Chờ duyệt</option>
                                <option value="approved">Đã duyệt</option>
                                <option value="rejected">Từ chối</option>
                            </select>
                        </FilterField>
                        <FilterField label="Nhận bàn giao">
                            <select className={filterControlClass} value={filters.handover_receive_status} onChange={(e) => setFilters((s) => ({ ...s, handover_receive_status: e.target.value }))}>
                                <option value="">Tất cả</option>
                                <option value="chua_nhan_ban_giao">Chưa nhận bàn giao</option>
                                <option value="da_nhan_ban_giao">Đã nhận bàn giao</option>
                            </select>
                        </FilterField>
                        <FilterField label="Dự án liên kết">
                            <select className={filterControlClass} value={filters.has_project} onChange={(e) => setFilters((s) => ({ ...s, has_project: e.target.value }))}>
                                <option value="">Tất cả</option>
                                <option value="yes">Đã liên kết</option>
                                <option value="no">Chưa liên kết</option>
                            </select>
                        </FilterField>
                        <FilterField label="Trạng thái dự án">
                            <select className={filterControlClass} value={filters.project_status} onChange={(e) => setFilters((s) => ({ ...s, project_status: e.target.value }))}>
                                <option value="">Tất cả</option>
                                {PROJECT_STATUS_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </FilterField>
                        <FilterField label="Nhân viên thu" hint="Lọc theo cột «Nhân viên thu» (người thu hợp đồng).">
                            <TagMultiSelect
                                options={collectorFilterOptions}
                                selectedIds={filters.staff_ids}
                                onChange={(selectedIds) => setFilters((s) => ({ ...s, staff_ids: selectedIds }))}
                                addPlaceholder="Tìm và thêm nhân viên thu"
                                emptyLabel="Để trống để xem toàn bộ trong phạm vi."
                            />
                        </FilterField>
                        {CONTRACT_NUMERIC_RANGE_FIELDS.map((field) => (
                            <React.Fragment key={field.key}>
                                <FilterField label={`${field.label} từ`}>
                                    <input
                                        className={filterControlClass}
                                        value={filters[`${field.key}_min`] || ''}
                                        onChange={(e) => setFilters((s) => ({ ...s, [`${field.key}_min`]: e.target.value }))}
                                        placeholder="Tối thiểu"
                                        inputMode="decimal"
                                    />
                                </FilterField>
                                <FilterField label={`${field.label} đến`}>
                                    <input
                                        className={filterControlClass}
                                        value={filters[`${field.key}_max`] || ''}
                                        onChange={(e) => setFilters((s) => ({ ...s, [`${field.key}_max`]: e.target.value }))}
                                        placeholder="Tối đa"
                                        inputMode="decimal"
                                    />
                                </FilterField>
                            </React.Fragment>
                        ))}
                        {CONTRACT_DATE_FIELD_OPTIONS.map((field) => (
                            <React.Fragment key={field.value}>
                                <FilterField label={`${field.label} từ`}>
                                    <FilterDateInput
                                        className={filterControlClass}
                                        value={filters[`${field.value}_from`] || ''}
                                        onChange={(e) => setFilters((s) => ({ ...s, [`${field.value}_from`]: e.target.value }))}
                                    />
                                </FilterField>
                                <FilterField label={`${field.label} đến`}>
                                    <FilterDateInput
                                        className={filterControlClass}
                                        value={filters[`${field.value}_to`] || ''}
                                        onChange={(e) => setFilters((s) => ({ ...s, [`${field.value}_to`]: e.target.value }))}
                                    />
                                </FilterField>
                            </React.Fragment>
                        ))}
                        <FilterActionGroup className={FILTER_GRID_SUBMIT_ROW}>
                            <button
                                type="button"
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                                onClick={resetFilters}
                            >
                                Xóa lọc
                            </button>
                            <button type="submit" className={FILTER_SUBMIT_BUTTON_CLASS}>Lọc</button>
                        </FilterActionGroup>
                    </div>
                </FilterToolbar>

                <p className="mb-2 text-xs text-slate-500">
                    Card phía trên đang so sánh theo <strong>năm dương lịch</strong>
                    {' '}
                    ({yearComparison.current_period?.from || '—'} đến {yearComparison.current_period?.to || '—'}
                    {' '}
                    so với
                    {' '}
                    {yearComparison.previous_period?.from || '—'} đến {yearComparison.previous_period?.to || '—'}).
                    Hệ thống ưu tiên <strong>ngày duyệt</strong> (`approved_at`), nếu chưa duyệt sẽ dùng <strong>ngày tạo</strong> (`created_at`),
                    và các card này <strong>không bám bộ lọc ngày</strong> của bảng bên dưới.
                </p>
                <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="group relative overflow-hidden rounded-3xl border border-sky-300/60 bg-gradient-to-br from-sky-600 via-cyan-600 to-blue-700 px-5 py-4 text-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
                        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/10" />
                        <div className="pointer-events-none absolute -left-10 -bottom-10 h-24 w-24 rounded-full bg-white/10" />
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl border border-white/20 bg-white/15 text-white">
                                    <AppIcon name="document" className="h-4 w-4" />
                                </span>
                                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/85">Hợp đồng</div>
                            </div>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${percentBadgeClass(yearComparison.change_percent.contracts_count)}`}>
                                {toSignedPercent(yearComparison.change_percent.contracts_count)}
                            </span>
                        </div>
                        <div className="mt-2 text-3xl font-bold leading-none">{Number(yearComparison.current.contracts_count || 0).toLocaleString('vi-VN')}</div>
                        <div className="mt-3 text-sm text-white/90">
                            {yearComparison.previous_label || 'Năm trước'}: {Number(yearComparison.previous.contracts_count || 0).toLocaleString('vi-VN')}
                        </div>
                    </div>

                    <div className="group relative overflow-hidden rounded-3xl border border-indigo-300/60 bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-700 px-5 py-4 text-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
                        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/10" />
                        <div className="pointer-events-none absolute -left-10 -bottom-10 h-24 w-24 rounded-full bg-white/10" />
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl border border-white/20 bg-white/15 text-white">
                                    <AppIcon name="users" className="h-4 w-4" />
                                </span>
                                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/85">Khách hàng</div>
                            </div>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${percentBadgeClass(yearComparison.change_percent.clients_count)}`}>
                                {toSignedPercent(yearComparison.change_percent.clients_count)}
                            </span>
                        </div>
                        <div className="mt-2 text-3xl font-bold leading-none">{Number(yearComparison.current.clients_count || 0).toLocaleString('vi-VN')}</div>
                        <div className="mt-3 text-sm text-white/90">
                            {yearComparison.previous_label || 'Năm trước'}: {Number(yearComparison.previous.clients_count || 0).toLocaleString('vi-VN')}
                        </div>
                    </div>

                    <div className="group relative overflow-hidden rounded-3xl border border-emerald-300/60 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-700 px-5 py-4 text-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
                        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/10" />
                        <div className="pointer-events-none absolute -left-10 -bottom-10 h-24 w-24 rounded-full bg-white/10" />
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl border border-white/20 bg-white/15 text-white">
                                    <AppIcon name="chart" className="h-4 w-4" />
                                </span>
                                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/85">Doanh số</div>
                            </div>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${percentBadgeClass(yearComparison.change_percent.sales_total)}`}>
                                {toSignedPercent(yearComparison.change_percent.sales_total)}
                            </span>
                        </div>
                        <div className="mt-2 text-3xl font-bold leading-none">{Number(yearComparison.current.sales_total || 0).toLocaleString('vi-VN')}</div>
                        <div className="mt-3 text-sm text-white/90">
                            {yearComparison.previous_label || 'Năm trước'}: {Number(yearComparison.previous.sales_total || 0).toLocaleString('vi-VN')}
                        </div>
                    </div>

                    <div className="group relative overflow-hidden rounded-3xl border border-teal-300/60 bg-gradient-to-br from-teal-600 via-emerald-600 to-cyan-700 px-5 py-4 text-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
                        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/10" />
                        <div className="pointer-events-none absolute -left-10 -bottom-10 h-24 w-24 rounded-full bg-white/10" />
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl border border-white/20 bg-white/15 text-white">
                                    <AppIcon name="trend" className="h-4 w-4" />
                                </span>
                                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/85">Doanh thu</div>
                            </div>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${percentBadgeClass(yearComparison.change_percent.revenue_total)}`}>
                                {toSignedPercent(yearComparison.change_percent.revenue_total)}
                            </span>
                        </div>
                        <div className="mt-2 text-3xl font-bold leading-none">{Number(yearComparison.current.revenue_total || 0).toLocaleString('vi-VN')}</div>
                        <div className="mt-3 text-sm text-white/90">
                            {yearComparison.previous_label || 'Năm trước'}: {Number(yearComparison.previous.revenue_total || 0).toLocaleString('vi-VN')}
                        </div>
                    </div>
                </div>

                <div className="mb-4 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                    {isEmployee
                        ? 'Nhân viên có thể tạo hợp đồng mới trong phạm vi khách hàng phụ trách, nhưng không có quyền duyệt và không được sửa/xóa hợp đồng đã tạo.'
                        : userRole === 'quan_ly'
                            ? 'Trưởng phòng được sửa/xóa hợp đồng trong phạm vi phòng ban, đồng thời có thể gắn nhân viên thu và nhóm chăm sóc theo tag.'
                            : canApprove
                                ? 'Admin và Kế toán có thể theo dõi toàn bộ hợp đồng, duyệt nhanh, gắn nhóm chăm sóc và quản lý công nợ trên cùng một màn.'
                                : 'Theo dõi hợp đồng theo phạm vi khách hàng bạn đang quản lý.'}
                </div>
                {canSelectContracts && selectedContractIds.length > 0 && (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3">
                        <div>
                            <div className="text-sm font-medium text-cyan-900">
                                Đã chọn {selectedContractIds.length} hợp đồng.
                            </div>
                            {canManage && (
                                <div className="mt-1 text-xs text-cyan-800/80">
                                    Đồng bộ hiện tại: <strong>{bulkSyncTargetLabel}</strong> theo <strong>{bulkSyncReferenceLabel}</strong>.
                                </div>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                className="rounded-xl border border-cyan-300 bg-white px-3 py-2 text-xs font-semibold text-cyan-700"
                                onClick={() => setSelectedContractIds([])}
                                disabled={bulkLoading}
                            >
                                Bỏ chọn
                            </button>
                            {canExportContracts && (
                                <button
                                    type="button"
                                    className="rounded-xl border border-teal-300 bg-teal-100 px-3 py-2 text-xs font-semibold text-teal-900"
                                    onClick={openExportModal}
                                    disabled={bulkLoading}
                                    title="Chọn cột và sheet cần xuất ra file XLSX"
                                >
                                    {bulkLoading ? 'Đang xử lý...' : 'Xuất XLSX đã chọn'}
                                </button>
                            )}
                            {canManage && (
                                <button
                                    type="button"
                                    className="rounded-xl border border-sky-300 bg-sky-100 px-3 py-2 text-xs font-semibold text-sky-900"
                                    onClick={openBulkDateSyncModal}
                                    disabled={bulkLoading}
                                    title="Chọn trường ngày cần đồng bộ và ngày tham chiếu trước khi chạy"
                                >
                                    {bulkLoading ? 'Đang xử lý...' : 'Đồng bộ ngày đã chọn'}
                                </button>
                            )}
                            {canApprove && (
                                <button
                                    type="button"
                                    className="rounded-xl border border-emerald-300 bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800"
                                    onClick={bulkApproveContracts}
                                    disabled={bulkLoading}
                                >
                                    {bulkLoading ? 'Đang xử lý...' : 'Duyệt đã chọn'}
                                </button>
                            )}
                            {canDelete && (
                                <button
                                    type="button"
                                    className="rounded-xl border border-rose-300 bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-800"
                                    onClick={bulkDeleteContracts}
                                    disabled={bulkLoading}
                                >
                                    {bulkLoading ? 'Đang xử lý...' : 'Xóa đã chọn'}
                                </button>
                            )}
                        </div>
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table
                        ref={contractTableRef}
                        data-sort-scope="remote"
                        data-sort-by={filters.sort_by || 'created_at'}
                        data-sort-dir={filters.sort_dir || 'desc'}
                        className="table-spacious min-w-full text-sm"
                    >
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-wider text-text-subtle border-b border-slate-200">
                                    {canSelectContracts && (
                                        <th className="py-2 pr-3" data-az-ignore>
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
                                                checked={allVisibleSelected}
                                                onChange={toggleSelectAllVisible}
                                                aria-label="Chọn tất cả hợp đồng đang hiển thị"
                                            />
                                        </th>
                                    )}
                                    <th className="py-2" data-sort-key="code">Hợp đồng</th>
                                    <th className="py-2" data-sort-key="client_name">Khách hàng</th>
                                    <th className="py-2" data-az-ignore>Cơ hội</th>
                                    <th className="py-2" data-az-ignore>Dự án liên kết</th>
                                    <th className="py-2" data-sort-key="client_phone">SĐT khách hàng</th>
                                    <th className="py-2" data-sort-key="signed_at">Ngày ký</th>
                                    <th className="py-2" data-sort-key="approved_at">Ngày duyệt</th>
                                    <th className="py-2" data-sort-key="start_date">Ngày bắt đầu hiệu lực</th>
                                    <th className="py-2" data-sort-key="end_date">Ngày kết thúc</th>
                                    <th className="py-2" data-sort-key="notes">Ghi chú</th>
                                    <th className="py-2" data-sort-key="collector_name">Nhân viên thu</th>
                                    <th className="py-2" data-sort-key="value">Giá trị</th>
                                    <th className="py-2" data-sort-key="payments_total">Đã thu</th>
                                    <th className="py-2" data-sort-key="debt_outstanding">Công nợ</th>
                                    <th className="py-2" data-sort-key="costs_total">Chi phí</th>
                                    <th className="py-2" data-sort-key="payments_count">TT</th>
                                    <th className="py-2" data-sort-key="status">Trạng thái</th>
                                    <th className="py-2" data-sort-key="approval_status">Duyệt</th>
                                    <th className="py-2" data-sort-key="handover_receive_status">Bàn giao</th>
                                    <th className="py-2" data-az-ignore></th>
                                </tr>
                            </thead>
                            <tbody>
                                {contracts.map((c) => (
                                    <tr key={c.id} className={`border-b border-slate-100 ${selectedContractSet.has(Number(c.id)) ? 'bg-primary/5' : ''}`}>
                                        {canSelectContracts && (
                                            <td className="py-2 pr-3 align-top">
                                                <input
                                                    type="checkbox"
                                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
                                                    checked={selectedContractSet.has(Number(c.id))}
                                                    onChange={() => toggleContractSelection(c.id)}
                                                    aria-label={`Chọn hợp đồng ${c.code || c.id}`}
                                                />
                                            </td>
                                        )}
                                        <td className="py-2">
                                            <button
                                                type="button"
                                                className="group text-left"
                                                onClick={() => openDetail(c.id)}
                                            >
                                                <AutoCodeBadge code={c.code || `CTR-${c.id}`} className="group-hover:border-primary/30 group-hover:bg-primary/5 group-hover:text-primary" />
                                                <div className="text-xs text-text-muted">{c.title}</div>
                                                <div className="mt-1 text-[11px] font-medium text-primary/80">
                                                    Xem chi tiết hợp đồng
                                                </div>
                                            </button>
                                        </td>
                                        <td className="py-2 text-slate-700">{c.client?.name || '—'}</td>
                                        <td className="py-2 align-top text-slate-700">
                                            {c.opportunity?.id ? (
                                                <div className="max-w-[14rem]">
                                                    <a
                                                        href={`/co-hoi/${c.opportunity.id}`}
                                                        className="font-semibold text-primary hover:underline text-xs leading-snug"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        CH-{c.opportunity.id}
                                                    </a>
                                                    <div className="text-[11px] text-text-muted truncate" title={c.opportunity.title || ''}>
                                                        {c.opportunity.title || '—'}
                                                    </div>
                                                </div>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td className="py-2 align-top text-slate-700">
                                            {(() => {
                                                const pr = resolveLinkedProject(c);
                                                if (!pr?.id) return '—';
                                                return (
                                                    <div className="max-w-[14rem]">
                                                        <a
                                                            href={`/du-an/${pr.id}`}
                                                            className="font-semibold text-primary hover:underline text-xs leading-snug"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            {pr.code || `DA-${pr.id}`}
                                                        </a>
                                                        <div className="text-[11px] text-text-muted truncate" title={pr.name || ''}>
                                                            {pr.name || '—'}
                                                        </div>
                                                        <span className="mt-0.5 inline-block rounded-full border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                                            {PROJECT_STATUS_LABELS[pr.status] || pr.status || '—'}
                                                        </span>
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="py-2 text-slate-700">{c.client?.phone || '—'}</td>
                                        <td className="py-2 text-slate-700">{formatDateDisplay(c.signed_at)}</td>
                                        <td className="py-2 text-slate-700">{formatDateDisplay(c.approved_at)}</td>
                                        <td className="py-2 text-slate-700">{formatDateDisplay(c.start_date)}</td>
                                        <td className="py-2 text-slate-700">{formatDateDisplay(c.end_date)}</td>
                                        <td className="allow-wrap py-2 text-slate-700">{c.notes || '—'}</td>
                                        <td className="py-2 text-slate-700">{c.collector?.name || '—'}</td>
                                        <td className="py-2 text-slate-700">{formatCurrency(resolveContractValue(c))}</td>
                                        <td className="py-2 text-slate-700">{formatCurrency(c.payments_total || 0)}</td>
                                        <td className="py-2 text-slate-700">{formatCurrency(c.debt_outstanding || 0)}</td>
                                        <td className="py-2 text-slate-700">{formatCurrency(c.costs_total || 0)}</td>
                                        <td className="py-2 text-slate-700">
                                            {(c.payments_count ?? 0)}/{c.payment_times ?? 1}
                                        </td>
                                        <td className="py-2">
                                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(c.status)}`}>
                                                {STATUS_OPTIONS.find((s) => s.value === c.status)?.label || c.status}
                                            </span>
                                        </td>
                                        <td className="py-2">
                                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${approvalBadgeClass(c.approval_status)}`}>
                                                {approvalLabel(c.approval_status)}
                                            </span>
                                        </td>
                                        <td className="py-2">
                                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${handoverReceiveBadgeClass(c.handover_receive_status)}`}>
                                                {handoverReceiveLabel(c.handover_receive_status)}
                                            </span>
                                        </td>
                                        <td className="py-2 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    type="button"
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                                                    aria-label="Xem chi tiết hợp đồng"
                                                    title="Xem chi tiết hợp đồng"
                                                    onClick={() => openDetail(c.id)}
                                                >
                                                    <AppIcon name="eye" className="h-4 w-4" />
                                                </button>
                                                {canManageContract(c) && (
                                                    <button
                                                        type="button"
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                                                        aria-label="Sửa hợp đồng"
                                                        title="Sửa hợp đồng"
                                                        onClick={() => startEdit(c)}
                                                    >
                                                        <AppIcon name="pencil" className="h-4 w-4" />
                                                    </button>
                                                )}
                                                {canApprove && c.approval_status === 'pending' && (
                                                    <button
                                                        type="button"
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700"
                                                        aria-label="Không duyệt hợp đồng"
                                                        title="Không duyệt hợp đồng"
                                                        onClick={() => rejectContract(c)}
                                                    >
                                                        <AppIcon name="x" className="h-4 w-4" />
                                                    </button>
                                                )}
                                                {canApprove && c.approval_status !== 'approved' && (
                                                    <button
                                                        type="button"
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 transition hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-700"
                                                        aria-label="Duyệt hợp đồng"
                                                        title="Duyệt hợp đồng"
                                                        onClick={() => approve(c)}
                                                    >
                                                        <AppIcon name="check" className="h-4 w-4" />
                                                    </button>
                                                )}
                                                {canDeleteContract(c) && (
                                                    <button
                                                        type="button"
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700"
                                                        aria-label="Xóa hợp đồng"
                                                        title="Xóa hợp đồng"
                                                        onClick={() => remove(c.id)}
                                                    >
                                                        <AppIcon name="trash" className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {contracts.length === 0 && (
                                    <tr>
                                        <td className="py-6 text-center text-sm text-text-muted" colSpan={canSelectContracts ? 21 : 20}>
                                            Chưa có hợp đồng nào.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {!loading && (contractMeta.total || 0) > 0 ? (
                                <tfoot>
                                    <tr className="border-t-2 border-slate-200 bg-slate-50/90 text-left text-sm text-slate-800">
                                        <td
                                            colSpan={canSelectContracts ? 12 : 11}
                                            className="py-2.5 pr-3 text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle"
                                        >
                                            Tổng theo bộ lọc (tất cả trang)
                                        </td>
                                        <td className="py-2.5 font-semibold text-slate-900">{formatCurrency(listAggregates.revenue_total)}</td>
                                        <td className="py-2.5 font-semibold text-slate-900">{formatCurrency(listAggregates.cashflow_total)}</td>
                                        <td className="py-2.5 font-semibold text-slate-900">{formatCurrency(listAggregates.debt_total)}</td>
                                        <td className="py-2.5 font-semibold text-slate-900">{formatCurrency(listAggregates.costs_total)}</td>
                                        <td className="py-2.5 text-center text-text-muted">—</td>
                                        <td className="py-2.5 text-text-muted">—</td>
                                        <td className="py-2.5 text-text-muted">—</td>
                                        <td className="py-2.5 text-text-muted">—</td>
                                        <td className="py-2.5" aria-hidden />
                                    </tr>
                                </tfoot>
                            ) : null}
                        </table>
                </div>
                <PaginationControls
                    page={contractMeta.current_page}
                    lastPage={contractMeta.last_page}
                    total={contractMeta.total}
                    perPage={contractMeta.per_page ?? filters.per_page ?? 20}
                    rangeFrom={contractMeta.from}
                    rangeTo={contractMeta.to}
                    label="hợp đồng"
                    loading={loading}
                    onPageChange={(page) => fetchContracts(page, filters)}
                    onPerPageChange={(perPage) => {
                        const next = { ...filters, per_page: perPage, page: 1 };
                        setFilters(next);
                        fetchContracts(1, next);
                    }}
                />
            </div>

            <Modal
                open={showForm}
                onClose={() => {
                    if (savingContract) return;
                    closeForm();
                }}
                title={editingId ? `Sửa hợp đồng #${editingId}` : 'Tạo hợp đồng'}
                description="Mã hợp đồng sẽ tự sinh. Bạn chỉ cần nhập nghiệp vụ, người phụ trách và danh sách sản phẩm."
                size="xl"
            >
                <div className="space-y-4 text-sm">
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <LabeledField label="Tiêu đề hợp đồng" required className="md:col-span-2">
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    placeholder="Ví dụ: Hợp đồng SEO Tổng Thể Q2"
                                    value={form.title}
                                    onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                                />
                            </LabeledField>
                            <LabeledField label="Khách hàng" required className="md:col-span-2">
                                <ClientSelect
                                    assignedOnly
                                    className="bg-white"
                                    value={form.client_id}
                                    onChange={(id) => setForm((s) => ({ ...s, client_id: id, opportunity_id: '' }))}
                                    placeholder="Chọn khách hàng do bạn đang quản lý"
                                    clientPreview={contractClientPreview}
                                />
                            </LabeledField>
                            <LabeledField label="Cơ hội liên kết (tuỳ chọn)" hint="Chỉ hiển thị cơ hội chưa gắn hợp đồng khác (khi sửa, cơ hội hiện tại vẫn có trong danh sách)." className="md:col-span-2">
                                <select
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    value={form.opportunity_id}
                                    disabled={!form.client_id}
                                    onChange={(e) => setForm((s) => ({ ...s, opportunity_id: e.target.value }))}
                                >
                                    <option value="">Không chọn cơ hội</option>
                                    {linkableOpportunities.map((o) => (
                                        <option key={o.id} value={String(o.id)}>
                                            {o.title || `Cơ hội #${o.id}`}
                                        </option>
                                    ))}
                                </select>
                            </LabeledField>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-[0.16em] text-text-subtle">Nhân viên thu theo hợp đồng</p>
                                <p className="mt-1 text-xs text-text-muted">
                                    {isEmployee
                                        ? 'Nhân viên tạo hợp đồng sẽ tự gắn chính mình và không thể đổi sang người khác.'
                                        : userRole === 'quan_ly'
                                            ? 'Trưởng phòng mặc định là chính mình nhưng có thể chọn nhân sự trong phòng để đứng tên hợp đồng.'
                                            : canApprove
                                                ? 'Admin/Kế toán có thể tạo hợp đồng cho mọi nhân viên và dùng thêm nút tạo & duyệt.'
                                                : 'Chọn nhân sự thu theo hợp đồng.'}
                                </p>
                            </div>
                            <select
                                className="min-w-[260px] rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm"
                                value={form.collector_user_id}
                                disabled={!canChooseCollector}
                                onChange={(e) => setForm((s) => ({ ...s, collector_user_id: e.target.value }))}
                            >
                                <option value="">Chọn nhân viên thu</option>
                                {currentUserId && !collectors.some((c) => Number(c.id) === Number(currentUserId)) ? (
                                    <option value={String(currentUserId)}>
                                        {props.auth?.user?.name || `Nhân sự #${currentUserId}`}
                                        {props.auth?.user?.email ? ` • ${props.auth.user.email}` : ''}
                                    </option>
                                ) : null}
                                {collectors.map((collector) => (
                                    <option key={collector.id} value={collector.id}>
                                        {collector.name}{collector.email ? ` • ${collector.email}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold">Sản phẩm trong hợp đồng</h4>
                            <button type="button" className="text-xs text-primary" onClick={addItem}>+ Thêm sản phẩm</button>
                        </div>
                        <div className="space-y-2">
                            {items.map((item, index) => (
                                <div key={index} className="rounded-xl border border-slate-200/80 bg-white p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-semibold text-slate-600">Sản phẩm #{index + 1}</p>
                                        <button type="button" className="text-xs text-rose-500" onClick={() => removeItem(index)}>Xóa</button>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
                                            Sản phẩm
                                        </label>
                                        <select
                                            className="w-full rounded-xl border border-slate-200/80 px-3 py-2 text-xs"
                                            value={item.product_id}
                                            onChange={(e) => {
                                                const selected = products.find((p) => String(p.id) === e.target.value);
                                                updateItem(index, {
                                                    product_id: e.target.value,
                                                    product_name: selected?.name || item.product_name,
                                                    unit: selected?.unit || item.unit,
                                                    unit_price: selected?.unit_price ?? item.unit_price,
                                                });
                                            }}
                                        >
                                            <option value="">Chọn sản phẩm</option>
                                            {products.map((product) => (
                                                <option key={product.id} value={product.id}>
                                                    {product.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                        <div>
                                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
                                                Đơn vị
                                            </label>
                                            <input
                                                className="rounded-xl border border-slate-200/80 px-3 py-2 text-xs"
                                                placeholder="Ví dụ: gói, tháng"
                                                value={item.unit || ''}
                                                onChange={(e) => updateItem(index, { unit: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
                                                Đơn giá
                                            </label>
                                            <input
                                                className="rounded-xl border border-slate-200/80 px-3 py-2 text-xs"
                                                placeholder="Giá bán"
                                                type="text"
                                                inputMode="numeric"
                                                value={item.unit_price}
                                                onChange={(e) => updateItem(index, { unit_price: formatMoneyInput(e.target.value) })}
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
                                                Số lượng
                                            </label>
                                            <input
                                                className="rounded-xl border border-slate-200/80 px-3 py-2 text-xs"
                                                placeholder="Số lượng"
                                                type="number"
                                                value={item.quantity}
                                                onChange={(e) => updateItem(index, { quantity: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
                                                Giá trị
                                            </label>
                                            <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                                                {formatCurrency(calculateItemTotal(item))} VNĐ
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
                                            Ghi chú sản phẩm
                                        </label>
                                        <input
                                            className="rounded-xl border border-slate-200/80 px-3 py-2 text-xs"
                                            placeholder="Điều khoản riêng hoặc phạm vi áp dụng"
                                            value={item.note || ''}
                                            onChange={(e) => updateItem(index, { note: e.target.value })}
                                        />
                                    </div>
                                </div>
                            ))}
                            {items.length === 0 && (
                                <div className="rounded-xl border border-dashed border-slate-200/80 px-3 py-3 text-xs text-text-muted text-center">
                                    Chưa có sản phẩm. Thêm để tự tính giá trị hợp đồng.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                        <div className="grid gap-4 md:grid-cols-3">
                            <LabeledField
                                label="Giá trị hợp đồng (VNĐ)"
                                hint="Tự động bằng tổng giá trị các dòng sản phẩm (đơn giá × số lượng)."
                            >
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 bg-slate-100 px-3 py-2 text-slate-700"
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="0"
                                    value={formatMoneyInput(contractValueTotal)}
                                    readOnly
                                    disabled
                                />
                            </LabeledField>
                            <LabeledField label="Số lần thanh toán">
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    type="number"
                                    placeholder="1"
                                    value={form.payment_times}
                                    onChange={(e) => setForm((s) => ({ ...s, payment_times: e.target.value }))}
                                />
                            </LabeledField>
                            <LabeledField
                                label="Trạng thái hợp đồng"
                                hint="Hệ thống tự cập nhật theo duyệt, thu tiền và ngày kết thúc."
                            >
                                <div className="rounded-2xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-800">
                                    {form.status_display
                                        ? (STATUS_OPTIONS.find((s) => s.value === form.status_display)?.label || form.status_display)
                                        : '— (lưu xong sẽ cập nhật)'}
                                </div>
                            </LabeledField>
                            <LabeledField label="Ngày ký" required>
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    type="date"
                                    required
                                    value={form.signed_at}
                                    onChange={(e) => setForm((s) => ({ ...s, signed_at: e.target.value }))}
                                />
                            </LabeledField>
                            <LabeledField label="Ngày bắt đầu hiệu lực" required>
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    type="date"
                                    required
                                    value={form.start_date}
                                    onChange={(e) => setForm((s) => ({ ...s, start_date: e.target.value }))}
                                />
                            </LabeledField>
                            <LabeledField label="Ngày kết thúc / gia hạn" required>
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    type="date"
                                    required
                                    value={form.end_date}
                                    onChange={(e) => setForm((s) => ({ ...s, end_date: e.target.value }))}
                                />
                            </LabeledField>
                            <LabeledField label="Ghi chú hợp đồng" className="md:col-span-3">
                                <textarea
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    rows={3}
                                    placeholder="Ghi chú thêm về hợp đồng, điều khoản hoặc thông tin nội bộ"
                                    value={form.notes}
                                    onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
                                />
                            </LabeledField>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-semibold text-slate-900">Thanh toán hợp đồng</h4>
                                <p className="text-xs text-text-muted">Số lần thanh toán: {form.payment_times || 1}</p>
                            </div>
                            {editingFinancePerms.can_submit_finance_request && (
                                <button type="button" className="text-xs font-semibold text-primary" onClick={openPaymentCreate}>
                                    + Thêm thanh toán
                                </button>
                            )}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-xs">
                                <thead>
                                    <tr className="text-left text-[11px] uppercase tracking-wider text-text-subtle border-b border-slate-200">
                                        <th className="py-2">Ngày thu</th>
                                        <th className="py-2">Số tiền</th>
                                        <th className="py-2">Phương thức</th>
                                        <th className="py-2">Ghi chú</th>
                                        <th className="py-2 text-right">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.map((p) => (
                                        <tr key={p.id} className="border-b border-slate-100">
                                            <td className="py-2">{p.paid_at ? formatDateDisplay(p.paid_at) : '—'}</td>
                                            <td className="py-2">{formatCurrency(p.amount || 0)}</td>
                                            <td className="py-2">{p.method || '—'}</td>
                                            <td className="py-2">{p.note || '—'}</td>
                                            <td className="py-2 text-right">
                                                {p.row_type === 'create_draft' ? (
                                                    <div className="inline-flex flex-wrap items-center justify-end gap-2">
                                                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                                                            Gửi kèm khi tạo HĐ
                                                        </span>
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                                            aria-label="Sửa dòng nháp"
                                                            title="Sửa dòng nháp"
                                                            onClick={() => editPayment(p)}
                                                        >
                                                            <AppIcon name="pencil" className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                                                            aria-label="Xóa dòng nháp"
                                                            title="Xóa dòng nháp"
                                                            onClick={() => removePayment(p.id)}
                                                        >
                                                            <AppIcon name="trash" className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                ) : p.row_type === 'pending_request' ? (
                                                    <div className="inline-flex flex-wrap items-center justify-end gap-2">
                                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                                            Cần duyệt
                                                        </span>
                                                        {p.submitter?.name ? (
                                                            <span className="max-w-[120px] truncate text-[11px] text-text-muted" title={p.submitter.name}>
                                                                {p.submitter.name}
                                                            </span>
                                                        ) : null}
                                                        {editingFinancePerms.can_review_finance_request ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                                                    onClick={() => approveFinanceRequest(p.finance_request_id)}
                                                                    disabled={reviewingRequestId === p.finance_request_id}
                                                                >
                                                                    Duyệt
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                                                    onClick={() => rejectFinanceRequest(p.finance_request_id)}
                                                                    disabled={reviewingRequestId === p.finance_request_id}
                                                                >
                                                                    Từ chối
                                                                </button>
                                                            </>
                                                        ) : null}
                                                    </div>
                                                ) : editingFinancePerms.can_manage_finance ? (
                                                    <div className="inline-flex items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                                            aria-label="Sửa thanh toán"
                                                            title="Sửa thanh toán"
                                                            onClick={() => editPayment(p)}
                                                        >
                                                            <AppIcon name="pencil" className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                                                            aria-label="Xóa thanh toán"
                                                            title="Xóa thanh toán"
                                                            onClick={() => removePayment(p.id)}
                                                        >
                                                            <AppIcon name="trash" className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-text-muted">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {payments.length === 0 && (
                                        <tr>
                                            <td className="py-3 text-center text-xs text-text-muted" colSpan={5}>
                                                Chưa có thanh toán nào.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-semibold text-slate-900">Chi phí hợp đồng</h4>
                                <p className="text-xs text-text-muted">Tổng chi phí: {formatCurrency(costs.reduce((sum, c) => sum + parseNumberInput(c.amount), 0))} VNĐ</p>
                            </div>
                            {editingFinancePerms.can_submit_finance_request && (
                                <button type="button" className="text-xs font-semibold text-primary" onClick={openCostCreate}>
                                    + Thêm chi phí
                                </button>
                            )}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-xs">
                                <thead>
                                    <tr className="text-left text-[11px] uppercase tracking-wider text-text-subtle border-b border-slate-200">
                                        <th className="py-2">Ngày chi</th>
                                        <th className="py-2">Loại chi phí</th>
                                        <th className="py-2">Số tiền</th>
                                        <th className="py-2">Ghi chú</th>
                                        <th className="py-2 text-right">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {costs.map((c) => (
                                        <tr key={c.id} className="border-b border-slate-100">
                                            <td className="py-2">{c.cost_date ? formatDateDisplay(c.cost_date) : '—'}</td>
                                            <td className="py-2">{c.cost_type || '—'}</td>
                                            <td className="py-2">{formatCurrency(c.amount || 0)}</td>
                                            <td className="py-2">{c.note || '—'}</td>
                                            <td className="py-2 text-right">
                                                {c.row_type === 'create_draft' ? (
                                                    <div className="inline-flex flex-wrap items-center justify-end gap-2">
                                                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                                                            Gửi kèm khi tạo HĐ
                                                        </span>
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                                            aria-label="Sửa dòng nháp"
                                                            title="Sửa dòng nháp"
                                                            onClick={() => editCost(c)}
                                                        >
                                                            <AppIcon name="pencil" className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                                                            aria-label="Xóa dòng nháp"
                                                            title="Xóa dòng nháp"
                                                            onClick={() => removeCost(c.id)}
                                                        >
                                                            <AppIcon name="trash" className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                ) : c.row_type === 'pending_request' ? (
                                                    <div className="inline-flex flex-wrap items-center justify-end gap-2">
                                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                                            Cần duyệt
                                                        </span>
                                                        {c.submitter?.name ? (
                                                            <span className="max-w-[120px] truncate text-[11px] text-text-muted" title={c.submitter.name}>
                                                                {c.submitter.name}
                                                            </span>
                                                        ) : null}
                                                        {editingFinancePerms.can_review_finance_request ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                                                    onClick={() => approveFinanceRequest(c.finance_request_id)}
                                                                    disabled={reviewingRequestId === c.finance_request_id}
                                                                >
                                                                    Duyệt
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                                                    onClick={() => rejectFinanceRequest(c.finance_request_id)}
                                                                    disabled={reviewingRequestId === c.finance_request_id}
                                                                >
                                                                    Từ chối
                                                                </button>
                                                            </>
                                                        ) : null}
                                                    </div>
                                                ) : editingFinancePerms.can_manage_finance ? (
                                                    <div className="inline-flex items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                                            aria-label="Sửa chi phí"
                                                            title="Sửa chi phí"
                                                            onClick={() => editCost(c)}
                                                        >
                                                            <AppIcon name="pencil" className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                                                            aria-label="Xóa chi phí"
                                                            title="Xóa chi phí"
                                                            onClick={() => removeCost(c.id)}
                                                        >
                                                            <AppIcon name="trash" className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-text-muted">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {costs.length === 0 && (
                                        <tr>
                                            <td className="py-3 text-center text-xs text-text-muted" colSpan={5}>
                                                Chưa có chi phí nào.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 md:flex-row">
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                            onClick={() => save(false)}
                            disabled={savingContract}
                        >
                            {savingContract
                                ? (editingId ? 'Đang cập nhật...' : 'Đang tạo...')
                                : (editingId ? 'Cập nhật hợp đồng' : 'Tạo hợp đồng')}
                        </button>
                        {!editingId && canApprove && (
                            <button
                                type="button"
                                className="flex-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                onClick={() => save(true)}
                                disabled={savingContract}
                            >
                                {savingContract ? 'Đang tạo...' : 'Tạo và duyệt'}
                            </button>
                        )}
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                            onClick={closeForm}
                            disabled={savingContract}
                        >
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={showPaymentForm}
                onClose={() => {
                    if (savingPayment) return;
                    setShowPaymentForm(false);
                }}
                title={editingPaymentId ? 'Sửa thanh toán' : 'Thêm thanh toán'}
                size="md"
            >
                <form className="space-y-3 text-sm" onSubmit={submitPayment}>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs text-text-muted">
                        <div className="flex items-center justify-between gap-3">
                            <span>Giá trị hợp đồng</span>
                            <span className="font-semibold text-slate-900">{formatCurrency(contractValueTotal)} VNĐ</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3">
                            <span>Số tiền còn cần thu</span>
                            <span className={`font-semibold ${paymentRemaining > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{formatCurrency(paymentRemaining)} VNĐ</span>
                        </div>
                        {paymentProjectedTotal > contractValueTotal + 0.0001 && (
                            <p className="mt-2 text-rose-600">
                                Số tiền đang nhập vượt tổng giá trị hợp đồng.
                            </p>
                        )}
                    </div>
                    <LabeledField label="Số tiền thanh toán" required>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Nhập số tiền đã thu"
                            type="text"
                            inputMode="numeric"
                            value={paymentForm.amount}
                            onChange={(e) => setPaymentForm((s) => ({ ...s, amount: formatMoneyInput(e.target.value) }))}
                        />
                    </LabeledField>
                    <LabeledField label="Ngày thu">
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            type="date"
                            value={paymentForm.paid_at}
                            onChange={(e) => setPaymentForm((s) => ({ ...s, paid_at: e.target.value }))}
                        />
                    </LabeledField>
                    <LabeledField label="Phương thức thanh toán">
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Ví dụ: Chuyển khoản, tiền mặt"
                            value={paymentForm.method}
                            onChange={(e) => setPaymentForm((s) => ({ ...s, method: e.target.value }))}
                        />
                    </LabeledField>
                    <LabeledField label="Ghi chú">
                        <textarea
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            rows={3}
                            placeholder="Thêm chứng từ, đợt thanh toán hoặc lưu ý nội bộ"
                            value={paymentForm.note}
                            onChange={(e) => setPaymentForm((s) => ({ ...s, note: e.target.value }))}
                        />
                    </LabeledField>
                    <div className="flex items-center gap-2">
                        <button
                            type="submit"
                            className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                            disabled={savingPayment}
                        >
                            {savingPayment
                                ? (editingPaymentId ? 'Đang cập nhật...' : 'Đang tạo...')
                                : (editingPaymentId
                                    ? 'Cập nhật phiếu thu'
                                    : 'Tạo phiếu thu')}
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                            onClick={() => setShowPaymentForm(false)}
                            disabled={savingPayment}
                        >
                            Hủy
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                open={showCostForm}
                onClose={() => {
                    if (savingCost) return;
                    setShowCostForm(false);
                }}
                title={editingCostId ? 'Sửa chi phí' : 'Thêm chi phí'}
                size="md"
            >
                <form className="space-y-3 text-sm" onSubmit={submitCost}>
                    <LabeledField label="Số tiền chi" required>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Nhập chi phí phát sinh"
                            type="text"
                            inputMode="numeric"
                            value={costForm.amount}
                            onChange={(e) => setCostForm((s) => ({ ...s, amount: formatMoneyInput(e.target.value) }))}
                        />
                    </LabeledField>
                    <LabeledField label="Ngày chi">
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            type="date"
                            value={costForm.cost_date}
                            onChange={(e) => setCostForm((s) => ({ ...s, cost_date: e.target.value }))}
                        />
                    </LabeledField>
                    <LabeledField label="Loại chi phí">
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Ví dụ: Quảng cáo, freelancer, vận hành"
                            value={costForm.cost_type}
                            onChange={(e) => setCostForm((s) => ({ ...s, cost_type: e.target.value }))}
                        />
                    </LabeledField>
                    <LabeledField label="Ghi chú chi phí">
                        <textarea
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            rows={3}
                            placeholder="Nêu rõ khoản chi, chứng từ hoặc người chi"
                            value={costForm.note}
                            onChange={(e) => setCostForm((s) => ({ ...s, note: e.target.value }))}
                        />
                    </LabeledField>
                    <div className="flex items-center gap-2">
                        <button
                            type="submit"
                            className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                            disabled={savingCost}
                        >
                            {savingCost
                                ? (editingCostId ? 'Đang cập nhật...' : 'Đang tạo...')
                                : (editingCostId
                                    ? 'Cập nhật phiếu chi'
                                    : 'Tạo phiếu chi')}
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                            onClick={() => setShowCostForm(false)}
                            disabled={savingCost}
                        >
                            Hủy
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                open={showExportModal}
                onClose={() => {
                    if (bulkLoading) return;
                    setShowExportModal(false);
                }}
                title="Xuất Excel hợp đồng đã chọn"
                description="Chọn cột cần xuất ở sheet hợp đồng chính và bật hoặc tắt các sheet chi tiết kèm theo."
                size="xl"
            >
                <div className="space-y-4 text-sm">
                    <div className="rounded-2xl border border-teal-100 bg-teal-50/80 px-4 py-3 text-xs text-teal-900">
                        <div className="font-semibold">Phạm vi xuất</div>
                        <p className="mt-1">
                            {selectedContractIds.length} hợp đồng đang được chọn. Sheet chính luôn có cột STT cố định; các cột còn lại sẽ theo đúng lựa chọn của bạn.
                        </p>
                        <p className="mt-2">
                            Hiện đang chọn <strong>{contractExportFieldKeys.length}</strong> cột và <strong>{contractExportSheetKeys.length}</strong> sheet phụ.
                        </p>
                        <p className="mt-2">
                            Cấu hình xuất gần nhất sẽ được nhớ lại trên trình duyệt này để bạn không phải chọn lại từ đầu.
                        </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold text-slate-900">Chọn nhanh cột sheet chính</div>
                                <div className="mt-1 text-xs text-slate-500">Bạn có thể chọn tất cả, bỏ hết, hoặc dùng preset gần đúng rồi tinh chỉnh tiếp.</div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                                    onClick={selectAllContractExportFields}
                                    disabled={bulkLoading}
                                >
                                    Chọn tất cả cột
                                </button>
                                <button
                                    type="button"
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                                    onClick={clearAllContractExportFields}
                                    disabled={bulkLoading}
                                >
                                    Bỏ hết cột
                                </button>
                                <button
                                    type="button"
                                    className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800"
                                    onClick={() => applyContractExportPreset('basic')}
                                    disabled={bulkLoading}
                                >
                                    Preset cơ bản
                                </button>
                                <button
                                    type="button"
                                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"
                                    onClick={() => applyContractExportPreset('finance')}
                                    disabled={bulkLoading}
                                >
                                    Preset tài chính
                                </button>
                                <button
                                    type="button"
                                    className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800"
                                    onClick={() => applyContractExportPreset('operations')}
                                    disabled={bulkLoading}
                                >
                                    Preset vận hành
                                </button>
                                <button
                                    type="button"
                                    className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900"
                                    onClick={restoreDefaultContractExportConfig}
                                    disabled={bulkLoading}
                                >
                                    Khôi phục mặc định
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {CONTRACT_EXPORT_FIELD_GROUPS.map((group) => (
                            <div key={group.key} className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-semibold text-slate-900">{group.title}</div>
                                        <div className="mt-1 text-xs text-slate-500">
                                            {group.fields.filter((field) => selectedExportFieldSet.has(field.key)).length}/{group.fields.length} cột đang được chọn.
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
                                            onClick={() => setContractExportFieldKeys((prev) => Array.from(new Set([
                                                ...prev,
                                                ...group.fields.map((field) => field.key),
                                            ])))}
                                            disabled={bulkLoading}
                                        >
                                            Chọn nhóm
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
                                            onClick={() => setContractExportFieldKeys((prev) => prev.filter((key) => !group.fields.some((field) => field.key === key)))}
                                            disabled={bulkLoading}
                                        >
                                            Bỏ nhóm
                                        </button>
                                    </div>
                                </div>
                                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                    {group.fields.map((field) => {
                                        const checked = selectedExportFieldSet.has(field.key);
                                        return (
                                            <label
                                                key={field.key}
                                                className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2.5 transition ${
                                                    checked
                                                        ? 'border-teal-300 bg-teal-50/70'
                                                        : 'border-slate-200 bg-slate-50/40 hover:border-slate-300'
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
                                                    checked={checked}
                                                    onChange={() => toggleContractExportField(field.key)}
                                                    disabled={bulkLoading}
                                                />
                                                <span className="text-sm text-slate-800">{field.label}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold text-slate-900">Sheet chi tiết kèm theo</div>
                                <div className="mt-1 text-xs text-slate-500">
                                    Nếu bật, sheet phụ vẫn xuất đủ cấu trúc riêng của nó. Nếu tắt hết, file chỉ còn sheet hợp đồng chính với các cột bạn vừa chọn.
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
                                    onClick={selectAllContractExportSheets}
                                    disabled={bulkLoading}
                                >
                                    Bật tất cả sheet
                                </button>
                                <button
                                    type="button"
                                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
                                    onClick={clearAllContractExportSheets}
                                    disabled={bulkLoading}
                                >
                                    Tắt tất cả sheet
                                </button>
                            </div>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {CONTRACT_EXPORT_SHEET_OPTIONS.map((sheet) => {
                                const checked = selectedExportSheetSet.has(sheet.key);
                                return (
                                    <label
                                        key={sheet.key}
                                        className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2.5 transition ${
                                            checked
                                                ? 'border-sky-300 bg-sky-50/70'
                                                : 'border-slate-200 bg-slate-50/40 hover:border-slate-300'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
                                            checked={checked}
                                            onChange={() => toggleContractExportSheet(sheet.key)}
                                            disabled={bulkLoading}
                                        />
                                        <span className="text-sm text-slate-800">{sheet.label}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                        {contractExportFieldKeys.length > 0
                            ? `Sẵn sàng xuất ${contractExportFieldKeys.length} cột ở sheet chính${contractExportSheetKeys.length ? ` và ${contractExportSheetKeys.length} sheet phụ` : ''}.`
                            : 'Bạn cần chọn ít nhất một cột ở sheet chính thì mới xuất được file.'}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="flex-1 rounded-2xl bg-primary px-3 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={exportSelectedContracts}
                            disabled={bulkLoading || contractExportFieldKeys.length === 0}
                        >
                            {bulkLoading ? 'Đang xuất...' : 'Xuất file XLSX'}
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => setShowExportModal(false)}
                            disabled={bulkLoading}
                        >
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={showBulkDateSyncModal}
                onClose={() => {
                    if (bulkLoading) return;
                    setShowBulkDateSyncModal(false);
                }}
                title="Đồng bộ ngày cho hợp đồng đã chọn"
                description="Chọn trường ngày cần cập nhật và mốc ngày tham chiếu. Hệ thống sẽ chỉ ghi đè khi hợp đồng có đủ dữ liệu và không làm vỡ thứ tự ngày."
                size="md"
            >
                <div className="space-y-4 text-sm">
                    <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-xs text-sky-900">
                        <div className="font-semibold">Phạm vi chạy</div>
                        <p className="mt-1">
                            {selectedContractIds.length} hợp đồng đang được chọn. Nếu ngày tham chiếu bị trống hoặc làm sai thứ tự ngày ký / hiệu lực / kết thúc, hợp đồng đó sẽ được giữ nguyên.
                        </p>
                        {selectedContractIds.length > BULK_DATE_SYNC_BATCH_SIZE && (
                            <p className="mt-2">
                                Hệ thống sẽ tự chia thành khoảng {Math.ceil(selectedContractIds.length / BULK_DATE_SYNC_BATCH_SIZE)} đợt để tránh lỗi khi đồng bộ số lượng lớn.
                            </p>
                        )}
                    </div>

                    <LabeledField
                        label="Ngày bị đồng bộ"
                        required
                        hint="Trường đích sẽ được cập nhật bằng giá trị của ngày tham chiếu."
                    >
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={bulkDateSyncForm.target_date_field}
                            onChange={(e) => setBulkDateSyncForm((prev) => ({ ...prev, target_date_field: e.target.value }))}
                            disabled={bulkLoading}
                        >
                            {bulkSyncTargetOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </LabeledField>

                    <LabeledField
                        label="Ngày tham chiếu"
                        required
                        hint="Hệ thống đọc giá trị từ trường này để chép sang trường đích."
                    >
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={bulkDateSyncForm.reference_date_field}
                            onChange={(e) => setBulkDateSyncForm((prev) => ({ ...prev, reference_date_field: e.target.value }))}
                            disabled={bulkLoading}
                        >
                            {bulkSyncReferenceOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </LabeledField>

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                        Sắp chạy: <strong>{bulkSyncTargetLabel}</strong> theo <strong>{bulkSyncReferenceLabel}</strong>.
                        {bulkDateSyncForm.target_date_field === 'created_at'
                            ? ' Đây là ngày tạo hệ thống, chỉ nên dùng khi cần sửa dữ liệu lịch sử.'
                            : ''}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="flex-1 rounded-2xl bg-primary px-3 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={bulkSyncContractDates}
                            disabled={bulkLoading}
                        >
                            {bulkLoading ? 'Đang đồng bộ...' : 'Chạy đồng bộ'}
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => setShowBulkDateSyncModal(false)}
                            disabled={bulkLoading}
                        >
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={showImport}
                onClose={() => {
                    setShowImport(false);
                    setImportFile(null);
                    setImportReport(null);
                    setImportJob(null);
                }}
                title="Import hợp đồng"
                description="Tải file Excel (.xls/.xlsx/.csv) để nhập hợp đồng và tự nối khách hàng trùng tên."
                size="md"
            >
                <form className="space-y-3 text-sm" onSubmit={submitImport}>
                    <LabeledField
                        label="File hợp đồng"
                        required
                        hint="Hỗ trợ Excel hoặc CSV. Hệ thống sẽ tự nối theo số hợp đồng, mã khách hàng, số điện thoại và tạo dữ liệu còn thiếu nếu cần."
                    >
                        <div className="rounded-2xl border border-dashed border-slate-200/80 p-4 text-center">
                            <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                                onClick={() => window.open('/api/v1/imports/contracts/template', '_blank', 'noopener,noreferrer')}
                            >
                                Tải file mẫu
                            </button>
                            <input
                                id="import-contract-file"
                                type="file"
                                accept=".xls,.xlsx,.xlsm,.ods,.csv,.tsv"
                                onChange={(e) => {
                                    setImportFile(e.target.files?.[0] || null);
                                    setImportReport(null);
                                }}
                                className="hidden"
                            />
                            <label
                                htmlFor="import-contract-file"
                                className="mt-3 inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                                Chọn file
                            </label>
                            <p className="text-xs text-text-muted mt-2">
                                {importFile ? importFile.name : 'Chưa chọn file'}
                            </p>
                        </div>
                    </LabeledField>
                    {importReport && (
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3 space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                                Kết quả import
                            </div>
                            <p className="text-xs text-slate-700">
                                Tạo mới: {importReport.created || 0} • Cập nhật: {importReport.updated || 0} • Bỏ qua: {importReport.skipped || 0}
                            </p>
                            {Array.isArray(importReport.errors) && importReport.errors.length > 0 && (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5">
                                    <div className="text-xs font-semibold text-rose-700">Dòng lỗi không import được</div>
                                    <div className="mt-1 max-h-32 space-y-1 overflow-y-auto text-xs text-rose-700">
                                        {importReport.errors.map((item, idx) => (
                                            <div key={`err-${idx}`}>
                                                Dòng {item.row ?? '-'}: {item.message || 'Lỗi không xác định'}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {Array.isArray(importReport.warnings) && importReport.warnings.length > 0 && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                                    <div className="text-xs font-semibold text-amber-700">Cảnh báo dữ liệu (đã import nhưng có trường để trống)</div>
                                    <div className="mt-1 max-h-28 space-y-1 overflow-y-auto text-xs text-amber-700">
                                        {importReport.warnings.map((item, idx) => (
                                            <div key={`warn-${idx}`}>
                                                Dòng {item.row ?? '-'}: {item.message || 'Cảnh báo dữ liệu'}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {importJob && (
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-3 text-xs">
                                <div className="font-semibold uppercase tracking-[0.14em] text-text-subtle">Tiến trình import</div>
                                <div className="font-semibold text-slate-700">
                                    {importJob.processed_rows || 0}/{importJob.total_rows || 0} dòng
                                </div>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                                <div
                                    className={`h-full rounded-full transition-all ${importJob.status === 'failed' ? 'bg-rose-500' : 'bg-primary'}`}
                                    style={{ width: `${importJob.progress_percent || 0}%` }}
                                />
                            </div>
                            <div className="flex items-center justify-between text-xs text-text-muted">
                                <span>
                                    Trạng thái: {importJob.status === 'queued' ? 'Đang chờ' : importJob.status === 'processing' ? 'Đang xử lý' : importJob.status === 'completed' ? 'Hoàn tất' : 'Thất bại'}
                                </span>
                                <span>{importJob.progress_percent || 0}%</span>
                            </div>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <button
                            type="submit"
                            className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold"
                            disabled={importing}
                        >
                            {importing ? 'Đang import...' : 'Import'}
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold"
                            onClick={() => {
                                setShowImport(false);
                                setImportFile(null);
                                setImportReport(null);
                                setImportJob(null);
                            }}
                        >
                            Hủy
                        </button>
                    </div>
                </form>
            </Modal>
        </PageContainer>
    );
}
