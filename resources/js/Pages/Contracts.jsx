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
import PaginationControls from '@/Components/PaginationControls';
import ClientSelect from '@/Components/ClientSelect';
import TagMultiSelect from '@/Components/TagMultiSelect';
import { fetchStaffFilterOptions, usersToStaffTagOptions } from '@/lib/staffFilterOptions';
import { useToast } from '@/Contexts/ToastContext';
import { formatVietnamDate, toDateInputValue } from '@/lib/vietnamTime';

const STATUS_OPTIONS = [
    { value: 'draft', label: 'Nháp' },
    { value: 'signed', label: 'Đã ký' },
    { value: 'success', label: 'Thành công' },
    { value: 'active', label: 'Đang hiệu lực' },
    { value: 'expired', label: 'Hết hạn' },
    { value: 'cancelled', label: 'Hủy' },
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
const calculateItemTotal = (item) => {
    const price = parseNumberInput(item?.unit_price);
    const quantity = Math.max(1, parseNumberInput(item?.quantity) || 1);
    return price * quantity;
};
const hasInputValue = (value) => value !== null && value !== undefined && String(value).trim() !== '';
const normalizeVatMode = (value) => (String(value || '').toLowerCase() === 'amount' ? 'amount' : 'percent');
const calculateVatAmount = ({ subtotal = 0, vatEnabled = false, vatMode = 'percent', vatRate = 0, vatAmount = 0 }) => {
    if (!vatEnabled) return 0;
    const normalizedSubtotal = Math.max(0, parseNumberInput(subtotal));
    if (normalizeVatMode(vatMode) === 'amount') {
        return Math.max(0, parseNumberInput(vatAmount));
    }
    return Math.max(0, normalizedSubtotal * Math.max(0, parseNumberInput(vatRate)) / 100);
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
    const canDelete = ['admin', 'administrator', 'quan_ly', 'ke_toan'].includes(userRole);
    const canApprove = ['admin', 'administrator', 'ke_toan'].includes(userRole);
    const canFinance = ['admin', 'administrator', 'ke_toan'].includes(userRole);
    const canBulkActions = canApprove || canDelete;
    const isEmployee = userRole === 'nhan_vien';
    const canChooseCollector = ['admin', 'administrator', 'quan_ly', 'ke_toan'].includes(userRole);
    /** Mặc định khi tạo mới: người đang đăng nhập (có thể đổi nếu được phép). */
    const defaultCollectorUserId = currentUserId ? String(currentUserId) : '';

    const [contracts, setContracts] = useState([]);
    const [projects, setProjects] = useState([]);
    const [products, setProducts] = useState([]);
    const [collectors, setCollectors] = useState([]);
    const [contractStaffFilterUsers, setContractStaffFilterUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [savingContract, setSavingContract] = useState(false);
    const [savingPayment, setSavingPayment] = useState(false);
    const [savingCost, setSavingCost] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [contractClientPreview, setContractClientPreview] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [showDetail, setShowDetail] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailContract, setDetailContract] = useState(null);
    const [careNoteForm, setCareNoteForm] = useState({ title: '', detail: '' });
    const [savingCareNote, setSavingCareNote] = useState(false);
    const [contractMeta, setContractMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [listAggregates, setListAggregates] = useState({
        revenue_total: 0,
        cashflow_total: 0,
        debt_total: 0,
        costs_total: 0,
    });
    const [filters, setFilters] = useState({
        search: '',
        status: '',
        client_id: '',
        approval_status: '',
        handover_receive_status: '',
        has_project: '',
        project_status: '',
        staff_ids: [],
        per_page: 20,
        page: 1,
        sort_by: 'signed_at',
        sort_dir: 'desc',
    });
    const [form, setForm] = useState({
        title: '',
        client_id: '',
        collector_user_id: defaultCollectorUserId,
        care_staff_ids: [],
        value: '',
        subtotal_value: '',
        vat_enabled: false,
        vat_mode: 'percent',
        vat_rate: '',
        vat_amount: '',
        payment_times: '1',
        /** Chỉ để hiển thị (đồng bộ từ API), không gửi khi lưu */
        status_display: '',
        signed_at: todayInputValue(),
        start_date: todayInputValue(),
        end_date: '',
        notes: '',
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
    const [bulkLoading, setBulkLoading] = useState(false);
    const contractTableRef = useRef(null);

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
        if (!canManage) return false;

        const apiPermission = readBoolean(contract?.can_manage);
        if (apiPermission !== null) {
            return apiPermission;
        }

        if (userRole !== 'nhan_vien') {
            return true;
        }

        const uid = Number(currentUserId || 0);
        if (!uid) return false;

        const client = contract?.client || {};
        return Number(contract?.created_by || 0) === uid
            || Number(contract?.collector_user_id || 0) === uid
            || Number(client?.assigned_staff_id || 0) === uid
            || Number(client?.sales_owner_id || 0) === uid;
    };

    const canDeleteContract = (contract) => {
        if (!canDelete) return false;

        const apiPermission = readBoolean(contract?.can_delete);
        if (apiPermission !== null) {
            return apiPermission;
        }

        return canManageContract(contract);
    };

    const collectorFilterOptions = useMemo(() => {
        if (contractStaffFilterUsers.length > 0) {
            return usersToStaffTagOptions(contractStaffFilterUsers);
        }
        return usersToStaffTagOptions(collectors);
    }, [contractStaffFilterUsers, collectors]);

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
        items.length
            ? itemsTotal
            : parseNumberInput(form.vat_enabled ? form.subtotal_value : form.value)
    ), [form.subtotal_value, form.value, form.vat_enabled, items.length, itemsTotal]);

    const vatComputedAmount = useMemo(() => calculateVatAmount({
        subtotal: contractSubtotal,
        vatEnabled: form.vat_enabled,
        vatMode: form.vat_mode,
        vatRate: form.vat_rate,
        vatAmount: form.vat_amount,
    }), [contractSubtotal, form.vat_amount, form.vat_enabled, form.vat_mode, form.vat_rate]);

    const contractValueTotal = useMemo(() => (
        contractSubtotal + vatComputedAmount
    ), [contractSubtotal, vatComputedAmount]);

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

    const fetchContractStaffFilterOptions = async () => {
        try {
            const rows = await fetchStaffFilterOptions('contracts');
            setContractStaffFilterUsers(rows);
        } catch {
            setContractStaffFilterUsers([]);
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
                    sort_by: nextFilters.sort_by || 'signed_at',
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
            });
            const visibleIds = new Set(rows.map((row) => Number(row.id)));
            setSelectedContractIds((prev) => prev.filter((id) => visibleIds.has(Number(id))));
            setContractMeta({
                current_page: res.data?.current_page || 1,
                last_page: res.data?.last_page || 1,
                total: res.data?.total || 0,
            });
            setFilters((prev) => ({ ...prev, page: res.data?.current_page || nextPage }));
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
        fetchContractStaffFilterOptions();
        fetchContracts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    const visibleContractIds = useMemo(
        () => contracts.map((contract) => Number(contract.id)).filter((id) => id > 0),
        [contracts]
    );
    const selectedContractSet = useMemo(
        () => new Set(selectedContractIds.map((id) => Number(id))),
        [selectedContractIds]
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
            vat_enabled: false,
            vat_mode: 'percent',
            vat_rate: '',
            vat_amount: '',
            payment_times: '1',
            status_display: '',
            signed_at: todayInputValue(),
            start_date: todayInputValue(),
            end_date: '',
            notes: '',
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
                vat_enabled: Boolean(detail.vat_enabled),
                vat_mode: normalizeVatMode(detail.vat_mode),
                vat_rate: hasInputValue(detail.vat_rate) ? String(detail.vat_rate) : '',
                vat_amount: hasInputValue(detail.vat_amount) ? String(detail.vat_amount) : '',
                payment_times: String(detail.payment_times ?? 1),
                status_display: detail.status || 'draft',
                signed_at: toDateInputValue(detail.signed_at),
                start_date: toDateInputValue(detail.start_date),
                end_date: toDateInputValue(detail.end_date),
                notes: detail.notes || '',
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
            const nextSubtotal = nextItems.reduce((sum, item) => sum + calculateItemTotal(item), 0);
            setForm((current) => ({ ...current, value: String(nextSubtotal), subtotal_value: String(nextSubtotal) }));
            return nextItems;
        });
    };

    const updateItem = (index, changes) => {
        setItems((prev) => {
            const nextItems = prev.map((item, idx) => {
                if (idx !== index) return item;
                return { ...item, ...changes };
            });
            const nextSubtotal = nextItems.reduce((sum, item) => sum + calculateItemTotal(item), 0);
            setForm((current) => ({ ...current, value: String(nextSubtotal), subtotal_value: String(nextSubtotal) }));
            return nextItems;
        });
    };

    const removeItem = (index) => {
        setItems((prev) => {
            const nextItems = prev.filter((_, idx) => idx !== index);
            const nextSubtotal = nextItems.reduce((sum, item) => sum + calculateItemTotal(item), 0);
            setForm((current) => ({
                ...current,
                value: nextItems.length ? String(nextSubtotal) : current.vat_enabled ? current.value : '',
                subtotal_value: nextItems.length ? String(nextSubtotal) : '',
            }));
            return nextItems;
        });
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
        if (editingId && !canManage) return toast.error('Bạn không có quyền quản lý hợp đồng.');
        if (editingId && !editingCanManage) {
            return toast.error('Bạn chỉ có quyền xem hợp đồng này.');
        }
        if (!form.title?.trim() || !form.client_id) {
            return toast.error('Vui lòng chọn khách hàng và nhập tiêu đề hợp đồng.');
        }
        const payload = {
            title: form.title,
            client_id: Number(form.client_id),
            collector_user_id: form.collector_user_id ? Number(form.collector_user_id) : null,
            subtotal_value: items.length || form.vat_enabled
                ? contractSubtotal
                : form.value === '' ? null : parseNumberInput(form.value),
            value: items.length || form.vat_enabled
                ? contractValueTotal
                : form.value === '' ? null : parseNumberInput(form.value),
            vat_enabled: Boolean(form.vat_enabled),
            vat_mode: form.vat_enabled ? normalizeVatMode(form.vat_mode) : null,
            vat_rate: form.vat_enabled && normalizeVatMode(form.vat_mode) === 'percent'
                ? parseNumberInput(form.vat_rate)
                : null,
            vat_amount: form.vat_enabled && normalizeVatMode(form.vat_mode) === 'amount'
                ? parseNumberInput(form.vat_amount)
                : null,
            payment_times: form.payment_times === '' ? 1 : Number(form.payment_times),
            signed_at: form.signed_at || null,
            start_date: form.start_date || null,
            end_date: form.end_date || null,
            notes: form.notes || null,
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
                    {canCreate && (
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
                    description="Lọc theo mã, trạng thái thực hiện và trạng thái duyệt. Ô tìm kiếm gồm cả mã/tên dự án liên kết. Nhấn Enter để áp dụng lọc."
                    searchValue={filters.search}
                    onSearch={handleContractSearch}
                    onSubmitFilters={applyFilters}
                >
                    <div className={FILTER_GRID_RESPONSIVE}>
                        <FilterField label="Trạng thái">
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
                        <FilterField label="Nhân sự phụ trách">
                            <TagMultiSelect
                                options={collectorFilterOptions}
                                selectedIds={filters.staff_ids}
                                onChange={(selectedIds) => setFilters((s) => ({ ...s, staff_ids: selectedIds }))}
                                addPlaceholder="Tìm và thêm nhân sự"
                                emptyLabel="Để trống để xem toàn bộ nhân sự trong phạm vi."
                            />
                        </FilterField>
                        <FilterActionGroup className={FILTER_GRID_SUBMIT_ROW}>
                            <button type="submit" className={FILTER_SUBMIT_BUTTON_CLASS}>Lọc</button>
                        </FilterActionGroup>
                    </div>
                </FilterToolbar>
                <div className="mb-4 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                    {isEmployee
                        ? 'Nhân viên có thể tạo hợp đồng mới trong phạm vi khách hàng phụ trách, nhưng không có quyền duyệt và không được sửa/xóa hợp đồng đã tạo.'
                        : userRole === 'quan_ly'
                            ? 'Trưởng phòng được sửa/xóa hợp đồng trong phạm vi phòng ban, đồng thời có thể gắn nhân viên thu và nhóm chăm sóc theo tag.'
                            : canApprove
                                ? 'Admin và Kế toán có thể theo dõi toàn bộ hợp đồng, duyệt nhanh, gắn nhóm chăm sóc và quản lý công nợ trên cùng một màn.'
                                : 'Theo dõi hợp đồng theo phạm vi khách hàng bạn đang quản lý.'}
                </div>
                {canBulkActions && selectedContractIds.length > 0 && (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3">
                        <div className="text-sm font-medium text-cyan-900">
                            Đã chọn {selectedContractIds.length} hợp đồng.
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
                        data-sort-by={filters.sort_by || 'signed_at'}
                        data-sort-dir={filters.sort_dir || 'desc'}
                        className="table-spacious min-w-full text-sm"
                    >
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-wider text-text-subtle border-b border-slate-200">
                                    {canBulkActions && (
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
                                    <th className="py-2" data-az-ignore>Dự án liên kết</th>
                                    <th className="py-2" data-sort-key="client_phone">SĐT khách hàng</th>
                                    <th className="py-2" data-sort-key="signed_at">Ngày ký</th>
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
                                        {canBulkActions && (
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
                                        <td className="py-6 text-center text-sm text-text-muted" colSpan={canBulkActions ? 17 : 16}>
                                            Chưa có hợp đồng nào.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {!loading && (contractMeta.total || 0) > 0 ? (
                                <tfoot>
                                    <tr className="border-t-2 border-slate-200 bg-slate-50/90 text-left text-sm text-slate-800">
                                        <td
                                            colSpan={canBulkActions ? 9 : 8}
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
                    perPage={filters.per_page}
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
                                    className="bg-white"
                                    value={form.client_id}
                                    onChange={(id) => setForm((s) => ({ ...s, client_id: id }))}
                                    placeholder="Chọn khách hàng do bạn đang quản lý"
                                    clientPreview={contractClientPreview}
                                />
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
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h4 className="text-sm font-semibold text-slate-900">VAT</h4>
                                <p className="mt-1 text-xs text-text-muted">Tự cộng VAT vào tổng giá trị hợp đồng.</p>
                            </div>
                            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={Boolean(form.vat_enabled)}
                                    onChange={(e) => setForm((s) => ({
                                        ...s,
                                        vat_enabled: e.target.checked,
                                        value: !e.target.checked && !items.length
                                            ? (hasInputValue(s.subtotal_value) ? s.subtotal_value : s.value)
                                            : s.value,
                                        subtotal_value: e.target.checked && !items.length && !hasInputValue(s.subtotal_value)
                                            ? s.value
                                            : s.subtotal_value,
                                    }))}
                                />
                                Áp dụng VAT
                            </label>
                        </div>
                        {form.vat_enabled && (
                            <div className="mt-4 grid gap-4 md:grid-cols-4">
                                {!items.length && (
                                    <LabeledField label="Giá trị trước VAT (VNĐ)" className="md:col-span-2">
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="0"
                                            value={form.subtotal_value}
                                            onChange={(e) => setForm((s) => ({ ...s, subtotal_value: formatMoneyInput(e.target.value) }))}
                                        />
                                    </LabeledField>
                                )}
                                <LabeledField label="Kiểu VAT">
                                    <select
                                        className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                        value={form.vat_mode}
                                        onChange={(e) => setForm((s) => ({ ...s, vat_mode: normalizeVatMode(e.target.value) }))}
                                    >
                                        <option value="percent">Theo %</option>
                                        <option value="amount">Theo số tiền</option>
                                    </select>
                                </LabeledField>
                                {normalizeVatMode(form.vat_mode) === 'percent' ? (
                                    <LabeledField label="% VAT">
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            placeholder="10"
                                            value={form.vat_rate}
                                            onChange={(e) => setForm((s) => ({ ...s, vat_rate: e.target.value }))}
                                        />
                                    </LabeledField>
                                ) : (
                                    <LabeledField label="Tiền VAT (VNĐ)">
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="0"
                                            value={form.vat_amount}
                                            onChange={(e) => setForm((s) => ({ ...s, vat_amount: formatMoneyInput(e.target.value) }))}
                                        />
                                    </LabeledField>
                                )}
                                <LabeledField label="VAT tạm tính">
                                    <div className="rounded-2xl border border-slate-200/80 bg-white px-3 py-2 text-sm font-semibold text-slate-800">
                                        {formatCurrency(vatComputedAmount)} VNĐ
                                    </div>
                                </LabeledField>
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                        <div className="grid gap-4 md:grid-cols-3">
                            <LabeledField
                                label="Giá trị hợp đồng (VNĐ)"
                                hint={items.length || form.vat_enabled
                                    ? 'Đang được tự tính từ giá trị trước VAT và cấu hình VAT phía trên.'
                                    : ''}
                            >
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="0"
                                    value={items.length || form.vat_enabled ? formatMoneyInput(contractValueTotal) : form.value}
                                    onChange={(e) => setForm((s) => ({ ...s, value: formatMoneyInput(e.target.value) }))}
                                    disabled={items.length > 0 || form.vat_enabled}
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
                            <LabeledField label="Ngày ký">
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    type="date"
                                    value={form.signed_at}
                                    onChange={(e) => setForm((s) => ({ ...s, signed_at: e.target.value }))}
                                />
                            </LabeledField>
                            <LabeledField label="Ngày bắt đầu hiệu lực">
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    type="date"
                                    value={form.start_date}
                                    onChange={(e) => setForm((s) => ({ ...s, start_date: e.target.value }))}
                                />
                            </LabeledField>
                            <LabeledField label="Ngày kết thúc / gia hạn">
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    type="date"
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
                                accept=".xls,.xlsx,.csv"
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
