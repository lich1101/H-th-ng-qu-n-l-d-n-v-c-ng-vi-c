import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import FilterToolbar, { FilterActionGroup, FilterField, filterControlClass } from '@/Components/FilterToolbar';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import PaginationControls from '@/Components/PaginationControls';
import { useToast } from '@/Contexts/ToastContext';

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

const LABELS = {
    moi_tao: 'Mới tạo',
    dang_trien_khai: 'Đang triển khai',
    cho_duyet: 'Chờ duyệt',
    hoan_thanh: 'Hoàn thành',
    tam_dung: 'Tạm dừng',
    backlinks: 'Backlinks',
    viet_content: 'Content',
    audit_content: 'Audit Content',
    cham_soc_website_tong_the: 'Website Care',
    noi_bo: 'Dự án Nội bộ',
    khac: 'Khác',
};

const STATUS_STYLES = {
    moi_tao: 'bg-slate-100 text-slate-700 border-slate-200',
    dang_trien_khai: 'bg-blue-50 text-blue-700 border-blue-200',
    cho_duyet: 'bg-amber-50 text-amber-700 border-amber-200',
    hoan_thanh: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    tam_dung: 'bg-rose-50 text-rose-700 border-rose-200',
};

const SERVICE_STYLES = {
    backlinks: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    viet_content: 'bg-sky-50 text-sky-700 border-sky-200',
    audit_content: 'bg-amber-50 text-amber-700 border-amber-200',
    cham_soc_website_tong_the: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    noi_bo: 'bg-slate-100 text-slate-700 border-slate-200',
};

const HANDOVER_LABELS = {
    pending: 'Chờ duyệt bàn giao',
    approved: 'Đã duyệt bàn giao',
};

const HANDOVER_STYLES = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const BLOCKED_ASSIGNMENT_ROLES = ['admin', 'administrator', 'ke_toan'];

