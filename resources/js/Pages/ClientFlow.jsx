import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import AppIcon from '@/Components/AppIcon';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import TagMultiSelect from '@/Components/TagMultiSelect';
import { filterControlClass } from '@/Components/FilterToolbar';
import { useToast } from '@/Contexts/ToastContext';
import { formatVietnamDate, formatVietnamDateTime } from '@/lib/vietnamTime';

const STATUS_LABELS = {
    open: 'Đang mở',
    won: 'Thành công',
    lost: 'Thất bại',
    pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Từ chối',
    moi_tao: 'Mới tạo',
    dang_trien_khai: 'Đang triển khai',
    cho_duyet: 'Chờ duyệt',
    hoan_thanh: 'Hoàn thành',
    tam_dung: 'Tạm dừng',
    todo: 'Cần làm',
    doing: 'Đang làm',
    done: 'Hoàn tất',
    blocked: 'Bị chặn',
};

const SERVICE_LABELS = {
    backlinks: 'Backlinks',
    viet_content: 'Content',
    audit_content: 'Audit Content',
    cham_soc_website_tong_the: 'Website Care',
    khac: 'Khác',
};

const doneStatusSet = new Set(['won', 'success', 'thanh_cong', 'hoan_thanh', 'done', 'completed']);
const doneContractStatusSet = new Set(['success', 'active', 'approved', 'hoan_thanh']);

const statusLabel = (value) => STATUS_LABELS[String(value || '').toLowerCase()] || value || '—';
const opportunityStatusLabel = (row) => row?.status_config?.name || statusLabel(row?.status);

const formatDate = (raw) => formatVietnamDate(raw);
const formatDateTime = (raw) => formatVietnamDateTime(raw);

const formatCurrency = (value) => Number(value || 0).toLocaleString('vi-VN');
const numberOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const serviceLabel = (project) => {
    if (!project) return '—';
    if (project.service_type === 'khac') return project.service_type_other || 'Khác';
    return SERVICE_LABELS[project.service_type] || project.service_type || '—';
};

