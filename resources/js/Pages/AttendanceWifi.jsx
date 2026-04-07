import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import FilterToolbar, { FilterActionGroup, FilterField, filterControlClass } from '@/Components/FilterToolbar';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import PaginationControls from '@/Components/PaginationControls';
import { useToast } from '@/Contexts/ToastContext';
import {
    formatVietnamDate,
    formatVietnamDateTime,
    formatVietnamTime,
    monthStartIsoVietnam,
    todayIsoVietnam,
} from '@/lib/vietnamTime';

const attendanceTabs = {
    personal: 'Cá nhân',
    requests: 'Đơn xin phép',
    settings: 'Cấu hình',
    wifi: 'WiFi',
    devices: 'Thiết bị',
    holidays: 'Ngày lễ',
    staff: 'Nhân sự',
    report: 'Báo cáo',
};

const statusLabels = {
    present: 'Đúng công',
    late_pending: 'Đi muộn',
    late: 'Đi muộn',
    approved_full: 'Duyệt đủ công',
    approved_partial: 'Duyệt công thủ công',
    holiday_auto: 'Ngày lễ tự động',
    pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Từ chối',
};

const employmentOptions = [
    { value: 'full_time', label: 'Toàn thời gian' },
    { value: 'half_day_morning', label: 'Mỗi sáng' },
    { value: 'half_day_afternoon', label: 'Mỗi chiều' },
];

const requestTypeOptions = [
    { value: 'late_arrival', label: 'Đi muộn' },
    { value: 'leave_request', label: 'Nghỉ phép' },
];

const lateApprovalModeOptions = [
    { value: 'full_work', label: 'Duyệt đủ công (theo giờ trong đơn)' },
    { value: 'no_change', label: 'Giữ nguyên công hiện có' },
];

const leaveApprovalModeOptions = [
    { value: 'full_work', label: 'Duyệt tính công (đủ công các ngày trong đơn)' },
    { value: 'no_count', label: 'Duyệt nhưng không tính công' },
];

const cardClass = 'rounded-[28px] border border-slate-200/70 bg-white p-6 shadow-soft';
const inputClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm transition focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10';
const textAreaClass = `${inputClass} min-h-[120px] resize-y`;
const buttonPrimaryClass = 'inline-flex items-center justify-center rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/15 transition hover:-translate-y-0.5 hover:bg-primary/95';
const buttonSecondaryClass = 'inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50';

function FormField({ label, required = false, hint = '', children, className = '' }) {
    return (
        <label className={`block ${className}`}>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                {label}{required ? ' *' : ''}
            </span>
            {children}
            {hint ? <span className="mt-1 block text-xs text-text-muted">{hint}</span> : null}
        </label>
    );
}

function StatCard({ label, value, hint = '' }) {
    return (
        <div className="rounded-[24px] border border-slate-200/70 bg-white p-5 shadow-card">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
                <span className="h-2 w-2 rounded-full bg-primary" />
                {label}
            </div>
            <div className="mt-3 text-3xl font-semibold text-slate-900">{value}</div>
            {hint ? <div className="mt-1 text-xs text-text-muted">{hint}</div> : null}
        </div>
    );
}

function Badge({ children, tone = 'slate' }) {
    const toneClass = {
        emerald: 'bg-emerald-100/90 text-emerald-700',
        amber: 'bg-amber-100/90 text-amber-700',
        rose: 'bg-rose-100/90 text-rose-700',
        blue: 'bg-cyan-100/90 text-cyan-800',
        slate: 'bg-slate-100 text-slate-700',
    }[tone] || 'bg-slate-100 text-slate-700';

    return (
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
            {children}
        </span>
    );
}

function toneForStatus(status) {
    if (['present', 'approved', 'approved_full', 'holiday_auto'].includes(status)) return 'emerald';
    if (['late_pending', 'late', 'pending', 'approved_partial'].includes(status)) return 'amber';
    if (['rejected'].includes(status)) return 'rose';
    return 'slate';
}

function matrixToneClass(tone) {
    switch (tone) {
        case 'emerald':
            return 'bg-emerald-500';
        case 'amber':
            return 'bg-amber-500';
        case 'orange':
            return 'bg-orange-500';
        case 'blue':
            return 'bg-sky-600';
        case 'teal':
            return 'bg-teal-500';
        default:
            return 'bg-slate-300';
    }
}

function requestTypeLabel(type) {
    if (type === 'leave_request') return 'Nghỉ phép';
    return 'Đi muộn';
}

function todayIso() {
    return todayIsoVietnam();
}

function monthStartIso() {
    return monthStartIsoVietnam();
}

function currentMonthKey() {
    return todayIso().slice(0, 7);
}

/** Trả về { start_date, end_date } (YYYY-MM-DD) theo tháng YYYY-MM. */
function monthKeyToDateRange(monthKey) {
    const pad = (n) => String(n).padStart(2, '0');
    const m = monthKey && /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : currentMonthKey();
    const [yStr, moStr] = m.split('-');
    const y = Number(yStr);
    const mo = Number(moStr);
    const lastDay = new Date(y, mo, 0).getDate();
    return {
        start_date: `${y}-${pad(mo)}-01`,
        end_date: `${y}-${pad(mo)}-${pad(lastDay)}`,
    };
}