export default function ProjectsKanban(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canCreate = ['admin', 'administrator', 'quan_ly'].includes(userRole);
    const canUpdate = ['admin', 'administrator', 'quan_ly'].includes(userRole);
    const canDelete = ['admin', 'administrator'].includes(userRole);
    const canBulkActions = canUpdate || canDelete;

    const [loading, setLoading] = useState(false);
    const [projects, setProjects] = useState([]);
    const [contracts, setContracts] = useState([]);
    const [owners, setOwners] = useState([]);
    const [meta, setMeta] = useState({});
    const [paging, setPaging] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [viewMode, setViewMode] = useState('list');
    const [filters, setFilters] = useState({
        search: '',
        status: '',
        service_type: '',
        per_page: 20,
        page: 1,
    });
    const [form, setForm] = useState({
        code: '',
        name: '',
        client_id: '',
        contract_id: '',
        service_type: DEFAULT_SERVICES[0].value,
        service_type_other: '',
        start_date: '',
        deadline: '',
        budget: '',
        status: DEFAULT_STATUSES[0].value,
        customer_requirement: '',
        owner_id: '',
        repo_url: '',
        website_url: '',
    });
    const [selectedProjectIds, setSelectedProjectIds] = useState([]);
    const [bulkLoading, setBulkLoading] = useState(false);

    const toDateInputValue = (raw) => {
        if (!raw) return '';
        const value = String(raw).trim();
        const directMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
        if (directMatch?.[1]) return directMatch[1];

        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return '';

        const yyyy = parsed.getFullYear();
        const mm = String(parsed.getMonth() + 1).padStart(2, '0');
        const dd = String(parsed.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    const injectCurrentProjectContract = (rows, project) => {
        const contractId = Number(project?.contract_id || project?.contract?.id || 0);
        if (contractId <= 0) return rows;
        if (rows.some((item) => Number(item?.id || 0) === contractId)) {
            return rows;
        }

        return [
            {
                id: contractId,
                code: project?.contract?.code || `HĐ #${contractId}`,
                title: project?.contract?.title || `Hợp đồng liên kết của dự án #${project?.id || ''}`,
            },
            ...rows,
        ];
    };

    const statusOptions = useMemo(() => {
        const values = meta.project_statuses || [];
        if (!values.length) return DEFAULT_STATUSES;
        return values.map((value) => ({ value, label: LABELS[value] || value }));
    }, [meta]);

    const serviceOptions = useMemo(() => {
        const values = meta.service_types || [];
        if (!values.length) return DEFAULT_SERVICES;
        return values.map((value) => ({ value, label: LABELS[value] || value }));
    }, [meta]);

    const fetchMeta = async () => {
        try {
            const res = await axios.get('/api/v1/meta');
            setMeta(res.data || {});
        } catch {
            // ignore
        }
    };

    const handleProjectSearch = (val) => {
        const next = { ...filters, search: val, page: 1 };
        setFilters(next);
        fetchProjects(1, next);
    };

    const fetchProjects = async (pageOrFilters = filters.page, maybeFilters = filters) => {
        const nextFilters = typeof pageOrFilters === 'object' && pageOrFilters !== null
            ? pageOrFilters
            : maybeFilters;
        const nextPage = typeof pageOrFilters === 'object' && pageOrFilters !== null
            ? Number(pageOrFilters.page || 1)
            : Number(pageOrFilters || 1);

        setLoading(true);
        try {
            const res = await axios.get('/api/v1/projects', {
                params: {
                    per_page: Number(nextFilters.per_page || 15),
                    page: nextPage,
                    ...(nextFilters.search ? { search: nextFilters.search } : {}),
                    ...(nextFilters.status ? { status: nextFilters.status } : {}),
                    ...(nextFilters.service_type ? { service_type: nextFilters.service_type } : {}),
                    ...(nextFilters.owner_id ? { owner_id: nextFilters.owner_id } : {}),
                },
            });
            setProjects(res.data?.data || []);
            setPaging({
                current_page: res.data?.current_page || 1,
                last_page: res.data?.last_page || 1,
                total: res.data?.total || 0,
            });
            setFilters((prev) => ({
                ...prev,
                page: res.data?.current_page || nextPage,
            }));
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được danh sách dự án.');
        } finally {
            setLoading(false);
        }
    };

    const fetchContracts = async (projectId = null, currentProject = null) => {
        try {
            const res = await axios.get('/api/v1/contracts', {
                params: {
                    per_page: 200,
                    available_only: true,
                    approval_status: 'approved',
                    ...(projectId ? { project_id: projectId } : {}),
                },
            });
            const rows = injectCurrentProjectContract(res.data?.data || [], currentProject);
            setContracts(rows);
        } catch {
            if (currentProject) {
                setContracts(injectCurrentProjectContract([], currentProject));
            }
        }
    };

    const fetchOwners = async () => {
        try {
            const res = await axios.get('/api/v1/users/lookup', {
                params: { purpose: 'project_owner' },
            });
            setOwners(res.data?.data || []);
        } catch {
            // ignore
        }
    };

    const ownerOptions = useMemo(
        () => owners.filter((owner) => !BLOCKED_ASSIGNMENT_ROLES.includes(String(owner?.role || '').toLowerCase())),
        [owners]
    );

    useEffect(() => {
        fetchMeta();
        fetchProjects();
        fetchContracts();
        fetchOwners();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (serviceOptions.length && !form.service_type) {
            setForm((s) => ({ ...s, service_type: serviceOptions[0].value }));
        }
        if (statusOptions.length && !form.status) {
            setForm((s) => ({ ...s, status: statusOptions[0].value }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serviceOptions.length, statusOptions.length]);

    const columns = useMemo(() => {
        const buckets = {};
        for (const s of statusOptions) buckets[s.value] = [];
        for (const p of projects) {
            const key = p.status || statusOptions[0]?.value || 'moi_tao';
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(p);
        }
        return statusOptions.map((s) => ({
            key: s.value,
            title: s.label,
            items: buckets[s.value] || [],
        }));
    }, [projects, statusOptions]);

    const formatDate = (raw) => {
        if (!raw) return '';
        try {
            const d = new Date(raw);
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        } catch {
            return String(raw).slice(0, 10);
        }
    };

    const serviceLabel = (project) => {
        if (!project) return '';
        if (project.service_type === 'khac') {
            return project.service_type_other || 'Khác';
        }
        return LABELS[project.service_type] || project.service_type || '';
    };

    const hasLinkedContract = (project) => !!(project?.contract_id || project?.contract?.id);

    const handoverLabel = (value, project = null) => {
        if (!hasLinkedContract(project)) return 'Không yêu cầu';
        if (!value) return 'Chưa bàn giao';
        return HANDOVER_LABELS[value] || value;
    };

    const projectProgress = (project) => {
        const raw = project?.progress_percent;
        const value = Number(raw ?? 0);
        if (Number.isNaN(value)) return 0;
        return Math.min(100, Math.max(0, Math.round(value)));
    };

    const sortedByDeadline = useMemo(() => (
        [...projects].sort((a, b) => {
            const da = a.deadline ? new Date(a.deadline).getTime() : 0;
            const db = b.deadline ? new Date(b.deadline).getTime() : 0;
            return da - db;
        })
    ), [projects]);

    const stats = useMemo(() => {
        const total = paging.total || projects.length;
        const inProgress = projects.filter((p) => p.status === 'dang_trien_khai').length;
        const waiting = projects.filter((p) => p.status === 'cho_duyet').length;
        const risky = projects.filter((p) => {
            if (!p.deadline) return false;
            try {
                const d = new Date(p.deadline);
                const diffDays = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
                return diffDays <= 3 && (p.status === 'dang_trien_khai' || p.status === 'cho_duyet');
            } catch {
                return false;
            }
        }).length;
        return [
            { label: 'Tổng dự án', value: String(total) },
            { label: 'Đang triển khai', value: String(inProgress) },
            { label: 'Chờ duyệt', value: String(waiting) },
            { label: 'Nguy cơ trễ', value: String(risky), note: risky ? 'Cần họp điều phối' : '' },
        ];
    }, [paging.total, projects]);

    const visibleProjectIds = useMemo(
        () => projects.map((project) => Number(project.id)).filter((id) => id > 0),
        [projects]
    );
    const selectedProjectSet = useMemo(
        () => new Set(selectedProjectIds.map((id) => Number(id))),
        [selectedProjectIds]
    );
    const allVisibleSelected = visibleProjectIds.length > 0
        && visibleProjectIds.every((id) => selectedProjectSet.has(id));

    const toggleProjectSelection = (projectId) => {
        const normalizedId = Number(projectId || 0);
        if (normalizedId <= 0) return;
        setSelectedProjectIds((prev) => (
            prev.includes(normalizedId)
                ? prev.filter((id) => id !== normalizedId)
                : [...prev, normalizedId]
        ));
    };

    const toggleSelectAllVisibleProjects = () => {
        if (allVisibleSelected) {
            setSelectedProjectIds((prev) => prev.filter((id) => !visibleProjectIds.includes(Number(id))));
            return;
        }

        setSelectedProjectIds((prev) => {
            const set = new Set(prev.map((id) => Number(id)));
            visibleProjectIds.forEach((id) => set.add(id));
            return Array.from(set.values());
        });
    };

    const buildProjectPayload = (project, patch = {}) => ({
        code: patch.code ?? project.code,
        name: patch.name ?? project.name,
        client_id: patch.client_id ?? project.client_id,
        contract_id: patch.contract_id ?? project.contract_id ?? project.contract?.id ?? null,
        service_type: patch.service_type ?? project.service_type,
        service_type_other: patch.service_type_other ?? project.service_type_other ?? null,
        start_date: patch.start_date ?? project.start_date,
        deadline: patch.deadline ?? project.deadline,
        budget: patch.budget ?? project.budget,
        status: patch.status ?? project.status,
        customer_requirement: patch.customer_requirement ?? project.customer_requirement,
        owner_id: patch.owner_id ?? project.owner_id ?? project.owner?.id ?? null,
        repo_url: patch.repo_url ?? project.repo_url,
        website_url: patch.website_url ?? project.website_url,
    });

    const resetForm = () => {
        setEditingId(null);
        setForm({
            code: '',
            name: '',
            client_id: '',
            contract_id: '',
            service_type: serviceOptions[0]?.value || DEFAULT_SERVICES[0].value,
            service_type_other: '',
            start_date: '',
            deadline: '',
            budget: '',
            status: statusOptions[0]?.value || DEFAULT_STATUSES[0].value,
            customer_requirement: '',
            owner_id: '',
            repo_url: '',
            website_url: '',
        });
        fetchContracts();
    };

    const openCreate = () => {
        resetForm();
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        resetForm();
    };

    const startEdit = (p) => {
        setEditingId(p.id);
        setForm({
            code: p.code || '',
            name: p.name || '',
            client_id: p.client_id || '',
            contract_id: String(p.contract_id || p.contract?.id || ''),
            service_type: p.service_type || serviceOptions[0]?.value || DEFAULT_SERVICES[0].value,
            service_type_other: p.service_type_other || '',
            start_date: toDateInputValue(p.start_date),
            deadline: toDateInputValue(p.deadline),
            budget: p.budget ?? '',
            status: p.status || statusOptions[0]?.value || DEFAULT_STATUSES[0].value,
            customer_requirement: p.customer_requirement || '',
            owner_id: String(p.owner_id || p.owner?.id || ''),
            repo_url: p.repo_url || '',
            website_url: p.website_url || '',
        });
        setShowForm(true);
        fetchContracts(p.id, p);
    };

    const save = async () => {
        if (!canCreate && editingId == null) {
            toast.error('Bạn không có quyền tạo dự án.');
            return;
        }
        if (!canUpdate && editingId != null) {
            toast.error('Bạn không có quyền cập nhật dự án.');
            return;
        }
        if (!form.name?.trim()) {
            toast.error('Vui lòng nhập Tên dự án.');
            return;
        }
        try {
            const payload = {
                ...form,
                client_id: form.client_id ? Number(form.client_id) : null,
                contract_id: form.contract_id ? Number(form.contract_id) : null,
                budget: form.budget === '' ? null : Number(form.budget),
                start_date: form.start_date || null,
                deadline: form.deadline || null,
                service_type_other: form.service_type === 'khac' ? form.service_type_other : null,
                owner_id: form.owner_id ? Number(form.owner_id) : null,
                repo_url: form.repo_url?.trim() ? form.repo_url.trim() : null,
                website_url: form.website_url?.trim() ? form.website_url.trim() : null,
            };
            if (editingId) {
                await axios.put(`/api/v1/projects/${editingId}`, payload);
                toast.success('Đã cập nhật dự án.');
            } else {
                await axios.post('/api/v1/projects', payload);
                toast.success('Đã tạo dự án.');
            }
            closeForm();
            await fetchProjects();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu dự án thất bại.');
        }
    };

    const remove = async (id) => {
        if (!canDelete) {
            toast.error('Bạn không có quyền xóa dự án.');
            return;
        }
        if (!confirm('Xóa dự án này?')) return;
        try {
            await axios.delete(`/api/v1/projects/${id}`);
            toast.success('Đã xóa dự án.');
            await fetchProjects();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa dự án thất bại.');
        }
    };

    const quickMove = async (p, nextStatus) => {
        if (!canUpdate) return toast.error('Bạn không có quyền cập nhật dự án.');
        try {
            await axios.put(`/api/v1/projects/${p.id}`, buildProjectPayload(p, { status: nextStatus }));
            toast.success('Đã cập nhật trạng thái.');
            await fetchProjects();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Cập nhật trạng thái thất bại.');
        }
    };

    const bulkUpdateProjects = async (patch, successLabel) => {
        if (!canUpdate) {
            toast.error('Bạn không có quyền cập nhật dự án hàng loạt.');
            return;
        }
        if (!selectedProjectIds.length) {
            toast.error('Vui lòng chọn dự án cần xử lý.');
            return;
        }

        const selectedProjects = projects.filter((project) => selectedProjectSet.has(Number(project.id)));
        if (!selectedProjects.length) {
            toast.error('Không tìm thấy dự án phù hợp trong danh sách hiện tại.');
            return;
        }

        setBulkLoading(true);
        try {
            await Promise.all(selectedProjects.map((project) => (
                axios.put(`/api/v1/projects/${project.id}`, buildProjectPayload(project, patch))
            )));
            toast.success(successLabel);
            setSelectedProjectIds([]);
            await fetchProjects(filters.page, filters);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không thể cập nhật hàng loạt dự án.');
        } finally {
            setBulkLoading(false);
        }
    };

    const bulkDeleteProjects = async () => {
        if (!canDelete) {
            toast.error('Bạn không có quyền xóa dự án.');
            return;
        }
        if (!selectedProjectIds.length) {
            toast.error('Vui lòng chọn dự án cần xóa.');
            return;
        }
        if (!confirm(`Xóa ${selectedProjectIds.length} dự án đã chọn?`)) return;

        setBulkLoading(true);
        try {
            await Promise.all(selectedProjectIds.map((id) => axios.delete(`/api/v1/projects/${id}`)));
            toast.success(`Đã xóa ${selectedProjectIds.length} dự án đã chọn.`);
            setSelectedProjectIds([]);
            await fetchProjects(filters.page, filters);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không thể xóa hàng loạt dự án.');
        } finally {
            setBulkLoading(false);
        }
    };

    const submitHandover = async (project) => {
        if (!project?.permissions?.can_submit_handover) {
            toast.error('Bạn chưa đủ điều kiện gửi duyệt bàn giao dự án.');
            return;
        }
        const shouldComplete =
            projectProgress(project) >= 100 &&
            project.status !== 'hoan_thanh';
        try {
            await axios.post(`/api/v1/projects/${project.id}/handover-submit`, {});
            toast.success(
                shouldComplete
                    ? 'Đã gửi duyệt bàn giao dự án. Dự án sẽ được hoàn thành sau khi được duyệt.'
                    : 'Đã gửi duyệt bàn giao dự án.'
            );
            await fetchProjects();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Gửi duyệt bàn giao thất bại.');
        }
    };

    const canEditProject = (project) => !!project?.permissions?.can_edit;
    const canDeleteProject = (project) => !!project?.permissions?.can_delete;
    const canSubmitProjectHandover = (project) => !!project?.permissions?.can_submit_handover;
    const canReviewProjectHandover = (project) => !!project?.permissions?.can_review_handover;

    return (
        <PageContainer
            auth={props.auth}
            title="Quản lý dự án"
            description="Theo dõi toàn bộ dự án theo trạng thái và phân bổ theo dịch vụ."
            stats={stats}
        >
            <div className="lg:col-span-2">
                {canCreate && (
                    <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
                        <button
                            type="button"
                            className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm"
                            onClick={openCreate}
                        >
                            Thêm mới
                        </button>
                    </div>
                )}
                <FilterToolbar enableSearch
                    title="Bộ lọc dự án"
                    description="Tìm nhanh theo mã dự án, khách hàng, ghi chú hoặc tên trước khi chuyển chế độ xem."
                    searchValue={filters.search}
                    onSearch={handleProjectSearch}
                    actions={(
                        <FilterActionGroup className="justify-end">
                            {[
                                { key: 'list', label: 'Danh sách' },
                                { key: 'kanban', label: 'Bảng Kanban' },
                                { key: 'timeline', label: 'Dòng thời gian' },
                                { key: 'gantt', label: 'Biểu đồ Gantt' },
                            ].map((tab) => (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => setViewMode(tab.key)}
                                    className={`rounded-2xl px-3.5 py-3 text-xs font-semibold transition ${
                                        viewMode === tab.key
                                            ? 'bg-primary text-white shadow-sm'
                                            : 'border border-slate-200/80 bg-white text-slate-600 hover:border-primary/30 hover:text-primary'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </FilterActionGroup>
                    )}
                >
                    <div className="grid gap-3 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,0.7fr)_minmax(0,1fr)_auto]">
                        <FilterField label="Trạng thái">
                            <select
                                className={filterControlClass}
                                value={filters.status}
                                onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}
                            >
                                <option value="">Tất cả trạng thái</option>
                                {statusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                        </FilterField>
                        <FilterField label="Dịch vụ">
                            <select
                                className={filterControlClass}
                                value={filters.service_type}
                                onChange={(e) => setFilters((s) => ({ ...s, service_type: e.target.value }))}
                            >
                                <option value="">Tất cả dịch vụ</option>
                                {serviceOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                        </FilterField>
                        <FilterActionGroup className="xl:self-end xl:justify-end">
                            <button
                                type="button"
                                className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                                onClick={() => {
                                    const next = { ...filters, page: 1 };
                                    setFilters(next);
                                    fetchProjects(1, next);
                                }}
                            >
                                Lọc
                            </button>
                        </FilterActionGroup>
                    </div>
                </FilterToolbar>

                    {viewMode === 'list' && (
                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-4">
                            {canBulkActions && selectedProjectIds.length > 0 && (
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3">
                                    <div className="text-sm font-medium text-cyan-900">
                                        Đã chọn {selectedProjectIds.length} dự án.
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            className="rounded-xl border border-cyan-300 bg-white px-3 py-2 text-xs font-semibold text-cyan-700"
                                            onClick={() => setSelectedProjectIds([])}
                                            disabled={bulkLoading}
                                        >
                                            Bỏ chọn
                                        </button>
                                        {canUpdate && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="rounded-xl border border-sky-300 bg-sky-100 px-3 py-2 text-xs font-semibold text-sky-800"
                                                    onClick={() => bulkUpdateProjects({ status: 'dang_trien_khai' }, `Đã chuyển ${selectedProjectIds.length} dự án sang Đang triển khai.`)}
                                                    disabled={bulkLoading}
                                                >
                                                    {bulkLoading ? 'Đang xử lý...' : 'Đang triển khai'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="rounded-xl border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800"
                                                    onClick={() => bulkUpdateProjects({ status: 'cho_duyet' }, `Đã chuyển ${selectedProjectIds.length} dự án sang Chờ duyệt.`)}
                                                    disabled={bulkLoading}
                                                >
                                                    {bulkLoading ? 'Đang xử lý...' : 'Chờ duyệt'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="rounded-xl border border-rose-300 bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-800"
                                                    onClick={() => bulkUpdateProjects({ status: 'tam_dung' }, `Đã tạm dừng ${selectedProjectIds.length} dự án.`)}
                                                    disabled={bulkLoading}
                                                >
                                                    {bulkLoading ? 'Đang xử lý...' : 'Tạm dừng'}
                                                </button>
                                            </>
                                        )}
                                        {canDelete && (
                                            <button
                                                type="button"
                                                className="rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700"
                                                onClick={bulkDeleteProjects}
                                                disabled={bulkLoading}
                                            >
                                                {bulkLoading ? 'Đang xử lý...' : 'Xóa đã chọn'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs uppercase tracking-wider text-text-subtle border-b border-slate-200">
                                            {canBulkActions && (
                                                <th className="py-2 pr-3">
                                                    <input
                                                        type="checkbox"
                                                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
                                                        checked={allVisibleSelected}
                                                        onChange={toggleSelectAllVisibleProjects}
                                                        aria-label="Chọn tất cả dự án đang hiển thị"
                                                    />
                                                </th>
                                            )}
                                            <th className="py-2">Dự án</th>
                                            <th className="py-2">Website</th>
                                            <th className="py-2">Dịch vụ</th>
                                            <th className="py-2">Trạng thái</th>
                                            <th className="py-2">Tiến độ</th>
                                            <th className="py-2">Bàn giao</th>
                                            <th className="py-2">Phụ trách</th>
                                            <th className="py-2">Hợp đồng</th>
                                            <th className="py-2">Hạn chót</th>
                                            <th className="py-2">Ngân sách</th>
                                            <th className="py-2"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {projects.map((p) => (
                                            <tr
                                                key={p.id}
                                                className={`border-b border-slate-100 cursor-pointer hover:bg-slate-50/70 ${selectedProjectSet.has(Number(p.id)) ? 'bg-primary/5' : ''}`}
                                                onClick={() => { window.location.href = `/du-an/${p.id}`; }}
                                            >
                                                {canBulkActions && (
                                                    <td className="py-3 pr-3 align-top">
                                                        <input
                                                            type="checkbox"
                                                            className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/40"
                                                            checked={selectedProjectSet.has(Number(p.id))}
                                                            onChange={() => toggleProjectSelection(p.id)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            aria-label={`Chọn dự án ${p.name}`}
                                                        />
                                                    </td>
                                                )}
                                                <td className="py-3">
                                                    <div className="font-medium text-slate-900">{p.name}</div>
                                                    <div className="text-xs text-text-muted">{p.code}</div>
                                                </td>
                                                <td className="py-3">
                                                    {p.website_url ? (
                                                        <a
                                                            href={p.website_url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-block max-w-[220px] truncate text-xs font-semibold text-primary hover:underline"
                                                            onClick={(e) => e.stopPropagation()}
                                                            title={p.website_url}
                                                        >
                                                            {p.website_url}
                                                        </a>
                                                    ) : (
                                                        <span className="text-xs text-text-muted">—</span>
                                                    )}
                                                </td>
                                                <td className="py-3">
                                                    <span
                                                        className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                                                            SERVICE_STYLES[p.service_type] || 'bg-slate-100 text-slate-700 border-slate-200'
                                                        }`}
                                                    >
                                                        {serviceLabel(p)}
                                                    </span>
                                                </td>
                                                <td className="py-3">
                                                    <span
                                                        className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                                                            STATUS_STYLES[p.status] || 'bg-slate-100 text-slate-700 border-slate-200'
                                                        }`}
                                                    >
                                                        {LABELS[p.status] || p.status}
                                                    </span>
                                                </td>
                                                <td className="py-3">
                                                    <div className="w-24">
                                                        <div className="text-xs text-text-muted mb-1">{projectProgress(p)}%</div>
                                                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                                            <div className="h-1.5 bg-primary" style={{ width: `${projectProgress(p)}%` }} />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3">
                                                    <span
                                                        className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                                                            HANDOVER_STYLES[p.handover_status] || 'bg-slate-100 text-slate-600 border-slate-200'
                                                        }`}
                                                    >
                                                        {handoverLabel(p.handover_status, p)}
                                                    </span>
                                                </td>
                                                <td className="py-3 text-xs text-text-muted">
                                                    {p.owner?.name || '—'}
                                                </td>
                                                <td className={`py-3 text-xs ${p.contract ? 'text-text-muted' : 'text-warning'}`}>
                                                    {p.contract?.code || 'Chưa có hợp đồng'}
                                                </td>
                                                <td className="py-3 text-xs text-text-muted">
                                                    {p.deadline ? String(p.deadline).slice(0, 10) : '—'}
                                                </td>
                                                <td className="py-3 text-xs text-text-muted">
                                                    {p.budget ? Number(p.budget).toLocaleString('vi-VN') : '—'}
                                                </td>
                                                <td className="py-3 text-right space-x-2">
                                                    {canSubmitProjectHandover(p) && (
                                                        <button
                                                            className="text-xs font-semibold text-amber-700"
                                                            onClick={(e) => { e.stopPropagation(); submitHandover(p); }}
                                                            type="button"
                                                        >
                                                            Gửi duyệt BG
                                                        </button>
                                                    )}
                                                    {canReviewProjectHandover(p) && p.handover_status === 'pending' && (
                                                        <a
                                                            className="text-xs font-semibold text-emerald-700"
                                                            href="/ban-giao"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            Duyệt bàn giao
                                                        </a>
                                                    )}
                                                    {canEditProject(p) && (
                                                        <button className="text-xs font-semibold text-primary" onClick={(e) => { e.stopPropagation(); startEdit(p); }} type="button">
                                                            Sửa
                                                        </button>
                                                    )}
                                                    {canDeleteProject(p) && (
                                                        <button className="text-xs font-semibold text-rose-500" onClick={(e) => { e.stopPropagation(); remove(p.id); }} type="button">
                                                            Xóa
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {loading && (
                                            <tr>
                                                <td className="py-6 text-center text-sm text-text-muted" colSpan={canBulkActions ? 12 : 11}>
                                                    Đang tải...
                                                </td>
                                            </tr>
                                        )}
                                        {!loading && projects.length === 0 && (
                                            <tr>
                                                <td className="py-6 text-center text-sm text-text-muted" colSpan={canBulkActions ? 12 : 11}>
                                                    Chưa có dự án theo bộ lọc.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {viewMode === 'kanban' && (
                        <div className="flex gap-4 overflow-x-auto pb-2">
                            {columns.map((col) => (
                                <div key={col.key} className="min-w-[280px] flex-1">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-xs uppercase tracking-widest text-text-subtle font-semibold">{col.title} ({col.items.length})</h4>
                                    </div>
                                    <div className="space-y-3">
                                        {col.items.map((p) => (
                                            <div
                                                key={p.id}
                                                className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card cursor-pointer"
                                                onClick={() => { window.location.href = `/du-an/${p.id}`; }}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                                        {serviceLabel(p)}
                                                    </span>
                                                    <div className="flex items-center gap-2 text-xs text-text-muted">
                                                        {canEditProject(p) && (
                                                            <button className="hover:text-slate-900" onClick={(e) => { e.stopPropagation(); startEdit(p); }} type="button">Sửa</button>
                                                        )}
                                                        {canDeleteProject(p) && (
                                                            <button className="hover:text-danger" onClick={(e) => { e.stopPropagation(); remove(p.id); }} type="button">Xoá</button>
                                                        )}
                                                    </div>
                                                </div>
                                                <h3 className="mt-3 font-semibold text-slate-900">{p.name}</h3>
                                                <p className="text-xs text-text-muted mt-1">{p.code} • {p.deadline ? `Hạn chót ${String(p.deadline).slice(0, 10)}` : 'Chưa có hạn chót'}</p>
                                                <p className={`text-xs mt-1 ${p.contract ? 'text-text-muted' : 'text-warning'}`}>
                                                    Hợp đồng: {p.contract?.code || 'Chưa có hợp đồng'}
                                                </p>
                                                <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
                                                    <span>Tiến độ: {projectProgress(p)}%</span>
                                                    <span>{handoverLabel(p.handover_status, p)}</span>
                                                </div>
                                                <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                                    <div className="h-1.5 bg-primary" style={{ width: `${projectProgress(p)}%` }} />
                                                </div>
                                                <div className="mt-2 flex items-center gap-2">
                                                    {canSubmitProjectHandover(p) && (
                                                        <button
                                                            className="text-[11px] font-semibold text-amber-700"
                                                            onClick={(e) => { e.stopPropagation(); submitHandover(p); }}
                                                            type="button"
                                                        >
                                                            Gửi duyệt BG
                                                        </button>
                                                    )}
                                                    {canReviewProjectHandover(p) && p.handover_status === 'pending' && (
                                                        <a
                                                            className="text-[11px] font-semibold text-emerald-700"
                                                            href="/ban-giao"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            Duyệt BG
                                                        </a>
                                                    )}
                                                </div>
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {canEditProject(p) && statusOptions.map((s) => (
                                                        <button
                                                            key={s.value}
                                                            className={`text-xs px-2 py-1 rounded-full border ${p.status === s.value ? 'border-primary text-primary' : 'border-slate-200/80 text-text-muted'}`}
                                                            onClick={(e) => { e.stopPropagation(); quickMove(p, s.value); }}
                                                            type="button"
                                                        >
                                                            {s.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                        {loading && <p className="text-sm text-text-muted">Đang tải...</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {viewMode === 'timeline' && (
                        <div className="space-y-4">
                            {sortedByDeadline.map((p) => (
                                <div key={p.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card flex gap-4 cursor-pointer" onClick={() => { window.location.href = `/du-an/${p.id}`; }}>
                                    <div className="flex flex-col items-center">
                                        <span className="h-3 w-3 rounded-full bg-primary" />
                                        <span className="flex-1 w-px bg-slate-200 mt-2" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-semibold text-slate-900">{p.name}</h3>
                                            <span className="text-xs text-text-muted">{formatDate(p.deadline)}</span>
                                        </div>
                                        <p className="text-xs text-text-muted mt-1">{p.code} • {serviceLabel(p)}</p>
                                        <p className={`text-xs mt-1 ${p.contract ? 'text-text-muted' : 'text-warning'}`}>
                                            Hợp đồng: {p.contract?.code || 'Chưa có hợp đồng'}
                                        </p>
                                        <div className="mt-2 text-xs text-text-muted">Trạng thái: {LABELS[p.status] || p.status}</div>
                                        <div className="mt-1 text-xs text-text-muted">Tiến độ: {projectProgress(p)}%</div>
                                        <div className="mt-1 text-xs text-text-muted">Bàn giao: {handoverLabel(p.handover_status, p)}</div>
                                    </div>
                                </div>
                            ))}
                            {loading && <p className="text-sm text-text-muted">Đang tải...</p>}
                            {!loading && sortedByDeadline.length === 0 && (
                                <p className="text-sm text-text-muted">Chưa có dữ liệu dòng thời gian.</p>
                            )}
                        </div>
                    )}

                    {viewMode === 'gantt' && (
                        <div className="space-y-3">
                            {sortedByDeadline.length === 0 && (
                                <p className="text-sm text-text-muted">Chưa có dữ liệu biểu đồ Gantt.</p>
                            )}
                            {sortedByDeadline.map((p) => {
                                const start = p.start_date ? new Date(p.start_date) : (p.deadline ? new Date(p.deadline) : new Date());
                                const end = p.deadline ? new Date(p.deadline) : new Date(start.getTime() + 5 * 86400000);
                                const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
                                return (
                                    <div key={p.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card cursor-pointer" onClick={() => { window.location.href = `/du-an/${p.id}`; }}>
                                    <div className="flex items-center justify-between text-xs text-text-muted mb-2">
                                        <span>{p.name}</span>
                                        <span>{formatDate(p.deadline) || 'Chưa có hạn chót'}</span>
                                    </div>
                                    <div className={`text-xs mb-2 ${p.contract ? 'text-text-muted' : 'text-warning'}`}>
                                        Hợp đồng: {p.contract?.code || 'Chưa có hợp đồng'}
                                    </div>
                                    <div className="mb-2 text-xs text-text-muted">
                                        Tiến độ: {projectProgress(p)}% • Bàn giao: {handoverLabel(p.handover_status, p)} • {totalDays} ngày
                                    </div>
                                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                            <div className="h-2 bg-primary" style={{ width: `${projectProgress(p)}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <PaginationControls
                        page={paging.current_page}
                        lastPage={paging.last_page}
                        total={paging.total}
                        perPage={filters.per_page}
                        label="dự án"
                        loading={loading}
                        onPageChange={(page) => fetchProjects(page, filters)}
                        onPerPageChange={(perPage) => {
                            const next = { ...filters, per_page: perPage, page: 1 };
                            setFilters(next);
                            fetchProjects(1, next);
                        }}
                    />
                </div>

            <Modal
                open={showForm}
                onClose={closeForm}
                title={editingId ? `Sửa dự án #${editingId}` : 'Tạo dự án'}
                description="Nhập thông tin dự án. Dự án nội bộ có thể để trống hợp đồng liên kết."
                size="lg"
            >
                <div className="space-y-5 text-sm">
                    {editingId ? (
                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Mã dự án</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-slate-600"
                                value={form.code || ''}
                                readOnly
                            />
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs text-text-muted">
                            Mã dự án sẽ được hệ thống tự sinh sau khi bạn tạo dự án.
                        </div>
                    )}
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Tên dự án</label>
                        <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" placeholder="Tên dự án hiển thị với đội triển khai" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Loại dịch vụ</label>
                        <select className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.service_type} onChange={(e) => setForm((s) => ({ ...s, service_type: e.target.value }))}>
                            {serviceOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>
                    {form.service_type === 'khac' && (
                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Tên dịch vụ khác</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                placeholder="Nhập đúng tên dịch vụ cần triển khai"
                                value={form.service_type_other}
                                onChange={(e) => setForm((s) => ({ ...s, service_type_other: e.target.value }))}
                            />
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Hợp đồng liên kết</label>
                            <select
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={form.contract_id}
                                onChange={(e) => setForm((s) => ({ ...s, contract_id: e.target.value }))}
                            >
                                <option value="">Chọn hợp đồng (khuyên chọn để tạo công việc đúng phạm vi)</option>
                                {contracts.map((c) => (
                                    <option key={c.id} value={String(c.id)}>
                                        {c.code} • {c.title}
                                    </option>
                                ))}
                            </select>
                            <p className="mt-1 text-xs text-text-muted">
                                Nếu để trống, dự án được hiểu là dự án nội bộ và không cần phiếu duyệt bàn giao.
                            </p>
                        </div>
                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Người phụ trách triển khai</label>
                            <select
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={form.owner_id}
                                onChange={(e) => setForm((s) => ({ ...s, owner_id: e.target.value }))}
                            >
                                <option value="">Chọn người phụ trách dự án</option>
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
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Ngày bắt đầu</label>
                            <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" type="date" value={form.start_date} onChange={(e) => setForm((s) => ({ ...s, start_date: e.target.value }))} />
                        </div>
                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Hạn chót</label>
                            <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" type="date" value={form.deadline} onChange={(e) => setForm((s) => ({ ...s, deadline: e.target.value }))} />
                        </div>
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Link link dự án</label>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="URL link dự án hoặc repo lưu tài liệu (tuỳ chọn)"
                            value={form.repo_url}
                            onChange={(e) => setForm((s) => ({ ...s, repo_url: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Website dự án (Google Search Console)</label>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="VD: https://clickon.vn/"
                            value={form.website_url}
                            onChange={(e) => setForm((s) => ({ ...s, website_url: e.target.value }))}
                        />
                        <p className="mt-1 text-xs text-text-muted">
                            Sau khi nhập URL, vào chi tiết dự án để bật thông báo GSC. Khi bật, hệ thống sẽ tự lấy dữ liệu hằng ngày theo giờ cấu hình.
                        </p>
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Trạng thái dự án</label>
                        <select className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
                            {statusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Yêu cầu khách hàng</label>
                        <textarea className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" rows={3} placeholder="Mô tả yêu cầu, phạm vi triển khai hoặc ghi chú từ khách" value={form.customer_requirement} onChange={(e) => setForm((s) => ({ ...s, customer_requirement: e.target.value }))} />
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="flex-1 bg-primary text-white rounded-2xl py-2.5 font-semibold" onClick={save} type="button">
                            {editingId ? 'Cập nhật dự án' : 'Tạo dự án'}
                        </button>
                        <button className="flex-1 border border-slate-200 rounded-2xl py-2.5 font-semibold" onClick={closeForm} type="button">
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>
        </PageContainer>
    );
}
