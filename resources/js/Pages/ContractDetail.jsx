import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import ClientSelect from '@/Components/ClientSelect';
import Modal from '@/Components/Modal';
import AppIcon from '@/Components/AppIcon';
import TagMultiSelect from '@/Components/TagMultiSelect';
import { useToast } from '@/Contexts/ToastContext';
import { formatVietnamDate, toDateInputValue } from '@/lib/vietnamTime';
import { Link } from '@inertiajs/inertia-react';

// Common badges and formatters (copied from Contracts.jsx / ProjectsKanban)
const STATUS_OPTIONS = [
    { value: 'draft', label: 'Bản nháp' },
    { value: 'active', label: 'Đang hiệu lực' },
    { value: 'signed', label: 'Đã ký' },
    { value: 'expired', label: 'Hết hạn' },
    { value: 'cancelled', label: 'Đã hủy' },
];

const DEFAULT_STATUSES = [
    { value: 'moi_tao', label: 'Mới tạo' },
    { value: 'dang_trien_khai', label: 'Đang triển khai' },
    { value: 'cho_duyet', label: 'Chờ duyệt' },
    { value: 'hoan_thanh', label: 'Hoàn thành' },
    { value: 'tam_dung', label: 'Tạm dừng' },
];

const DEFAULT_SERVICES = [
    { value: 'backlinks', label: 'Backlinks' },
    { value: 'viet_content', label: 'Content' },
    { value: 'audit_content', label: 'Audit Content' },
    { value: 'cham_soc_website_tong_the', label: 'Website Care' },
    { value: 'noi_bo', label: 'Dự án Nội bộ' },
    { value: 'khac', label: 'Khác' },
];

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

const formatCurrency = (amount) => {
    return parseNumberInput(amount).toLocaleString('vi-VN');
};

const formatDateDisplay = (dateString) => formatVietnamDate(dateString, '—');

const resolveContractValue = (contract) => {
    if ((contract?.items || []).length > 0) return contract.items_total_value || 0;
    return contract?.value || 0;
};

const calculateItemTotal = (item) => {
    return parseNumberInput(item.unit_price) * parseNumberInput(item.quantity);
};

const statusBadgeClass = (status) => {
    if (status === 'draft') return 'bg-slate-100 text-slate-700 border border-slate-200';
    if (status === 'active') return 'bg-sky-50 text-sky-700 border border-sky-200';
    if (status === 'signed') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    if (status === 'expired') return 'bg-amber-50 text-amber-700 border border-amber-200';
    if (status === 'cancelled') return 'bg-rose-50 text-rose-700 border border-rose-200';
    return 'bg-slate-100 text-slate-700 border border-slate-200';
};

const approvalBadgeClass = (status) => {
    if (status === 'approved') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    if (status === 'rejected') return 'bg-rose-50 text-rose-700 border border-rose-200';
    return 'bg-amber-50 text-amber-700 border border-amber-200';
};

const approvalLabel = (status) => {
    if (status === 'approved') return 'Đã duyệt';
    if (status === 'rejected') return 'Từ chối';
    return 'Chờ duyệt';
};

const handoverReceiveBadgeClass = (status) => {
    if (status === 'da_nhan_ban_giao') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    return 'bg-amber-50 text-amber-700 border border-amber-200';
};

