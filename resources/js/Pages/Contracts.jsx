import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import Dropdown from '@/Components/Dropdown';
import AppIcon from '@/Components/AppIcon';
import { useToast } from '@/Contexts/ToastContext';

const STATUS_OPTIONS = [
    { value: 'draft', label: 'Nháp' },
    { value: 'signed', label: 'Đã ký' },
    { value: 'success', label: 'Thành công' },
    { value: 'active', label: 'Đang hiệu lực' },
    { value: 'expired', label: 'Hết hạn' },
    { value: 'cancelled', label: 'Hủy' },
];

const APPROVAL_LABELS = {
    pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Từ chối',
};

const approvalLabel = (value) => APPROVAL_LABELS[value] || APPROVAL_LABELS.pending;
const formatCurrency = (value) => Number(value || 0).toLocaleString('vi-VN');
const formatDateDisplay = (value) => (value ? new Date(value).toLocaleDateString('vi-VN') : '—');
const statusBadgeClass = (value) => ({
    active: 'bg-emerald-100 text-emerald-700',
    signed: 'bg-sky-100 text-sky-700',
    success: 'bg-emerald-100 text-emerald-700',
    expired: 'bg-rose-100 text-rose-700',
    cancelled: 'bg-rose-100 text-rose-700',
    draft: 'bg-slate-100 text-slate-600',
}[value] || 'bg-slate-100 text-slate-600');
const approvalBadgeClass = (value) => ({
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-rose-100 text-rose-700',
    pending: 'bg-amber-100 text-amber-700',
}[value] || 'bg-amber-100 text-amber-700');

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
    const canManage = ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'].includes(userRole);
    const canDelete = userRole === 'admin';
    const canApprove = ['admin', 'ke_toan'].includes(userRole);
    const canFinance = ['admin', 'ke_toan'].includes(userRole);
    const isEmployee = userRole === 'nhan_vien';
    const canChooseCollector = ['admin', 'quan_ly', 'ke_toan'].includes(userRole);
    const defaultCollectorUserId = userRole === 'nhan_vien' || userRole === 'quan_ly'
        ? (currentUserId ? String(currentUserId) : '')
        : '';

    const [contracts, setContracts] = useState([]);
    const [clients, setClients] = useState([]);
    const [projects, setProjects] = useState([]);
    const [products, setProducts] = useState([]);
    const [collectors, setCollectors] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [showDetail, setShowDetail] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailContract, setDetailContract] = useState(null);
    const [filters, setFilters] = useState({ search: '', status: '', client_id: '', approval_status: '' });
    const [form, setForm] = useState({
        code: '',
        title: '',
        client_id: '',
        project_id: '',
        collector_user_id: defaultCollectorUserId,
        value: '',
        payment_times: '1',
        status: 'draft',
        signed_at: '',
        start_date: '',
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

    const contractValueTotal = useMemo(() => (
        items.length ? itemsTotal : Number(form.value || 0)
    ), [form.value, items.length, itemsTotal]);

    const paymentBaseTotal = useMemo(() => {
        return payments.reduce((sum, payment) => {
            if (editingPaymentId && Number(payment.id) === Number(editingPaymentId)) {
                return sum;
            }
            return sum + Number(payment.amount || 0);
        }, 0);
    }, [payments, editingPaymentId]);

    const paymentRemaining = useMemo(
        () => Math.max(0, contractValueTotal - paymentBaseTotal),
        [contractValueTotal, paymentBaseTotal]
    );

    const paymentProjectedTotal = useMemo(
        () => paymentBaseTotal + Number(paymentForm.amount || 0),
        [paymentBaseTotal, paymentForm.amount]
    );

    const fetchClients = async () => {
        try {
            const res = await axios.get('/api/v1/crm/clients', { params: { per_page: 200 } });
            setClients(res.data?.data || []);
        } catch {
            // ignore
        }
    };

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

    const fetchContracts = async (nextFilters = filters) => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/contracts', {
                params: {
                    per_page: 50,
                    with_items: true,
                    ...(nextFilters.search ? { search: nextFilters.search } : {}),
                    ...(nextFilters.status ? { status: nextFilters.status } : {}),
                    ...(nextFilters.client_id ? { client_id: nextFilters.client_id } : {}),
                    ...(nextFilters.approval_status ? { approval_status: nextFilters.approval_status } : {}),
                },
            });
            setContracts(res.data?.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được danh sách hợp đồng.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClients();
        fetchProjects();
        fetchProducts();
        fetchCollectors();
        fetchContracts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stats = useMemo(() => {
        const total = contracts.length;
        const active = contracts.filter((c) => c.status === 'active').length;
        const signed = contracts.filter((c) => c.status === 'signed').length;
        const pendingApproval = contracts.filter((c) => c.approval_status === 'pending').length;
        return [
            { label: 'Tổng hợp đồng', value: String(total) },
            { label: 'Đang hiệu lực', value: String(active) },
            { label: 'Đã ký', value: String(signed) },
            { label: 'Chờ duyệt', value: String(pendingApproval) },
        ];
    }, [contracts]);

    const resetForm = () => {
        setEditingId(null);
        setForm({
            code: '',
            title: '',
            client_id: '',
            project_id: '',
            collector_user_id: defaultCollectorUserId,
            value: '',
            payment_times: '1',
            status: 'draft',
            signed_at: '',
            start_date: '',
            end_date: '',
            notes: '',
        });
        setItems([]);
        setPayments([]);
        setCosts([]);
    };

    const startEdit = async (c) => {
        setEditingId(c.id);
        try {
            const res = await axios.get(`/api/v1/contracts/${c.id}`);
            const detail = res.data || c;
            setForm({
                code: detail.code || '',
                title: detail.title || '',
                client_id: detail.client_id || '',
                project_id: detail.project_id || '',
                collector_user_id: detail.collector_user_id ? String(detail.collector_user_id) : (currentUserId ? String(currentUserId) : ''),
                value: detail.value ?? '',
                payment_times: String(detail.payment_times ?? 1),
                status: detail.status || 'draft',
                signed_at: detail.signed_at ? String(detail.signed_at).slice(0, 10) : '',
                start_date: detail.start_date ? String(detail.start_date).slice(0, 10) : '',
                end_date: detail.end_date ? String(detail.end_date).slice(0, 10) : '',
                notes: detail.notes || '',
            });
            setItems(
                (detail.items || []).map((item) => ({
                    product_id: item.product_id || '',
                    product_name: item.product_name || '',
                    unit: item.unit || '',
                    unit_price: item.unit_price ?? '',
                    quantity: item.quantity ?? 1,
                    note: item.note || '',
                }))
            );
            setPayments(detail.payments || []);
            setCosts(detail.costs || []);
            setShowForm(true);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được chi tiết hợp đồng.');
        }
    };

    const openCreate = () => {
        resetForm();
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        resetForm();
    };

    const openDetail = async (contractId) => {
        setDetailLoading(true);
        setShowDetail(true);
        try {
            const res = await axios.get(`/api/v1/contracts/${contractId}`);
            setDetailContract(res.data || null);
        } catch (e) {
            setDetailContract(null);
            toast.error(e?.response?.data?.message || 'Không tải được chi tiết hợp đồng.');
        } finally {
            setDetailLoading(false);
        }
    };

    const closeDetail = () => {
        setShowDetail(false);
        setDetailContract(null);
        setDetailLoading(false);
    };

    const addItem = () => {
        setItems((prev) => [
            ...prev,
            { product_id: '', product_name: '', unit: '', unit_price: '', quantity: 1, note: '' },
        ]);
    };

    const updateItem = (index, changes) => {
        setItems((prev) =>
            prev.map((item, idx) => {
                if (idx !== index) return item;
                return { ...item, ...changes };
            })
        );
    };

    const removeItem = (index) => {
        setItems((prev) => prev.filter((_, idx) => idx !== index));
    };

    const itemsTotal = useMemo(() => {
        return items.reduce((sum, item) => {
            const price = Number(item.unit_price || 0);
            const qty = Number(item.quantity || 1);
            return sum + price * qty;
        }, 0);
    }, [items]);

    const refreshContractExtras = async () => {
        if (!editingId) return;
        try {
            const res = await axios.get(`/api/v1/contracts/${editingId}`);
            const detail = res.data || {};
            setPayments(detail.payments || []);
            setCosts(detail.costs || []);
        } catch {
            // ignore
        }
    };

    const openPaymentCreate = () => {
        if (!canFinance) {
            toast.error('Chỉ Admin/Kế toán được quản lý thanh toán.');
            return;
        }
        if (!editingId) {
            toast.error('Vui lòng lưu hợp đồng trước khi thêm thanh toán.');
            return;
        }
        setEditingPaymentId(null);
        setPaymentForm({ amount: '', paid_at: '', method: '', note: '' });
        setShowPaymentForm(true);
    };

    const editPayment = (payment) => {
        setEditingPaymentId(payment.id);
        setPaymentForm({
            amount: payment.amount ?? '',
            paid_at: payment.paid_at ? String(payment.paid_at).slice(0, 10) : '',
            method: payment.method || '',
            note: payment.note || '',
        });
        setShowPaymentForm(true);
    };

    const submitPayment = async (e) => {
        e.preventDefault();
        if (!editingId) return;
        if (paymentProjectedTotal > contractValueTotal + 0.0001) {
            toast.error(`Số tiền thanh toán vượt giá trị hợp đồng. Chỉ còn tối đa ${formatCurrency(paymentRemaining)} VNĐ.`);
            return;
        }
        try {
            const payload = {
                amount: Number(paymentForm.amount || 0),
                paid_at: paymentForm.paid_at || null,
                method: paymentForm.method || null,
                note: paymentForm.note || null,
            };
            if (editingPaymentId) {
                await axios.put(`/api/v1/contracts/${editingId}/payments/${editingPaymentId}`, payload);
                toast.success('Đã cập nhật thanh toán.');
            } else {
                await axios.post(`/api/v1/contracts/${editingId}/payments`, payload);
                toast.success('Đã thêm thanh toán.');
            }
            setShowPaymentForm(false);
            setEditingPaymentId(null);
            await refreshContractExtras();
            await fetchContracts(filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu thanh toán thất bại.');
        }
    };

    const removePayment = async (id) => {
        if (!editingId) return;
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
        if (!canFinance) {
            toast.error('Chỉ Admin/Kế toán được quản lý chi phí.');
            return;
        }
        if (!editingId) {
            toast.error('Vui lòng lưu hợp đồng trước khi thêm chi phí.');
            return;
        }
        setEditingCostId(null);
        setCostForm({ amount: '', cost_date: '', cost_type: '', note: '' });
        setShowCostForm(true);
    };

    const editCost = (cost) => {
        setEditingCostId(cost.id);
        setCostForm({
            amount: cost.amount ?? '',
            cost_date: cost.cost_date ? String(cost.cost_date).slice(0, 10) : '',
            cost_type: cost.cost_type || '',
            note: cost.note || '',
        });
        setShowCostForm(true);
    };

    const submitCost = async (e) => {
        e.preventDefault();
        if (!editingId) return;
        try {
            const payload = {
                amount: Number(costForm.amount || 0),
                cost_date: costForm.cost_date || null,
                cost_type: costForm.cost_type || null,
                note: costForm.note || null,
            };
            if (editingCostId) {
                await axios.put(`/api/v1/contracts/${editingId}/costs/${editingCostId}`, payload);
                toast.success('Đã cập nhật chi phí.');
            } else {
                await axios.post(`/api/v1/contracts/${editingId}/costs`, payload);
                toast.success('Đã thêm chi phí.');
            }
            setShowCostForm(false);
            setEditingCostId(null);
            await refreshContractExtras();
            await fetchContracts(filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu chi phí thất bại.');
        }
    };

    const removeCost = async (id) => {
        if (!editingId) return;
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
            const report = res.data || {};
            toast.success(
                `Import hoàn tất: ${report.created || 0} tạo mới, ${report.updated || 0} cập nhật, ${report.skipped || 0} bỏ qua.`
            );
            setShowImport(false);
            setImportFile(null);
            await fetchContracts();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Import thất bại.');
        } finally {
            setImporting(false);
        }
    };

    const save = async (createAndApprove = false) => {
        if (!canManage) return toast.error('Bạn không có quyền quản lý hợp đồng.');
        if (!form.title?.trim() || !form.client_id) {
            return toast.error('Vui lòng chọn khách hàng và nhập tiêu đề hợp đồng.');
        }
        const payload = {
            code: form.code || null,
            title: form.title,
            client_id: Number(form.client_id),
            project_id: form.project_id ? Number(form.project_id) : null,
            collector_user_id: form.collector_user_id ? Number(form.collector_user_id) : null,
            value: items.length ? itemsTotal : form.value === '' ? null : Number(form.value),
            payment_times: form.payment_times === '' ? 1 : Number(form.payment_times),
            status: form.status,
            signed_at: form.signed_at || null,
            start_date: form.start_date || null,
            end_date: form.end_date || null,
            notes: form.notes || null,
            items: items.map((item) => ({
                product_id: item.product_id ? Number(item.product_id) : null,
                product_name: item.product_name || null,
                unit: item.unit || null,
                unit_price: item.unit_price === '' ? 0 : Number(item.unit_price),
                quantity: item.quantity === '' ? 1 : Number(item.quantity),
                note: item.note || null,
            })),
        };
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
            closeForm();
            await fetchContracts();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu hợp đồng thất bại.');
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

    const applyFilters = () => fetchContracts(filters);

    return (
        <PageContainer
            auth={props.auth}
            title="Quản lý hợp đồng"
            description="Theo dõi hợp đồng, duyệt kế toán và quản lý sản phẩm kèm theo."
            stats={stats}
        >
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
                    <h3 className="font-semibold">Danh sách hợp đồng</h3>
                    <div className="flex flex-col gap-2 md:flex-row md:items-center">
                        {canManage && (
                            <button
                                type="button"
                                className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                                onClick={openCreate}
                            >
                                Thêm mới
                            </button>
                        )}
                        {canManage && (
                            <button
                                type="button"
                                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                                onClick={() => setShowImport(true)}
                            >
                                Import Excel
                            </button>
                        )}
                        <input className="rounded-xl border border-slate-200/80 px-3 py-2 text-sm" placeholder="Tìm theo mã/tiêu đề" value={filters.search} onChange={(e) => setFilters((s) => ({ ...s, search: e.target.value }))} />
                        <select className="rounded-xl border border-slate-200/80 px-3 py-2 text-sm" value={filters.status} onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}>
                            <option value="">Tất cả trạng thái</option>
                            {STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <select className="rounded-xl border border-slate-200/80 px-3 py-2 text-sm" value={filters.approval_status} onChange={(e) => setFilters((s) => ({ ...s, approval_status: e.target.value }))}>
                            <option value="">Tất cả duyệt</option>
                            <option value="pending">Chờ duyệt</option>
                            <option value="approved">Đã duyệt</option>
                            <option value="rejected">Từ chối</option>
                        </select>
                        <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" onClick={applyFilters}>Lọc</button>
                    </div>
                </div>
                <div className="mb-4 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                    {isEmployee
                        ? 'Bạn chỉ được tạo hợp đồng cho khách hàng mình phụ trách và hệ thống sẽ tự gắn bạn là nhân viên thu theo hợp đồng.'
                        : userRole === 'quan_ly'
                            ? 'Trưởng phòng được thao tác trong phạm vi phòng ban, đồng thời có thể chọn nhân viên trong phòng làm người thu hợp đồng.'
                            : canApprove
                                ? 'Admin và Kế toán có thể theo dõi toàn bộ hợp đồng, duyệt nhanh và quản lý công nợ trên cùng một màn.'
                                : 'Theo dõi hợp đồng theo phạm vi khách hàng bạn đang quản lý.'}
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-wider text-text-subtle border-b border-slate-200">
                                    <th className="py-2">Hợp đồng</th>
                                    <th className="py-2">Khách hàng</th>
                                    <th className="py-2">Nhân viên thu</th>
                                    <th className="py-2">Giá trị</th>
                                    <th className="py-2">Đã thu</th>
                                    <th className="py-2">Công nợ</th>
                                    <th className="py-2">Chi phí</th>
                                    <th className="py-2">TT</th>
                                    <th className="py-2">Trạng thái</th>
                                    <th className="py-2">Duyệt</th>
                                    <th className="py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {contracts.map((c) => (
                                    <tr key={c.id} className="border-b border-slate-100">
                                        <td className="py-2">
                                            <button
                                                type="button"
                                                className="group text-left"
                                                onClick={() => openDetail(c.id)}
                                            >
                                                <div className="font-medium text-slate-900 group-hover:text-primary">
                                                    {c.code || `CTR-${c.id}`}
                                                </div>
                                                <div className="text-xs text-text-muted">{c.title}</div>
                                                <div className="mt-1 text-[11px] font-medium text-primary/80">
                                                    Xem chi tiết hợp đồng
                                                </div>
                                            </button>
                                        </td>
                                        <td className="py-2 text-slate-700">{c.client?.name || '—'}</td>
                                        <td className="py-2 text-slate-700">{c.collector?.name || '—'}</td>
                                        <td className="py-2 text-slate-700">{formatCurrency(c.value || 0)}</td>
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
                                        <td className="py-2 text-right">
                                            <Dropdown>
                                                <Dropdown.Trigger>
                                                    <button
                                                        type="button"
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                                        aria-label="Thao tác hợp đồng"
                                                    >
                                                        <AppIcon name="ellipsis-horizontal" className="h-4 w-4" />
                                                    </button>
                                                </Dropdown.Trigger>
                                                <Dropdown.Content align="right" width="48" contentClasses="py-2 bg-white rounded-2xl border border-slate-200 shadow-xl">
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                                        onClick={() => openDetail(c.id)}
                                                    >
                                                        <AppIcon name="eye" className="h-4 w-4 text-slate-400" />
                                                        Xem chi tiết
                                                    </button>
                                                    {canManage && (
                                                        <button
                                                            type="button"
                                                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                                            onClick={() => startEdit(c)}
                                                        >
                                                            <AppIcon name="pencil" className="h-4 w-4 text-slate-400" />
                                                            Sửa hợp đồng
                                                        </button>
                                                    )}
                                                    {canApprove && c.approval_status !== 'approved' && (
                                                        <button
                                                            type="button"
                                                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50"
                                                            onClick={() => approve(c)}
                                                        >
                                                            <AppIcon name="check" className="h-4 w-4" />
                                                            Duyệt hợp đồng
                                                        </button>
                                                    )}
                                                    {canDelete && (
                                                        <button
                                                            type="button"
                                                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                                                            onClick={() => remove(c.id)}
                                                        >
                                                            <AppIcon name="trash" className="h-4 w-4" />
                                                            Xóa hợp đồng
                                                        </button>
                                                    )}
                                                </Dropdown.Content>
                                            </Dropdown>
                                        </td>
                                    </tr>
                                ))}
                                {contracts.length === 0 && (
                                    <tr>
                                        <td className="py-6 text-center text-sm text-text-muted" colSpan={11}>
                                            Chưa có hợp đồng nào.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                </div>
            </div>

            <Modal
                open={showForm}
                onClose={closeForm}
                title={editingId ? `Sửa hợp đồng #${editingId}` : 'Tạo hợp đồng'}
                description="Thiết lập thông tin hợp đồng và danh sách sản phẩm."
                size="xl"
            >
                <div className="space-y-4 text-sm">
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <LabeledField
                                label="Mã hợp đồng"
                                hint="Có thể để trống để hệ thống tự sinh mã."
                                className="md:col-span-2"
                            >
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    placeholder="Ví dụ: CTR-20260318-ABCD"
                                    value={form.code}
                                    onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))}
                                />
                            </LabeledField>
                            <LabeledField label="Tiêu đề hợp đồng" required className="md:col-span-2">
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    placeholder="Ví dụ: Hợp đồng SEO Tổng Thể Q2"
                                    value={form.title}
                                    onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                                />
                            </LabeledField>
                            <LabeledField label="Khách hàng" required className="md:col-span-2">
                                <select
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    value={form.client_id}
                                    onChange={(e) => setForm((s) => ({ ...s, client_id: e.target.value }))}
                                >
                                    <option value="">Chọn khách hàng do bạn đang quản lý</option>
                                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name} {c.company ? `(${c.company})` : ''}</option>)}
                                </select>
                            </LabeledField>
                            <LabeledField label="Liên kết dự án" className="md:col-span-2">
                                <select
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    value={form.project_id}
                                    onChange={(e) => setForm((s) => ({ ...s, project_id: e.target.value }))}
                                >
                                    <option value="">Chưa liên kết dự án</option>
                                    {projects.map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
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
                                {collectors.map((collector) => (
                                    <option key={collector.id} value={collector.id}>
                                        {collector.name}{collector.email ? ` • ${collector.email}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                        <div className="grid gap-4 md:grid-cols-3">
                            <LabeledField
                                label="Giá trị hợp đồng (VNĐ)"
                                hint={items.length ? 'Đang được tự tính từ danh sách sản phẩm phía dưới.' : ''}
                            >
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    type="number"
                                    placeholder="0"
                                    value={items.length ? itemsTotal : form.value}
                                    onChange={(e) => setForm((s) => ({ ...s, value: e.target.value }))}
                                    disabled={items.length > 0}
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
                            <LabeledField label="Trạng thái hợp đồng">
                                <select
                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                    value={form.status}
                                    onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}
                                >
                                    {STATUS_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
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
                                    <div className="grid grid-cols-3 gap-2">
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
                                                type="number"
                                                value={item.unit_price}
                                                onChange={(e) => updateItem(index, { unit_price: e.target.value })}
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

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-semibold text-slate-900">Thanh toán hợp đồng</h4>
                                <p className="text-xs text-text-muted">Số lần thanh toán: {form.payment_times || 1}</p>
                            </div>
                            {canFinance && (
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
                                            <td className="py-2">{p.paid_at ? String(p.paid_at).slice(0, 10) : '—'}</td>
                                            <td className="py-2">{Number(p.amount || 0).toLocaleString('vi-VN')}</td>
                                            <td className="py-2">{p.method || '—'}</td>
                                            <td className="py-2">{p.note || '—'}</td>
                                            <td className="py-2 text-right">
                                                {canFinance ? (
                                                    <Dropdown>
                                                        <Dropdown.Trigger>
                                                            <button
                                                                type="button"
                                                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                                                aria-label="Thao tác thanh toán hợp đồng"
                                                            >
                                                                <AppIcon name="ellipsis-horizontal" className="h-4 w-4" />
                                                            </button>
                                                        </Dropdown.Trigger>
                                                        <Dropdown.Content align="right" width="48" contentClasses="py-2 bg-white rounded-2xl border border-slate-200 shadow-xl">
                                                            <button
                                                                type="button"
                                                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                                                onClick={() => editPayment(p)}
                                                            >
                                                                <AppIcon name="pencil" className="h-4 w-4 text-slate-400" />
                                                                Sửa thanh toán
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                                                                onClick={() => removePayment(p.id)}
                                                            >
                                                                <AppIcon name="trash" className="h-4 w-4" />
                                                                Xóa thanh toán
                                                            </button>
                                                        </Dropdown.Content>
                                                    </Dropdown>
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
                                <p className="text-xs text-text-muted">Tổng chi phí: {Number(costs.reduce((sum, c) => sum + Number(c.amount || 0), 0)).toLocaleString('vi-VN')} VNĐ</p>
                            </div>
                            {canFinance && (
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
                                            <td className="py-2">{c.cost_date ? String(c.cost_date).slice(0, 10) : '—'}</td>
                                            <td className="py-2">{c.cost_type || '—'}</td>
                                            <td className="py-2">{Number(c.amount || 0).toLocaleString('vi-VN')}</td>
                                            <td className="py-2">{c.note || '—'}</td>
                                            <td className="py-2 text-right">
                                                {canFinance ? (
                                                    <Dropdown>
                                                        <Dropdown.Trigger>
                                                            <button
                                                                type="button"
                                                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                                                aria-label="Thao tác chi phí hợp đồng"
                                                            >
                                                                <AppIcon name="ellipsis-horizontal" className="h-4 w-4" />
                                                            </button>
                                                        </Dropdown.Trigger>
                                                        <Dropdown.Content align="right" width="48" contentClasses="py-2 bg-white rounded-2xl border border-slate-200 shadow-xl">
                                                            <button
                                                                type="button"
                                                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                                                onClick={() => editCost(c)}
                                                            >
                                                                <AppIcon name="pencil" className="h-4 w-4 text-slate-400" />
                                                                Sửa chi phí
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                                                                onClick={() => removeCost(c.id)}
                                                            >
                                                                <AppIcon name="trash" className="h-4 w-4" />
                                                                Xóa chi phí
                                                            </button>
                                                        </Dropdown.Content>
                                                    </Dropdown>
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
                        <button type="button" className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold" onClick={() => save(false)}>
                            {editingId ? 'Cập nhật hợp đồng' : 'Tạo hợp đồng'}
                        </button>
                        {!editingId && canApprove && (
                            <button
                                type="button"
                                className="flex-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700"
                                onClick={() => save(true)}
                            >
                                Tạo và duyệt
                            </button>
                        )}
                        <button type="button" className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold" onClick={closeForm}>
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={showDetail}
                onClose={closeDetail}
                title={detailContract ? `Chi tiết ${detailContract.code || `CTR-${detailContract.id}`}` : 'Chi tiết hợp đồng'}
                description="Xem nhanh toàn bộ thông tin, sản phẩm, thanh toán và chi phí của hợp đồng."
                size="xl"
            >
                {detailLoading ? (
                    <div className="py-8 text-center text-sm text-text-muted">Đang tải chi tiết hợp đồng...</div>
                ) : detailContract ? (
                    <div className="space-y-4 text-sm">
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                    <div className="text-xs uppercase tracking-[0.16em] text-text-subtle">Hợp đồng</div>
                                    <h3 className="mt-1 text-xl font-semibold text-slate-900">{detailContract.title}</h3>
                                    <p className="mt-1 text-sm text-text-muted">
                                        Khách hàng: <span className="font-semibold text-slate-700">{detailContract.client?.name || '—'}</span>
                                        {' • '}
                                        Nhân viên thu: <span className="font-semibold text-slate-700">{detailContract.collector?.name || '—'}</span>
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(detailContract.status)}`}>
                                        {STATUS_OPTIONS.find((item) => item.value === detailContract.status)?.label || detailContract.status}
                                    </span>
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${approvalBadgeClass(detailContract.approval_status)}`}>
                                        {approvalLabel(detailContract.approval_status)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <DetailMetric label="Giá trị hợp đồng" value={`${formatCurrency(detailContract.value || 0)} VNĐ`} tone="sky" />
                            <DetailMetric label="Đã thu" value={`${formatCurrency(detailContract.payments_total || 0)} VNĐ`} tone="emerald" />
                            <DetailMetric label="Còn phải thu" value={`${formatCurrency(detailContract.debt_outstanding || 0)} VNĐ`} tone="amber" />
                            <DetailMetric label="Chi phí đã ghi nhận" value={`${formatCurrency(detailContract.costs_total || 0)} VNĐ`} />
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                                <h4 className="text-sm font-semibold text-slate-900">Thông tin chính</h4>
                                <div className="mt-3 space-y-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-text-muted">Mã hợp đồng</span>
                                        <span className="font-semibold text-slate-900">{detailContract.code || `CTR-${detailContract.id}`}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-text-muted">Dự án liên kết</span>
                                        <span className="font-semibold text-slate-900">{detailContract.project?.name || '—'}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-text-muted">Ngày ký</span>
                                        <span className="font-semibold text-slate-900">{formatDateDisplay(detailContract.signed_at)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-text-muted">Ngày bắt đầu</span>
                                        <span className="font-semibold text-slate-900">{formatDateDisplay(detailContract.start_date)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-text-muted">Ngày kết thúc</span>
                                        <span className="font-semibold text-slate-900">{formatDateDisplay(detailContract.end_date)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-text-muted">Số kỳ thanh toán</span>
                                        <span className="font-semibold text-slate-900">{detailContract.payments_count || 0}/{detailContract.payment_times || 1}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                                <h4 className="text-sm font-semibold text-slate-900">Ghi chú & phê duyệt</h4>
                                <div className="mt-3 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-text-muted">Người tạo</span>
                                        <span className="font-semibold text-slate-900">{detailContract.creator?.name || '—'}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-text-muted">Người duyệt</span>
                                        <span className="font-semibold text-slate-900">{detailContract.approver?.name || '—'}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-text-muted">Ngày duyệt</span>
                                        <span className="font-semibold text-slate-900">{formatDateDisplay(detailContract.approved_at)}</span>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 px-3 py-3">
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                                            Ghi chú hợp đồng
                                        </div>
                                        <div className="mt-1 text-slate-700">
                                            {detailContract.notes || 'Chưa có ghi chú hợp đồng.'}
                                        </div>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 px-3 py-3">
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                                            Ghi chú duyệt
                                        </div>
                                        <div className="mt-1 text-slate-700">
                                            {detailContract.approval_note || 'Chưa có ghi chú duyệt.'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                            <h4 className="text-sm font-semibold text-slate-900">Sản phẩm trong hợp đồng</h4>
                            <div className="mt-3 overflow-x-auto">
                                <table className="min-w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-left uppercase tracking-[0.14em] text-text-subtle">
                                            <th className="py-2">Sản phẩm</th>
                                            <th className="py-2">Đơn vị</th>
                                            <th className="py-2">Đơn giá</th>
                                            <th className="py-2">Số lượng</th>
                                            <th className="py-2">Thành tiền</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(detailContract.items || []).map((item) => (
                                            <tr key={item.id || `${item.product_name}-${item.quantity}`} className="border-b border-slate-100">
                                                <td className="py-2 font-medium text-slate-900">{item.product_name || '—'}</td>
                                                <td className="py-2">{item.unit || '—'}</td>
                                                <td className="py-2">{formatCurrency(item.unit_price || 0)}</td>
                                                <td className="py-2">{item.quantity || 0}</td>
                                                <td className="py-2">{formatCurrency(item.total_price || 0)}</td>
                                            </tr>
                                        ))}
                                        {(detailContract.items || []).length === 0 && (
                                            <tr>
                                                <td className="py-3 text-center text-text-muted" colSpan={5}>Chưa có sản phẩm nào.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                                <h4 className="text-sm font-semibold text-slate-900">Lịch sử thanh toán</h4>
                                <div className="mt-3 overflow-x-auto">
                                    <table className="min-w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-slate-200 text-left uppercase tracking-[0.14em] text-text-subtle">
                                                <th className="py-2">Ngày thu</th>
                                                <th className="py-2">Số tiền</th>
                                                <th className="py-2">Phương thức</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(detailContract.payments || []).map((payment) => (
                                                <tr key={payment.id} className="border-b border-slate-100">
                                                    <td className="py-2">{formatDateDisplay(payment.paid_at)}</td>
                                                    <td className="py-2">{formatCurrency(payment.amount || 0)}</td>
                                                    <td className="py-2">{payment.method || '—'}</td>
                                                </tr>
                                            ))}
                                            {(detailContract.payments || []).length === 0 && (
                                                <tr>
                                                    <td className="py-3 text-center text-text-muted" colSpan={3}>Chưa có lần thanh toán nào.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                                <h4 className="text-sm font-semibold text-slate-900">Chi phí hợp đồng</h4>
                                <div className="mt-3 overflow-x-auto">
                                    <table className="min-w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-slate-200 text-left uppercase tracking-[0.14em] text-text-subtle">
                                                <th className="py-2">Ngày chi</th>
                                                <th className="py-2">Loại chi phí</th>
                                                <th className="py-2">Số tiền</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(detailContract.costs || []).map((cost) => (
                                                <tr key={cost.id} className="border-b border-slate-100">
                                                    <td className="py-2">{formatDateDisplay(cost.cost_date)}</td>
                                                    <td className="py-2">{cost.cost_type || '—'}</td>
                                                    <td className="py-2">{formatCurrency(cost.amount || 0)}</td>
                                                </tr>
                                            ))}
                                            {(detailContract.costs || []).length === 0 && (
                                                <tr>
                                                    <td className="py-3 text-center text-text-muted" colSpan={3}>Chưa có chi phí nào.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="py-8 text-center text-sm text-text-muted">Chưa có dữ liệu chi tiết.</div>
                )}
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
                            Lưu
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
                    <LabeledField label="Số tiền chi" required>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Nhập chi phí phát sinh"
                            type="number"
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
                            Lưu
                        </button>
                        <button type="button" className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold" onClick={() => setShowCostForm(false)}>
                            Hủy
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                open={showImport}
                onClose={() => setShowImport(false)}
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
                                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
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
                    <div className="flex items-center gap-2">
                        <button
                            type="submit"
                            className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold"
                            disabled={importing}
                        >
                            {importing ? 'Đang import...' : 'Import'}
                        </button>
                        <button type="button" className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold" onClick={() => setShowImport(false)}>
                            Hủy
                        </button>
                    </div>
                </form>
            </Modal>
        </PageContainer>
    );
}