function TabButton({ active, icon, label, onClick, count = null }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-primary/30 hover:text-primary'
            }`}
        >
            <AppIcon name={icon} className="h-4 w-4" />
            <span>{label}</span>
            {count !== null && (
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs text-slate-700">{count}</span>
            )}
        </button>
    );
}

function EmptyTable({ colSpan, message }) {
    return (
        <tr>
            <td colSpan={colSpan} className="py-6 text-center text-sm text-slate-500">
                {message}
            </td>
        </tr>
    );
}

function Field({ label, required = false, children, hint = '' }) {
    return (
        <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
                {label}{required ? ' *' : ''}
            </label>
            {children}
            {hint ? <p className="mt-1.5 text-xs text-text-muted">{hint}</p> : null}
        </div>
    );
}

export default function ClientFlow({ auth, clientId }) {
    const toast = useToast();
    const userRole = String(auth?.user?.role || '').toLowerCase();
    const canCreateOpportunity = ['admin', 'administrator', 'quan_ly', 'nhan_vien'].includes(userRole);
    const [flow, setFlow] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('tong_quan');
    const [showEditModal, setShowEditModal] = useState(false);
    const [savingClient, setSavingClient] = useState(false);
    const [loadingLookups, setLoadingLookups] = useState(false);
    const [leadTypes, setLeadTypes] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [staffUsers, setStaffUsers] = useState([]);
    const [clientForm, setClientForm] = useState({
        name: '',
        company: '',
        email: '',
        phone: '',
        notes: '',
        lead_type_id: '',
        lead_source: '',
        lead_channel: '',
        assigned_department_id: '',
        assigned_staff_id: '',
        sales_owner_id: '',
    });
    const [careNoteForm, setCareNoteForm] = useState({ title: '', detail: '' });
    const [submittingCareNote, setSubmittingCareNote] = useState(false);
    const [deletingCommentId, setDeletingCommentId] = useState('');
    const [opportunityStatuses, setOpportunityStatuses] = useState([]);
    const [opportunityProducts, setOpportunityProducts] = useState([]);
    const [showOpportunityModal, setShowOpportunityModal] = useState(false);
    const [savingOpportunity, setSavingOpportunity] = useState(false);
    const [opportunityForm, setOpportunityForm] = useState({
        title: '',
        opportunity_type: '',
        source: '',
        amount: '',
        status: '',
        success_probability: '',
        expected_close_date: '',
        product_id: '',
        assigned_to: '',
        watcher_ids: [],
        notes: '',
    });

    const fetchFlow = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/v1/crm/clients/${clientId}/flow`);
            setFlow(res.data || null);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được thông tin khách hàng.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFlow();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientId]);

    const hydrateClientForm = (client) => {
        if (!client) return;
        setClientForm({
            name: client.name || '',
            company: client.company || '',
            email: client.email || '',
            phone: client.phone || '',
            notes: client.notes || '',
            lead_type_id: client.lead_type_id ? String(client.lead_type_id) : '',
            lead_source: client.lead_source || '',
            lead_channel: client.lead_channel || '',
            assigned_department_id: client.assigned_department_id ? String(client.assigned_department_id) : '',
            assigned_staff_id: client.assigned_staff_id ? String(client.assigned_staff_id) : '',
            sales_owner_id: client.sales_owner_id ? String(client.sales_owner_id) : '',
        });
    };

    const fetchLookups = async () => {
        setLoadingLookups(true);
        try {
            const [leadRes, deptRes, userRes, statusRes, productRes] = await Promise.all([
                axios.get('/api/v1/lead-types').catch(() => ({ data: [] })),
                axios.get('/api/v1/departments').catch(() => ({ data: [] })),
                axios.get('/api/v1/users/lookup', { params: { purpose: 'operational_assignee' } }).catch(() => ({ data: { data: [] } })),
                axios.get('/api/v1/opportunity-statuses').catch(() => ({ data: [] })),
                axios.get('/api/v1/products', { params: { per_page: 300, page: 1 } }).catch(() => ({ data: { data: [] } })),
            ]);
            const nextLeadTypes = Array.isArray(leadRes.data) ? leadRes.data : [];
            const nextDepartments = Array.isArray(deptRes.data) ? deptRes.data : [];
            const nextUsers = Array.isArray(userRes.data?.data) ? userRes.data.data : [];
            const nextStatuses = Array.isArray(statusRes.data) ? statusRes.data : [];
            const nextProducts = Array.isArray(productRes.data?.data) ? productRes.data.data : [];

            setLeadTypes(nextLeadTypes);
            setDepartments(nextDepartments);
            setStaffUsers(nextUsers);
            setOpportunityStatuses(nextStatuses);
            setOpportunityProducts(nextProducts);
            return {
                statuses: nextStatuses,
                users: nextUsers,
            };
        } finally {
            setLoadingLookups(false);
        }
    };

    const openEditModal = async () => {
        hydrateClientForm(flow?.client);
        setShowEditModal(true);
        if (leadTypes.length === 0 && departments.length === 0 && staffUsers.length === 0) {
            await fetchLookups();
        }
    };

    const submitClientUpdate = async (event) => {
        event.preventDefault();
        if (!flow?.client?.id) return;
        if (!(clientForm.name || '').trim()) {
            toast.error('Vui lòng nhập tên khách hàng.');
            return;
        }
        setSavingClient(true);
        try {
            const payload = {
                name: (clientForm.name || '').trim(),
                company: (clientForm.company || '').trim() || null,
                email: (clientForm.email || '').trim() || null,
                phone: (clientForm.phone || '').trim() || null,
                notes: (clientForm.notes || '').trim() || null,
                lead_type_id: clientForm.lead_type_id ? Number(clientForm.lead_type_id) : null,
                lead_source: (clientForm.lead_source || '').trim() || null,
                lead_channel: (clientForm.lead_channel || '').trim() || null,
                assigned_department_id: clientForm.assigned_department_id ? Number(clientForm.assigned_department_id) : null,
                assigned_staff_id: clientForm.assigned_staff_id ? Number(clientForm.assigned_staff_id) : null,
                sales_owner_id: clientForm.sales_owner_id ? Number(clientForm.sales_owner_id) : null,
            };
            await axios.put(`/api/v1/crm/clients/${flow.client.id}`, payload);
            toast.success('Đã cập nhật khách hàng.');
            setShowEditModal(false);
            await fetchFlow();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không thể cập nhật khách hàng.');
        } finally {
            setSavingClient(false);
        }
    };

    const navigateTo = (url) => {
        if (!url) return;
        window.location.href = url;
    };

    const submitComment = async (event) => {
        event.preventDefault();
        if (!flow?.client?.id) return;

        const title = (careNoteForm.title || '').trim();
        const detail = (careNoteForm.detail || '').trim();
        if (!title || !detail) {
            toast.error('Vui lòng nhập tiêu đề và nội dung bình luận.');
            return;
        }

        setSubmittingCareNote(true);
        try {
            const res = await axios.post(`/api/v1/crm/clients/${flow.client.id}/comments`, {
                title,
                detail,
            });
            const comment = res?.data?.comment;
            if (comment) {
                setFlow((prev) => ({
                    ...(prev || {}),
                    comments_history: [comment, ...((prev?.comments_history || []))],
                }));
            } else {
                await fetchFlow();
            }
            setCareNoteForm({ title: '', detail: '' });
            toast.success('Đã thêm bình luận.');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không thể thêm bình luận.');
        } finally {
            setSubmittingCareNote(false);
        }
    };

    const watcherOptions = useMemo(() => (
        staffUsers.map((user) => ({
            id: Number(user?.id || 0),
            label: user?.name || `Nhân sự #${user?.id}`,
            meta: [user?.role, user?.email].filter(Boolean).join(' • '),
        })).filter((user) => user.id > 0)
    ), [staffUsers]);

    const openCreateOpportunityModal = async () => {
        if (loadingLookups) return;
        let nextStatuses = opportunityStatuses;
        let nextUsers = staffUsers;
        if (!opportunityStatuses.length || !staffUsers.length) {
            const loaded = await fetchLookups();
            if (loaded?.statuses) nextStatuses = loaded.statuses;
            if (loaded?.users) nextUsers = loaded.users;
        }

        const defaultStatusCode = String((nextStatuses[0]?.code || '').trim());
        const currentUserId = Number(auth?.user?.id || 0);
        setOpportunityForm({
            title: '',
            opportunity_type: '',
            source: '',
            amount: '',
            status: defaultStatusCode,
            success_probability: '',
            expected_close_date: '',
            product_id: '',
            assigned_to: currentUserId > 0 ? String(currentUserId) : '',
            watcher_ids: [],
            notes: '',
        });
        setShowOpportunityModal(true);
    };

    const submitOpportunity = async (event) => {
        event.preventDefault();
        if (!flow?.client?.id) return;
        if (!String(opportunityForm.title || '').trim()) {
            toast.error('Vui lòng nhập tên cơ hội.');
            return;
        }
        const amountParsed = numberOrNull(opportunityForm.amount);
        if (amountParsed === null || amountParsed < 0) {
            toast.error('Vui lòng nhập doanh số dự kiến (số ≥ 0).');
            return;
        }
        const probParsed = numberOrNull(opportunityForm.success_probability);
        if (probParsed === null || !Number.isInteger(probParsed) || probParsed < 0 || probParsed > 100) {
            toast.error('Vui lòng chọn tỷ lệ thành công (0–100%).');
            return;
        }

        setSavingOpportunity(true);
        try {
            await axios.post('/api/v1/opportunities', {
                title: String(opportunityForm.title || '').trim(),
                opportunity_type: String(opportunityForm.opportunity_type || '').trim() || null,
                client_id: Number(flow.client.id),
                source: String(opportunityForm.source || '').trim() || null,
                amount: amountParsed,
                status: opportunityForm.status || null,
                success_probability: probParsed,
                product_id: opportunityForm.product_id ? Number(opportunityForm.product_id) : null,
                assigned_to: opportunityForm.assigned_to ? Number(opportunityForm.assigned_to) : null,
                watcher_ids: (opportunityForm.watcher_ids || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0),
                expected_close_date: opportunityForm.expected_close_date || null,
                notes: String(opportunityForm.notes || '').trim() || null,
            });
            toast.success('Đã thêm cơ hội mới.');
            setShowOpportunityModal(false);
            await fetchFlow();
            setActiveTab('co_hoi');
        } catch (e) {
            const message = e?.response?.data?.message || 'Không thể tạo cơ hội.';
            const validation = e?.response?.data?.errors
                ? Object.values(e.response.data.errors).flat().join(' ')
                : '';
            toast.error(message === 'The given data was invalid.' && validation ? validation : message);
        } finally {
            setSavingOpportunity(false);
        }
    };

    const deleteComment = async (commentId) => {
        if (!flow?.client?.id || !commentId) return;
        if (!window.confirm('Xóa bình luận này?')) return;

        setDeletingCommentId(String(commentId));
        try {
            await axios.delete(`/api/v1/crm/clients/${flow.client.id}/comments/${commentId}`);
            setFlow((prev) => ({
                ...(prev || {}),
                comments_history: (prev?.comments_history || []).filter((comment) => String(comment.id) !== String(commentId)),
            }));
            toast.success('Đã xóa bình luận.');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không thể xóa bình luận.');
        } finally {
            setDeletingCommentId('');
        }
    };

    const opportunities = flow?.opportunities || [];
    const contracts = flow?.contracts || [];
    const projects = flow?.projects || [];
    const tasks = flow?.tasks || [];
    const items = flow?.items || [];

    const projectById = useMemo(() => {
        const map = new Map();
        projects.forEach((project) => map.set(Number(project.id), project));
        return map;
    }, [projects]);

    const taskById = useMemo(() => {
        const map = new Map();
        tasks.forEach((task) => map.set(Number(task.id), task));
        return map;
    }, [tasks]);

    const summary = useMemo(() => {
        const completedOpportunities = opportunities.filter((row) => doneStatusSet.has(String(row.status || '').toLowerCase())).length;
        const completedContracts = contracts.filter((row) => {
            const status = String(row.status || '').toLowerCase();
            const approval = String(row.approval_status || '').toLowerCase();
            return doneContractStatusSet.has(status) || doneContractStatusSet.has(approval);
        }).length;
        const completedProjects = projects.filter((row) => doneStatusSet.has(String(row.status || '').toLowerCase())).length;
        const completedTasks = tasks.filter((row) => doneStatusSet.has(String(row.status || '').toLowerCase())).length;
        const completedItems = items.filter((row) => doneStatusSet.has(String(row.status || '').toLowerCase())).length;

        const totalRecords = opportunities.length + contracts.length + projects.length + tasks.length + items.length;
        const completedRecords = completedOpportunities + completedContracts + completedProjects + completedTasks + completedItems;
        const progressPercent = totalRecords > 0 ? Math.round((completedRecords / totalRecords) * 100) : 0;

        return {
            totalRecords,
            completedRecords,
            progressPercent,
            opportunities: { total: opportunities.length, done: completedOpportunities },
            contracts: { total: contracts.length, done: completedContracts },
            projects: { total: projects.length, done: completedProjects },
            tasks: { total: tasks.length, done: completedTasks },
            items: { total: items.length, done: completedItems },
        };
    }, [opportunities, contracts, projects, tasks, items]);

    const stats = useMemo(() => {
        return [
            { label: 'Tiến độ tổng', value: `${summary.progressPercent}%` },
            { label: 'Cơ hội', value: `${summary.opportunities.done}/${summary.opportunities.total}` },
            { label: 'Hợp đồng', value: `${summary.contracts.done}/${summary.contracts.total}` },
            { label: 'Đầu việc', value: `${summary.items.done}/${summary.items.total}` },
        ];
    }, [summary]);

    const commentsHistory = flow?.comments_history || [];

    const tabs = [
        { key: 'tong_quan', label: 'Tổng quan', icon: 'chart', count: null },
        { key: 'co_hoi', label: 'Cơ hội', icon: 'trend', count: opportunities.length },
        { key: 'hop_dong', label: 'Hợp đồng', icon: 'file', count: contracts.length },
        { key: 'du_an', label: 'Dự án', icon: 'folder', count: projects.length },
        { key: 'cong_viec', label: 'Công việc', icon: 'tasks', count: tasks.length },
        { key: 'dau_viec', label: 'Đầu việc', icon: 'check', count: items.length },
    ];

    return (
        <PageContainer
            auth={auth}
            title="Thông tin khách hàng"
            description="Theo dõi khách hàng theo tab nghiệp vụ, thống kê tiến độ tổng hợp và trao đổi nội bộ."
            stats={stats}
        >
            <div className="space-y-5">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-xs uppercase tracking-[0.14em] text-text-subtle">Khách hàng</div>
                            <h3 className="mt-1 text-xl font-semibold text-slate-900">{flow?.client?.name || '—'}</h3>
                            <p className="mt-1 text-sm text-slate-500">{flow?.client?.company || 'Chưa có công ty'} • {flow?.client?.phone || 'Chưa có số điện thoại'}</p>
                        </div>
                        {flow?.permissions?.can_manage_client && (
                            <button
                                type="button"
                                onClick={openEditModal}
                                className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
                            >
                                <AppIcon name="edit" className="h-4 w-4" />
                                Sửa khách hàng
                            </button>
                        )}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        {[
                            { label: 'Cơ hội', value: `${summary.opportunities.done}/${summary.opportunities.total}` },
                            { label: 'Hợp đồng', value: `${summary.contracts.done}/${summary.contracts.total}` },
                            { label: 'Dự án', value: `${summary.projects.done}/${summary.projects.total}` },
                            { label: 'Công việc', value: `${summary.tasks.done}/${summary.tasks.total}` },
                            { label: 'Đầu việc', value: `${summary.items.done}/${summary.items.total}` },
                        ].map((card) => (
                            <div key={card.label} className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                <div className="text-xs uppercase tracking-[0.14em] text-slate-400">{card.label}</div>
                                <div className="mt-1 text-lg font-semibold text-slate-900">{card.value}</div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        <p className="font-semibold">Công thức tiến độ tổng: {summary.progressPercent}%</p>
                        <p className="mt-1 text-xs leading-5">
                            Tiến độ tổng = (Cơ hội thành công + Hợp đồng đã nhận bàn giao/active + Dự án hoàn thành + Công việc hoàn tất + Đầu việc hoàn tất)
                            / Tổng số bản ghi của 5 nhóm x 100.
                        </p>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                    <div className="flex flex-wrap gap-2">
                        {tabs.map((tab) => (
                            <TabButton
                                key={tab.key}
                                active={activeTab === tab.key}
                                icon={tab.icon}
                                label={tab.label}
                                count={tab.count}
                                onClick={() => setActiveTab(tab.key)}
                            />
                        ))}
                    </div>

                    {loading && (
                        <div className="mt-4 rounded-2xl border border-dashed border-slate-200/80 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                            Đang tải dữ liệu khách hàng...
                        </div>
                    )}

                    {!loading && activeTab === 'tong_quan' && (
                        <div className="mt-5 grid gap-4 lg:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200/80 p-4">
                                <h4 className="text-sm font-semibold text-slate-900">Thông tin chung</h4>
                                <div className="mt-3 space-y-2 text-sm">
                                    <div className="flex justify-between gap-2"><span className="text-slate-500">Email</span><span className="font-medium text-slate-800">{flow?.client?.email || '—'}</span></div>
                                    <div className="flex justify-between gap-2"><span className="text-slate-500">Nguồn</span><span className="font-medium text-slate-800">{flow?.client?.lead_source || '—'} {flow?.client?.lead_channel ? `• ${flow.client.lead_channel}` : ''}</span></div>
                                    <div className="flex justify-between gap-2"><span className="text-slate-500">Doanh thu</span><span className="font-medium text-slate-800">{formatCurrency(flow?.client?.total_revenue)} VNĐ</span></div>
                                    <div className="flex justify-between gap-2"><span className="text-slate-500">Phụ trách chính</span><span className="font-medium text-slate-800">{flow?.client?.assigned_staff?.name || flow?.client?.sales_owner?.name || '—'}</span></div>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200/80 p-4">
                                <h4 className="text-sm font-semibold text-slate-900">Nhân sự chăm sóc</h4>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {(flow?.client?.care_staff_users || []).length > 0 ? flow.client.care_staff_users.map((staff) => (
                                        <span key={staff.id} className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                                            {staff.name}
                                        </span>
                                    )) : (
                                        <span className="text-sm text-slate-500">Chưa có nhân sự chăm sóc.</span>
                                    )}
                                </div>
                                <p className="mt-4 text-xs leading-5 text-slate-500">Khi thêm bình luận, hệ thống tự lưu người gửi và thời gian để tiện theo dõi lịch sử trao đổi.</p>
                            </div>
                        </div>
                    )}

                    {!loading && activeTab === 'co_hoi' && (
                        <div className="mt-5 space-y-3">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                {canCreateOpportunity ? (
                                    <button
                                        type="button"
                                        className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white"
                                        onClick={openCreateOpportunityModal}
                                    >
                                        + Thêm cơ hội
                                    </button>
                                ) : null}
                            </div>
                            <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                                        <th className="py-2">Tên cơ hội</th>
                                        <th className="py-2">Trạng thái</th>
                                        <th className="py-2">Doanh số</th>
                                        <th className="py-2">Phụ trách</th>
                                        <th className="py-2">Dự kiến chốt</th>
                                        <th className="py-2">Ghi chú</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {opportunities.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/80"
                                            onClick={() => navigateTo(route('opportunities.detail', row.id))}
                                        >
                                            <td className="py-2.5 font-medium text-slate-900">{row.title || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">
                                                <span
                                                    className="inline-flex rounded-full border px-2 py-1 font-semibold"
                                                    style={{
                                                        borderColor: row?.status_config?.color_hex || '#CBD5E1',
                                                        color: row?.status_config?.color_hex || '#475569',
                                                        backgroundColor: `${row?.status_config?.color_hex || '#CBD5E1'}20`,
                                                    }}
                                                >
                                                    {opportunityStatusLabel(row)}
                                                </span>
                                            </td>
                                            <td className="py-2.5 text-xs text-slate-600">{formatCurrency(row.amount)} VNĐ</td>
                                            <td className="py-2.5 text-xs text-slate-600">{row.assignee?.name || row.creator?.name || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{formatDate(row.expected_close_date)}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{row.notes || '—'}</td>
                                        </tr>
                                    ))}
                                    {opportunities.length === 0 && <EmptyTable colSpan={6} message="Khách hàng chưa có cơ hội nào." />}
                                </tbody>
                            </table>
                            </div>
                        </div>
                    )}

                    {!loading && activeTab === 'hop_dong' && (
                        <div className="mt-5 overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                                        <th className="py-2">Mã hợp đồng</th>
                                        <th className="py-2">Tên hợp đồng</th>
                                        <th className="py-2">Trạng thái</th>
                                        <th className="py-2">Bàn giao</th>
                                        <th className="py-2">Giá trị</th>
                                        <th className="py-2">Ngày ký</th>
                                        <th className="py-2">Hiệu lực đến</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {contracts.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/80"
                                            onClick={() => navigateTo(`/hop-dong/${row.id}`)}
                                        >
                                            <td className="py-2.5 text-xs text-slate-600">{row.code || `HD-${row.id}`}</td>
                                            <td className="py-2.5 font-medium text-slate-900">{row.title || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{statusLabel(row.status)}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{statusLabel(row.approval_status)}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{formatCurrency(row.value)} VNĐ</td>
                                            <td className="py-2.5 text-xs text-slate-600">{formatDate(row.signed_at)}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{formatDate(row.end_date)}</td>
                                        </tr>
                                    ))}
                                    {contracts.length === 0 && <EmptyTable colSpan={7} message="Khách hàng chưa có hợp đồng nào." />}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {!loading && activeTab === 'du_an' && (
                        <div className="mt-5 overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                                        <th className="py-2">Tên dự án</th>
                                        <th className="py-2">Dịch vụ</th>
                                        <th className="py-2">Trạng thái</th>
                                        <th className="py-2">Tiến độ</th>
                                        <th className="py-2">Hạn</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {projects.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/80"
                                            onClick={() => navigateTo(`/du-an/${row.id}`)}
                                        >
                                            <td className="py-2.5 font-medium text-slate-900">{row.name || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{serviceLabel(row)}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{statusLabel(row.status)}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{Number(row.progress_percent ?? 0)}%</td>
                                            <td className="py-2.5 text-xs text-slate-600">{formatDate(row.deadline)}</td>
                                        </tr>
                                    ))}
                                    {projects.length === 0 && <EmptyTable colSpan={5} message="Khách hàng chưa có dự án nào." />}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {!loading && activeTab === 'cong_viec' && (
                        <div className="mt-5 overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                                        <th className="py-2">Công việc</th>
                                        <th className="py-2">Dự án</th>
                                        <th className="py-2">Phụ trách</th>
                                        <th className="py-2">Trạng thái</th>
                                        <th className="py-2">Tiến độ</th>
                                        <th className="py-2">Tỷ trọng</th>
                                        <th className="py-2">Deadline</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tasks.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/80"
                                            onClick={() => navigateTo(`/cong-viec/${row.id}`)}
                                        >
                                            <td className="py-2.5 font-medium text-slate-900">{row.title || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{projectById.get(Number(row.project_id))?.name || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{row.assignee?.name || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{statusLabel(row.status)}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{Number(row.progress_percent ?? 0)}%</td>
                                            <td className="py-2.5 text-xs text-slate-600">{Number(row.weight_percent ?? 0)}%</td>
                                            <td className="py-2.5 text-xs text-slate-600">{formatDate(row.deadline)}</td>
                                        </tr>
                                    ))}
                                    {tasks.length === 0 && <EmptyTable colSpan={7} message="Khách hàng chưa có công việc nào." />}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {!loading && activeTab === 'dau_viec' && (
                        <div className="mt-5 overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                                        <th className="py-2">Đầu việc</th>
                                        <th className="py-2">Công việc</th>
                                        <th className="py-2">Phụ trách</th>
                                        <th className="py-2">Trạng thái</th>
                                        <th className="py-2">Tiến độ</th>
                                        <th className="py-2">Tỷ trọng</th>
                                        <th className="py-2">Deadline</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/80"
                                            onClick={() => navigateTo(`/dau-viec/${row.id}`)}
                                        >
                                            <td className="py-2.5 font-medium text-slate-900">{row.title || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{taskById.get(Number(row.task_id))?.title || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{row.assignee?.name || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{statusLabel(row.status)}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{Number(row.progress_percent ?? 0)}%</td>
                                            <td className="py-2.5 text-xs text-slate-600">{Number(row.weight_percent ?? 0)}%</td>
                                            <td className="py-2.5 text-xs text-slate-600">{formatDate(row.deadline)}</td>
                                        </tr>
                                    ))}
                                    {items.length === 0 && <EmptyTable colSpan={7} message="Khách hàng chưa có đầu việc nào." />}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h4 className="text-base font-semibold text-slate-900">Bình luận nội bộ</h4>
                            <p className="mt-1 text-xs text-slate-500">
                                Lịch sử bình luận hiển thị phía trên. Ô nhập bình luận đặt phía dưới để thao tác nhanh.
                            </p>
                        </div>
                        <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                            {commentsHistory.length} bình luận
                        </span>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/70">
                        <div className="max-h-[360px] overflow-y-auto p-3 sm:p-4">
                            <div className="space-y-3">
                                {commentsHistory.map((note) => (
                                    <div key={note.id} className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="text-sm font-semibold text-slate-900">{note.title}</div>
                                                <div className="mt-0.5 text-xs text-slate-500">{note.user?.name || 'Nhân sự'} • {note.user?.email || '—'}</div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(note.created_at)}</div>
                                                {note?.can_delete && (
                                                    <button
                                                        type="button"
                                                        className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                                        onClick={() => deleteComment(note.id)}
                                                        disabled={deletingCommentId === String(note.id)}
                                                    >
                                                        {deletingCommentId === String(note.id) ? 'Đang xóa...' : 'Xóa'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{note.detail}</p>
                                    </div>
                                ))}
                                {commentsHistory.length === 0 && (
                                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                                        Chưa có bình luận nào.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-4">
                        {flow?.permissions?.can_add_comment ? (
                            <form className="space-y-3" onSubmit={submitComment}>
                                <div>
                                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                                        Tiêu đề bình luận
                                    </label>
                                    <input
                                        className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm"
                                        placeholder="Ví dụ: Cập nhật sau buổi gọi sáng nay"
                                        value={careNoteForm.title}
                                        onChange={(e) => setCareNoteForm((prev) => ({ ...prev, title: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                                        Nội dung
                                    </label>
                                    <textarea
                                        className="min-h-[120px] w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm"
                                        placeholder="Nhập nội dung bình luận..."
                                        value={careNoteForm.detail}
                                        onChange={(e) => setCareNoteForm((prev) => ({ ...prev, detail: e.target.value }))}
                                    />
                                    <div className="mt-1 text-right text-xs text-slate-400">
                                        {(careNoteForm.detail || '').length} ký tự
                                    </div>
                                </div>
                                <div className="flex items-center justify-end">
                                    <button
                                        type="submit"
                                        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
                                        disabled={submittingCareNote}
                                    >
                                        {submittingCareNote ? 'Đang gửi...' : 'Gửi bình luận'}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                Bạn chỉ có quyền xem lịch sử bình luận của khách hàng này.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Modal
                open={showEditModal}
                onClose={() => setShowEditModal(false)}
                title="Sửa khách hàng"
                description="Cập nhật thông tin khách hàng từ trang chi tiết."
                size="lg"
            >
                <form className="mt-2 space-y-4 text-sm" onSubmit={submitClientUpdate}>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Tên khách hàng *</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={clientForm.name}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, name: e.target.value }))}
                                placeholder="VD: Nguyễn Văn A"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Công ty</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={clientForm.company}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, company: e.target.value }))}
                                placeholder="Tên công ty"
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Email</label>
                            <input
                                type="email"
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={clientForm.email}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, email: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Số điện thoại</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={clientForm.phone}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, phone: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Loại lead</label>
                            <select
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={clientForm.lead_type_id}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, lead_type_id: e.target.value }))}
                            >
                                <option value="">Chưa chọn</option>
                                {leadTypes.map((lead) => (
                                    <option key={lead.id} value={lead.id}>
                                        {lead.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Phòng ban phụ trách</label>
                            <select
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={clientForm.assigned_department_id}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, assigned_department_id: e.target.value }))}
                            >
                                <option value="">Chưa chọn</option>
                                {departments.map((department) => (
                                    <option key={department.id} value={department.id}>
                                        {department.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Nhân sự phụ trách</label>
                            <select
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={clientForm.assigned_staff_id}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, assigned_staff_id: e.target.value }))}
                            >
                                <option value="">Chưa chọn</option>
                                {staffUsers.map((user) => (
                                    <option key={user.id} value={user.id}>
                                        {user.name} ({user.role})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Sales owner</label>
                            <select
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={clientForm.sales_owner_id}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, sales_owner_id: e.target.value }))}
                            >
                                <option value="">Chưa chọn</option>
                                {staffUsers.map((user) => (
                                    <option key={user.id} value={user.id}>
                                        {user.name} ({user.role})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Nguồn lead</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={clientForm.lead_source}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, lead_source: e.target.value }))}
                                placeholder="VD: facebook"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Kênh lead</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={clientForm.lead_channel}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, lead_channel: e.target.value }))}
                                placeholder="VD: page_message"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Ghi chú</label>
                        <textarea
                            className="min-h-[90px] w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={clientForm.notes}
                            onChange={(e) => setClientForm((prev) => ({ ...prev, notes: e.target.value }))}
                        />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setShowEditModal(false)}
                            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={savingClient || loadingLookups}
                            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                        >
                            {savingClient ? 'Đang lưu...' : 'Lưu khách hàng'}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                open={showOpportunityModal}
                onClose={() => setShowOpportunityModal(false)}
                title="Thêm cơ hội mới"
                description="Tạo cơ hội trực tiếp trong trang chi tiết khách hàng."
                size="md"
            >
                <form className="grid gap-4 xl:grid-cols-2" onSubmit={submitOpportunity}>
                    <Field label="Tên cơ hội" required>
                        <input
                            className={filterControlClass}
                            value={opportunityForm.title}
                            onChange={(event) => setOpportunityForm((prev) => ({ ...prev, title: event.target.value }))}
                            placeholder="Nhập tên cơ hội"
                        />
                    </Field>
                    <Field label="Nguồn cơ hội">
                        <input
                            className={filterControlClass}
                            value={opportunityForm.source}
                            onChange={(event) => setOpportunityForm((prev) => ({ ...prev, source: event.target.value }))}
                            placeholder="Ví dụ: Facebook, Form, Telesale"
                        />
                    </Field>
                    <Field label="Loại cơ hội">
                        <input
                            className={filterControlClass}
                            value={opportunityForm.opportunity_type}
                            onChange={(event) => setOpportunityForm((prev) => ({ ...prev, opportunity_type: event.target.value }))}
                            placeholder="Ví dụ: Dịch vụ SEO, Backlink"
                        />
                    </Field>
                    <Field label="Doanh số dự kiến (VNĐ)" required>
                        <input
                            type="number"
                            min="0"
                            className={filterControlClass}
                            value={opportunityForm.amount}
                            onChange={(event) => setOpportunityForm((prev) => ({ ...prev, amount: event.target.value }))}
                            placeholder="0"
                            required
                        />
                    </Field>
                    <Field label="Khách hàng">
                        <input
                            className={filterControlClass}
                            value={flow?.client?.name || ''}
                            readOnly
                        />
                    </Field>
                    <Field label="Tỷ lệ thành công (%)" required>
                        <select
                            className={filterControlClass}
                            value={opportunityForm.success_probability}
                            onChange={(event) => setOpportunityForm((prev) => ({ ...prev, success_probability: event.target.value }))}
                            required
                        >
                            <option value="">Chọn tỷ lệ</option>
                            {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((value) => (
                                <option key={value} value={value}>{value}%</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Ngày kết thúc dự kiến">
                        <input
                            type="date"
                            className={filterControlClass}
                            value={opportunityForm.expected_close_date}
                            onChange={(event) => setOpportunityForm((prev) => ({ ...prev, expected_close_date: event.target.value }))}
                        />
                    </Field>
                    <Field label="Sản phẩm">
                        <select
                            className={filterControlClass}
                            value={opportunityForm.product_id}
                            onChange={(event) => setOpportunityForm((prev) => ({ ...prev, product_id: event.target.value }))}
                        >
                            <option value="">Chọn sản phẩm</option>
                            {opportunityProducts.map((product) => (
                                <option key={product.id} value={product.id}>
                                    {product.name} {product.code ? `• ${product.code}` : ''}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Trạng thái cơ hội">
                        <select
                            className={filterControlClass}
                            value={opportunityForm.status}
                            onChange={(event) => setOpportunityForm((prev) => ({ ...prev, status: event.target.value }))}
                        >
                            {opportunityStatuses.map((status) => (
                                <option key={status.id} value={status.code}>
                                    {status.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Người quản lý/phụ trách" hint="Mặc định gán tài khoản đang tạo cơ hội.">
                        <select
                            className={filterControlClass}
                            value={opportunityForm.assigned_to}
                            onChange={(event) => setOpportunityForm((prev) => ({ ...prev, assigned_to: event.target.value }))}
                        >
                            <option value="">Chọn nhân sự</option>
                            {staffUsers.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.name} • {user.role}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <div className="xl:col-span-2">
                        <Field label="Người theo dõi">
                            <TagMultiSelect
                                options={watcherOptions}
                                selectedIds={opportunityForm.watcher_ids}
                                onChange={(next) => setOpportunityForm((prev) => ({ ...prev, watcher_ids: next }))}
                                addPlaceholder="Tìm và thêm người theo dõi"
                                emptyLabel="Chưa chọn người theo dõi."
                            />
                        </Field>
                    </div>
                    <div className="xl:col-span-2">
                        <Field label="Ghi chú">
                            <textarea
                                className={`${filterControlClass} min-h-[108px] resize-y`}
                                value={opportunityForm.notes}
                                onChange={(event) => setOpportunityForm((prev) => ({ ...prev, notes: event.target.value }))}
                                placeholder="Nhập ghi chú cơ hội"
                            />
                        </Field>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 xl:col-span-2">
                        <button
                            type="submit"
                            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                            disabled={savingOpportunity}
                        >
                            {savingOpportunity ? 'Đang lưu...' : 'Lưu cơ hội'}
                        </button>
                        <button
                            type="button"
                            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
                            onClick={() => setShowOpportunityModal(false)}
                        >
                            Đóng
                        </button>
                    </div>
                </form>
            </Modal>
        </PageContainer>
    );
}