function displayDateToIso(value) {
    if (!value || typeof value !== 'string') return todayIso();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parts = value.split('/');
    if (parts.length !== 3) return todayIso();
    const [day, month, year] = parts;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatIsoDate(value) {
    return formatVietnamDate(value);
}

function formatHolidayRange(item) {
    const startDate = item?.start_date || item?.holiday_date;
    const endDate = item?.end_date || item?.holiday_date;
    const startLabel = formatIsoDate(startDate);
    const endLabel = formatIsoDate(endDate);
    const dayCount = Number(item?.day_count || 1);
    const rangeLabel = startDate && endDate && startDate !== endDate
        ? `${startLabel} - ${endLabel}`
        : startLabel;

    return `${rangeLabel}${dayCount > 1 ? ` • ${dayCount} ngày` : ''}`;
}

export default function AttendanceWifi(props) {
    const toast = useToast();
    const role = props?.auth?.user?.role || '';
    const canManage = ['admin', 'administrator', 'ke_toan'].includes(role);
    const isAdministrator = String(role).toLowerCase() === 'administrator';
    const canExport = canManage;
    const canViewReport = canManage || ['quan_ly', 'nhan_vien'].includes(role);
    const canManualAdjust = role === 'administrator';
    const [activeTab, setActiveTab] = useState('personal');
    const [loading, setLoading] = useState(false);
    const [dashboard, setDashboard] = useState(null);
    const [records, setRecords] = useState([]);
    const [recordFilters, setRecordFilters] = useState({
        from_date: monthStartIso(),
        to_date: todayIso(),
    });
    const [settingsForm, setSettingsForm] = useState({
        attendance_enabled: true,
        attendance_work_start_time: '08:30',
        attendance_work_end_time: '17:30',
        attendance_afternoon_start_time: '13:30',
        attendance_late_grace_minutes: 10,
        attendance_reminder_enabled: true,
        attendance_reminder_minutes_before: 10,
    });
    const [wifiRows, setWifiRows] = useState([]);
    const [wifiModal, setWifiModal] = useState({ open: false, item: null });
    const [wifiForm, setWifiForm] = useState({ ssid: '', bssid: '', note: '', is_active: true });
    const [devices, setDevices] = useState([]);
    const [devicePaging, setDevicePaging] = useState({ current_page: 1, last_page: 1, total: 0, per_page: 20 });
    const [deviceFilters, setDeviceFilters] = useState({ search: '', status: '', per_page: 20, page: 1 });
    const [requests, setRequests] = useState([]);
    const [requestPaging, setRequestPaging] = useState({ current_page: 1, last_page: 1, total: 0, per_page: 20 });
    const [requestFilters, setRequestFilters] = useState({ search: '', status: '', per_page: 20, page: 1 });
    const [requestForm, setRequestForm] = useState({
        request_type: 'late_arrival',
        request_date: todayIso(),
        request_end_date: '',
        expected_check_in_time: '',
        title: '',
        content: '',
    });
    const [reviewModal, setReviewModal] = useState({ open: false, item: null });
    const [reviewForm, setReviewForm] = useState({ status: 'approved', approval_mode: 'full_work', decision_note: '' });
    const [holidays, setHolidays] = useState([]);
    const [holidayModal, setHolidayModal] = useState({ open: false, item: null });
    const [holidayForm, setHolidayForm] = useState({ start_date: todayIso(), end_date: todayIso(), title: '', note: '', is_active: true });
    const [staffRows, setStaffRows] = useState([]);
    const [staffPaging, setStaffPaging] = useState({ current_page: 1, last_page: 1, total: 0, per_page: 200 });
    const [staffFilters, setStaffFilters] = useState({ search: '', role: '', per_page: 200, page: 1 });
    const [reportSummary, setReportSummary] = useState({ total_staff: 0, today_work_units: 0 });
    const [reportMatrix, setReportMatrix] = useState({ month: currentMonthKey(), month_label: '', days: [], rows: [], legend: [] });
    const [reportFilters, setReportFilters] = useState({ month: currentMonthKey(), user_id: '', search: '' });
    const [manualRecordModal, setManualRecordModal] = useState({ open: false, item: null });
    const [manualRecordForm, setManualRecordForm] = useState({ user_id: '', work_date: todayIso(), work_units: '1.0', check_in_time: '', note: '' });
    const [recordDetailModal, setRecordDetailModal] = useState({
        open: false,
        loading: false,
        record: null,
        edit_logs: [],
        form_read_only: true,
        error: null,
        meta: null,
    });
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [exportRange, setExportRange] = useState(() => monthKeyToDateRange(currentMonthKey()));

    const tabs = useMemo(() => {
        const base = ['personal', 'requests'];
        if (canManage) {
            base.push('settings', 'wifi', 'devices', 'holidays', 'staff', 'report');
        } else if (canViewReport) {
            base.push('report');
        }
        return base;
    }, [canManage, canViewReport]);

    const manualStaffOptions = useMemo(() => {
        const rows = [...staffRows];
        const currentUserId = Number(manualRecordModal.item?.user_id || 0);
        if (currentUserId && !rows.some((item) => Number(item.id) === currentUserId)) {
            rows.unshift({
                id: currentUserId,
                name: manualRecordModal.item?.user_name || `Nhân sự #${currentUserId}`,
                role: manualRecordModal.item?.role || '—',
                department: manualRecordModal.item?.department || '—',
            });
        }
        return rows;
    }, [manualRecordModal.item, staffRows]);

    const reportGrowth = useMemo(() => {
        const days = Array.isArray(reportMatrix?.days) ? reportMatrix.days : [];
        const rows = Array.isArray(reportMatrix?.rows) ? reportMatrix.rows : [];
        if (days.length === 0 || rows.length === 0) {
            return { items: [], max: 1 };
        }

        const items = days.map((day, dayIndex) => {
            const totalWorkUnits = rows.reduce((sum, row) => {
                const cell = Array.isArray(row?.cells) ? row.cells[dayIndex] : null;
                return sum + Number(cell?.work_units || 0);
            }, 0);
            return {
                date: day?.date,
                label: String(day?.day || '').padStart(2, '0'),
                weekday: day?.weekday || '',
                value: Number(totalWorkUnits.toFixed(1)),
                is_weekend: !!day?.is_weekend,
            };
        });

        const max = items.reduce((carry, item) => Math.max(carry, Number(item.value || 0)), 0);
        return { items, max: max > 0 ? max : 1 };
    }, [reportMatrix]);

    const stats = useMemo(() => {
        const todayRecord = dashboard?.today_record;
        return [
            {
                label: 'Trạng thái hôm nay',
                value: todayRecord ? (statusLabels[todayRecord.status] || todayRecord.status) : 'Chưa chấm',
                hint: todayRecord?.check_in_at ? formatVietnamTime(todayRecord.check_in_at) : 'Check-in chỉ hỗ trợ trên app mobile',
            },
            {
                label: 'Công hôm nay',
                value: String(todayRecord?.work_units ?? 0),
                hint: todayRecord ? `Đi muộn ${todayRecord.minutes_late || 0} phút` : 'Chưa có bản ghi',
            },
            {
                label: 'Thiết bị',
                value: dashboard?.device?.status ? (statusLabels[dashboard.device.status] || dashboard.device.status) : 'Chưa đăng ký',
                hint: dashboard?.device?.device_name || 'Thiết bị duyệt trên app mobile',
            },
            {
                label: 'Đơn chờ duyệt',
                value: canManage ? String(dashboard?.pending_counts?.requests || 0) : String((requests || []).filter((item) => item.status === 'pending').length),
                hint: canManage ? 'Tổng đơn toàn hệ thống' : 'Đơn của bạn',
            },
        ];
    }, [canManage, dashboard, requests]);

    const resetWifiForm = (item = null) => {
        setWifiForm({
            ssid: item?.ssid || '',
            bssid: item?.bssid || '',
            note: item?.note || '',
            is_active: item?.is_active ?? true,
        });
        setWifiModal({ open: true, item });
    };

    const resetHolidayForm = (item = null) => {
        setHolidayForm({
            start_date: item?.start_date || item?.holiday_date || todayIso(),
            end_date: item?.end_date || item?.holiday_date || todayIso(),
            title: item?.title || '',
            note: item?.note || '',
            is_active: item?.is_active ?? true,
        });
        setHolidayModal({ open: true, item });
    };

    const openReview = (item) => {
        const employmentType = item?.user?.attendance_employment_type || 'full_time';
        const fallbackUnits = employmentType === 'full_time' ? 1 : 0.5;
        setReviewForm({
            status: 'approved',
            approval_mode: 'full_work',
            decision_note: '',
        });
        setReviewModal({ open: true, item });
    };

    const openManualRecord = (item = null) => {
        if (!canManualAdjust) return;
        const fallbackUnits = Number.isFinite(Number(item?.work_units))
            ? Number(item.work_units).toFixed(1)
            : ((item?.employment_type || 'full_time') === 'full_time' ? '1.0' : '0.5');
        setManualRecordForm({
            user_id: item?.user_id ? String(item.user_id) : '',
            work_date: displayDateToIso(item?.work_date),
            work_units: fallbackUnits,
            check_in_time: item?.check_in_at && item.check_in_at !== '—' ? String(item.check_in_at) : '',
            note: item?.note || '',
        });
        setManualRecordModal({ open: true, item });
    };

    const openManualRecordFromMatrixCell = (row, cell) => {
        if (!canManualAdjust) return;
        openManualRecord({
            user_id: row?.user_id,
            user_name: row?.user_name,
            role: row?.role,
            department: row?.department,
            employment_type: row?.employment_type,
            work_date: cell?.date,
            work_units: cell?.has_record ? cell?.work_units : (row?.employment_type === 'full_time' ? 1 : 0.5),
            check_in_at: cell?.has_record ? (cell?.check_in_at || '') : '',
            note: cell?.has_record ? (cell?.note || '') : '',
        });
    };

    const loadRecordDetail = async (recordId, meta = {}) => {
        if (!recordId) return;
        setRecordDetailModal({
            open: true,
            loading: true,
            record: null,
            edit_logs: [],
            form_read_only: true,
            error: null,
            meta,
        });
        try {
            const res = await axios.get(`/api/v1/attendance/records/${recordId}`);
            setRecordDetailModal({
                open: true,
                loading: false,
                record: res.data?.record || null,
                edit_logs: res.data?.edit_logs || [],
                form_read_only: res.data?.form_read_only !== false,
                error: null,
                meta,
            });
        } catch (error) {
            setRecordDetailModal({
                open: true,
                loading: false,
                record: null,
                edit_logs: [],
                form_read_only: true,
                error: error?.response?.data?.message || 'Không tải được chi tiết bản ghi.',
                meta,
            });
        }
    };

    const onMatrixCellClick = (row, cell) => {
        if (cell?.has_record && cell?.record_id) {
            void loadRecordDetail(cell.record_id, {
                user_name: row?.user_name,
                work_date: cell.date,
            });
            return;
        }
        if (canManualAdjust) {
            openManualRecordFromMatrixCell(row, cell);
        }
    };

    const loadDashboard = async () => {
        const res = await axios.get('/api/v1/attendance/dashboard');
        setDashboard(res.data || null);
        setSettingsForm((current) => ({
            ...current,
            attendance_enabled: res.data?.settings?.enabled ?? current.attendance_enabled,
            attendance_work_start_time: res.data?.settings?.work_start_time || current.attendance_work_start_time,
            attendance_work_end_time: res.data?.settings?.work_end_time || current.attendance_work_end_time,
            attendance_afternoon_start_time: res.data?.settings?.afternoon_start_time || current.attendance_afternoon_start_time,
            attendance_late_grace_minutes: res.data?.settings?.late_grace_minutes ?? current.attendance_late_grace_minutes,
            attendance_reminder_enabled: res.data?.settings?.reminder_enabled ?? current.attendance_reminder_enabled,
            attendance_reminder_minutes_before: res.data?.settings?.reminder_minutes_before ?? current.attendance_reminder_minutes_before,
        }));
    };

    const loadRecords = async (filters = recordFilters) => {
        const res = await axios.get('/api/v1/attendance/records/my', { params: filters });
        setRecords(res.data?.data || []);
    };

    const handleRequestSearch = (val) => {
        const next = { ...requestFilters, search: val, page: 1 };
        setRequestFilters(next);
    };

    const loadRequests = async (filters = requestFilters) => {
        const res = await axios.get('/api/v1/attendance/requests', { params: filters });
        setRequests(res.data?.data || []);
        setRequestPaging({
            current_page: res.data?.current_page || 1,
            last_page: res.data?.last_page || 1,
            total: res.data?.total || 0,
            per_page: Number(filters.per_page || 20),
        });
    };

    const loadWifi = async () => {
        if (!canManage) return;
        const res = await axios.get('/api/v1/attendance/wifi');
        setWifiRows(res.data?.data || []);
    };

    const handleDeviceSearch = (val) => {
        const next = { ...deviceFilters, search: val, page: 1 };
        setDeviceFilters(next);
    };

    const loadDevices = async (filters = deviceFilters) => {
        if (!canManage) return;
        const res = await axios.get('/api/v1/attendance/devices', { params: filters });
        setDevices(res.data?.data || []);
        setDevicePaging({
            current_page: res.data?.current_page || 1,
            last_page: res.data?.last_page || 1,
            total: res.data?.total || 0,
            per_page: Number(filters.per_page || 20),
        });
    };

    const loadHolidays = async () => {
        if (!canManage) return;
        const res = await axios.get('/api/v1/attendance/holidays', { params: { from_date: monthStartIso(), to_date: '2099-12-31' } });
        setHolidays(res.data?.data || []);
    };

    const handleStaffSearch = (val) => {
        const next = { ...staffFilters, search: val, page: 1 };
        setStaffFilters(next);
    };

    const loadStaff = async (filters = staffFilters) => {
        if (!canManage) return;
        const res = await axios.get('/api/v1/attendance/staff', { params: filters });
        setStaffRows(res.data?.data || []);
        setStaffPaging({
            current_page: res.data?.current_page || 1,
            last_page: res.data?.last_page || 1,
            total: res.data?.total || 0,
            per_page: Number(filters.per_page || 20),
        });
    };

    const handleReportSearch = (val) => {
        const next = { ...reportFilters, search: val };
        setReportFilters(next);
    };

    const loadReport = async (filters = reportFilters) => {
        if (!canViewReport) return;
        const res = await axios.get('/api/v1/attendance/report', { params: filters });
        setReportSummary(res.data?.summary || { total_staff: 0, today_work_units: 0 });
        setReportMatrix(res.data?.matrix || { month: filters.month || currentMonthKey(), month_label: '', days: [], rows: [], legend: [] });
    };

    const initialLoad = async () => {
        setLoading(true);
        try {
            await Promise.all([
                loadDashboard(),
                loadRecords(recordFilters),
                loadRequests(requestFilters),
                canManage ? loadWifi() : Promise.resolve(),
                canManage ? loadDevices(deviceFilters) : Promise.resolve(),
                canManage ? loadHolidays() : Promise.resolve(),
                canManage ? loadStaff(staffFilters) : Promise.resolve(),
                canViewReport ? loadReport(reportFilters) : Promise.resolve(),
            ]);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được dữ liệu chấm công.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!tabs.includes(activeTab)) {
            setActiveTab(tabs[0]);
        }
    }, [activeTab, tabs]);

    useEffect(() => {
        initialLoad();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canManage, canViewReport]);

    const saveSettings = async () => {
        try {
            await axios.put('/api/v1/attendance/settings', settingsForm);
            toast.success('Đã cập nhật cấu hình chấm công.');
            await loadDashboard();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Lưu cấu hình thất bại.');
        }
    };

    const saveWifi = async () => {
        try {
            if (wifiModal.item?.id) {
                await axios.put(`/api/v1/attendance/wifi/${wifiModal.item.id}`, wifiForm);
                toast.success('Đã cập nhật WiFi.');
            } else {
                await axios.post('/api/v1/attendance/wifi', wifiForm);
                toast.success('Đã thêm WiFi.');
            }
            setWifiModal({ open: false, item: null });
            await loadWifi();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Lưu WiFi thất bại.');
        }
    };

    const removeWifi = async (item) => {
        if (!confirm(`Xóa WiFi ${item.ssid}?`)) return;
        try {
            await axios.delete(`/api/v1/attendance/wifi/${item.id}`);
            toast.success('Đã xóa WiFi.');
            await loadWifi();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Xóa WiFi thất bại.');
        }
    };

    const submitLateRequest = async () => {
        try {
            const payload = { ...requestForm };
            if (payload.request_type !== 'leave_request') {
                delete payload.request_end_date;
            }
            await axios.post('/api/v1/attendance/requests', payload);
            toast.success(requestForm.request_type === 'leave_request' ? 'Đã gửi đơn xin nghỉ phép.' : 'Đã gửi đơn xin đi muộn.');
            setRequestForm({
                request_type: 'late_arrival',
                request_date: todayIso(),
                request_end_date: '',
                expected_check_in_time: '',
                title: '',
                content: '',
            });
            await Promise.all([loadRequests({ ...requestFilters, page: 1 }), loadDashboard()]);
        } catch (error) {
            const body = error?.response?.data;
            toast.error(body?.message || 'Gửi đơn thất bại.');
        }
    };

    const reviewRequest = async () => {
        const item = reviewModal.item;
        if (!item) return;
        const payload = {
            status: reviewForm.status,
            approval_mode: reviewForm.status === 'approved' ? reviewForm.approval_mode : null,
            decision_note: reviewForm.decision_note || null,
        };
        try {
            await axios.post(`/api/v1/attendance/requests/${item.id}/review`, payload);
            toast.success(reviewForm.status === 'approved' ? 'Đã duyệt đơn.' : 'Đã từ chối đơn.');
            setReviewModal({ open: false, item: null });
            await Promise.all([loadRequests(requestFilters), loadRecords(recordFilters), loadDashboard(), canViewReport ? loadReport(reportFilters) : Promise.resolve()]);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Duyệt đơn thất bại.');
        }
    };

    const revokeDevice = async (item) => {
        if (!isAdministrator) return;
        const name = item.user?.name || 'nhân sự';
        const ok = window.confirm(
            `Gỡ thiết bị khỏi tài khoản ${name}? Người đó sẽ phải gửi phiếu đăng ký thiết bị lại trên app mobile.`,
        );
        if (!ok) return;
        try {
            await axios.delete(`/api/v1/attendance/devices/${item.id}`);
            toast.success('Đã gỡ thiết bị. Nhân sự cần đăng ký lại trên app.');
            await loadDevices(deviceFilters);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Gỡ thiết bị thất bại.');
        }
    };

    const reviewDevice = async (item, status) => {
        const note = window.prompt(status === 'approved' ? 'Ghi chú duyệt thiết bị (tùy chọn)' : 'Lý do từ chối thiết bị', item.note || '');
        if (note === null) return;
        try {
            await axios.post(`/api/v1/attendance/devices/${item.id}/review`, { status, note });
            toast.success(status === 'approved' ? 'Đã duyệt thiết bị.' : 'Đã từ chối thiết bị.');
            await Promise.all([loadDevices(deviceFilters), loadDashboard()]);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Duyệt thiết bị thất bại.');
        }
    };

    const saveHoliday = async () => {
        try {
            if (holidayModal.item?.id) {
                await axios.put(`/api/v1/attendance/holidays/${holidayModal.item.id}`, holidayForm);
                toast.success('Đã cập nhật ngày lễ.');
            } else {
                await axios.post('/api/v1/attendance/holidays', holidayForm);
                toast.success('Đã thêm ngày lễ.');
            }
            setHolidayModal({ open: false, item: null });
            await Promise.all([loadHolidays(), loadDashboard(), loadReport(reportFilters)]);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Lưu ngày lễ thất bại.');
        }
    };

    const removeHoliday = async (item) => {
        if (!confirm(`Xóa ngày lễ ${item.title}?`)) return;
        try {
            await axios.delete(`/api/v1/attendance/holidays/${item.id}`);
            toast.success('Đã xóa ngày lễ.');
            await Promise.all([loadHolidays(), loadReport(reportFilters)]);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Xóa ngày lễ thất bại.');
        }
    };

    const updateStaffEmployment = async (userId, attendanceEmploymentType) => {
        try {
            await axios.put(`/api/v1/attendance/staff/${userId}`, { attendance_employment_type: attendanceEmploymentType });
            setStaffRows((current) => current.map((item) => (
                Number(item.id) === Number(userId)
                    ? { ...item, attendance_employment_type: attendanceEmploymentType }
                    : item
            )));
            toast.success('Đã cập nhật hình thức chấm công.');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Cập nhật nhân sự thất bại.');
        }
    };

    const openExportModal = () => {
        setExportRange(monthKeyToDateRange(reportFilters.month));
        setExportModalOpen(true);
    };

    const exportReport = () => {
        const params = new URLSearchParams();
        params.set('start_date', exportRange.start_date);
        params.set('end_date', exportRange.end_date);
        const search = String(reportFilters.search || '').trim();
        const userId = String(reportFilters.user_id || '').trim();
        if (search !== '') {
            params.set('search', search);
        }
        if (userId !== '') {
            params.set('user_id', userId);
        }
        window.open(`/api/v1/attendance/export?${params.toString()}`, '_blank');
        setExportModalOpen(false);
    };

    const saveManualRecord = async () => {
        try {
            await axios.post('/api/v1/attendance/records/manual', {
                user_id: Number(manualRecordForm.user_id),
                work_date: manualRecordForm.work_date,
                work_units: Number(manualRecordForm.work_units || 0),
                check_in_time: manualRecordForm.check_in_time || null,
                note: manualRecordForm.note || null,
            });
            toast.success('Đã cập nhật công thủ công.');
            setManualRecordModal({ open: false, item: null });
            await Promise.all([loadReport(reportFilters), loadRecords(recordFilters), loadDashboard()]);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Cập nhật công thủ công thất bại.');
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Chấm công Wi-Fi"
            description="Check-in bằng Wi‑Fi/BSSID trên app mobile, đồng thời quản trị thiết bị, đơn xin phép, ngày lễ và báo cáo công trên web."
            stats={stats}
        >
            <div className="mt-5 flex flex-wrap gap-2">
                {tabs.map((key) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setActiveTab(key)}
                        className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${activeTab === key ? 'bg-primary text-white shadow-lg shadow-primary/15' : 'border border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:bg-slate-50'}`}
                    >
                        {attendanceTabs[key]}
                    </button>
                ))}
            </div>

            <div className="mt-5 space-y-5">
                {activeTab === 'personal' && (
                    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                        <div className={cardClass}>
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Công cá nhân</h3>
                                <p className="mt-1 text-sm text-text-muted">Theo dõi bản ghi công của bạn trong khoảng ngày cần xem.</p>
                            </div>
                            <FilterToolbar enableSearch
                                className="mt-4 mb-4"
                                title="Bộ lọc bảng công"
                                description="Chọn khoảng ngày để xem lịch sử công cá nhân theo đúng chuẩn hiển thị chung của hệ thống."
                                onSubmitFilters={() => loadRecords(recordFilters)}
                                actions={(
                                    <FilterActionGroup className="xl:justify-end">
                                        <button type="submit" className={buttonPrimaryClass}>
                                            Xem công
                                        </button>
                                    </FilterActionGroup>
                                )}
                            >
                                <div className="grid gap-4 md:grid-cols-2">
                                    <FilterField label="Từ ngày">
                                        <input type="date" className={filterControlClass} value={recordFilters.from_date} onChange={(e) => setRecordFilters((s) => ({ ...s, from_date: e.target.value }))} />
                                    </FilterField>
                                    <FilterField label="Đến ngày">
                                        <input type="date" className={filterControlClass} value={recordFilters.to_date} onChange={(e) => setRecordFilters((s) => ({ ...s, to_date: e.target.value }))} />
                                    </FilterField>
                                </div>
                            </FilterToolbar>
                            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200/80">
                                <table className="min-w-full divide-y divide-slate-200 text-sm">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-700">Ngày</th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-700">Giờ vào</th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-700">Trễ</th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-700">Công</th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-700">Trạng thái</th>
                                            <th className="px-4 py-3 text-left font-semibold text-slate-700">Ghi chú</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {records.length === 0 && (
                                            <tr>
                                                <td className="px-4 py-6 text-center text-text-muted" colSpan={6}>Chưa có bản ghi công trong khoảng thời gian này.</td>
                                            </tr>
                                        )}
                                        {records.map((item) => (
                                            <tr key={item.id}>
                                                <td className="px-4 py-3">{formatVietnamDate(item.work_date)}</td>
                                                <td className="px-4 py-3">{formatVietnamTime(item.check_in_at)}</td>
                                                <td className="px-4 py-3">{item.minutes_late || 0} phút</td>
                                                <td className="px-4 py-3 font-semibold text-slate-900">{item.work_units || 0}</td>
                                                <td className="px-4 py-3"><Badge tone={toneForStatus(item.status)}>{['late', 'late_pending'].includes(item.status) ? `Đi muộn ${item.minutes_late || 0} phút` : (statusLabels[item.status] || item.status)}</Badge></td>
                                                <td className="px-4 py-3 text-text-muted">{item.note || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="space-y-5">
                            <div className={cardClass}>
                                <h3 className="text-lg font-semibold text-slate-900">Thiết bị đã duyệt</h3>
                                <p className="mt-1 text-sm text-text-muted">Thiết bị thực tế được đăng ký và duyệt trên app mobile. Mỗi nhân viên chỉ dùng một thiết bị đã duyệt để chấm công.</p>
                                <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
                                    <div><span className="font-semibold text-slate-900">Trạng thái:</span> {dashboard?.device?.status ? (statusLabels[dashboard.device.status] || dashboard.device.status) : 'Chưa có thiết bị'}</div>
                                    <div className="mt-2"><span className="font-semibold text-slate-900">Tên thiết bị:</span> {dashboard?.device?.device_name || '—'}</div>
                                    <div className="mt-2"><span className="font-semibold text-slate-900">UUID:</span> {dashboard?.device?.device_uuid || '—'}</div>
                                    <div className="mt-2"><span className="font-semibold text-slate-900">Nền tảng:</span> {dashboard?.device?.device_platform || '—'}</div>
                                </div>
                            </div>
                            <div className={cardClass}>
                                <h3 className="text-lg font-semibold text-slate-900">Rule chấm công</h3>
                                <div className="mt-4 grid gap-3 text-sm text-slate-700">
                                    <div className="rounded-2xl bg-slate-50 px-4 py-3">Bắt đầu làm: <span className="font-semibold">{dashboard?.settings?.work_start_time || '08:30'}</span></div>
                                    <div className="rounded-2xl bg-slate-50 px-4 py-3">Bắt đầu buổi chiều: <span className="font-semibold">{dashboard?.settings?.afternoon_start_time || '13:30'}</span></div>
                                    <div className="rounded-2xl bg-slate-50 px-4 py-3">Cho phép đến trễ: <span className="font-semibold">{dashboard?.settings?.late_grace_minutes || 0} phút</span></div>
                                    <div className="rounded-2xl bg-slate-50 px-4 py-3">Nhắc trước giờ vào làm: <span className="font-semibold">{dashboard?.settings?.reminder_minutes_before || 0} phút</span></div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'requests' && (
                    <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
                        <div className={cardClass}>
                            <h3 className="text-lg font-semibold text-slate-900">Gửi đơn xin phép</h3>
                                <p className="mt-1 text-sm text-text-muted">Nhân viên có thể gửi đơn đi muộn hoặc nghỉ phép. Admin và kế toán duyệt đơn; khi duyệt sẽ điều chỉnh giờ vào theo đơn xin phép (nếu có).</p>
                            <div className="mt-4 grid gap-4">
                                <FormField label="Loại đơn" required>
                                    <select className={inputClass} value={requestForm.request_type} onChange={(e) => setRequestForm((s) => ({ ...s, request_type: e.target.value }))}>
                                        {requestTypeOptions.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </FormField>
                                <FormField label={requestForm.request_type === 'leave_request' ? 'Từ ngày' : 'Ngày áp dụng'} required>
                                    <input type="date" className={inputClass} value={requestForm.request_date} onChange={(e) => setRequestForm((s) => ({ ...s, request_date: e.target.value }))} />
                                </FormField>
                                {requestForm.request_type === 'leave_request' ? (
                                    <FormField label="Đến ngày" hint="Để trống nếu nghỉ 1 ngày — mặc định trùng ngày bắt đầu">
                                        <input type="date" className={inputClass} value={requestForm.request_end_date} onChange={(e) => setRequestForm((s) => ({ ...s, request_end_date: e.target.value }))} />
                                    </FormField>
                                ) : null}
                                {requestForm.request_type === 'late_arrival' ? (
                                    <FormField label="Giờ dự kiến vào" required hint="Bắt buộc — dùng làm mốc tính trễ khi duyệt">
                                        <input type="time" className={inputClass} value={requestForm.expected_check_in_time} onChange={(e) => setRequestForm((s) => ({ ...s, expected_check_in_time: e.target.value }))} />
                                    </FormField>
                                ) : null}
                                <FormField label="Tiêu đề" required>
                                    <input className={inputClass} value={requestForm.title} onChange={(e) => setRequestForm((s) => ({ ...s, title: e.target.value }))} placeholder={requestForm.request_type === 'leave_request' ? 'Ví dụ: Xin nghỉ phép ngày 30/03' : 'Ví dụ: Xin đi muộn do kẹt xe'} />
                                </FormField>
                                <FormField label="Nội dung">
                                    <textarea className={textAreaClass} value={requestForm.content} onChange={(e) => setRequestForm((s) => ({ ...s, content: e.target.value }))} placeholder="Mô tả lý do và thông tin liên quan" />
                                </FormField>
                                <div className="flex justify-end">
                                    <button type="button" className={buttonPrimaryClass} onClick={submitLateRequest}>Gửi đơn</button>
                                </div>
                            </div>
                        </div>
                        <div className={cardClass}>
                            <FilterToolbar enableSearch
                                className="mb-4"
                                title="Danh sách đơn"
                                description={canManage ? 'Xem và duyệt toàn bộ đơn đi muộn hoặc nghỉ phép của nhân sự.' : 'Theo dõi trạng thái đơn của bạn.'}
                                searchValue={requestFilters.search}
                                onSearch={handleRequestSearch}
                                onSubmitFilters={() => loadRequests({ ...requestFilters, page: 1 })}
                                actions={(
                                    <FilterActionGroup className="xl:justify-end">
                                        <button
                                            type="submit"
                                            className={buttonSecondaryClass}
                                        >
                                            Lọc
                                        </button>
                                    </FilterActionGroup>
                                )}
                            >
                                <div className="grid gap-4 md:grid-cols-1">
                                    <FilterField label="Trạng thái">
                                        <select className={filterControlClass} value={requestFilters.status} onChange={(e) => {
                                            const next = { ...requestFilters, status: e.target.value, page: 1 };
                                            setRequestFilters(next);
                                        }}>
                                            <option value="">Tất cả trạng thái</option>
                                            <option value="pending">Chờ duyệt</option>
                                            <option value="approved">Đã duyệt</option>
                                            <option value="rejected">Từ chối</option>
                                        </select>
                                    </FilterField>
                                </div>
                            </FilterToolbar>
                            <div className="mt-4 space-y-3">
                                {requests.length === 0 && (
                                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-text-muted">Chưa có đơn nào.</div>
                                )}
                                {requests.map((item) => (
                                    <div key={item.id} className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h4 className="font-semibold text-slate-900">{item.title}</h4>
                                                    <Badge tone="blue">{item.request_type_label || requestTypeLabel(item.request_type)}</Badge>
                                                    <Badge tone={toneForStatus(item.status)}>{statusLabels[item.status] || item.status}</Badge>
                                                </div>
                                                <div className="mt-1 text-sm text-text-muted">
                                                    {item.user?.name ? `${item.user.name} • ` : ''}
                                                    {formatVietnamDate(item.request_date)}
                                                    {item.expected_check_in_time ? ` • Dự kiến vào ${item.expected_check_in_time}` : ''}
                                                </div>
                                                <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{item.content || 'Không có ghi chú thêm.'}</div>
                                                {item.decision_note ? (
                                                    <div className="mt-2 rounded-xl bg-white px-3 py-2 text-sm text-slate-700">
                                                        <span className="font-semibold">Ghi chú duyệt:</span> {item.decision_note}
                                                    </div>
                                                ) : null}
                                            </div>
                                            {canManage && item.status === 'pending' ? (
                                                <div className="flex flex-wrap gap-2">
                                                    <button type="button" className={buttonPrimaryClass} onClick={() => openReview(item)}>Duyệt / từ chối</button>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <PaginationControls
                                page={requestPaging.current_page}
                                lastPage={requestPaging.last_page}
                                total={requestPaging.total}
                                perPage={requestPaging.per_page}
                                onPageChange={(page) => {
                                    const next = { ...requestFilters, page };
                                    setRequestFilters(next);
                                    loadRequests(next);
                                }}
                                onPerPageChange={(perPage) => {
                                    const next = { ...requestFilters, per_page: perPage, page: 1 };
                                    setRequestFilters(next);
                                    loadRequests(next);
                                }}
                                label="đơn"
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'settings' && canManage && (
                    <div className={cardClass}>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Cấu hình chung</h3>
                                <p className="mt-1 text-sm text-text-muted">Áp dụng cho toàn bộ attendance theo WiFi: giờ vào làm, giờ kết thúc, thời gian trễ cho phép và nhắc trước giờ vào.</p>
                            </div>
                            <button type="button" className={buttonPrimaryClass} onClick={saveSettings}>Lưu cấu hình</button>
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <FormField label="Giờ bắt đầu" required>
                                <input type="time" className={inputClass} value={settingsForm.attendance_work_start_time} onChange={(e) => setSettingsForm((s) => ({ ...s, attendance_work_start_time: e.target.value }))} />
                            </FormField>
                            <FormField label="Giờ bắt đầu chiều" required>
                                <input type="time" className={inputClass} value={settingsForm.attendance_afternoon_start_time} onChange={(e) => setSettingsForm((s) => ({ ...s, attendance_afternoon_start_time: e.target.value }))} />
                            </FormField>
                            <FormField label="Giờ kết thúc" required>
                                <input type="time" className={inputClass} value={settingsForm.attendance_work_end_time} onChange={(e) => setSettingsForm((s) => ({ ...s, attendance_work_end_time: e.target.value }))} />
                            </FormField>
                            <FormField label="Phút trễ cho phép" required>
                                <input type="number" min="0" max="240" className={inputClass} value={settingsForm.attendance_late_grace_minutes} onChange={(e) => setSettingsForm((s) => ({ ...s, attendance_late_grace_minutes: e.target.value }))} />
                            </FormField>
                            <FormField label="Nhắc trước giờ vào" required>
                                <input type="number" min="0" max="120" className={inputClass} value={settingsForm.attendance_reminder_minutes_before} onChange={(e) => setSettingsForm((s) => ({ ...s, attendance_reminder_minutes_before: e.target.value }))} />
                            </FormField>
                            <FormField label="Attendance đang bật">
                                <select className={inputClass} value={settingsForm.attendance_enabled ? '1' : '0'} onChange={(e) => setSettingsForm((s) => ({ ...s, attendance_enabled: e.target.value === '1' }))}>
                                    <option value="1">Đang bật</option>
                                    <option value="0">Tạm tắt</option>
                                </select>
                            </FormField>
                            <FormField label="Nhắc giờ chấm công">
                                <select className={inputClass} value={settingsForm.attendance_reminder_enabled ? '1' : '0'} onChange={(e) => setSettingsForm((s) => ({ ...s, attendance_reminder_enabled: e.target.value === '1' }))}>
                                    <option value="1">Đang bật</option>
                                    <option value="0">Tạm tắt</option>
                                </select>
                            </FormField>
                        </div>
                    </div>
                )}

                {activeTab === 'wifi' && canManage && (
                    <div className={cardClass}>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">WiFi được phép chấm công</h3>
                                <p className="mt-1 text-sm text-text-muted">Admin và administrator lấy BSSID hiện tại ngay trên mobile. Ở web, bạn có thể thêm/sửa SSID và BSSID được phép.</p>
                            </div>
                            <button type="button" className={buttonPrimaryClass} onClick={() => resetWifiForm(null)}>Thêm WiFi</button>
                        </div>
                        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200/80">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold text-slate-700">SSID</th>
                                        <th className="px-4 py-3 text-left font-semibold text-slate-700">BSSID</th>
                                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Ghi chú</th>
                                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Trạng thái</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-700">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {wifiRows.length === 0 && (
                                        <tr>
                                            <td className="px-4 py-6 text-center text-text-muted" colSpan={5}>Chưa cấu hình WiFi nào.</td>
                                        </tr>
                                    )}
                                    {wifiRows.map((item) => (
                                        <tr key={item.id}>
                                            <td className="px-4 py-3 font-semibold text-slate-900">{item.ssid}</td>
                                            <td className="px-4 py-3 text-slate-700">{item.bssid || 'Bất kỳ BSSID nào'}</td>
                                            <td className="px-4 py-3 text-text-muted">{item.note || '—'}</td>
                                            <td className="px-4 py-3"><Badge tone={item.is_active ? 'emerald' : 'slate'}>{item.is_active ? 'Đang bật' : 'Đang tắt'}</Badge></td>
                                            <td className="px-4 py-3">
                                                <div className="flex justify-end gap-2">
                                                    <button type="button" className={buttonSecondaryClass} onClick={() => resetWifiForm(item)}>Sửa</button>
                                                    <button type="button" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100" onClick={() => removeWifi(item)}>Xóa</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'devices' && canManage && (
                    <div className={cardClass}>
                        <FilterToolbar enableSearch
                            className="mb-4"
                            title="Thiết bị nhân viên"
                            description="Mỗi nhân viên chỉ dùng một thiết bị đã được duyệt để chấm công trên đúng Wi-Fi/BSSID công ty. Administrator có thể gỡ liên kết thiết bị — nhân sự phải gửi đăng ký lại trên app."
                            searchValue={deviceFilters.search}
                            onSearch={handleDeviceSearch}
                            onSubmitFilters={() => loadDevices({ ...deviceFilters, page: 1 })}
                            actions={(
                                <FilterActionGroup className="xl:justify-end">
                                    <button
                                        type="submit"
                                        className={buttonSecondaryClass}
                                    >
                                        Lọc
                                    </button>
                                </FilterActionGroup>
                            )}
                        >
                            <div className="grid gap-4 md:grid-cols-1">
                                <FilterField label="Trạng thái">
                                    <select className={filterControlClass} value={deviceFilters.status} onChange={(e) => {
                                        const next = { ...deviceFilters, status: e.target.value, page: 1 };
                                        setDeviceFilters(next);
                                    }}>
                                        <option value="">Tất cả trạng thái</option>
                                        <option value="pending">Chờ duyệt</option>
                                        <option value="approved">Đã duyệt</option>
                                        <option value="rejected">Từ chối</option>
                                    </select>
                                </FilterField>
                            </div>
                        </FilterToolbar>
                        <div className="mt-4 space-y-3">
                            {devices.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-text-muted">Chưa có thiết bị nào.</div>}
                            {devices.map((item) => (
                                <div key={item.id} className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h4 className="font-semibold text-slate-900">{item.user?.name || 'Nhân sự'} • {item.device_name || 'Thiết bị chưa đặt tên'}</h4>
                                                <Badge tone={toneForStatus(item.status)}>{statusLabels[item.status] || item.status}</Badge>
                                            </div>
                                            <div className="mt-1 text-sm text-text-muted">{item.user?.role || '—'} • {item.user?.department || 'Chưa có phòng ban'}</div>
                                            <div className="mt-2 text-sm text-slate-700">UUID: {item.device_uuid}</div>
                                            <div className="mt-1 text-sm text-slate-700">Platform: {item.device_platform || '—'} • Model: {item.device_model || '—'}</div>
                                            <div className="mt-1 text-sm text-slate-700">Gửi yêu cầu: {formatVietnamDateTime(item.requested_at)}</div>
                                            {item.note ? <div className="mt-2 rounded-xl bg-white px-3 py-2 text-sm text-slate-700">{item.note}</div> : null}
                                        </div>
                                        {(item.status === 'pending' || isAdministrator) ? (
                                            <div className="flex flex-wrap justify-end gap-2">
                                                {item.status === 'pending' ? (
                                                    <>
                                                        <button type="button" className={buttonPrimaryClass} onClick={() => reviewDevice(item, 'approved')}>Duyệt</button>
                                                        <button type="button" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100" onClick={() => reviewDevice(item, 'rejected')}>Từ chối</button>
                                                    </>
                                                ) : null}
                                                {isAdministrator ? (
                                                    <button
                                                        type="button"
                                                        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                                                        onClick={() => revokeDevice(item)}
                                                    >
                                                        Gỡ thiết bị
                                                    </button>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <PaginationControls
                            page={devicePaging.current_page}
                            lastPage={devicePaging.last_page}
                            total={devicePaging.total}
                            perPage={devicePaging.per_page}
                            onPageChange={(page) => {
                                const next = { ...deviceFilters, page };
                                setDeviceFilters(next);
                                loadDevices(next);
                            }}
                            onPerPageChange={(perPage) => {
                                const next = { ...deviceFilters, per_page: perPage, page: 1 };
                                setDeviceFilters(next);
                                loadDevices(next);
                            }}
                            label="thiết bị"
                        />
                    </div>
                )}

                {activeTab === 'holidays' && canManage && (
                    <div className={cardClass}>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Ngày lễ tự động đủ công</h3>
                                <p className="mt-1 text-sm text-text-muted">Có thể nhập cả một khoảng nghỉ nhiều ngày. Khi đến từng ngày trong khoảng active, cron sẽ tự động chấm đủ công cho toàn bộ nhân sự thuộc diện attendance.</p>
                            </div>
                            <button type="button" className={buttonPrimaryClass} onClick={() => resetHolidayForm(null)}>Thêm ngày lễ</button>
                        </div>
                        <div className="mt-4 space-y-3">
                            {holidays.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-text-muted">Chưa có ngày lễ nào.</div>}
                            {holidays.map((item) => (
                                <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h4 className="font-semibold text-slate-900">{item.title}</h4>
                                            <Badge tone={item.is_active ? 'emerald' : 'slate'}>{item.is_active ? 'Active' : 'Tạm tắt'}</Badge>
                                        </div>
                                        <div className="mt-1 text-sm text-text-muted">{formatHolidayRange(item)}</div>
                                        {item.note ? <div className="mt-2 text-sm text-slate-700">{item.note}</div> : null}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button type="button" className={buttonSecondaryClass} onClick={() => resetHolidayForm(item)}>Sửa</button>
                                        <button type="button" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100" onClick={() => removeHoliday(item)}>Xóa</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'staff' && canManage && (
                    <div className={cardClass}>
                        <FilterToolbar enableSearch
                            className="mb-4"
                            title="Cấu hình từng nhân viên"
                            description="Toàn thời gian phải chấm trong khung đầu giờ để được 1 công. Mỗi chiều lấy mốc từ giờ bắt đầu buổi chiều."
                            searchValue={staffFilters.search}
                            onSearch={handleStaffSearch}
                            onSubmitFilters={() => loadStaff({ ...staffFilters, page: 1 })}
                            actions={(
                                <FilterActionGroup className="xl:justify-end">
                                    <button
                                        type="submit"
                                        className={buttonSecondaryClass}
                                    >
                                        Lọc
                                    </button>
                                </FilterActionGroup>
                            )}
                        >
                            <div className="grid gap-4 md:grid-cols-1">
                                <FilterField label="Vai trò">
                                    <select className={filterControlClass} value={staffFilters.role} onChange={(e) => {
                                        const next = { ...staffFilters, role: e.target.value, page: 1 };
                                        setStaffFilters(next);
                                    }}>
                                        <option value="">Tất cả vai trò</option>
                                        <option value="admin">Admin</option>
                                        <option value="quan_ly">Quản lý</option>
                                        <option value="nhan_vien">Nhân viên</option>
                                        <option value="ke_toan">Kế toán</option>
                                    </select>
                                </FilterField>
                            </div>
                        </FilterToolbar>
                        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200/80">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Nhân sự</th>
                                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Vai trò</th>
                                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Phòng ban</th>
                                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Kiểu làm việc</th>
                                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Trạng thái</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {staffRows.length === 0 && (
                                        <tr>
                                            <td className="px-4 py-6 text-center text-text-muted" colSpan={5}>Chưa có nhân sự phù hợp.</td>
                                        </tr>
                                    )}
                                    {staffRows.map((item) => (
                                        <tr key={item.id}>
                                            <td className="px-4 py-3">
                                                <div className="font-semibold text-slate-900">{item.name}</div>
                                                <div className="text-xs text-text-muted">{item.email}</div>
                                            </td>
                                            <td className="px-4 py-3">{item.role}</td>
                                            <td className="px-4 py-3">{item.department || '—'}</td>
                                            <td className="px-4 py-3">
                                                <select className={inputClass} value={item.attendance_employment_type || 'full_time'} onChange={(e) => updateStaffEmployment(item.id, e.target.value)}>
                                                    {employmentOptions.map((option) => (
                                                        <option key={option.value} value={option.value}>{option.label}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3"><Badge tone={item.is_active ? 'emerald' : 'slate'}>{item.is_active ? 'Đang hoạt động' : 'Ngừng hoạt động'}</Badge></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <PaginationControls
                            page={staffPaging.current_page}
                            lastPage={staffPaging.last_page}
                            total={staffPaging.total}
                            perPage={staffPaging.per_page}
                            onPageChange={(page) => {
                                const next = { ...staffFilters, page };
                                setStaffFilters(next);
                                loadStaff(next);
                            }}
                            onPerPageChange={(perPage) => {
                                const next = { ...staffFilters, per_page: perPage, page: 1 };
                                setStaffFilters(next);
                                loadStaff(next);
                            }}
                            label="nhân sự"
                        />
                    </div>
                )}

                {activeTab === 'report' && canViewReport && (
                    <div className={cardClass}>
                        <FilterToolbar enableSearch
                            className="mb-4"
                            title="Báo cáo công"
                            description="Bảng công dạng ma trận theo tháng: mỗi hàng là nhân sự, mỗi cột là ngày trong tháng."
                            searchValue={reportFilters.search}
                            onSearch={handleReportSearch}
                            onSubmitFilters={() => loadReport(reportFilters)}
                            actions={(
                                <FilterActionGroup className="xl:justify-end">
                                    {canManualAdjust ? (
                                        <button type="button" className={buttonSecondaryClass} onClick={() => openManualRecord()}>Sửa công tay</button>
                                    ) : null}
                                    <button type="submit" className={buttonSecondaryClass}>Xem báo cáo</button>
                                    {canExport ? (
                                        <button type="button" className={buttonPrimaryClass} onClick={openExportModal}>Xuất Excel</button>
                                    ) : null}
                                </FilterActionGroup>
                            )}
                        >
                            <div className="grid gap-4 md:grid-cols-2">
                                <FilterField label="Tháng báo cáo">
                                    <input
                                        type="month"
                                        className={filterControlClass}
                                        value={reportFilters.month}
                                        onChange={(e) => setReportFilters((s) => ({ ...s, month: e.target.value }))}
                                    />
                                </FilterField>
                                <FilterField label="Kỳ đang xem">
                                    <input
                                        className={`${filterControlClass} bg-slate-50`}
                                        value={reportMatrix.month_label || '—'}
                                        readOnly
                                    />
                                </FilterField>
                            </div>
                        </FilterToolbar>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <StatCard label="Tổng nhân viên" value={String(reportSummary.total_staff || 0)} />
                            <StatCard label="Công ngày hiện tại" value={String(reportSummary.today_work_units || 0)} />
                        </div>
                        {Array.isArray(reportMatrix.legend) && reportMatrix.legend.length > 0 && (
                            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                {reportMatrix.legend.map((item) => (
                                    <div key={item.key} className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                                        <span className={`h-2.5 w-2.5 rounded-full ${matrixToneClass(item.tone)}`} />
                                        {item.label}
                                    </div>
                                ))}
                            </div>
                        )}
                        {reportGrowth.items.length > 0 && (
                            <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                        Biểu đồ tăng trưởng công theo ngày
                                    </p>
                                    <p className="text-[11px] text-text-muted">
                                        Tổng hợp theo {reportMatrix.month_label || 'tháng'}
                                    </p>
                                </div>
                                <div className="flex items-end gap-1 overflow-x-auto pb-2">
                                    {reportGrowth.items.map((item) => {
                                        const h = Math.max(4, Math.round((Number(item.value || 0) / reportGrowth.max) * 100));
                                        return (
                                            <div key={item.date} className="min-w-[28px] text-center">
                                                <div className="flex h-24 items-end justify-center">
                                                    <div
                                                        className={`w-5 rounded-t ${item.is_weekend ? 'bg-cyan-400/75' : 'bg-primary/75'}`}
                                                        style={{ height: `${h}%` }}
                                                        title={`${item.date}: ${item.value} công`}
                                                    />
                                                </div>
                                                <div className="mt-1 text-[9px] text-text-muted">{item.label}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200/80">
                            <table className="min-w-max divide-y divide-slate-200 text-sm">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Nhân sự</th>
                                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Vai trò</th>
                                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Phòng ban</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-700">Tổng công</th>
                                        {(reportMatrix.days || []).map((day) => (
                                            <th key={day.date} className={`px-2 py-3 text-center font-semibold text-slate-700 ${day.is_weekend ? 'bg-slate-100/80' : ''}`}>
                                                <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">{day.weekday}</div>
                                                <div className="text-xs font-semibold">{String(day.day).padStart(2, '0')}</div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {(reportMatrix.rows || []).length === 0 && (
                                        <tr>
                                            <td className="px-4 py-6 text-center text-text-muted" colSpan={4 + (reportMatrix.days || []).length}>
                                                Chưa có dữ liệu báo cáo trong tháng đã chọn.
                                            </td>
                                        </tr>
                                    )}
                                    {(reportMatrix.rows || []).map((row) => (
                                        <tr key={row.user_id}>
                                            <td className="px-4 py-3">
                                                <div className="font-semibold text-slate-900">{row.user_name}</div>
                                                <div className="text-xs text-text-muted">{row.email || '—'}</div>
                                            </td>
                                            <td className="px-4 py-3">{row.role}</td>
                                            <td className="px-4 py-3">{row.department}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-900">{row.total_work_units}</td>
                                            {(row.cells || []).map((cell) => (
                                                <td
                                                    key={`${row.user_id}-${cell.date}`}
                                                    className={`px-2 py-2 text-center align-middle ${cell.has_record ? 'bg-white' : 'bg-slate-50/60'}`}
                                                    title={`${cell.date} • ${cell.status_label}${cell.minutes_late ? ` • Trễ ${cell.minutes_late} phút` : ''}`}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => onMatrixCellClick(row, cell)}
                                                        disabled={!cell.has_record && !canManualAdjust}
                                                        className="mx-auto inline-flex min-h-[30px] min-w-[38px] items-center justify-center gap-1 rounded-lg border border-transparent px-1.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-200 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        <span>{cell.work_units_display || '·'}</span>
                                                        <span className={`h-1.5 w-1.5 rounded-full ${matrixToneClass(cell.tone)}`} />
                                                    </button>
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-3 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs text-text-muted space-y-1">
                            <p>
                                Ô có chấm <span className="inline-block h-2 w-2 rounded-full bg-orange-500 align-middle" /> = chấm qua app thành công, chưa chỉnh sửa.
                                Chấm <span className="inline-block h-2 w-2 rounded-full bg-sky-600 align-middle" /> = đã chỉnh sửa hoặc duyệt đơn — xem lịch sử trong chi tiết.
                            </p>
                            {canManualAdjust ? (
                                <p>Administrator: bấm ô trống hoặc có bản ghi để sửa công tay; các vai trò khác chỉ xem chi tiết.</p>
                            ) : (
                                <p>Bấm vào ô có dữ liệu để xem chi tiết (chỉ đọc). Lịch sử chỉnh sửa hiển thị khi bản ghi đã được điều chỉnh.</p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <Modal
                open={wifiModal.open}
                onClose={() => setWifiModal({ open: false, item: null })}
                title={wifiModal.item ? `Sửa WiFi ${wifiModal.item.ssid}` : 'Thêm WiFi được phép'}
                description="Cấu hình SSID bắt buộc, BSSID có thể để trống nếu chấp nhận mọi BSSID của SSID đó."
                size="md"
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <FormField label="SSID" required>
                        <input className={inputClass} value={wifiForm.ssid} onChange={(e) => setWifiForm((s) => ({ ...s, ssid: e.target.value }))} />
                    </FormField>
                    <FormField label="BSSID">
                        <input className={inputClass} value={wifiForm.bssid} onChange={(e) => setWifiForm((s) => ({ ...s, bssid: e.target.value }))} placeholder="Ví dụ: aa:bb:cc:dd:ee:ff" />
                    </FormField>
                    <FormField label="Ghi chú" className="md:col-span-2">
                        <textarea className={textAreaClass} value={wifiForm.note} onChange={(e) => setWifiForm((s) => ({ ...s, note: e.target.value }))} />
                    </FormField>
                    <FormField label="Trạng thái">
                        <select className={inputClass} value={wifiForm.is_active ? '1' : '0'} onChange={(e) => setWifiForm((s) => ({ ...s, is_active: e.target.value === '1' }))}>
                            <option value="1">Đang bật</option>
                            <option value="0">Tạm tắt</option>
                        </select>
                    </FormField>
                </div>
                <div className="mt-5 flex justify-end gap-3">
                    <button type="button" className={buttonSecondaryClass} onClick={() => setWifiModal({ open: false, item: null })}>Hủy</button>
                    <button type="button" className={buttonPrimaryClass} onClick={saveWifi}>Lưu WiFi</button>
                </div>
            </Modal>

            <Modal
                open={holidayModal.open}
                onClose={() => setHolidayModal({ open: false, item: null })}
                title={holidayModal.item ? `Sửa ngày lễ ${holidayModal.item.title}` : 'Thêm ngày lễ'}
                description="Có thể nhập ngày bắt đầu và ngày kết thúc cho cả một kỳ nghỉ dài, ví dụ Tết 10 ngày. Cron sẽ tự động chấm đủ công cho từng ngày nằm trong khoảng này."
                size="md"
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <FormField label="Từ ngày" required>
                        <input type="date" className={inputClass} value={holidayForm.start_date} onChange={(e) => setHolidayForm((s) => ({ ...s, start_date: e.target.value }))} />
                    </FormField>
                    <FormField label="Đến ngày" required>
                        <input type="date" className={inputClass} value={holidayForm.end_date} onChange={(e) => setHolidayForm((s) => ({ ...s, end_date: e.target.value }))} />
                    </FormField>
                    <FormField label="Trạng thái">
                        <select className={inputClass} value={holidayForm.is_active ? '1' : '0'} onChange={(e) => setHolidayForm((s) => ({ ...s, is_active: e.target.value === '1' }))}>
                            <option value="1">Đang bật</option>
                            <option value="0">Tạm tắt</option>
                        </select>
                    </FormField>
                    <FormField label="Tiêu đề" required className="md:col-span-2">
                        <input className={inputClass} value={holidayForm.title} onChange={(e) => setHolidayForm((s) => ({ ...s, title: e.target.value }))} />
                    </FormField>
                    <FormField label="Ghi chú" className="md:col-span-2">
                        <textarea className={textAreaClass} value={holidayForm.note} onChange={(e) => setHolidayForm((s) => ({ ...s, note: e.target.value }))} />
                    </FormField>
                </div>
                <div className="mt-5 flex justify-end gap-3">
                    <button type="button" className={buttonSecondaryClass} onClick={() => setHolidayModal({ open: false, item: null })}>Hủy</button>
                    <button type="button" className={buttonPrimaryClass} onClick={saveHoliday}>Lưu ngày lễ</button>
                </div>
            </Modal>

            <Modal
                open={reviewModal.open}
                onClose={() => setReviewModal({ open: false, item: null })}
                title={reviewModal.item ? `Duyệt đơn #${reviewModal.item.id}` : 'Duyệt đơn'}
                description="Chọn duyệt đủ công hoặc duyệt không đủ công. Hệ thống sẽ điều chỉnh giờ vào theo giờ xin phép nếu có."
                size="md"
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <FormField label="Kết quả duyệt" required>
                        <select className={inputClass} value={reviewForm.status} onChange={(e) => setReviewForm((s) => ({ ...s, status: e.target.value }))}>
                            <option value="approved">Duyệt</option>
                            <option value="rejected">Từ chối</option>
                        </select>
                    </FormField>
                    {reviewForm.status === 'approved' ? (
                        <FormField label="Cách tính công" required>
                            <select className={inputClass} value={reviewForm.approval_mode} onChange={(e) => setReviewForm((s) => ({ ...s, approval_mode: e.target.value }))}>
                                {(reviewModal.item?.request_type === 'leave_request' ? leaveApprovalModeOptions : lateApprovalModeOptions).map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </FormField>
                    ) : null}
                    <FormField label="Ghi chú duyệt" className="md:col-span-2">
                        <textarea className={textAreaClass} value={reviewForm.decision_note} onChange={(e) => setReviewForm((s) => ({ ...s, decision_note: e.target.value }))} placeholder="Ghi chú gửi lại cho nhân viên" />
                    </FormField>
                </div>
                <div className="mt-5 flex justify-end gap-3">
                    <button type="button" className={buttonSecondaryClass} onClick={() => setReviewModal({ open: false, item: null })}>Hủy</button>
                    <button type="button" className={buttonPrimaryClass} onClick={reviewRequest}>Xác nhận</button>
                </div>
            </Modal>

            <Modal
                open={manualRecordModal.open}
                onClose={() => setManualRecordModal({ open: false, item: null })}
                title={manualRecordModal.item ? `Sửa công ${manualRecordModal.item.user_name}` : 'Sửa công thủ công'}
                description="Chỉ administrator được sửa công thủ công. Bước công là 0.5 (0.5 hoặc 1.0)."
                size="md"
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <FormField label="Nhân sự" required className="md:col-span-2">
                        <select className={inputClass} value={manualRecordForm.user_id} onChange={(e) => setManualRecordForm((s) => ({ ...s, user_id: e.target.value }))}>
                            <option value="">Chọn nhân sự</option>
                            {manualStaffOptions.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.name} • {item.role} • {item.department || 'Không có phòng ban'}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField label="Ngày công" required>
                        <input type="date" className={inputClass} value={manualRecordForm.work_date} onChange={(e) => setManualRecordForm((s) => ({ ...s, work_date: e.target.value }))} />
                    </FormField>
                    <FormField label="Giờ vào">
                        <input type="time" className={inputClass} value={manualRecordForm.check_in_time} onChange={(e) => setManualRecordForm((s) => ({ ...s, check_in_time: e.target.value }))} />
                    </FormField>
                    <FormField label="Số công" required>
                        <input type="number" step="0.5" min="0" max="1" className={inputClass} value={manualRecordForm.work_units} onChange={(e) => setManualRecordForm((s) => ({ ...s, work_units: e.target.value }))} />
                        <span className="mt-1 block text-xs text-text-muted">Nhập 0.5 hoặc 1.0 theo bước 0.5.</span>
                    </FormField>
                    <FormField label="Ghi chú" className="md:col-span-2">
                        <textarea className={textAreaClass} value={manualRecordForm.note} onChange={(e) => setManualRecordForm((s) => ({ ...s, note: e.target.value }))} placeholder="Ví dụ: Điều chỉnh tay theo quyết định quản lý" />
                    </FormField>
                </div>
                <div className="mt-5 flex justify-end gap-3">
                    <button type="button" className={buttonSecondaryClass} onClick={() => setManualRecordModal({ open: false, item: null })}>Hủy</button>
                    <button type="button" className={buttonPrimaryClass} onClick={saveManualRecord} disabled={!manualRecordForm.user_id || !manualRecordForm.work_date}>Lưu công</button>
                </div>
            </Modal>

            <Modal
                open={recordDetailModal.open}
                onClose={() => setRecordDetailModal((s) => ({ ...s, open: false }))}
                title={
                    recordDetailModal.meta?.user_name
                        ? `Chi tiết công — ${recordDetailModal.meta.user_name}`
                        : 'Chi tiết bản ghi chấm công'
                }
                description={
                    recordDetailModal.meta?.work_date
                        ? `Ngày ${formatIsoDate(recordDetailModal.meta.work_date)}. ${
                            recordDetailModal.form_read_only
                                ? 'Bạn chỉ xem thông tin; chỉ Administrator sửa công trực tiếp không qua đơn.'
                                : 'Administrator có thể điều chỉnh qua nút «Sửa công tay» trên báo cáo.'
                        }`
                        : ''
                }
                size="lg"
            >
                {recordDetailModal.loading ? (
                    <p className="text-sm text-text-muted">Đang tải...</p>
                ) : null}
                {recordDetailModal.error ? (
                    <p className="text-sm text-rose-600">{recordDetailModal.error}</p>
                ) : null}
                {!recordDetailModal.loading && recordDetailModal.record ? (
                    <div className="space-y-4 text-sm">
                        <div className="grid gap-3 md:grid-cols-2">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">Số công</p>
                                <p className="font-semibold text-slate-900">{recordDetailModal.record.work_units}</p>
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">Giờ vào (check-in)</p>
                                <p className="text-slate-800">
                                    {recordDetailModal.record.check_in_at
                                        ? formatVietnamDateTime(recordDetailModal.record.check_in_at)
                                        : '—'}
                                </p>
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">Phút trễ</p>
                                <p className="text-slate-800">{recordDetailModal.record.minutes_late ?? 0}</p>
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">Trạng thái</p>
                                <p className="text-slate-800">{recordDetailModal.record.status}</p>
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">Nguồn dữ liệu</p>
                                <p className="text-slate-800">{recordDetailModal.record.source}</p>
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">Loại chấm</p>
                                <p className="flex items-center gap-2 text-slate-800">
                                    <span className={`h-2.5 w-2.5 rounded-full ${matrixToneClass(recordDetailModal.record.dot_tone)}`} />
                                    {recordDetailModal.record.dot_tone === 'orange'
                                        ? 'Chấm app (chưa chỉnh)'
                                        : recordDetailModal.record.dot_tone === 'blue'
                                            ? 'Đã chỉnh / duyệt'
                                            : recordDetailModal.record.dot_tone || '—'}
                                </p>
                            </div>
                            <div className="md:col-span-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">Ghi chú</p>
                                <p className="whitespace-pre-wrap text-slate-800">{recordDetailModal.record.note || '—'}</p>
                            </div>
                            <div className="md:col-span-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                                <span className="font-semibold text-slate-700">Thiết bị / Wi-Fi:</span>{' '}
                                {recordDetailModal.record.device_name || '—'} • {recordDetailModal.record.wifi_ssid || '—'}
                            </div>
                        </div>
                        {Array.isArray(recordDetailModal.edit_logs) && recordDetailModal.edit_logs.length > 0 ? (
                            <div>
                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                                    Lịch sử chỉnh sửa
                                </p>
                                <ul className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-200/80 bg-white p-3">
                                    {recordDetailModal.edit_logs.map((log) => (
                                        <li key={log.id} className="border-b border-slate-100 pb-2 text-xs last:border-0 last:pb-0">
                                            <div className="flex flex-wrap justify-between gap-2 text-text-muted">
                                                <span>{log.created_at ? formatVietnamDateTime(log.created_at) : '—'}</span>
                                                <span className="font-medium text-slate-700">
                                                    {log.actor?.name || 'Hệ thống'} — {log.action}
                                                </span>
                                            </div>
                                            {log.payload ? (
                                                <pre className="mt-1 whitespace-pre-wrap break-all text-[11px] text-slate-600">
                                                    {typeof log.payload === 'string' ? log.payload : JSON.stringify(log.payload, null, 2)}
                                                </pre>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className="text-xs text-text-muted">
                                {recordDetailModal.record.dot_tone === 'orange'
                                    ? 'Bản ghi gốc từ app — chưa có lịch sử chỉnh sửa.'
                                    : 'Chưa có mục lịch sử (có thể chỉnh qua luồng khác).'}
                            </p>
                        )}
                    </div>
                ) : null}
                <div className="mt-5 flex justify-end gap-3">
                    <button
                        type="button"
                        className={buttonSecondaryClass}
                        onClick={() => setRecordDetailModal((s) => ({ ...s, open: false }))}
                    >
                        Đóng
                    </button>
                </div>
            </Modal>

            <Modal
                open={exportModalOpen}
                onClose={() => setExportModalOpen(false)}
                title="Xuất báo cáo công (Excel)"
                description="Chọn khoảng ngày cần xuất. File gồm công và phút trễ theo từng ngày, cột tổng hợp kỳ và đơn xin phép. Chỉ kế toán và quản trị mới xuất được."
                size="md"
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <FormField label="Từ ngày" required>
                        <input
                            type="date"
                            className={inputClass}
                            value={exportRange.start_date}
                            onChange={(e) => setExportRange((s) => ({ ...s, start_date: e.target.value }))}
                        />
                    </FormField>
                    <FormField label="Đến ngày" required>
                        <input
                            type="date"
                            className={inputClass}
                            value={exportRange.end_date}
                            onChange={(e) => setExportRange((s) => ({ ...s, end_date: e.target.value }))}
                        />
                    </FormField>
                </div>
                <div className="mt-5 flex justify-end gap-3">
                    <button type="button" className={buttonSecondaryClass} onClick={() => setExportModalOpen(false)}>Hủy</button>
                    <button type="button" className={buttonPrimaryClass} onClick={exportReport}>Tải file</button>
                </div>
            </Modal>
        </PageContainer>
    );
}