const handoverReceiveLabel = (status) => {
    if (status === 'da_nhan_ban_giao') return 'Đã nhận bàn giao';
    return 'Chưa nhận bàn giao';
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

/** API trả payments_display (ghi nhận + phiếu chờ); fallback payments cũ */
function normalizePaymentDisplayRows(contract) {
    const raw = contract?.payments_display || contract?.payments || [];
    if (!Array.isArray(raw) || raw.length === 0) return [];
    if (raw[0]?.row_type) return raw;
    return raw.map((p) => ({ ...p, row_type: 'record' }));
}

function normalizeCostDisplayRows(contract) {
    const raw = contract?.costs_display || contract?.costs || [];
    if (!Array.isArray(raw) || raw.length === 0) return [];
    if (raw[0]?.row_type) return raw;
    return raw.map((c) => ({ ...c, row_type: 'record' }));
}

function AutoCodeBadge({ code, className = '' }) {
    if (!code) return <span className={`text-text-muted ${className}`}>Chưa có</span>;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ${className}`}>
            <AppIcon name="hash" className="h-3 w-3 text-slate-400" />
            {code}
        </span>
    );
}

function DetailMetric({ label, value, tone = 'slate' }) {
    const tones = {
        slate: 'bg-white border-slate-200/80',
        sky: 'bg-gradient-to-br from-sky-50 to-white border-sky-100',
        emerald: 'bg-gradient-to-br from-emerald-50 to-white border-emerald-100',
        amber: 'bg-gradient-to-br from-amber-50 to-white border-amber-100',
        rose: 'bg-gradient-to-br from-rose-50 to-white border-rose-100',
    };
    const textTones = {
        slate: 'text-slate-900',
        sky: 'text-sky-900',
        emerald: 'text-emerald-900',
        amber: 'text-amber-900',
        rose: 'text-rose-900',
    };
    return (
        <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}>
            <div className="text-xs uppercase tracking-[0.12em] text-text-subtle">{label}</div>
            <div className={`mt-1 text-lg font-bold ${textTones[tone]}`}>{value}</div>
        </div>
    );
}

function LabeledField({ label, required = false, hint = '', className = '', children }) {
    return (
        <div className={className}>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
                {label}{required ? ' *' : ''}
            </label>
            {children}
            {hint ? <p className="mt-1 text-xs text-text-muted">{hint}</p> : null}
        </div>
    );
}

export default function ContractDetail(props) {
    const { contractId, auth } = props;
    const toast = useToast();

    const userRole = auth?.user?.role || '';
    const currentUserId = auth?.user?.id;

    const [loading, setLoading] = useState(true);
    const [contract, setContract] = useState(null);
    const [careNoteForm, setCareNoteForm] = useState({ title: '', detail: '' });
    const [savingCareNote, setSavingCareNote] = useState(false);

    // Project creation state
    const [projectOwners, setProjectOwners] = useState([]);
    const [meta, setMeta] = useState({});
    const [showProjectForm, setShowProjectForm] = useState(false);
    const [showEditContractModal, setShowEditContractModal] = useState(false);
    const [savingContract, setSavingContract] = useState(false);
    const [productsLookup, setProductsLookup] = useState([]);
    const [collectorsLookup, setCollectorsLookup] = useState([]);
    const [careStaffUsers, setCareStaffUsers] = useState([]);
    const [editItems, setEditItems] = useState([]);
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
    const [reviewingRequestId, setReviewingRequestId] = useState(null);
    const [editForm, setEditForm] = useState({
        title: '',
        client_id: '',
        status: 'draft',
        collector_user_id: '',
        care_staff_ids: [],
        value: '',
        payment_times: '1',
        signed_at: '',
        start_date: '',
        end_date: '',
        notes: '',
    });
    const [workflowTopics, setWorkflowTopics] = useState([]);
    const [projectForm, setProjectForm] = useState({
        name: '',
        service_type: DEFAULT_SERVICES[0].value,
        service_type_other: '',
        start_date: '',
        deadline: '',
        status: DEFAULT_STATUSES[0].value,
        customer_requirement: '',
        owner_id: '',
        repo_url: '',
        website_url: '',
        workflow_topic_id: '',
        budget: '',
    });

    const statusOptions = useMemo(() => {
        const values = meta.project_statuses || [];
        if (!values.length) return DEFAULT_STATUSES;
        return values.map((value) => ({ value, label: value })); // simplified since we don't have LABELS map here
    }, [meta]);

    const serviceOptions = useMemo(() => {
        const values = meta.service_types || [];
        if (!values.length) return DEFAULT_SERVICES;
        return values.map((value) => ({ value, label: value }));
    }, [meta]);

    const ownerOptions = useMemo(
        () => projectOwners.filter((owner) => !['admin', 'administrator', 'ke_toan'].includes(String(owner?.role || '').toLowerCase())),
        [projectOwners]
    );
    const collectorOptions = useMemo(
        () => collectorsLookup.filter((owner) => !['admin', 'administrator', 'ke_toan'].includes(String(owner?.role || '').toLowerCase())),
        [collectorsLookup]
    );
    const careStaffOptions = useMemo(() => {
        return (careStaffUsers || [])
            .map((user) => ({
                id: Number(user.id || 0),
                label: user.name || 'Nhân sự',
                meta: user.email || user.role || '',
            }))
            .filter((user) => user.id > 0);
    }, [careStaffUsers]);
    const normalizeCareStaffIds = (values) => {
        return Array.from(new Set((values || [])
            .map((value) => Number(typeof value === 'object' && value !== null ? value.id : value))
            .filter((value) => Number.isInteger(value) && value > 0)));
    };
    const editItemsTotal = useMemo(() => {
        return editItems.reduce((sum, item) => sum + calculateItemTotal(item), 0);
    }, [editItems]);
    const paymentRowsNormalized = useMemo(() => normalizePaymentDisplayRows(contract), [contract]);
    const paymentBaseTotal = useMemo(() => {
        return paymentRowsNormalized.reduce((sum, row) => {
            if (row.row_type === 'pending_request') {
                return sum + parseNumberInput(row.amount);
            }
            if (editingPaymentId && Number(row.id) === Number(editingPaymentId)) {
                return sum;
            }
            return sum + parseNumberInput(row.amount);
        }, 0);
    }, [paymentRowsNormalized, editingPaymentId]);
    const contractValueTotal = useMemo(() => {
        if (showEditContractModal && editItems.length > 0) {
            return editItemsTotal;
        }
        return parseNumberInput(resolveContractValue(contract));
    }, [contract, editItems.length, editItemsTotal, showEditContractModal]);
    const paymentRemaining = useMemo(
        () => Math.max(0, contractValueTotal - paymentBaseTotal),
        [contractValueTotal, paymentBaseTotal]
    );
    const paymentProjectedTotal = useMemo(
        () => paymentBaseTotal + parseNumberInput(paymentForm.amount),
        [paymentBaseTotal, paymentForm.amount]
    );

    const hydrateEditForm = (data) => {
        if (!data) return;
        setEditForm({
            title: data.title || '',
            client_id: data.client_id ? String(data.client_id) : '',
            status: data.status || 'draft',
            collector_user_id: data.collector_user_id ? String(data.collector_user_id) : '',
            care_staff_ids: normalizeCareStaffIds(data.care_staff_users || []),
            value: String(parseNumberInput(data.value || resolveContractValue(data) || 0)),
            payment_times: String(data.payment_times || 1),
            signed_at: toDateInputValue(data.signed_at),
            start_date: toDateInputValue(data.start_date),
            end_date: toDateInputValue(data.end_date),
            notes: data.notes || '',
        });
        setEditItems(
            (data.items || []).map((item) => ({
                product_id: item.product_id ? String(item.product_id) : '',
                product_name: item.product_name || '',
                unit: item.unit || '',
                unit_price: item.unit_price ?? '',
                quantity: item.quantity ?? 1,
                note: item.note || '',
            }))
        );
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/v1/contracts/${contractId}`);
            const detail = res.data || null;
            setContract(detail);

            if (detail) {
                setProjectForm((s) => ({
                    ...s,
                    name: detail.title || '',
                    start_date: toDateInputValue(detail.start_date),
                    deadline: toDateInputValue(detail.end_date),
                    budget: String(parseNumberInput(resolveContractValue(detail)) || ''),
                }));
            }
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được chi tiết hợp đồng.');
        } finally {
            setLoading(false);
        }
    };

    const fetchMetaAndOwners = async () => {
        try {
            const [metaRes, ownerRes, collectorRes, careStaffRes, productRes, workflowRes] = await Promise.all([
                axios.get('/api/v1/meta').catch(() => ({ data: {} })),
                axios.get('/api/v1/users/lookup', { params: { purpose: 'project_owner' } }).catch(() => ({ data: { data: [] } })),
                axios.get('/api/v1/users/lookup', { params: { purpose: 'contract_collector' } }).catch(() => ({ data: { data: [] } })),
                axios.get('/api/v1/users/lookup', { params: { purpose: 'contract_care_staff' } }).catch(() => ({ data: { data: [] } })),
                axios.get('/api/v1/products', { params: { per_page: 500 } }).catch(() => ({ data: { data: [] } })),
                axios.get('/api/v1/workflow-topics', { params: { per_page: 200, is_active: true } }).catch(() => ({ data: { data: [] } })),
            ]);
            setMeta(metaRes.data || {});
            setWorkflowTopics(workflowRes.data?.data || []);
            setProjectOwners(ownerRes.data?.data || []);
            setCollectorsLookup(collectorRes.data?.data || []);
            setCareStaffUsers(careStaffRes.data?.data || []);
            setProductsLookup(productRes.data?.data || []);
        } catch {
            // ignore
        }
    };

    useEffect(() => {
        loadData();
        fetchMetaAndOwners();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contractId]);

    const submitCareNote = async () => {
        if (!careNoteForm.title?.trim() || !careNoteForm.detail?.trim()) {
            toast.error('Vui lòng nhập cả tiêu đề và nội dung chăm sóc.');
            return;
        }
        setSavingCareNote(true);
        try {
            await axios.post(`/api/v1/contracts/${contractId}/care-notes`, careNoteForm);
            toast.success('Đã cập nhật nhật ký chăm sóc.');
            setCareNoteForm({ title: '', detail: '' });
            await loadData();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lỗi cập nhật nhật ký.');
        } finally {
            setSavingCareNote(false);
        }
    };

    const saveProject = async () => {
        if (!projectForm.name?.trim()) {
            toast.error('Vui lòng nhập Tên dự án.');
            return;
        }
        try {
            const rawBudget = projectForm.budget !== '' && projectForm.budget != null
                ? parseNumberInput(projectForm.budget)
                : 0;
            const budgetNum = rawBudget > 0 ? rawBudget : resolveContractValue(contract);

            const payload = {
                contract_id: contract.id,
                client_id: contract.client_id,
                name: projectForm.name.trim(),
                service_type: projectForm.service_type,
                service_type_other: projectForm.service_type === 'khac' ? (projectForm.service_type_other || '').trim() || null : null,
                workflow_topic_id: projectForm.workflow_topic_id ? Number(projectForm.workflow_topic_id) : null,
                start_date: projectForm.start_date || null,
                deadline: projectForm.deadline || null,
                budget: budgetNum,
                status: projectForm.status || null,
                customer_requirement: projectForm.customer_requirement || null,
                owner_id: projectForm.owner_id ? Number(projectForm.owner_id) : null,
                repo_url: projectForm.repo_url || null,
                website_url: projectForm.website_url || null,
            };

            const res = await axios.post('/api/v1/projects/from-contract', payload).catch(async (e) => {
                return await axios.post('/api/v1/projects', payload);
            });

            toast.success('Đã tạo dự án thành công.');
            setShowProjectForm(false);
            window.location.href = `/du-an/${res.data?.id || res.data?.data?.id}`;
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lỗi tạo dự án.');
        }
    };

    const openEditContractModal = () => {
        hydrateEditForm(contract);
        setShowEditContractModal(true);
    };

    const submitContractUpdate = async (event) => {
        event.preventDefault();
        if (!contract?.id) return;
        if (!(editForm.title || '').trim()) {
            toast.error('Vui lòng nhập tên hợp đồng.');
            return;
        }
        if (!editForm.client_id) {
            toast.error('Vui lòng chọn khách hàng.');
            return;
        }
        if (!editForm.status) {
            toast.error('Vui lòng chọn trạng thái hợp đồng.');
            return;
        }

        setSavingContract(true);
        try {
            const payload = {
                title: (editForm.title || '').trim(),
                client_id: Number(editForm.client_id),
                status: editForm.status,
                collector_user_id: editForm.collector_user_id ? Number(editForm.collector_user_id) : null,
                care_staff_ids: normalizeCareStaffIds(editForm.care_staff_ids || []),
                value: editItems.length ? editItemsTotal : parseNumberInput(editForm.value),
                payment_times: Math.max(1, Number(editForm.payment_times || 1)),
                signed_at: editForm.signed_at || null,
                start_date: editForm.start_date || null,
                end_date: editForm.end_date || null,
                notes: (editForm.notes || '').trim() || null,
                items: editItems.map((item) => ({
                    product_id: item.product_id ? Number(item.product_id) : null,
                    product_name: item.product_name || null,
                    unit: item.unit || null,
                    unit_price: parseNumberInput(item.unit_price),
                    quantity: item.quantity === '' ? 1 : Math.max(1, parseNumberInput(item.quantity)),
                    note: item.note || null,
                })),
            };
            await axios.put(`/api/v1/contracts/${contract.id}`, payload);
            toast.success('Đã cập nhật hợp đồng.');
            setShowEditContractModal(false);
            await loadData();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không thể cập nhật hợp đồng.');
        } finally {
            setSavingContract(false);
        }
    };

    const addEditItem = () => {
        setEditItems((prev) => ([
            ...prev,
            { product_id: '', product_name: '', unit: '', unit_price: '', quantity: 1, note: '' },
        ]));
    };

    const updateEditItem = (index, changes) => {
        setEditItems((prev) => prev.map((item, idx) => {
            if (idx !== index) return item;
            return { ...item, ...changes };
        }));
    };

    const removeEditItem = (index) => {
        setEditItems((prev) => prev.filter((_, idx) => idx !== index));
    };

    const openPaymentCreate = () => {
        setEditingPaymentId(null);
        setPaymentForm({ amount: '', paid_at: '', method: '', note: '' });
        setShowPaymentForm(true);
    };

    const editPayment = (payment) => {
        setEditingPaymentId(payment.id);
        setPaymentForm({
            amount: payment.amount ?? '',
            paid_at: toDateInputValue(payment.paid_at),
            method: payment.method || '',
            note: payment.note || '',
        });
        setShowPaymentForm(true);
    };

    const submitPayment = async (e) => {
        e.preventDefault();
        if (!contract?.id) return;
        if (paymentProjectedTotal > contractValueTotal + 0.0001) {
            toast.error(`Số tiền thanh toán vượt giá trị hợp đồng. Chỉ còn tối đa ${formatCurrency(paymentRemaining)} VNĐ.`);
            return;
        }

        try {
            const payload = {
                amount: parseNumberInput(paymentForm.amount),
                paid_at: paymentForm.paid_at || null,
                method: paymentForm.method || null,
                note: paymentForm.note || null,
            };

            const response = editingPaymentId
                ? await axios.put(`/api/v1/contracts/${contract.id}/payments/${editingPaymentId}`, payload)
                : await axios.post(`/api/v1/contracts/${contract.id}/payments`, payload);

            const requiresApproval = response?.data?.requires_approval === true;
            toast.success(
                response?.data?.message
                || (editingPaymentId
                    ? 'Đã cập nhật thanh toán.'
                    : requiresApproval
                        ? 'Đã gửi phiếu duyệt thanh toán.'
                        : 'Đã thêm thanh toán.')
            );

            setShowPaymentForm(false);
            setEditingPaymentId(null);
            await loadData();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Lưu thanh toán thất bại.');
        }
    };

    const removePayment = async (id) => {
        if (!contract?.id) return;
        if (!confirm('Xóa thanh toán này?')) return;
        try {
            await axios.delete(`/api/v1/contracts/${contract.id}/payments/${id}`);
            toast.success('Đã xóa thanh toán.');
            await loadData();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Xóa thanh toán thất bại.');
        }
    };

    const openCostCreate = () => {
        setEditingCostId(null);
        setCostForm({ amount: '', cost_date: '', cost_type: '', note: '' });
        setShowCostForm(true);
    };

    const editCost = (cost) => {
        setEditingCostId(cost.id);
        setCostForm({
            amount: cost.amount ?? '',
            cost_date: toDateInputValue(cost.cost_date),
            cost_type: cost.cost_type || '',
            note: cost.note || '',
        });
        setShowCostForm(true);
    };

    const submitCost = async (e) => {
        e.preventDefault();
        if (!contract?.id) return;

        try {
            const payload = {
                amount: parseNumberInput(costForm.amount),
                cost_date: costForm.cost_date || null,
                cost_type: costForm.cost_type || null,
                note: costForm.note || null,
            };

            const response = editingCostId
                ? await axios.put(`/api/v1/contracts/${contract.id}/costs/${editingCostId}`, payload)
                : await axios.post(`/api/v1/contracts/${contract.id}/costs`, payload);

            const requiresApproval = response?.data?.requires_approval === true;
            toast.success(
                response?.data?.message
                || (editingCostId
                    ? 'Đã cập nhật chi phí.'
                    : requiresApproval
                        ? 'Đã gửi phiếu duyệt chi phí.'
                        : 'Đã thêm chi phí.')
            );

            setShowCostForm(false);
            setEditingCostId(null);
            await loadData();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Lưu chi phí thất bại.');
        }
    };

    const removeCost = async (id) => {
        if (!contract?.id) return;
        if (!confirm('Xóa chi phí này?')) return;
        try {
            await axios.delete(`/api/v1/contracts/${contract.id}/costs/${id}`);
            toast.success('Đã xóa chi phí.');
            await loadData();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Xóa chi phí thất bại.');
        }
    };

    const approveFinanceRequest = async (requestId) => {
        if (!contract?.id || !requestId) return;
        if (!confirm('Duyệt ghi nhận thu/chi này?')) return;

        setReviewingRequestId(requestId);
        try {
            const response = await axios.post(`/api/v1/contracts/${contract.id}/finance-requests/${requestId}/approve`, {});
            toast.success(response?.data?.message || 'Đã duyệt phiếu tài chính.');
            await loadData();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không thể duyệt phiếu tài chính.');
        } finally {
            setReviewingRequestId(null);
        }
    };

    const rejectFinanceRequest = async (requestId) => {
        if (!contract?.id || !requestId) return;
        const reason = window.prompt('Lý do từ chối phiếu:');
        if (reason === null) return;
        if (!String(reason).trim()) {
            toast.error('Vui lòng nhập lý do từ chối.');
            return;
        }

        setReviewingRequestId(requestId);
        try {
            const response = await axios.post(`/api/v1/contracts/${contract.id}/finance-requests/${requestId}/reject`, {
                review_note: String(reason).trim(),
            });
            toast.success(response?.data?.message || 'Đã từ chối phiếu tài chính.');
            await loadData();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không thể từ chối phiếu tài chính.');
        } finally {
            setReviewingRequestId(null);
        }
    };

    if (loading) {
        return (
            <PageContainer auth={props.auth} title="Chi tiết Hợp đồng" description="">
                <div className="py-8 text-center text-sm text-text-muted">Đang tải chi tiết hợp đồng...</div>
            </PageContainer>
        );
    }

    if (!contract) {
        return (
            <PageContainer auth={props.auth} title="Lỗi" description="">
                <div className="py-8 text-center text-sm text-text-muted">Không tìm thấy hợp đồng hoặc bạn không có quyền truy cập.</div>
                <div className="text-center">
                    <Link href="/hop-dong" className="text-primary hover:underline">Về danh sách</Link>
                </div>
            </PageContainer>
        );
    }

    const canCreateProject = userRole === 'admin'
        || Number(contract.collector_user_id || 0) === currentUserId
        || Number(contract.created_by || 0) === currentUserId;
    const canManageContract = readBoolean(contract?.can_manage) === true;
    const canManageFinance = readBoolean(contract?.can_manage_finance) === true;
    const canSubmitFinanceRequest = readBoolean(contract?.can_submit_finance_request) === true;
    const canReviewFinanceRequest = readBoolean(contract?.can_review_finance_request) === true;
    const paymentDisplayRows = normalizePaymentDisplayRows(contract);
    const costDisplayRows = normalizeCostDisplayRows(contract);

    return (
        <PageContainer
            auth={props.auth}
            title={contract.title || `Hợp đồng #${contract.id}`}
            description="Xem toàn diện và cập nhật nhật ký chăm sóc Hợp đồng."
            breadcrumbs={[
                { label: 'Hợp đồng', url: '/hop-dong' },
                { label: contract.code || `CTR-${contract.id}` },
            ]}
        >


            <div className="space-y-4 text-sm mt-4">
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <div className="text-xs uppercase tracking-[0.16em] text-text-subtle">Hợp đồng</div>
                            <h3 className="mt-1 text-2xl font-bold text-slate-900">{contract.title}</h3>
                            <p className="mt-1 text-sm text-text-muted">
                                Khách hàng: <span className="font-semibold text-slate-700">{contract.client?.name || '—'}</span>
                                {' • '}
                                Nhân viên thu: <span className="font-semibold text-slate-700">{contract.collector?.name || '—'}</span>
                            </p>
                        </div>
                        <div className="flex flex-col items-end gap-3">
                            <div className="flex flex-wrap gap-2">
                                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${statusBadgeClass(contract.status)}`}>
                                    {STATUS_OPTIONS.find((item) => item.value === contract.status)?.label || contract.status}
                                </span>
                                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${approvalBadgeClass(contract.approval_status)}`}>
                                    {approvalLabel(contract.approval_status)}
                                </span>
                                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${handoverReceiveBadgeClass(contract.handover_receive_status)}`}>
                                    {handoverReceiveLabel(contract.handover_receive_status)}
                                </span>
                            </div>
                            {canManageContract && (
                                <button
                                    onClick={openEditContractModal}
                                    className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/15"
                                >
                                    Sửa hợp đồng
                                </button>
                            )}
                            {canCreateProject && contract.approval_status === 'approved' && !contract.project_id && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setProjectForm((s) => ({
                                            ...s,
                                            name: contract.title || '',
                                            start_date: toDateInputValue(contract.start_date),
                                            deadline: toDateInputValue(contract.end_date),
                                            budget: String(parseNumberInput(resolveContractValue(contract)) || ''),
                                            workflow_topic_id: '',
                                        }));
                                        setShowProjectForm(true);
                                    }}
                                    className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary/90"
                                >
                                    + Tạo Dự Án Triển Khai
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <DetailMetric label="Giá trị hợp đồng" value={`${formatCurrency(resolveContractValue(contract))} VNĐ`} tone="sky" />
                    <DetailMetric label="Đã thu" value={`${formatCurrency(contract.payments_total || 0)} VNĐ`} tone="emerald" />
                    <DetailMetric label="Còn phải thu" value={`${formatCurrency(contract.debt_outstanding || 0)} VNĐ`} tone="amber" />
                    <DetailMetric label="Chi phí đã tính" value={`${formatCurrency(contract.costs_total || 0)} VNĐ`} />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                        <h4 className="text-sm font-semibold text-slate-900">Chi tiết thực thi</h4>
                        <div className="mt-4 space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                <span className="text-text-muted">Mã hợp đồng</span>
                                <AutoCodeBadge code={contract.code || `CTR-${contract.id}`} />
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                <span className="text-text-muted">Dự án liên kết</span>
                                {contract.project?.id ? (
                                    <Link href={`/du-an/${contract.project.id}`} className="font-semibold text-primary hover:underline">
                                        {contract.project.name || `Dự án #${contract.project.id}`}
                                    </Link>
                                ) : (
                                    <span className="text-text-muted text-xs">Chưa tạo dự án</span>
                                )}
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                <span className="text-text-muted">Ngày ký</span>
                                <span className="font-semibold text-slate-900">{formatDateDisplay(contract.signed_at)}</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                <span className="text-text-muted">Ngày bắt đầu</span>
                                <span className="font-semibold text-slate-900">{formatDateDisplay(contract.start_date)}</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                <span className="text-text-muted">Ngày kết thúc</span>
                                <span className="font-semibold text-slate-900">{formatDateDisplay(contract.end_date)}</span>
                            </div>
                            <div className="flex items-center justify-between pb-2">
                                <span className="text-text-muted">Nhận bàn giao dự án</span>
                                <span className="font-semibold text-slate-900">{handoverReceiveLabel(contract.handover_receive_status)}</span>
                            </div>
                            <div className="pt-2 rounded-xl bg-slate-50 p-3 mt-2">
                                <div className="text-text-muted mb-2 text-xs font-medium">Nhóm chăm sóc hợp đồng:</div>
                                <div className="flex flex-wrap gap-2">
                                    {(contract.care_staff_users || []).map((staff) => (
                                        <span key={staff.id} className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
                                            {staff.name}
                                        </span>
                                    ))}
                                    {(contract.care_staff_users || []).length === 0 && (
                                        <span className="text-xs text-text-muted">Chưa gắn nhân viên chăm sóc riêng cho hợp đồng này.</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                        <h4 className="text-sm font-semibold text-slate-900">Dữ liệu phê duyệt</h4>
                        <div className="mt-4 space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                <span className="text-text-muted">Người tạo</span>
                                <span className="font-semibold text-slate-900">{contract.creator?.name || '—'}</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                <span className="text-text-muted">Người duyệt</span>
                                <span className="font-semibold text-slate-900">{contract.approver?.name || '—'}</span>
                            </div>
                            <div className="flex items-center justify-between pb-2">
                                <span className="text-text-muted">Ngày duyệt</span>
                                <span className="font-semibold text-slate-900">{formatDateDisplay(contract.approved_at)}</span>
                            </div>
                            <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 mt-2">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                                    Ghi chú hợp đồng
                                </div>
                                <div className="mt-1 text-slate-700 text-xs">
                                    {contract.notes || 'Chưa có ghi chú hợp đồng.'}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                                    Ghi chú duyệt
                                </div>
                                <div className="mt-1 text-slate-700 text-xs">
                                    {contract.approval_note || 'Chưa có ghi chú duyệt.'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between mb-4">
                        <div>
                            <h4 className="text-sm font-semibold text-slate-900">Sản phẩm trong hợp đồng</h4>
                        </div>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                        <table className="min-w-full text-xs">
                            <thead className="bg-slate-50">
                                <tr className="border-b border-slate-200 text-left uppercase tracking-[0.12em] text-slate-500 font-semibold">
                                    <th className="px-4 py-3">Sản phẩm</th>
                                    <th className="px-4 py-3">Đơn vị</th>
                                    <th className="px-4 py-3">Đơn giá</th>
                                    <th className="px-4 py-3">Số lượng</th>
                                    <th className="px-4 py-3">Thành tiền</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {(contract.items || []).map((item) => (
                                    <tr key={item.id || `${item.product_name}-${item.quantity}`}>
                                        <td className="px-4 py-3 font-medium text-slate-900">{item.product_name || '—'}</td>
                                        <td className="px-4 py-3">{item.unit || '—'}</td>
                                        <td className="px-4 py-3">{formatCurrency(item.unit_price || 0)}</td>
                                        <td className="px-4 py-3">{item.quantity || 0}</td>
                                        <td className="px-4 py-3 font-semibold text-slate-700">{formatCurrency(item.total_price || calculateItemTotal(item))} VNĐ</td>
                                    </tr>
                                ))}
                                {(contract.items || []).length === 0 && (
                                    <tr>
                                        <td className="px-4 py-6 text-center text-text-muted" colSpan={5}>Chưa có sản phẩm nào.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h4 className="text-sm font-semibold text-slate-900">Lịch sử thu tiền</h4>
                            {canSubmitFinanceRequest && (
                                <button
                                    type="button"
                                    className="text-xs font-semibold text-primary"
                                    onClick={openPaymentCreate}
                                >
                                    + Thêm thanh toán
                                </button>
                            )}
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                            <table className="min-w-full text-xs">
                                <thead className="bg-slate-50">
                                    <tr className="border-b border-slate-200 text-left uppercase tracking-[0.12em] text-slate-500 font-semibold">
                                        <th className="px-4 py-3">Ngày thu</th>
                                        <th className="px-4 py-3">Số tiền</th>
                                        <th className="px-4 py-3">Phương thức</th>
                                        <th className="px-4 py-3">Ghi chú</th>
                                        <th className="px-4 py-3 text-right">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {paymentDisplayRows.map((row) => (
                                        <tr key={row.id}>
                                            <td className="px-4 py-3">{formatDateDisplay(row.paid_at)}</td>
                                            <td className="px-4 py-3 font-semibold text-emerald-700">{formatCurrency(row.amount || 0)}</td>
                                            <td className="px-4 py-3">{row.method || '—'}</td>
                                            <td className="px-4 py-3">{row.note || '—'}</td>
                                            <td className="px-4 py-3 text-right">
                                                {row.row_type === 'pending_request' ? (
                                                    <div className="inline-flex flex-wrap items-center justify-end gap-2">
                                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                                            Cần duyệt
                                                        </span>
                                                        {row.submitter?.name ? (
                                                            <span className="max-w-[120px] truncate text-[11px] text-text-muted" title={row.submitter.name}>
                                                                {row.submitter.name}
                                                            </span>
                                                        ) : null}
                                                        {canReviewFinanceRequest ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                                                    onClick={() => approveFinanceRequest(row.finance_request_id)}
                                                                    disabled={reviewingRequestId === row.finance_request_id}
                                                                >
                                                                    Duyệt
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                                                    onClick={() => rejectFinanceRequest(row.finance_request_id)}
                                                                    disabled={reviewingRequestId === row.finance_request_id}
                                                                >
                                                                    Từ chối
                                                                </button>
                                                            </>
                                                        ) : null}
                                                    </div>
                                                ) : canManageFinance ? (
                                                    <div className="inline-flex items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                                            title="Sửa thanh toán"
                                                            onClick={() => editPayment(row)}
                                                        >
                                                            <AppIcon name="pencil" className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                                                            title="Xóa thanh toán"
                                                            onClick={() => removePayment(row.id)}
                                                        >
                                                            <AppIcon name="trash" className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-text-muted">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {paymentDisplayRows.length === 0 && (
                                        <tr>
                                            <td className="px-4 py-4 text-center text-text-muted" colSpan={5}>Chưa có đợt thu nào.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h4 className="text-sm font-semibold text-slate-900">Chi phí hợp đồng</h4>
                            {canSubmitFinanceRequest && (
                                <button
                                    type="button"
                                    className="text-xs font-semibold text-primary"
                                    onClick={openCostCreate}
                                >
                                    + Thêm chi phí
                                </button>
                            )}
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                            <table className="min-w-full text-xs">
                                <thead className="bg-slate-50">
                                    <tr className="border-b border-slate-200 text-left uppercase tracking-[0.12em] text-slate-500 font-semibold">
                                        <th className="px-4 py-3">Ngày chi</th>
                                        <th className="px-4 py-3">Loại chi phí</th>
                                        <th className="px-4 py-3">Số tiền</th>
                                        <th className="px-4 py-3">Ghi chú</th>
                                        <th className="px-4 py-3 text-right">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {costDisplayRows.map((row) => (
                                        <tr key={row.id}>
                                            <td className="px-4 py-3">{formatDateDisplay(row.cost_date)}</td>
                                            <td className="px-4 py-3">{row.cost_type || '—'}</td>
                                            <td className="px-4 py-3 font-semibold text-rose-600">{formatCurrency(row.amount || 0)}</td>
                                            <td className="px-4 py-3">{row.note || '—'}</td>
                                            <td className="px-4 py-3 text-right">
                                                {row.row_type === 'pending_request' ? (
                                                    <div className="inline-flex flex-wrap items-center justify-end gap-2">
                                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                                            Cần duyệt
                                                        </span>
                                                        {row.submitter?.name ? (
                                                            <span className="max-w-[120px] truncate text-[11px] text-text-muted" title={row.submitter.name}>
                                                                {row.submitter.name}
                                                            </span>
                                                        ) : null}
                                                        {canReviewFinanceRequest ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                                                    onClick={() => approveFinanceRequest(row.finance_request_id)}
                                                                    disabled={reviewingRequestId === row.finance_request_id}
                                                                >
                                                                    Duyệt
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                                                    onClick={() => rejectFinanceRequest(row.finance_request_id)}
                                                                    disabled={reviewingRequestId === row.finance_request_id}
                                                                >
                                                                    Từ chối
                                                                </button>
                                                            </>
                                                        ) : null}
                                                    </div>
                                                ) : canManageFinance ? (
                                                    <div className="inline-flex items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                                            title="Sửa chi phí"
                                                            onClick={() => editCost(row)}
                                                        >
                                                            <AppIcon name="pencil" className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                                                            title="Xóa chi phí"
                                                            onClick={() => removeCost(row.id)}
                                                        >
                                                            <AppIcon name="trash" className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-text-muted">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {costDisplayRows.length === 0 && (
                                        <tr>
                                            <td className="px-4 py-4 text-center text-text-muted" colSpan={5}>Chưa ghi nhận chi phí nào.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between mb-4">
                        <div>
                            <h4 className="text-sm font-semibold text-slate-900">Nhật ký chăm sóc</h4>
                            <p className="text-xs text-text-muted mt-1">Ghi chú lại quá trình tư vấn, xử lý tình huống với khách hàng.</p>
                        </div>
                    </div>

                    {readBoolean(contract.can_add_care_note) && (
                        <div className="rounded-xl border border-cyan-200/80 bg-cyan-50/30 p-4 mb-5">
                            <div className="grid gap-3 md:grid-cols-2">
                                <input
                                    className="w-full rounded-xl border border-cyan-200 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 bg-white px-3 py-2 outline-none transition"
                                    placeholder="Hoạt động chăm sóc (VD: Họp định kỳ tháng 10)"
                                    value={careNoteForm.title}
                                    onChange={(e) => setCareNoteForm((current) => ({ ...current, title: e.target.value }))}
                                />
                                <div className="flex items-center justify-end">
                                    <button
                                        type="button"
                                        className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-60"
                                        onClick={submitCareNote}
                                        disabled={savingCareNote}
                                    >
                                        {savingCareNote ? 'Đang lưu...' : 'Ghi nhận nhật ký'}
                                    </button>
                                </div>
                                <textarea
                                    className="md:col-span-2 w-full rounded-xl border border-cyan-200 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 bg-white px-3 py-2 outline-none transition"
                                    rows={3}
                                    placeholder="Nội dung chi tiết buổi họp, các phản hồi của khách, hoặc đề xuất của team nội bộ..."
                                    value={careNoteForm.detail}
                                    onChange={(e) => setCareNoteForm((current) => ({ ...current, detail: e.target.value }))}
                                />
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        {(contract.care_notes || []).map((note) => (
                            <div key={note.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                                    <div className="font-semibold text-slate-900">{note.title}</div>
                                    <div className="text-[11px] font-medium text-slate-500 bg-white border border-slate-200 rounded-md px-2 py-0.5 shadow-sm">
                                        {note.user?.name || 'Vô danh'} • {formatDateDisplay(note.created_at)}
                                    </div>
                                </div>
                                <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">{note.detail}</div>
                            </div>
                        ))}
                        {(contract.care_notes || []).length === 0 && (
                            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                                Chưa có nhật ký chăm sóc nào được ghi nhận.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Project Creation Form Modal */}
            <Modal
                open={showProjectForm}
                onClose={() => setShowProjectForm(false)}
                title="Khởi tạo Dự án từ Hợp đồng"
                description="Hệ thống sẽ đồng bộ thông tin khách hàng và ngân sách từ Hợp đồng vào dự án này."
                size="lg"
            >
                <div className="space-y-4 text-sm mt-2">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                        Hợp đồng đang liên kết: <strong>{contract.code} {contract.title ? `- ${contract.title}` : ''}</strong>.
                        Ngân sách dự tính sẽ áp dụng: <strong>{formatCurrency(resolveContractValue(contract))} VNĐ</strong>.
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Tên dự án</label>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                            placeholder="Tên dự án hiển thị với đội triển khai"
                            value={projectForm.name}
                            onChange={(e) => setProjectForm((s) => ({ ...s, name: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Loại dịch vụ</label>
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={projectForm.service_type}
                            onChange={(e) => setProjectForm((s) => ({ ...s, service_type: e.target.value }))}
                        >
                            {serviceOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>
                    {projectForm.service_type === 'khac' && (
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Dịch vụ khác</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                placeholder="Tên dịch vụ thật sự (R&D, Booking...)"
                                value={projectForm.service_type_other}
                                onChange={(e) => setProjectForm((s) => ({ ...s, service_type_other: e.target.value }))}
                            />
                        </div>
                    )}
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Barem công việc theo topic</label>
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={projectForm.workflow_topic_id}
                            onChange={(e) => setProjectForm((s) => ({ ...s, workflow_topic_id: e.target.value }))}
                        >
                            <option value="">Không dùng barem (tạo dự án trống)</option>
                            {workflowTopics.map((topic) => (
                                <option key={topic.id} value={String(topic.id)}>
                                    {topic.name}{topic.code ? ` • ${topic.code}` : ''} ({topic.tasks?.length || 0} công việc mẫu)
                                </option>
                            ))}
                        </select>
                        <p className="mt-1 text-xs text-text-muted">
                            Nếu chọn barem, hệ thống tự sinh công việc và đầu việc mẫu theo dự án (giống màn Tạo dự án).
                        </p>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Ngân sách dự án (VNĐ)</label>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            type="number"
                            min="0"
                            step="1"
                            placeholder="Mặc định theo giá trị hợp đồng"
                            value={projectForm.budget}
                            onChange={(e) => setProjectForm((s) => ({ ...s, budget: e.target.value }))}
                        />
                        <p className="mt-1 text-xs text-text-muted">
                            Để trống hoặc 0 để dùng đúng giá trị hợp đồng: {formatCurrency(resolveContractValue(contract))} VNĐ.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Trạng thái</label>
                            <select
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={projectForm.status}
                                onChange={(e) => setProjectForm((s) => ({ ...s, status: e.target.value }))}
                            >
                                {statusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Phụ trách triển khai</label>
                            <select
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={projectForm.owner_id}
                                onChange={(e) => setProjectForm((s) => ({ ...s, owner_id: e.target.value }))}
                            >
                                <option value="">(Chưa có / Chọn sau)</option>
                                {ownerOptions.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.name} ({u.role})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Ngày bắt đầu</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                type="date"
                                value={projectForm.start_date}
                                onChange={(e) => setProjectForm((s) => ({ ...s, start_date: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Hạn chót</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                type="date"
                                value={projectForm.deadline}
                                onChange={(e) => setProjectForm((s) => ({ ...s, deadline: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Tài nguyên, repo dự án</label>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="URL link dự án (tuỳ chọn)"
                            value={projectForm.repo_url}
                            onChange={(e) => setProjectForm((s) => ({ ...s, repo_url: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Website liên quan (GSC)</label>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="VD: https://congty.vn"
                            value={projectForm.website_url}
                            onChange={(e) => setProjectForm((s) => ({ ...s, website_url: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Yêu cầu từ khách / Phạm vi</label>
                        <textarea
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            rows={3}
                            placeholder="Mô tả cụ thể KPIs, yêu cầu tính năng..."
                            value={projectForm.customer_requirement}
                            onChange={(e) => setProjectForm((s) => ({ ...s, customer_requirement: e.target.value }))}
                        />
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                        <button
                            className="flex-1 rounded-2xl bg-primary px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-primary/90"
                            onClick={saveProject}
                            type="button"
                        >
                            Tạo Dự Án
                        </button>
                        <button
                            className="flex-1 rounded-2xl border border-slate-200 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => setShowProjectForm(false)}
                            type="button"
                        >
                            Hủy bỏ
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={showPaymentForm}
                onClose={() => setShowPaymentForm(false)}
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
                            <span>Còn có thể thu</span>
                            <span className={`font-semibold ${paymentRemaining > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{formatCurrency(paymentRemaining)} VNĐ</span>
                        </div>
                        {!canManageFinance && (
                            <p className="mt-2 text-amber-700">
                                Khoản thu sẽ tạo phiếu chờ admin/kế toán duyệt trước khi ghi nhận vào hợp đồng.
                            </p>
                        )}
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
                            type="number"
                            min="0"
                            value={paymentForm.amount}
                            onChange={(e) => setPaymentForm((s) => ({ ...s, amount: e.target.value }))}
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
                        <button type="submit" className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold">
                            {canManageFinance ? 'Lưu' : 'Gửi duyệt'}
                        </button>
                        <button type="button" className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold" onClick={() => setShowPaymentForm(false)}>
                            Hủy
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                open={showCostForm}
                onClose={() => setShowCostForm(false)}
                title={editingCostId ? 'Sửa chi phí' : 'Thêm chi phí'}
                size="md"
            >
                <form className="space-y-3 text-sm" onSubmit={submitCost}>
                    {!canManageFinance && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                            Khoản chi sẽ tạo phiếu chờ admin/kế toán duyệt trước khi ghi nhận vào hợp đồng.
                        </div>
                    )}
                    <LabeledField label="Số tiền chi" required>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Nhập chi phí phát sinh"
                            type="number"
                            min="0"
                            value={costForm.amount}
                            onChange={(e) => setCostForm((s) => ({ ...s, amount: e.target.value }))}
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
                        <button type="submit" className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold">
                            {canManageFinance ? 'Lưu' : 'Gửi duyệt'}
                        </button>
                        <button type="button" className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold" onClick={() => setShowCostForm(false)}>
                            Hủy
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                open={showEditContractModal}
                onClose={() => setShowEditContractModal(false)}
                title={`Sửa hợp đồng #${contract.id}`}
                description="Cập nhật đầy đủ thông tin hợp đồng, nhân sự phụ trách và sản phẩm."
                size="xl"
            >
                <form className="mt-2 space-y-4 text-sm" onSubmit={submitContractUpdate}>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <LabeledField label="Tiêu đề hợp đồng" required className="md:col-span-2">
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    placeholder="Ví dụ: Hợp đồng SEO Tổng Thể Q2"
                                    value={editForm.title}
                                    onChange={(e) => setEditForm((s) => ({ ...s, title: e.target.value }))}
                                />
                            </LabeledField>
                            <LabeledField label="Khách hàng" required className="md:col-span-2">
                                <ClientSelect
                                    className="bg-white"
                                    value={editForm.client_id}
                                    onChange={(id) => setEditForm((s) => ({ ...s, client_id: id }))}
                                    placeholder="Chọn khách hàng do bạn đang quản lý"
                                    clientPreview={contract?.client}
                                />
                            </LabeledField>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <p className="text-xs uppercase tracking-[0.16em] text-text-subtle">Nhân viên thu theo hợp đồng</p>
                                <p className="mt-1 text-xs text-text-muted">
                                    {userRole === 'nhan_vien'
                                        ? 'Nhân viên không thể đổi người thu hợp đồng.'
                                        : userRole === 'quan_ly'
                                            ? 'Trưởng phòng có thể chọn nhân sự trong phòng để đứng tên hợp đồng.'
                                            : ['admin', 'ke_toan'].includes(userRole)
                                                ? 'Admin/Kế toán có thể gán người thu theo nhu cầu nghiệp vụ.'
                                                : 'Chọn nhân sự thu theo hợp đồng.'}
                                </p>
                            </div>
                            <select
                                className="min-w-[260px] rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm"
                                value={editForm.collector_user_id}
                                disabled={!['admin', 'quan_ly', 'ke_toan'].includes(userRole)}
                                onChange={(e) => setEditForm((s) => ({ ...s, collector_user_id: e.target.value }))}
                            >
                                <option value="">Chọn nhân viên thu</option>
                                {!collectorOptions.some((collector) => String(collector.id) === String(editForm.collector_user_id)) && contract?.collector?.id ? (
                                    <option value={contract.collector.id}>
                                        {contract.collector.name || `Nhân sự #${contract.collector.id}`}
                                    </option>
                                ) : null}
                                {collectorOptions.map((collector) => (
                                    <option key={collector.id} value={collector.id}>
                                        {collector.name}{collector.email ? ` • ${collector.email}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4">
                        <div className="mb-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-text-subtle">Nhân viên chăm sóc hợp đồng</p>
                            <p className="mt-1 text-xs text-text-muted">
                                Danh sách này quyết định nhân sự có thể theo dõi nhật ký chăm sóc trong hợp đồng.
                            </p>
                        </div>
                        {careStaffUsers.length > 0 ? (
                            <TagMultiSelect
                                options={careStaffOptions}
                                selectedIds={editForm.care_staff_ids}
                                addPlaceholder="Thêm nhân viên chăm sóc hợp đồng"
                                emptyLabel="Chưa thêm nhân viên chăm sóc hợp đồng nào."
                                onChange={(selectedIds) => {
                                    setEditForm((current) => ({ ...current, care_staff_ids: selectedIds }));
                                }}
                            />
                        ) : (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-3 text-xs text-text-muted">
                                Chưa có nhân viên chăm sóc phù hợp trong phạm vi được phép gán.
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                        <div className="grid gap-4 md:grid-cols-3">
                            <LabeledField
                                label="Giá trị hợp đồng (VNĐ)"
                                hint={editItems.length ? 'Đang được tự tính từ danh sách sản phẩm phía dưới.' : ''}
                            >
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={editItems.length ? editItemsTotal : editForm.value}
                                    onChange={(e) => setEditForm((s) => ({ ...s, value: e.target.value }))}
                                    disabled={editItems.length > 0}
                                />
                            </LabeledField>
                            <LabeledField label="Số lần thanh toán">
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    type="number"
                                    min="1"
                                    placeholder="1"
                                    value={editForm.payment_times}
                                    onChange={(e) => setEditForm((s) => ({ ...s, payment_times: e.target.value }))}
                                />
                            </LabeledField>
                            <LabeledField label="Trạng thái hợp đồng" required>
                                <select
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    value={editForm.status}
                                    onChange={(e) => setEditForm((s) => ({ ...s, status: e.target.value }))}
                                >
                                    {STATUS_OPTIONS.map((status) => (
                                        <option key={status.value} value={status.value}>
                                            {status.label}
                                        </option>
                                    ))}
                                </select>
                            </LabeledField>
                            <LabeledField label="Ngày ký">
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    type="date"
                                    value={editForm.signed_at}
                                    onChange={(e) => setEditForm((s) => ({ ...s, signed_at: e.target.value }))}
                                />
                            </LabeledField>
                            <LabeledField label="Ngày bắt đầu hiệu lực">
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    type="date"
                                    value={editForm.start_date}
                                    onChange={(e) => setEditForm((s) => ({ ...s, start_date: e.target.value }))}
                                />
                            </LabeledField>
                            <LabeledField label="Ngày kết thúc / gia hạn">
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    type="date"
                                    value={editForm.end_date}
                                    onChange={(e) => setEditForm((s) => ({ ...s, end_date: e.target.value }))}
                                />
                            </LabeledField>
                            <LabeledField label="Ghi chú hợp đồng" className="md:col-span-3">
                                <textarea
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    rows={3}
                                    placeholder="Ghi chú thêm về hợp đồng, điều khoản hoặc thông tin nội bộ"
                                    value={editForm.notes}
                                    onChange={(e) => setEditForm((s) => ({ ...s, notes: e.target.value }))}
                                />
                            </LabeledField>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3">
                        <div className="mb-2 flex items-center justify-between">
                            <h4 className="text-sm font-semibold">Sản phẩm trong hợp đồng</h4>
                            <button type="button" className="text-xs text-primary" onClick={addEditItem}>+ Thêm sản phẩm</button>
                        </div>
                        <div className="space-y-2">
                            {editItems.map((item, index) => (
                                <div key={index} className="rounded-xl border border-slate-200/80 bg-white p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-semibold text-slate-600">Sản phẩm #{index + 1}</p>
                                        <button type="button" className="text-xs text-rose-500" onClick={() => removeEditItem(index)}>Xóa</button>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
                                            Sản phẩm
                                        </label>
                                        <select
                                            className="w-full rounded-xl border border-slate-200/80 px-3 py-2 text-xs"
                                            value={item.product_id}
                                            onChange={(e) => {
                                                const selected = productsLookup.find((product) => String(product.id) === e.target.value);
                                                updateEditItem(index, {
                                                    product_id: e.target.value,
                                                    product_name: selected?.name || item.product_name,
                                                    unit: selected?.unit || item.unit,
                                                    unit_price: selected?.unit_price ?? item.unit_price,
                                                });
                                            }}
                                        >
                                            <option value="">Chọn sản phẩm</option>
                                            {!productsLookup.some((product) => String(product.id) === String(item.product_id)) && item.product_id ? (
                                                <option value={item.product_id}>{item.product_name || `Sản phẩm #${item.product_id}`}</option>
                                            ) : null}
                                            {productsLookup.map((product) => (
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
                                                onChange={(e) => updateEditItem(index, { unit: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
                                                Đơn giá
                                            </label>
                                            <input
                                                className="rounded-xl border border-slate-200/80 px-3 py-2 text-xs"
                                                placeholder="Giá bán"
                                                type="number"
                                                min="0"
                                                value={item.unit_price}
                                                onChange={(e) => updateEditItem(index, { unit_price: e.target.value })}
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
                                                min="1"
                                                value={item.quantity}
                                                onChange={(e) => updateEditItem(index, { quantity: e.target.value })}
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
                                            onChange={(e) => updateEditItem(index, { note: e.target.value })}
                                        />
                                    </div>
                                </div>
                            ))}
                            {editItems.length === 0 && (
                                <div className="rounded-xl border border-dashed border-slate-200/80 px-3 py-3 text-xs text-text-muted text-center">
                                    Chưa có sản phẩm. Thêm để tự tính giá trị hợp đồng.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setShowEditContractModal(false)}
                            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={savingContract}
                            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                        >
                            {savingContract ? 'Đang lưu...' : 'Lưu hợp đồng'}
                        </button>
                    </div>
                </form>
            </Modal>
        </PageContainer>
    );
}
