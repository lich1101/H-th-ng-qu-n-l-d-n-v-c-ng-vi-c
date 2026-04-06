import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import FilterToolbar, { FilterActionGroup, FilterField, filterControlClass } from '@/Components/FilterToolbar';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import AppIcon from '@/Components/AppIcon';
import PaginationControls from '@/Components/PaginationControls';
import TagMultiSelect from '@/Components/TagMultiSelect';
import { useToast } from '@/Contexts/ToastContext';
import { formatVietnamDate } from '@/lib/vietnamTime';

const badgeStyle = (hex) => ({
    borderColor: hex,
    color: hex,
    backgroundColor: `${hex}20`,
});

const parseProductCategories = (rawValue) => {
    if (!rawValue) return [];
    if (Array.isArray(rawValue)) {
        return rawValue.map((item) => String(item || '').trim()).filter(Boolean);
    }

    const text = String(rawValue || '').trim();
    if (!text) return [];

    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
            return parsed.map((item) => String(item || '').trim()).filter(Boolean);
        }
    } catch {
        // ignore parsing error and fallback to delimiter split
    }

    return text
        .split(/[,;\n|]/)
        .map((item) => item.trim())
        .filter(Boolean);
};

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
    const userName = props?.auth?.user?.name || 'Nhân sự';
    const userDepartmentId = props?.auth?.user?.department_id || null;
    const isManager = userRole === 'quan_ly';
    const isAdminRole = ['admin', 'administrator'].includes(userRole);
    const canFilterByStaff = ['admin', 'administrator', 'quan_ly', 'nhan_vien', 'ke_toan'].includes(userRole);
    const canManageClients = ['admin', 'quan_ly', 'nhan_vien'].includes(userRole);
    const canManagePayments = ['admin', 'ke_toan'].includes(userRole);
    const canDeleteClients = userRole === 'admin';
    const canDeletePayments = userRole === 'admin';
    const canAssignClientOwner = ['admin', 'quan_ly'].includes(userRole);
    const canBulkClientActions = canManageClients || canDeleteClients;

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
    const [selectedClientIds, setSelectedClientIds] = useState([]);
    const [bulkLoading, setBulkLoading] = useState(false);
    const clientTableRef = useRef(null);
    const [bulkForm, setBulkForm] = useState({
        lead_type_id: '',
        assigned_staff_id: '',
    });
    const [clientFilters, setClientFilters] = useState({
        search: '',
        per_page: 10,
        lead_type_id: '',
        type: '',
        revenue_tier_id: '',
        assigned_department_id: '',
        assigned_staff_id: '',
        sort_by: 'last_activity_at',
        sort_dir: 'desc',
    });
    const [paymentFilters, setPaymentFilters] = useState({ status: '', per_page: 10 });
    const [editingClientId, setEditingClientId] = useState(null);
    const [editingPaymentId, setEditingPaymentId] = useState(null);
    const [showClientForm, setShowClientForm] = useState(false);
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [submittingClient, setSubmittingClient] = useState(false);
    const [submittingPayment, setSubmittingPayment] = useState(false);
    const [showClientImport, setShowClientImport] = useState(false);
    const [clientImportFile, setClientImportFile] = useState(null);
    const [importingClients, setImportingClients] = useState(false);
    const [clientImportReport, setClientImportReport] = useState(null);
    const [clientImportJob, setClientImportJob] = useState(null);
    const [clientForm, setClientForm] = useState({
        name: '',
        company: '',
        email: '',
        phone: '',
        notes: '',
        sales_owner_id: '',
        assigned_department_id: '',
        assigned_staff_id: '',
        care_staff_ids: [],
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

    const normalizeCareStaffIds = (rawValue) => (
        Array.isArray(rawValue)
            ? rawValue
                .map((item) => Number(item?.id ?? item))
                .filter((id) => Number.isInteger(id) && id > 0)
            : []
    );

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
        if (!canFilterByStaff) return;
        try {
            const res = await axios.get('/api/v1/users/lookup', {
                params: { purpose: 'operational_assignee' },
            });
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
                    sort_by: filtersArg.sort_by || 'last_activity_at',
                    sort_dir: filtersArg.sort_dir || 'desc',
                },
            });
            const resolvedPage = clientsRes.data.current_page || 1;
            const rows = clientsRes.data.data || [];
            setClients(rows);
            setClientMeta({
                current_page: resolvedPage,
                last_page: clientsRes.data.last_page || 1,
                total: clientsRes.data.total || 0,
            });
            setClientPage(resolvedPage);
            setSelectedClientIds((prev) => {
                const visible = new Set(rows.map((row) => Number(row.id)));
                return prev.filter((id) => visible.has(Number(id)));
            });
        } catch (error) {
            toast.error(getErrorMessage(error, 'Không tải được danh sách khách hàng.'));
        }
    };

    const handleClientSearch = (val) => {
        const next = { ...clientFilters, search: val };
        setClientFilters(next);
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
            setClientImportJob(res.data?.job || null);
            setClientImportReport(null);
            toast.success('Đã đưa file import khách hàng vào hàng đợi xử lý.');
        } catch (error) {
            const validationMessages = extractValidationMessages(error);
            const fallbackMessage = getErrorMessage(error, 'Import thất bại.');
            setClientImportJob(null);
            setImportingClients(false);
            setClientImportReport({
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
        if (!showClientImport || !clientImportJob?.id) return undefined;

        const poll = async () => {
            try {
                const res = await axios.get(`/api/v1/imports/jobs/${clientImportJob.id}`);
                const nextJob = res.data || null;
                setClientImportJob(nextJob);

                if (nextJob?.status === 'completed') {
                    window.clearInterval(timer);
                    const report = nextJob.report || {};
                    setImportingClients(false);
                    setClientImportReport(report);
                    toast.success(
                        `Import hoàn tất: ${report.created || 0} tạo mới, ${report.updated || 0} cập nhật, ${report.skipped || 0} bỏ qua.`
                    );
                    await fetchClients(1, clientFilters);
                } else if (nextJob?.status === 'failed') {
                    window.clearInterval(timer);
                    setImportingClients(false);
                    setClientImportReport(nextJob.report || {
                        created: 0,
                        updated: 0,
                        skipped: 0,
                        warnings: [],
                        errors: [{ row: '-', message: nextJob.error_message || 'Import thất bại.' }],
                    });
                    toast.error(nextJob?.error_message || 'Import thất bại.');
                }
            } catch (error) {
                setImportingClients(false);
                toast.error(getErrorMessage(error, 'Không kiểm tra được tiến trình import khách hàng.'));
            }
        };

        const timer = window.setInterval(poll, 1500);
        poll();

        return () => window.clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showClientImport, clientImportJob?.id]);

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

    useEffect(() => {
        if (userRole !== 'nhan_vien' || !userId) return;
        setClientFilters((prev) => {
            if (String(prev.assigned_staff_id || '') === String(userId)) {
                return prev;
            }
            return {
                ...prev,
                assigned_staff_id: String(userId),
            };
        });
    }, [userRole, userId]);

    useEffect(() => {
        const table = clientTableRef.current;
        if (!table) return undefined;

        const handleRemoteSort = (event) => {
            const sortBy = String(event?.detail?.sortBy || '').trim();
            const sortDir = String(event?.detail?.sortDir || '').toLowerCase() === 'asc' ? 'asc' : 'desc';
            if (!sortBy) return;

            const nextFilters = {
                ...clientFilters,
                sort_by: sortBy,
                sort_dir: sortDir,
            };
            setClientFilters(nextFilters);
            fetchClients(1, nextFilters);
        };

        table.addEventListener('table:remote-sort', handleRemoteSort);
        return () => {
            table.removeEventListener('table:remote-sort', handleRemoteSort);
        };
    }, [clientFilters]);

    const submitClient = async (e) => {
        e.preventDefault();
        if (submittingClient) {
            return;
        }
        if (!canManageClients) {
            toast.error('Bạn không có quyền quản lý khách hàng.');
            return;
        }
        setSubmittingClient(true);
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
                care_staff_ids: normalizeCareStaffIds(clientForm.care_staff_ids),
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
        } finally {
            setSubmittingClient(false);
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
            care_staff_ids: normalizeCareStaffIds(client.care_staff_users || []),
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
            care_staff_ids: [],
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
        setSubmittingClient(false);
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

    const buildClientPayload = (client, overrides = {}) => {
        const assignedStaffId = client.assigned_staff_id ? Number(client.assigned_staff_id) : null;
        const salesOwnerId = client.sales_owner_id ? Number(client.sales_owner_id) : assignedStaffId;
        return {
            name: client.name || '',
            company: client.company || null,
            email: client.email || null,
            phone: client.phone || null,
            notes: client.notes || null,
            sales_owner_id: salesOwnerId,
            assigned_department_id: client.assigned_department_id ? Number(client.assigned_department_id) : null,
            assigned_staff_id: assignedStaffId,
            care_staff_ids: normalizeCareStaffIds(client.care_staff_users || []),
            lead_type_id: client.lead_type_id ? Number(client.lead_type_id) : null,
            lead_source: client.lead_source || null,
            lead_channel: client.lead_channel || null,
            lead_message: client.lead_message || null,
            ...overrides,
        };
    };

    const selectedClientSet = useMemo(
        () => new Set(selectedClientIds.map((id) => Number(id))),
        [selectedClientIds]
    );

    const visibleClientIds = useMemo(
        () => clients.map((client) => Number(client.id)).filter((id) => id > 0),
        [clients]
    );

    const selectedClients = useMemo(
        () => clients.filter((client) => selectedClientSet.has(Number(client.id))),
        [clients, selectedClientSet]
    );

    const allVisibleSelected = visibleClientIds.length > 0
        && visibleClientIds.every((id) => selectedClientSet.has(id));

    const toggleClientSelect = (id) => {
        const numericId = Number(id);
        setSelectedClientIds((prev) => (
            prev.includes(numericId)
                ? prev.filter((item) => Number(item) !== numericId)
                : [...prev, numericId]
        ));
    };

    const toggleSelectAllVisibleClients = () => {
        if (allVisibleSelected) {
            setSelectedClientIds((prev) => (
                prev.filter((id) => !visibleClientIds.includes(Number(id)))
            ));
            return;
        }

        setSelectedClientIds((prev) => {
            const merged = new Set(prev.map((id) => Number(id)));
            visibleClientIds.forEach((id) => merged.add(Number(id)));
            return Array.from(merged);
        });
    };

    const runBulkClientUpdate = async (overrides, successLabel) => {
        if (!selectedClients.length) {
            toast.error('Vui lòng chọn ít nhất 1 khách hàng.');
            return;
        }
        setBulkLoading(true);
        try {
            const results = await Promise.allSettled(
                selectedClients.map((client) => axios.put(
                    `/api/v1/crm/clients/${client.id}`,
                    buildClientPayload(client, overrides)
                ))
            );
            const success = results.filter((result) => result.status === 'fulfilled').length;
            const failed = results.length - success;

            if (success > 0) {
                await fetchClients(clientPage);
                toast.success(`${success} khách hàng đã được ${successLabel}.`);
            }
            if (failed > 0) {
                toast.error(`${failed} khách hàng xử lý thất bại. Kiểm tra quyền hoặc dữ liệu.`);
            }

            setSelectedClientIds([]);
        } finally {
            setBulkLoading(false);
        }
    };

    const bulkApplyLeadType = async () => {
        if (!bulkForm.lead_type_id) {
            toast.error('Chọn trạng thái lead để áp dụng.');
            return;
        }
        await runBulkClientUpdate(
            { lead_type_id: Number(bulkForm.lead_type_id) },
            'cập nhật trạng thái lead'
        );
    };

    const bulkAssignStaff = async () => {
        if (!bulkForm.assigned_staff_id) {
            toast.error('Chọn nhân sự phụ trách để áp dụng.');
            return;
        }
        const user = staffUsers.find((item) => Number(item.id) === Number(bulkForm.assigned_staff_id));
        const deptId = user?.department_id ? Number(user.department_id) : null;
        await runBulkClientUpdate(
            {
                assigned_staff_id: Number(bulkForm.assigned_staff_id),
                assigned_department_id: deptId,
                sales_owner_id: Number(bulkForm.assigned_staff_id),
            },
            'gán phụ trách'
        );
    };

    const bulkDeleteClients = async () => {
        if (!canDeleteClients) {
            toast.error('Bạn không có quyền xóa khách hàng.');
            return;
        }
        if (!selectedClients.length) {
            toast.error('Vui lòng chọn ít nhất 1 khách hàng.');
            return;
        }
        if (!window.confirm(`Xóa ${selectedClients.length} khách hàng đã chọn?`)) {
            return;
        }

        setBulkLoading(true);
        try {
            const results = await Promise.allSettled(
                selectedClients.map((client) => axios.delete(`/api/v1/crm/clients/${client.id}`))
            );
            const success = results.filter((result) => result.status === 'fulfilled').length;
            const failed = results.length - success;

            if (success > 0) {
                await fetchClients(clientPage);
                toast.success(`Đã xóa ${success} khách hàng.`);
            }
            if (failed > 0) {
                toast.error(`${failed} khách hàng xóa thất bại.`);
            }

            setSelectedClientIds([]);
        } finally {
            setBulkLoading(false);
        }
    };

    const submitPayment = async (e) => {
        e.preventDefault();
        if (submittingPayment) {
            return;
        }
        if (!canManagePayments) return toast.error('Bạn không có quyền quản lý thanh toán.');
        setSubmittingPayment(true);
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
        } finally {
            setSubmittingPayment(false);
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
        setSubmittingPayment(false);
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

    const careStaffOptions = useMemo(() => {
        return staffUsers.map((user) => ({
            id: Number(user.id || 0),
            label: user.name || 'Nhân sự',
            meta: user.department_id
                ? (visibleDepartmentOptions.find((dept) => Number(dept.id) === Number(user.department_id))?.name || user.role || '')
                : (user.role || ''),
        })).filter((user) => user.id > 0);
    }, [staffUsers, visibleDepartmentOptions]);

    const clientResponsibleStaffOptions = useMemo(() => {
        const departmentId = Number(clientFilters.assigned_department_id || 0);
        const scopedUsers = staffUsers.length > 0
            ? staffUsers
            : (userRole === 'nhan_vien' && userId
                ? [{
                    id: Number(userId),
                    name: userName,
                    department_id: userDepartmentId,
                }]
                : []);

        return scopedUsers
            .filter((user) => {
                if (!departmentId) return true;
                return Number(user.department_id || 0) === departmentId;
            })
            .map((user) => ({
                id: Number(user.id || 0),
                name: user.name || 'Nhân sự',
                departmentName: user.department_id
                    ? (visibleDepartmentOptions.find((dept) => Number(dept.id) === Number(user.department_id))?.name || '')
                    : '',
            }))
            .filter((user) => user.id > 0);
    }, [
        clientFilters.assigned_department_id,
        staffUsers,
        visibleDepartmentOptions,
        userRole,
        userId,
        userName,
        userDepartmentId,
    ]);

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
                        {(canManageClients) && (
                            <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
                                <button
                                    type="button"
                                    className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm"
                                    onClick={openClientCreate}
                                >
                                    Thêm mới
                                </button>
                                <button
                                    type="button"
                                    className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                                    onClick={() => {
                                        setClientImportReport(null);
                                        setClientImportFile(null);
                                        setShowClientImport(true);
                                    }}
                                >
                                    Import Excel
                                </button>
                            </div>
                        )}
                        <FilterToolbar enableSearch
                            className="mb-4 border-0 p-0 shadow-none"
                            title="Danh sách khách hàng"
                            description="Lọc theo tên, loại lead và nhóm khách trước khi thao tác CRM hoặc phân công phụ trách."
                            searchValue={clientFilters.search}
                            onSearch={handleClientSearch}
                        >
                            <div className={`grid gap-3 ${isAdminRole ? 'md:grid-cols-2 xl:grid-cols-6' : 'md:grid-cols-2 xl:grid-cols-5'}`}>
                                <FilterField label="Trạng thái lead">
                                    <select
                                        className={filterControlClass}
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
                                </FilterField>
                                <FilterField label="Nhóm khách">
                                    <select
                                        className={filterControlClass}
                                        value={clientFilters.type}
                                        onChange={(e) => setClientFilters((s) => ({ ...s, type: e.target.value }))}
                                    >
                                        <option value="">Tất cả nhóm</option>
                                        <option value="potential">Tiềm năng</option>
                                        <option value="active">Đã mua</option>
                                    </select>
                                </FilterField>
                                <FilterField label="Hạng khách hàng">
                                    <select
                                        className={filterControlClass}
                                        value={clientFilters.revenue_tier_id}
                                        onChange={(e) => setClientFilters((s) => ({ ...s, revenue_tier_id: e.target.value }))}
                                    >
                                        <option value="">Tất cả hạng</option>
                                        {revenueTiers.map((tier) => (
                                            <option key={tier.id} value={tier.id}>
                                                {tier.label}
                                            </option>
                                        ))}
                                    </select>
                                </FilterField>
                                {isAdminRole && (
                                    <FilterField label="Phòng ban phụ trách">
                                        <select
                                            className={filterControlClass}
                                            value={clientFilters.assigned_department_id}
                                            onChange={(e) => setClientFilters((s) => ({
                                                ...s,
                                                assigned_department_id: e.target.value,
                                                assigned_staff_id: '',
                                            }))}
                                        >
                                            <option value="">Tất cả phòng ban</option>
                                            {visibleDepartmentOptions.map((dept) => (
                                                <option key={dept.id} value={dept.id}>
                                                    {dept.name}
                                                </option>
                                            ))}
                                        </select>
                                    </FilterField>
                                )}
                                {canFilterByStaff && (
                                    <FilterField label="Nhân sự phụ trách">
                                        <select
                                            className={filterControlClass}
                                            value={clientFilters.assigned_staff_id}
                                            onChange={(e) => setClientFilters((s) => ({ ...s, assigned_staff_id: e.target.value }))}
                                        >
                                            <option value="">
                                                {userRole === 'nhan_vien' ? 'Chính tôi' : 'Tất cả nhân sự phụ trách'}
                                            </option>
                                            {clientResponsibleStaffOptions.map((user) => (
                                                <option key={user.id} value={user.id}>
                                                    {user.name}{user.departmentName ? ` • ${user.departmentName}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </FilterField>
                                )}
                                <FilterActionGroup className="md:col-span-2 xl:col-span-1 xl:self-end xl:justify-end">
                                    <button
                                        type="button"
                                        className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                                        onClick={() => fetchClients(1, clientFilters)}
                                    >
                                        Lọc
                                    </button>
                                </FilterActionGroup>
                            </div>
                        </FilterToolbar>
                        <div className="mb-4 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                            {isAdminRole
                                ? 'Bạn đang ở chế độ xem toàn bộ khách hàng. Có thể phân công khách cho mọi phòng ban và nhân sự.'
                                : isManager
                                    ? 'Bạn chỉ nhìn thấy khách hàng của nhân sự trong phòng ban mình quản lý, và có thể giao lại trong phạm vi phòng ban đó.'
                                    : 'Bạn chỉ nhìn thấy khách hàng do chính mình phụ trách. Khi thêm khách mới, hệ thống sẽ tự gắn khách cho bạn.'}
                        </div>
                        {canBulkClientActions && selectedClientIds.length > 0 && (
                            <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                    <span className="font-semibold text-slate-900">
                                        Đã chọn {selectedClientIds.length} khách hàng
                                    </span>
                                    <button
                                        type="button"
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                                        onClick={() => setSelectedClientIds([])}
                                        disabled={bulkLoading}
                                    >
                                        Bỏ chọn
                                    </button>
                                </div>
                                <div className="mt-3 grid gap-2 xl:grid-cols-[minmax(0,0.9fr)_auto_minmax(0,1fr)_auto_auto]">
                                    {canManageClients && (
                                        <select
                                            className={filterControlClass}
                                            value={bulkForm.lead_type_id}
                                            onChange={(e) => setBulkForm((s) => ({ ...s, lead_type_id: e.target.value }))}
                                            disabled={bulkLoading}
                                        >
                                            <option value="">Áp dụng trạng thái lead...</option>
                                            {leadTypes.map((type) => (
                                                <option key={type.id} value={type.id}>
                                                    {type.name}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    {canManageClients && (
                                        <button
                                            type="button"
                                            className="rounded-2xl border border-slate-200/80 bg-white px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
                                            onClick={bulkApplyLeadType}
                                            disabled={bulkLoading}
                                        >
                                            Cập nhật lead
                                        </button>
                                    )}
                                    {canAssignClientOwner && (
                                        <select
                                            className={filterControlClass}
                                            value={bulkForm.assigned_staff_id}
                                            onChange={(e) => setBulkForm((s) => ({ ...s, assigned_staff_id: e.target.value }))}
                                            disabled={bulkLoading}
                                        >
                                            <option value="">Gán nhân sự phụ trách...</option>
                                            {staffUsers.map((user) => (
                                                <option key={user.id} value={user.id}>
                                                    {user.name}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    {canAssignClientOwner && (
                                        <button
                                            type="button"
                                            className="rounded-2xl border border-slate-200/80 bg-white px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
                                            onClick={bulkAssignStaff}
                                            disabled={bulkLoading}
                                        >
                                            Gán phụ trách
                                        </button>
                                    )}
                                    {canDeleteClients && (
                                        <button
                                            type="button"
                                            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 disabled:opacity-60"
                                            onClick={bulkDeleteClients}
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
                                ref={clientTableRef}
                                data-sort-scope="remote"
                                data-sort-by={clientFilters.sort_by || 'last_activity_at'}
                                data-sort-dir={clientFilters.sort_dir || 'desc'}
                                className="table-spacious min-w-full text-sm"
                            >
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-wider text-text-subtle border-b border-slate-200">
                                        {canBulkClientActions && (
                                            <th className="py-2 pr-2 w-10" data-az-ignore>
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-slate-300 text-primary focus:ring-primary/20"
                                                    checked={allVisibleSelected}
                                                    onChange={toggleSelectAllVisibleClients}
                                                    aria-label="Chọn tất cả khách hàng trang hiện tại"
                                                />
                                            </th>
                                        )}
                                        <th className="py-2" data-sort-key="name">Khách hàng</th>
                                        <th className="py-2" data-sort-key="phone">SĐT</th>
                                        <th className="py-2" data-sort-key="lead_type">Trạng thái</th>
                                        <th className="py-2" data-sort-key="revenue_tier">Hạng</th>
                                        <th className="py-2" data-sort-key="department">Phòng ban</th>
                                        <th className="py-2" data-sort-key="assigned_staff">Phụ trách</th>
                                        <th className="py-2" data-sort-key="care_staff">Chăm sóc</th>
                                        <th className="py-2" data-sort-key="created_at">Ngày tạo</th>
                                        <th className="py-2" data-sort-key="product_categories">Danh mục sản phẩm</th>
                                        <th className="py-2" data-sort-key="notes">Ghi chú</th>
                                        <th className="py-2" data-sort-key="total_revenue">Doanh số lũy kế</th>
                                        <th className="py-2" data-sort-key="total_debt_amount">Công nợ</th>
                                        <th className="py-2" data-sort-key="opportunities_count">Số cơ hội</th>
                                        <th className="py-2" data-sort-key="contracts_count">Số hợp đồng</th>
                                        <th className="py-2" data-sort-key="lead_source">Nguồn</th>
                                        <th className="py-2" data-az-ignore></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {clients.map((client) => (
                                        <tr
                                            key={client.id}
                                            className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${selectedClientSet.has(Number(client.id)) ? 'bg-primary/5' : ''}`}
                                            onClick={() => {
                                                window.location.href = route('crm.flow', client.id);
                                            }}
                                        >
                                            {canBulkClientActions && (
                                                <td className="py-2 pr-2 align-top">
                                                    <input
                                                        type="checkbox"
                                                        className="mt-1 rounded border-slate-300 text-primary focus:ring-primary/20"
                                                        checked={selectedClientSet.has(Number(client.id))}
                                                        onChange={() => toggleClientSelect(client.id)}
                                                        onClick={(event) => event.stopPropagation()}
                                                        aria-label={`Chọn khách hàng ${client.name}`}
                                                    />
                                                </td>
                                            )}
                                            <td className="py-2">
                                                <button
                                                    type="button"
                                                    className="text-left"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        window.location.href = route('crm.flow', client.id);
                                                    }}
                                                    title="Mở chi tiết khách hàng"
                                                >
                                                    <div className="font-medium text-primary hover:underline">{client.name}</div>
                                                    <div className="text-xs text-text-muted">{client.company || '—'}</div>
                                                </button>
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
                                            <td className="py-2 text-xs text-text-muted">
                                                {Array.isArray(client.care_staff_users) && client.care_staff_users.length > 0
                                                    ? client.care_staff_users.map((item) => item?.name).filter(Boolean).slice(0, 2).join(', ')
                                                        + (client.care_staff_users.length > 2 ? ` +${client.care_staff_users.length - 2}` : '')
                                                    : '—'}
                                            </td>
                                            <td className="py-2 text-xs text-text-muted">
                                                {formatVietnamDate(client.created_at)}
                                            </td>
                                            <td className="allow-wrap py-2 text-xs text-text-muted">
                                                {(() => {
                                                    const categories = parseProductCategories(client.product_categories);
                                                    if (categories.length === 0) return '—';
                                                    return categories.slice(0, 2).join(', ') + (categories.length > 2 ? ` +${categories.length - 2}` : '');
                                                })()}
                                            </td>
                                            <td className="allow-wrap py-2 text-xs text-text-muted">
                                                {client.notes ? client.notes : '—'}
                                            </td>
                                            <td className="py-2 text-slate-700">
                                                {Number(client.total_revenue || 0).toLocaleString('vi-VN')}
                                            </td>
                                            <td className="py-2 text-slate-700">
                                                {Number(client.total_debt_amount || 0).toLocaleString('vi-VN')}
                                            </td>
                                            <td className="py-2 text-xs font-semibold text-slate-700">
                                                {Number(client.opportunities_count || 0)}
                                            </td>
                                            <td className="py-2 text-xs font-semibold text-slate-700">
                                                {Number(client.contracts_count || 0)}
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
                                                    {canManageClients && (
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                editClient(client);
                                                            }}
                                                            title="Sửa khách hàng"
                                                        >
                                                            <AppIcon name="pencil" className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                    {canDeleteClients && (
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 text-rose-600 hover:bg-rose-50"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                deleteClient(client.id);
                                                            }}
                                                            title="Xóa khách hàng"
                                                        >
                                                            <AppIcon name="trash" className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {clients.length === 0 && (
                                        <tr>
                                            <td className="py-6 text-center text-sm text-text-muted" colSpan={canBulkClientActions ? 17 : 16}>
                                                Chưa có khách hàng nào.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <PaginationControls
                            page={clientMeta.current_page}
                            lastPage={clientMeta.last_page}
                            total={clientMeta.total}
                            perPage={clientFilters.per_page}
                            label="khách hàng"
                            onPageChange={(page) => fetchClients(page, clientFilters)}
                            onPerPageChange={(perPage) => {
                                const next = { ...clientFilters, per_page: perPage };
                                setClientFilters(next);
                                fetchClients(1, next);
                            }}
                        />
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
                                        <LabeledField
                                            label="Danh sách nhân viên chăm sóc"
                                            hint="Nhóm này chỉ có quyền xem thông tin khách hàng, hợp đồng, dự án, công việc và thêm ghi chú chăm sóc."
                                            className={isAdminRole ? 'md:col-span-2' : ''}
                                        >
                                            <TagMultiSelect
                                                options={careStaffOptions}
                                                selectedIds={clientForm.care_staff_ids}
                                                addPlaceholder="Thêm nhân viên chăm sóc"
                                                emptyLabel="Chưa thêm nhân viên chăm sóc nào."
                                                onChange={(selectedIds) => {
                                                    setClientForm((s) => ({ ...s, care_staff_ids: selectedIds }));
                                                }}
                                            />
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
                                    disabled={submittingClient}
                                >
                                    {submittingClient
                                        ? (editingClientId ? 'Đang cập nhật...' : 'Đang tạo...')
                                        : (editingClientId ? 'Cập nhật khách hàng' : 'Tạo khách hàng')}
                                </button>
                                <button
                                    type="button"
                                    className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold"
                                    onClick={closeClientForm}
                                    disabled={submittingClient}
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
                        {canManagePayments && (
                            <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
                                <button
                                    type="button"
                                    className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm"
                                    onClick={openPaymentCreate}
                                >
                                    Thêm mới
                                </button>
                            </div>
                        )}
                        <FilterToolbar enableSearch
                            className="mb-4 border-0 p-0 shadow-none"
                            title="Danh sách thanh toán"
                            description="Lọc nhanh trạng thái thanh toán để theo dõi công nợ và nhắc hạn dễ hơn."
                        >
                            <div className="grid gap-3 xl:grid-cols-[minmax(0,0.85fr)_auto]">
                                <FilterField label="Trạng thái thanh toán">
                                    <select
                                        className={filterControlClass}
                                        value={paymentFilters.status}
                                        onChange={(e) => setPaymentFilters((s) => ({ ...s, status: e.target.value }))}
                                    >
                                        <option value="">Tất cả trạng thái</option>
                                        <option value="pending">Đang chờ</option>
                                        <option value="paid">Đã thanh toán</option>
                                        <option value="overdue">Quá hạn</option>
                                    </select>
                                </FilterField>
                                <FilterActionGroup className="xl:self-end xl:justify-end">
                                    <button
                                        type="button"
                                        className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                                        onClick={() => fetchPayments(1, paymentFilters)}
                                    >
                                        Lọc
                                    </button>
                                </FilterActionGroup>
                            </div>
                        </FilterToolbar>
                        <div className="overflow-x-auto">
                            <table className="table-spacious min-w-full text-sm">
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
                                                    <div className="flex items-center justify-end gap-2">
                                                        {canManagePayments && (
                                                            <button
                                                                type="button"
                                                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                                                                onClick={() => editPayment(payment)}
                                                                title="Sửa thanh toán"
                                                            >
                                                                <AppIcon name="pencil" className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                        {canDeletePayments && (
                                                            <button
                                                                type="button"
                                                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 text-rose-600 hover:bg-rose-50"
                                                                onClick={() => deletePayment(payment.id)}
                                                                title="Xóa thanh toán"
                                                            >
                                                                <AppIcon name="trash" className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                    </div>
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
                        <PaginationControls
                            page={paymentMeta.current_page}
                            lastPage={paymentMeta.last_page}
                            total={paymentMeta.total}
                            perPage={paymentFilters.per_page}
                            label="thanh toán"
                            onPageChange={(page) => fetchPayments(page, paymentFilters)}
                            onPerPageChange={(perPage) => {
                                const next = { ...paymentFilters, per_page: perPage };
                                setPaymentFilters(next);
                                fetchPayments(1, next);
                            }}
                        />
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
                                    disabled={submittingPayment}
                                >
                                    {submittingPayment
                                        ? (editingPaymentId ? 'Đang cập nhật...' : 'Đang tạo...')
                                        : (editingPaymentId ? 'Cập nhật thanh toán' : 'Tạo thanh toán')}
                                </button>
                                <button
                                    type="button"
                                    className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold"
                                    onClick={closePaymentForm}
                                    disabled={submittingPayment}
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
                onClose={() => {
                    setShowClientImport(false);
                    setClientImportFile(null);
                    setClientImportReport(null);
                    setClientImportJob(null);
                }}
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
                                onChange={(e) => {
                                    setClientImportFile(e.target.files?.[0] || null);
                                    setClientImportReport(null);
                                }}
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
                    {clientImportReport && (
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3 space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                                Kết quả import
                            </div>
                            <p className="text-xs text-slate-700">
                                Tạo mới: {clientImportReport.created || 0} • Cập nhật: {clientImportReport.updated || 0} • Bỏ qua: {clientImportReport.skipped || 0}
                            </p>

                            {Array.isArray(clientImportReport.errors) && clientImportReport.errors.length > 0 && (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5">
                                    <div className="text-xs font-semibold text-rose-700">Dòng lỗi không import được</div>
                                    <div className="mt-1 max-h-32 space-y-1 overflow-y-auto text-xs text-rose-700">
                                        {clientImportReport.errors.map((item, idx) => (
                                            <div key={`err-${idx}`}>
                                                Dòng {item.row ?? '-'}: {item.message || 'Lỗi không xác định'}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {Array.isArray(clientImportReport.warnings) && clientImportReport.warnings.length > 0 && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                                    <div className="text-xs font-semibold text-amber-700">Cảnh báo dữ liệu (đã import nhưng có trường để trống)</div>
                                    <div className="mt-1 max-h-28 space-y-1 overflow-y-auto text-xs text-amber-700">
                                        {clientImportReport.warnings.map((item, idx) => (
                                            <div key={`warn-${idx}`}>
                                                Dòng {item.row ?? '-'}: {item.message || 'Cảnh báo dữ liệu'}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {clientImportJob && (
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-3 text-xs">
                                <div className="font-semibold uppercase tracking-[0.14em] text-text-subtle">Tiến trình import</div>
                                <div className="font-semibold text-slate-700">
                                    {clientImportJob.processed_rows || 0}/{clientImportJob.total_rows || 0} dòng
                                </div>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                                <div
                                    className={`h-full rounded-full transition-all ${clientImportJob.status === 'failed' ? 'bg-rose-500' : 'bg-primary'}`}
                                    style={{ width: `${clientImportJob.progress_percent || 0}%` }}
                                />
                            </div>
                            <div className="flex items-center justify-between text-xs text-text-muted">
                                <span>
                                    Trạng thái: {clientImportJob.status === 'queued' ? 'Đang chờ' : clientImportJob.status === 'processing' ? 'Đang xử lý' : clientImportJob.status === 'completed' ? 'Hoàn tất' : 'Thất bại'}
                                </span>
                                <span>{clientImportJob.progress_percent || 0}%</span>
                            </div>
                        </div>
                    )}
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
                            onClick={() => {
                                setShowClientImport(false);
                                setClientImportFile(null);
                                setClientImportReport(null);
                                setClientImportJob(null);
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
