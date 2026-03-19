import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from '@inertiajs/inertia-react';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import Dropdown from '@/Components/Dropdown';
import AppIcon from '@/Components/AppIcon';
import { useToast } from '@/Contexts/ToastContext';

const badgeStyle = (hex) => ({
    borderColor: hex,
    color: hex,
    backgroundColor: `${hex}20`,
});

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

export default function CRM(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const userId = props?.auth?.user?.id;
    const isManager = userRole === 'quan_ly';
    const isAdminRole = userRole === 'admin';
    const canManageClients = ['admin', 'quan_ly', 'nhan_vien'].includes(userRole);
    const canManagePayments = ['admin', 'ke_toan'].includes(userRole);
    const canDeleteClients = userRole === 'admin';
    const canDeletePayments = userRole === 'admin';
    const canAssignClientOwner = ['admin', 'quan_ly'].includes(userRole);

    const [activeTab, setActiveTab] = useState('clients');
    const [clients, setClients] = useState([]);
    const [payments, setPayments] = useState([]);
    const [leadTypes, setLeadTypes] = useState([]);
    const [revenueTiers, setRevenueTiers] = useState([]);
    const [staffUsers, setStaffUsers] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [clientMeta, setClientMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [paymentMeta, setPaymentMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [clientPage, setClientPage] = useState(1);
    const [paymentPage, setPaymentPage] = useState(1);
    const [clientFilters, setClientFilters] = useState({ search: '', per_page: 10, lead_type_id: '', type: '' });
    const [paymentFilters, setPaymentFilters] = useState({ status: '', per_page: 10 });
    const [editingClientId, setEditingClientId] = useState(null);
    const [editingPaymentId, setEditingPaymentId] = useState(null);
    const [showClientForm, setShowClientForm] = useState(false);
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [showClientImport, setShowClientImport] = useState(false);
    const [clientImportFile, setClientImportFile] = useState(null);
    const [importingClients, setImportingClients] = useState(false);
    const [clientForm, setClientForm] = useState({
        name: '',
        company: '',
        email: '',
        phone: '',
        notes: '',
        sales_owner_id: '',
        assigned_department_id: '',
        assigned_staff_id: '',
        lead_type_id: '',
        lead_source: '',
        lead_channel: '',
        lead_message: '',
    });
    const [paymentForm, setPaymentForm] = useState({
        client_id: '',
        amount: '',
        status: 'pending',
        due_date: '',
        invoice_no: '',
        note: '',
    });

    const getErrorMessage = (error, fallback) => error?.response?.data?.message || fallback;

    const fetchLookups = async () => {
        try {
            const [leadRes, tierRes] = await Promise.all([
                axios.get('/api/v1/lead-types'),
                axios.get('/api/v1/revenue-tiers'),
            ]);
            setLeadTypes(leadRes.data || []);
            setRevenueTiers(tierRes.data || []);
        } catch {
            // ignore
        }
    };

    const fetchStaffUsers = async () => {
        if (!canManageClients) return;
        try {
            const res = await axios.get('/api/v1/users/lookup');
            setStaffUsers(res.data?.data || []);
        } catch {
            setStaffUsers([]);
        }
    };

    const fetchDepartments = async () => {
        try {
            const res = await axios.get('/api/v1/departments');
            setDepartments(res.data || []);
        } catch {
            setDepartments([]);
        }
    };

    const fetchClients = async (page = 1, filtersArg = clientFilters) => {
        try {
            const clientsRes = await axios.get('/api/v1/crm/clients', {
                params: {
                    ...filtersArg,
                    page,
                },
            });
            const resolvedPage = clientsRes.data.current_page || 1;
            setClients(clientsRes.data.data || []);
            setClientMeta({
                current_page: resolvedPage,
                last_page: clientsRes.data.last_page || 1,
                total: clientsRes.data.total || 0,
            });
            setClientPage(resolvedPage);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Không tải được danh sách khách hàng.'));
        }
    };

    const fetchPayments = async (page = 1, filtersArg = paymentFilters) => {
        try {
            const paymentsRes = await axios.get('/api/v1/crm/payments', {
                params: {
                    ...filtersArg,
                    page,
                },
            });
            const resolvedPage = paymentsRes.data.current_page || 1;
            setPayments(paymentsRes.data.data || []);
            setPaymentMeta({
                current_page: resolvedPage,
                last_page: paymentsRes.data.last_page || 1,
                total: paymentsRes.data.total || 0,
            });
            setPaymentPage(resolvedPage);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Không tải được danh sách thanh toán.'));
        }
    };

    const submitClientImport = async (e) => {
        e.preventDefault();
        if (!clientImportFile) {
            toast.error('Vui lòng chọn file Excel.');
            return;
        }
        setImportingClients(true);
        try {
            const formData = new FormData();
            formData.append('file', clientImportFile);
            const res = await axios.post('/api/v1/imports/clients', formData);
            const report = res.data || {};
            toast.success(
                `Import hoàn tất: ${report.created || 0} tạo mới, ${report.updated || 0} cập nhật, ${report.skipped || 0} bỏ qua.`
            );
            setShowClientImport(false);
            setClientImportFile(null);
            await fetchClients(1, clientFilters);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Import thất bại.'));
        } finally {
            setImportingClients(false);
        }
    };

    useEffect(() => {
        fetchLookups();
        fetchStaffUsers();
        fetchDepartments();
        fetchClients(1, clientFilters);
        fetchPayments(1, paymentFilters);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (leadTypes.length && !clientForm.lead_type_id) {
            setClientForm((prev) => ({ ...prev, lead_type_id: leadTypes[0]?.id || '' }));
        }
    }, [leadTypes]);

    const submitClient = async (e) => {
        e.preventDefault();
        if (!canManageClients) {
            toast.error('Bạn không có quyền quản lý khách hàng.');
            return;
        }
        try {
            const resolvedAssignedStaff = clientForm.assigned_staff_id
                ? Number(clientForm.assigned_staff_id)
                : null;
            const payload = {
                name: clientForm.name,
                company: clientForm.company || null,
                email: clientForm.email || null,
                phone: clientForm.phone || null,
                notes: clientForm.notes || null,
                sales_owner_id: clientForm.sales_owner_id
                    ? Number(clientForm.sales_owner_id)
                    : resolvedAssignedStaff || userId || null,
                assigned_department_id: clientForm.assigned_department_id
                    ? Number(clientForm.assigned_department_id)
                    : null,
                assigned_staff_id: resolvedAssignedStaff,
                lead_type_id: clientForm.lead_type_id ? Number(clientForm.lead_type_id) : null,
                lead_source: clientForm.lead_source || null,
                lead_channel: clientForm.lead_channel || null,
                lead_message: clientForm.lead_message || null,
            };
            if (editingClientId) {
                await axios.put(`/api/v1/crm/clients/${editingClientId}`, payload);
            } else {
                await axios.post('/api/v1/crm/clients', payload);
            }
            closeClientForm();
            await fetchClients(clientPage);
            toast.success(editingClientId ? 'Cập nhật khách hàng thành công.' : 'Tạo khách hàng thành công.');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Lưu khách hàng thất bại.'));
        }
    };

    const editClient = (client) => {
        setEditingClientId(client.id);
        setClientForm({
            name: client.name || '',
            company: client.company || '',
            email: client.email || '',
            phone: client.phone || '',
            notes: client.notes || '',
            sales_owner_id: client.sales_owner_id || '',
            assigned_department_id: client.assigned_department_id || '',
            assigned_staff_id: client.assigned_staff_id || '',
            lead_type_id: client.lead_type_id || '',
            lead_source: client.lead_source || '',
            lead_channel: client.lead_channel || '',
            lead_message: client.lead_message || '',
        });
        setShowClientForm(true);
    };

    const openClientCreate = () => {
        setEditingClientId(null);
        setClientForm({
            name: '',
            company: '',
            email: '',
            phone: '',
            notes: '',
            sales_owner_id: '',
            assigned_department_id: '',
            assigned_staff_id: '',
            lead_type_id: leadTypes[0]?.id || '',
            lead_source: '',
            lead_channel: '',
            lead_message: '',
        });
        setShowClientForm(true);
    };

    const closeClientForm = () => {
        setShowClientForm(false);
        setEditingClientId(null);
    };

    const deleteClient = async (id) => {
        if (!canDeleteClients) return toast.error('Bạn không có quyền xóa khách hàng.');
        try {
            await axios.delete(`/api/v1/crm/clients/${id}`);
            if (editingClientId === id) {
                closeClientForm();
            }
            await fetchClients(clientPage);
            toast.success('Xóa khách hàng thành công.');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Xóa khách hàng thất bại.'));
        }
    };

    const submitPayment = async (e) => {
        e.preventDefault();
        if (!canManagePayments) return toast.error('Bạn không có quyền quản lý thanh toán.');
        const payload = {
            ...paymentForm,
            client_id: Number(paymentForm.client_id),
            amount: Number(paymentForm.amount || 0),
            due_date: paymentForm.due_date || null,
        };
        try {
            if (editingPaymentId) {
                await axios.put(`/api/v1/crm/payments/${editingPaymentId}`, payload);
            } else {
                await axios.post('/api/v1/crm/payments', payload);
            }
            closePaymentForm();
            await fetchPayments(paymentPage);
            toast.success(editingPaymentId ? 'Cập nhật thanh toán thành công.' : 'Tạo thanh toán thành công.');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Lưu thanh toán thất bại.'));
        }
    };

    const editPayment = (payment) => {
        setEditingPaymentId(payment.id);
        setPaymentForm({
            client_id: String(payment.client_id || ''),
            amount: String(payment.amount || ''),
            status: payment.status || 'pending',
            due_date: payment.due_date ? payment.due_date.slice(0, 10) : '',
            invoice_no: payment.invoice_no || '',
            note: payment.note || '',
        });
        setShowPaymentForm(true);
    };

    const openPaymentCreate = () => {
        setEditingPaymentId(null);
        setPaymentForm({
            client_id: '',
            amount: '',
            status: 'pending',
            due_date: '',
            invoice_no: '',
            note: '',
        });
        setShowPaymentForm(true);
    };

    const closePaymentForm = () => {
        setShowPaymentForm(false);
        setEditingPaymentId(null);
    };

    const deletePayment = async (id) => {
        if (!canDeletePayments) return toast.error('Bạn không có quyền xóa thanh toán.');
        try {
            await axios.delete(`/api/v1/crm/payments/${id}`);
            if (editingPaymentId === id) {
                closePaymentForm();
            }
            await fetchPayments(paymentPage);
            toast.success('Xóa thanh toán thành công.');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Xóa thanh toán thất bại.'));
        }
    };

    const clientStats = useMemo(() => {
        const total = clientMeta.total || clients.length;
        const leadCount = clients.filter((c) => c.lead_type_id).length;
        const purchased = clients.filter((c) => c.has_purchased).length;
        return [
            { label: 'Khách hàng', value: String(total) },
            { label: 'Tiềm năng', value: String(leadCount) },
            { label: 'Đã mua', value: String(purchased) },
            { label: 'Doanh thu', value: clients.reduce((acc, c) => acc + Number(c.total_revenue || 0), 0).toLocaleString('vi-VN') + ' VNĐ' },
        ];
    }, [clients, clientMeta]);

    const paymentStats = useMemo(() => {
        const total = paymentMeta.total || payments.length;
        const pending = payments.filter((p) => p.status === 'pending').length;
        const paid = payments.filter((p) => p.status === 'paid').length;
        return [
            { label: 'Giao dịch', value: String(total) },
            { label: 'Đang chờ', value: String(pending) },
            { label: 'Đã thanh toán', value: String(paid) },
            { label: 'Vai trò', value: userRole || '—' },
        ];
    }, [payments, paymentMeta, userRole]);

    const visibleDepartmentOptions = useMemo(() => {
        if (isAdminRole) {
            return departments;
        }
        if (!isManager) {
            return [];
        }

        const scopedDepartmentIds = new Set(
            staffUsers
                .map((user) => Number(user.department_id || 0))
                .filter((id) => id > 0)
        );

        return departments.filter((dept) => {
            const deptId = Number(dept.id || 0);
            const managerId = Number(dept.manager_id || 0);
            return (deptId > 0 && scopedDepartmentIds.has(deptId)) || managerId === Number(userId || 0);
        });
    }, [departments, staffUsers, isAdminRole, isManager, userId]);

    return (
        <PageContainer
            auth={props.auth}
            title="Quản lý khách hàng"
            description="Quản lý khách hàng, trạng thái tiềm năng, thanh toán và phân quyền chăm sóc."
            stats={activeTab === 'clients' ? clientStats : paymentStats}
        >
            <div className="flex flex-wrap gap-2 mb-6">
                <button
                    type="button"
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        activeTab === 'clients' ? 'bg-primary text-white' : 'bg-white border border-slate-200 text-slate-600'
                    }`}
                    onClick={() => setActiveTab('clients')}
                >
                    Khách hàng
                </button>
                <button
                    type="button"
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        activeTab === 'payments' ? 'bg-primary text-white' : 'bg-white border border-slate-200 text-slate-600'
                    }`}
                    onClick={() => setActiveTab('payments')}
                >
                    Thanh toán
                </button>
            </div>

            {activeTab === 'clients' && (
                <>
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
                            <h3 className="font-semibold">Danh sách khách hàng</h3>
                            <div className="flex flex-col gap-2 md:flex-row md:items-center">
                                {canManageClients && (
                                    <button
                                        type="button"
                                        className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                                        onClick={openClientCreate}
                                    >
                                        Thêm mới
                                    </button>
                                )}
                                {canManageClients && (
                                    <button
                                        type="button"
                                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                                        onClick={() => setShowClientImport(true)}
                                    >
                                        Import Excel
                                    </button>
                                )}
                                <input
                                    className="rounded-xl border border-slate-200/80 px-3 py-2 text-sm"
                                    placeholder="Tìm theo tên/email..."
                                    value={clientFilters.search}
                                    onChange={(e) => setClientFilters((s) => ({ ...s, search: e.target.value }))}
                                />
                                <select
                                    className="rounded-xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={clientFilters.lead_type_id}
                                    onChange={(e) => setClientFilters((s) => ({ ...s, lead_type_id: e.target.value }))}
                                >
                                    <option value="">Tất cả trạng thái</option>
                                    {leadTypes.map((type) => (
                                        <option key={type.id} value={type.id}>
                                            {type.name}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    className="rounded-xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={clientFilters.type}
                                    onChange={(e) => setClientFilters((s) => ({ ...s, type: e.target.value }))}
                                >
                                    <option value="">Tất cả nhóm</option>
                                    <option value="potential">Tiềm năng</option>
                                    <option value="active">Đã mua</option>
                                </select>
                                <button
                                    type="button"
                                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                                    onClick={() => fetchClients(1, clientFilters)}
                                >
                                    Lọc
                                </button>
                            </div>
                        </div>
                        <div className="mb-4 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                            {isAdminRole
                                ? 'Bạn đang ở chế độ xem toàn bộ khách hàng. Có thể phân công khách cho mọi phòng ban và nhân sự.'
                                : isManager
                                    ? 'Bạn chỉ nhìn thấy khách hàng của nhân sự trong phòng ban mình quản lý, và có thể giao lại trong phạm vi phòng ban đó.'
                                    : 'Bạn chỉ nhìn thấy khách hàng do chính mình phụ trách. Khi thêm khách mới, hệ thống sẽ tự gắn khách cho bạn.'}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-wider text-text-subtle border-b border-slate-200">
                                        <th className="py-2">Khách hàng</th>
                                        <th className="py-2">SĐT</th>
                                        <th className="py-2">Trạng thái</th>
                                        <th className="py-2">Hạng</th>
                                        <th className="py-2">Phòng ban</th>
                                        <th className="py-2">Phụ trách</th>
                                        <th className="py-2">Doanh thu</th>
                                        <th className="py-2">Nguồn</th>
                                        <th className="py-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {clients.map((client) => (
                                        <tr key={client.id} className="border-b border-slate-100">
                                            <td className="py-2">
                                                <div className="font-medium text-slate-900">{client.name}</div>
                                                <div className="text-xs text-text-muted">{client.company || '—'}</div>
                                            </td>
                                            <td className="py-2 text-xs text-text-muted">{client.phone || '—'}</td>
                                            <td className="py-2">
                                                {client.lead_type ? (
                                                    <span
                                                        className="rounded-full border px-2 py-1 text-xs font-semibold"
                                                        style={badgeStyle(client.lead_type.color_hex || '#94A3B8')}
                                                    >
                                                        {client.lead_type.name}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-text-muted">—</span>
                                                )}
                                            </td>
                                            <td className="py-2">
                                                {client.revenue_tier ? (
                                                    <span
                                                        className="rounded-full border px-2 py-1 text-xs font-semibold"
                                                        style={badgeStyle(client.revenue_tier.color_hex || '#94A3B8')}
                                                    >
                                                        {client.revenue_tier.label}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-text-muted">—</span>
                                                )}
                                            </td>
                                            <td className="py-2 text-xs text-text-muted">
                                                {client.assigned_department?.name || '—'}
                                            </td>
                                            <td className="py-2 text-xs text-text-muted">
                                                {client.assigned_staff?.name || client.sales_owner?.name || '—'}
                                            </td>
                                            <td className="py-2 text-slate-700">
                                                {Number(client.total_revenue || 0).toLocaleString('vi-VN')}
                                            </td>
                                            <td className="py-2 text-xs text-text-muted">
                                                <div>
                                                    {client.lead_source || '—'} {client.lead_channel ? `• ${client.lead_channel}` : ''}
                                                </div>
                                                {client.facebook_page?.name && (
                                                    <div className="text-[11px] text-text-subtle">Page: {client.facebook_page.name}</div>
                                                )}
                                            </td>
                                            <td className="py-2 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {client.has_purchased || Number(client.total_revenue || 0) > 0 ? (
                                                        <Link
                                                            href={route('crm.flow', client.id)}
                                                            className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                                                        >
                                                            Xem luồng
                                                        </Link>
                                                    ) : (
                                                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                                                            Lead mới
                                                        </span>
                                                    )}
                                                    {(canManageClients || canDeleteClients) && (
                                                        <Dropdown>
                                                            <Dropdown.Trigger>
                                                                <button
                                                                    type="button"
                                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                                                    aria-label="Thao tác khách hàng"
                                                                >
                                                                    <AppIcon name="ellipsis-horizontal" className="h-4 w-4" />
                                                                </button>
                                                            </Dropdown.Trigger>
                                                            <Dropdown.Content align="right" width="48" contentClasses="py-2 bg-white rounded-2xl border border-slate-200 shadow-xl">
                                                                {canManageClients && (
                                                                    <button
                                                                        type="button"
                                                                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                                                        onClick={() => editClient(client)}
                                                                    >
                                                                        <AppIcon name="pencil" className="h-4 w-4 text-slate-400" />
                                                                        Sửa khách hàng
                                                                    </button>
                                                                )}
                                                                {client.has_purchased || Number(client.total_revenue || 0) > 0 ? (
                                                                    <Link
                                                                        href={route('crm.flow', client.id)}
                                                                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                                                    >
                                                                        <AppIcon name="eye" className="h-4 w-4 text-slate-400" />
                                                                        Mở luồng khách hàng
                                                                    </Link>
                                                                ) : null}
                                                                {canDeleteClients && (
                                                                    <button
                                                                        type="button"
                                                                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                                                                        onClick={() => deleteClient(client.id)}
                                                                    >
                                                                        <AppIcon name="trash" className="h-4 w-4" />
                                                                        Xóa khách hàng
                                                                    </button>
                                                                )}
                                                            </Dropdown.Content>
                                                        </Dropdown>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {clients.length === 0 && (
                                        <tr>
                                            <td className="py-6 text-center text-sm text-text-muted" colSpan={9}>
                                                Chưa có khách hàng nào.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <Modal
                        open={showClientForm}
                        onClose={closeClientForm}
                        title={editingClientId ? `Sửa khách hàng #${editingClientId}` : 'Tạo khách hàng'}
                        description="Cập nhật thông tin khách hàng và trạng thái khách hàng tiềm năng."
                        size="lg"
                    >
                        <form className="space-y-3 text-sm" onSubmit={submitClient}>
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                                <div className="mb-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-subtle">
                                        Thông tin khách hàng
                                    </p>
                                    <p className="mt-1 text-xs text-text-muted">
                                        Điền thông tin cơ bản để CRM dễ lọc, tìm kiếm và lên hợp đồng.
                                    </p>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <LabeledField label="Tên khách hàng" required className="md:col-span-2">
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                            placeholder="Ví dụ: Nguyễn Văn A"
                                            value={clientForm.name}
                                            onChange={(e) => setClientForm((s) => ({ ...s, name: e.target.value }))}
                                        />
                                    </LabeledField>
                                    <LabeledField label="Công ty">
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                            placeholder="Ví dụ: Công ty ABC"
                                            value={clientForm.company}
                                            onChange={(e) => setClientForm((s) => ({ ...s, company: e.target.value }))}
                                        />
                                    </LabeledField>
                                    <LabeledField label="Trạng thái lead">
                                        <select
                                            className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                            value={clientForm.lead_type_id}
                                            onChange={(e) => setClientForm((s) => ({ ...s, lead_type_id: e.target.value }))}
                                        >
                                            {leadTypes.map((type) => (
                                                <option key={type.id} value={type.id}>
                                                    {type.name}
                                                </option>
                                            ))}
                                        </select>
                                    </LabeledField>
                                    <LabeledField label="Email">
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                            placeholder="contact@company.com"
                                            value={clientForm.email}
                                            onChange={(e) => setClientForm((s) => ({ ...s, email: e.target.value }))}
                                        />
                                    </LabeledField>
                                    <LabeledField label="Số điện thoại">
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                            placeholder="09xxxxxxxx"
                                            value={clientForm.phone}
                                            onChange={(e) => setClientForm((s) => ({ ...s, phone: e.target.value }))}
                                        />
                                    </LabeledField>
                                </div>
                            </div>
                            {canAssignClientOwner && (
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4 space-y-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-subtle">
                                            Phân công khách hàng
                                        </p>
                                        <p className="mt-1 text-xs text-text-muted">
                                            {isAdminRole
                                                ? 'Admin có thể giao khách cho bất kỳ nhân sự nào. Nếu chỉ chọn phòng ban mà chưa chọn người, khách vẫn nằm trong phòng ban đó.'
                                                : 'Trưởng phòng có thể giao khách cho chính mình hoặc nhân sự thuộc phòng ban mình quản lý.'}
                                        </p>
                                    </div>
                                    <div className={`grid gap-2 ${isAdminRole ? 'md:grid-cols-2' : ''}`}>
                                        {isAdminRole && (
                                            <LabeledField
                                                label="Phòng ban phụ trách"
                                                hint="Dùng khi muốn giao lead theo đúng phòng ban trước khi chốt người phụ trách cụ thể."
                                            >
                                                <select
                                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                                    value={clientForm.assigned_department_id}
                                                    onChange={(e) => setClientForm((s) => ({ ...s, assigned_department_id: e.target.value }))}
                                                >
                                                    <option value="">Chọn phòng ban phụ trách</option>
                                                    {visibleDepartmentOptions.map((dept) => (
                                                        <option key={dept.id} value={dept.id}>
                                                            {dept.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </LabeledField>
                                        )}
                                        <LabeledField
                                            label="Nhân sự phụ trách"
                                            required={!isAdminRole}
                                            hint="Người này sẽ nhận push khi có khách hàng mới từ form, page hoặc CRM."
                                        >
                                            <select
                                                className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                                value={clientForm.assigned_staff_id}
                                                onChange={(e) => {
                                                    const selectedUser = staffUsers.find((user) => String(user.id) === e.target.value);
                                                    setClientForm((s) => ({
                                                        ...s,
                                                        assigned_staff_id: e.target.value,
                                                        assigned_department_id: selectedUser?.department_id
                                                            ? String(selectedUser.department_id)
                                                            : (isAdminRole ? s.assigned_department_id : ''),
                                                    }));
                                                }}
                                            >
                                                <option value="">
                                                    {isAdminRole ? 'Chọn nhân sự phụ trách (tuỳ chọn)' : 'Chọn nhân sự phụ trách'}
                                                </option>
                                                {staffUsers.map((user) => (
                                                    <option key={user.id} value={user.id}>
                                                        {user.name}
                                                        {user.department_id
                                                            ? ` • ${visibleDepartmentOptions.find((dept) => Number(dept.id) === Number(user.department_id))?.name || user.role}`
                                                            : ` • ${user.role}`}
                                                    </option>
                                                ))}
                                            </select>
                                        </LabeledField>
                                    </div>
                                </div>
                            )}
                            {!canAssignClientOwner && (
                                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                                    Khách hàng này sẽ tự gắn cho bạn phụ trách. Khi có lead mới hệ thống cũng sẽ dùng người phụ trách này để gửi thông báo.
                                </div>
                            )}
                            <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                                <div className="mb-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-subtle">
                                        Nguồn & nội dung lead
                                    </p>
                                    <p className="mt-1 text-xs text-text-muted">
                                        Ghi rõ nguồn khách, kênh tiếp cận và nội dung trao đổi để đội sales bám theo dễ hơn.
                                    </p>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <LabeledField label="Nguồn khách hàng">
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                            placeholder="Ví dụ: Website, fanpage, referral"
                                            value={clientForm.lead_source}
                                            onChange={(e) => setClientForm((s) => ({ ...s, lead_source: e.target.value }))}
                                        />
                                    </LabeledField>
                                    <LabeledField label="Kênh tiếp cận">
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                            placeholder="Ví dụ: Form, inbox, gọi điện"
                                            value={clientForm.lead_channel}
                                            onChange={(e) => setClientForm((s) => ({ ...s, lead_channel: e.target.value }))}
                                        />
                                    </LabeledField>
                                    <LabeledField label="Nội dung khách để lại" className="md:col-span-2">
                                        <textarea
                                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                            rows={3}
                                            placeholder="Ví dụ: Khách cần báo giá gói dịch vụ SEO tổng thể"
                                            value={clientForm.lead_message}
                                            onChange={(e) => setClientForm((s) => ({ ...s, lead_message: e.target.value }))}
                                        />
                                    </LabeledField>
                                    <LabeledField label="Ghi chú nội bộ" className="md:col-span-2">
                                        <textarea
                                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                            rows={3}
                                            placeholder="Ghi chú riêng cho đội phụ trách"
                                            value={clientForm.notes}
                                            onChange={(e) => setClientForm((s) => ({ ...s, notes: e.target.value }))}
                                        />
                                    </LabeledField>
                                </div>
                            </div>
                            {!canManageClients && (
                                <p className="text-xs text-text-muted">
                                    Chỉ Admin/Quản lý/Nhân sự được quản lý khách hàng.
                                </p>
                            )}
                            <div className="flex items-center gap-3">
                                <button
                                    type="submit"
                                    className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold"
                                >
                                    {editingClientId ? 'Cập nhật khách hàng' : 'Tạo khách hàng'}
                                </button>
                                <button
                                    type="button"
                                    className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold"
                                    onClick={closeClientForm}
                                >
                                    Hủy
                                </button>
                            </div>
                        </form>
                    </Modal>
                </>
            )}

            {activeTab === 'payments' && (
                <>
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
                            <h3 className="font-semibold">Danh sách thanh toán</h3>
                            <div className="flex gap-2 flex-wrap">
                                {canManagePayments && (
                                    <button
                                        type="button"
                                        className="rounded-xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                                        onClick={openPaymentCreate}
                                    >
                                        Thêm mới
                                    </button>
                                )}
                                <select
                                    className="rounded-xl border border-slate-200/80 px-3 py-2 text-sm"
                                    value={paymentFilters.status}
                                    onChange={(e) => setPaymentFilters((s) => ({ ...s, status: e.target.value }))}
                                >
                                    <option value="">Tất cả trạng thái</option>
                                    <option value="pending">Đang chờ</option>
                                    <option value="paid">Đã thanh toán</option>
                                    <option value="overdue">Quá hạn</option>
                                </select>
                                <button
                                    type="button"
                                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                                    onClick={() => fetchPayments(1, paymentFilters)}
                                >
                                    Lọc
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-wider text-text-subtle border-b border-slate-200">
                                        <th className="py-2">Khách hàng</th>
                                        <th className="py-2">Số tiền</th>
                                        <th className="py-2">Hạn</th>
                                        <th className="py-2">Trạng thái</th>
                                        <th className="py-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.map((payment) => (
                                        <tr key={payment.id} className="border-b border-slate-100">
                                            <td className="py-2 font-medium text-slate-900">{payment.client?.name || '—'}</td>
                                            <td className="py-2 text-slate-700">
                                                {Number(payment.amount || 0).toLocaleString('vi-VN')}
                                            </td>
                                            <td className="py-2 text-xs text-text-muted">
                                                {payment.due_date ? payment.due_date.slice(0, 10) : '—'}
                                            </td>
                                            <td className="py-2">
                                                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                                                    {payment.status}
                                                </span>
                                            </td>
                                            <td className="py-2 text-right">
                                                {(canManagePayments || canDeletePayments) ? (
                                                    <Dropdown>
                                                        <Dropdown.Trigger>
                                                            <button
                                                                type="button"
                                                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                                                aria-label="Thao tác thanh toán"
                                                            >
                                                                <AppIcon name="ellipsis-horizontal" className="h-4 w-4" />
                                                            </button>
                                                        </Dropdown.Trigger>
                                                        <Dropdown.Content align="right" width="48" contentClasses="py-2 bg-white rounded-2xl border border-slate-200 shadow-xl">
                                                            {canManagePayments && (
                                                                <button
                                                                    type="button"
                                                                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                                                    onClick={() => editPayment(payment)}
                                                                >
                                                                    <AppIcon name="pencil" className="h-4 w-4 text-slate-400" />
                                                                    Sửa thanh toán
                                                                </button>
                                                            )}
                                                            {canDeletePayments && (
                                                                <button
                                                                    type="button"
                                                                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                                                                    onClick={() => deletePayment(payment.id)}
                                                                >
                                                                    <AppIcon name="trash" className="h-4 w-4" />
                                                                    Xóa thanh toán
                                                                </button>
                                                            )}
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
                                            <td className="py-6 text-center text-sm text-text-muted" colSpan={5}>
                                                Chưa có thanh toán nào.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <Modal
                        open={showPaymentForm}
                        onClose={closePaymentForm}
                        title={editingPaymentId ? `Sửa thanh toán #${editingPaymentId}` : 'Tạo thanh toán'}
                        description="Ghi nhận thanh toán và trạng thái công nợ."
                        size="md"
                    >
                        <form className="space-y-3 text-sm" onSubmit={submitPayment}>
                            <LabeledField label="Khách hàng" required>
                                <select
                                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                    value={paymentForm.client_id}
                                    onChange={(e) => setPaymentForm((s) => ({ ...s, client_id: e.target.value }))}
                                >
                                    <option value="">Chọn khách hàng *</option>
                                    {clients.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name} {c.company ? `(${c.company})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </LabeledField>
                            <LabeledField label="Số tiền" required>
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                    type="number"
                                    placeholder="Nhập số tiền cần ghi nhận"
                                    value={paymentForm.amount}
                                    onChange={(e) => setPaymentForm((s) => ({ ...s, amount: e.target.value }))}
                                />
                            </LabeledField>
                            <LabeledField label="Trạng thái thanh toán">
                                <select
                                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                    value={paymentForm.status}
                                    onChange={(e) => setPaymentForm((s) => ({ ...s, status: e.target.value }))}
                                >
                                    <option value="pending">Đang chờ</option>
                                    <option value="paid">Đã thanh toán</option>
                                    <option value="overdue">Quá hạn</option>
                                </select>
                            </LabeledField>
                            <LabeledField label="Hạn thanh toán">
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                    type="date"
                                    value={paymentForm.due_date}
                                    onChange={(e) => setPaymentForm((s) => ({ ...s, due_date: e.target.value }))}
                                />
                            </LabeledField>
                            <LabeledField label="Số hóa đơn">
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                    placeholder="Điền nếu có xuất hóa đơn"
                                    value={paymentForm.invoice_no}
                                    onChange={(e) => setPaymentForm((s) => ({ ...s, invoice_no: e.target.value }))}
                                />
                            </LabeledField>
                            <LabeledField label="Ghi chú">
                                <textarea
                                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                    rows={3}
                                    placeholder="Thêm ghi chú thu tiền, chứng từ hoặc lưu ý nội bộ"
                                    value={paymentForm.note}
                                    onChange={(e) => setPaymentForm((s) => ({ ...s, note: e.target.value }))}
                                />
                            </LabeledField>
                            {!canManagePayments && (
                                <p className="text-xs text-text-muted">
                                    Chỉ Admin/Kế toán được quản lý thanh toán.
                                </p>
                            )}
                            <div className="flex items-center gap-3">
                                <button
                                    type="submit"
                                    className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold"
                                >
                                    {editingPaymentId ? 'Cập nhật thanh toán' : 'Tạo thanh toán'}
                                </button>
                                <button
                                    type="button"
                                    className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold"
                                    onClick={closePaymentForm}
                                >
                                    Hủy
                                </button>
                            </div>
                        </form>
                    </Modal>
                </>
            )}

            <Modal
                open={showClientImport}
                onClose={() => setShowClientImport(false)}
                title="Import khách hàng"
                description="Tải file Excel (.xls/.xlsx/.csv) để nhập khách hàng."
                size="md"
            >
                <form className="space-y-3 text-sm" onSubmit={submitClientImport}>
                    <LabeledField
                        label="File khách hàng"
                        required
                        hint="Hỗ trợ Excel hoặc CSV. Hệ thống sẽ tự nối theo mã khách, email, số điện thoại hoặc tên để tránh trùng dữ liệu."
                    >
                        <div className="rounded-2xl border border-dashed border-slate-200/80 p-4 text-center">
                            <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                                onClick={() => window.open('/api/v1/imports/clients/template', '_blank', 'noopener,noreferrer')}
                            >
                                Tải file mẫu
                            </button>
                            <input
                                id="import-client-file"
                                type="file"
                                accept=".xls,.xlsx,.csv"
                                onChange={(e) => setClientImportFile(e.target.files?.[0] || null)}
                                className="hidden"
                            />
                            <label
                                htmlFor="import-client-file"
                                className="mt-3 inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                                Chọn file
                            </label>
                            <p className="text-xs text-text-muted mt-2">
                                {clientImportFile ? clientImportFile.name : 'Chưa chọn file'}
                            </p>
                        </div>
                    </LabeledField>
                    <div className="flex items-center gap-2">
                        <button
                            type="submit"
                            className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold"
                            disabled={importingClients}
                        >
                            {importingClients ? 'Đang import...' : 'Import'}
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold"
                            onClick={() => setShowClientImport(false)}
                        >
                            Hủy
                        </button>
                    </div>
                </form>
            </Modal>
        </PageContainer>
    );
}
