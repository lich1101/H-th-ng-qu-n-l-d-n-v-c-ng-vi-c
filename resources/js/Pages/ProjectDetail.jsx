import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Modal from '@/Components/Modal';
import ProjectWebsiteGscField from '@/Components/ProjectWebsiteGscField';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';
import { absoluteHttpUrl } from '@/lib/externalUrl';
import { progressBarFillClass } from '@/lib/progressBarFill';
import { datesFromContract, taskDefaultsFromProject } from '@/lib/timelineDefaults';
import { formatVietnamDate, formatVietnamDateShort, toDateInputValue } from '@/lib/vietnamTime';

const PROJECT_STATUS = {
    moi_tao: 'Mới tạo', dang_trien_khai: 'Đang triển khai',
    cho_duyet: 'Chờ duyệt', hoan_thanh: 'Hoàn thành', tam_dung: 'Tạm dừng',
};
const PROJECT_STATUS_STYLES = {
    moi_tao: 'bg-slate-100 text-slate-700 border-slate-200',
    dang_trien_khai: 'bg-blue-50 text-blue-700 border-blue-200',
    cho_duyet: 'bg-amber-50 text-amber-700 border-amber-200',
    hoan_thanh: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    tam_dung: 'bg-rose-50 text-rose-700 border-rose-200',
};
const TASK_STATUS = { todo: 'Cần làm', doing: 'Đang làm', done: 'Hoàn tất', blocked: 'Bị chặn' };
const TASK_STATUS_STYLES = {
    todo: 'bg-slate-100 text-slate-700 border-slate-200',
    doing: 'bg-blue-50 text-blue-700 border-blue-200',
    done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blocked: 'bg-rose-50 text-rose-700 border-rose-200',
};
const PRIORITY = { low: 'Thấp', medium: 'Trung Bình', high: 'Cao', urgent: 'Khẩn' };
const PRIORITY_STYLES = {
    low: 'bg-slate-100 text-slate-700 border-slate-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    urgent: 'bg-rose-50 text-rose-700 border-rose-200',
};

const formatDate = (raw) => formatVietnamDate(raw, '—');
const formatNumber = (v) => Number(v || 0).toLocaleString('vi-VN');

const DEFAULT_PROJECT_STATUSES = [
    { value: 'moi_tao', label: 'Mới tạo' },
    { value: 'dang_trien_khai', label: 'Đang triển khai' },
    { value: 'cho_duyet', label: 'Chờ duyệt' },
    { value: 'hoan_thanh', label: 'Hoàn thành' },
    { value: 'tam_dung', label: 'Tạm dừng' },
];
const DEFAULT_PROJECT_SERVICES = [
    { value: 'backlinks', label: 'Backlinks' },
    { value: 'viet_content', label: 'Content' },
    { value: 'audit_content', label: 'Audit Content' },
    { value: 'cham_soc_website_tong_the', label: 'Website Care' },
    { value: 'noi_bo', label: 'Dự án Nội bộ' },
    { value: 'khac', label: 'Khác' },
];
const PROJECT_LABELS = {
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
const BLOCKED_OWNER_ROLES = ['admin', 'administrator', 'ke_toan'];

const injectCurrentProjectContract = (rows, project) => {
    const contractId = Number(
        project?.contract_id
        || project?.contract?.id
        || project?.linked_contract?.id
        || 0,
    );
    if (contractId <= 0) return rows;
    if (rows.some((item) => Number(item?.id || 0) === contractId)) {
        return rows;
    }
    return [
        {
            id: contractId,
            code: project?.contract?.code || project?.linked_contract?.code || `HĐ #${contractId}`,
            title: project?.contract?.title
                || project?.linked_contract?.title
                || `Hợp đồng liên kết của dự án #${project?.id || ''}`,
        },
        ...rows,
    ];
};

export default function ProjectDetail(props) {
    const toast = useToast();
    const projectId = props.projectId;
    const currentRole = props?.auth?.user?.role || '';

    const [project, setProject] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [gsc, setGsc] = useState(null);
    const [loading, setLoading] = useState(true);
    const [gscLoading, setGscLoading] = useState(false);
    const [gscNotifySaving, setGscNotifySaving] = useState(false);
    const [activeTab, setActiveTab] = useState('all');

    // Task creation modal
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [editingTaskId, setEditingTaskId] = useState(null);
    const [savingTask, setSavingTask] = useState(false);
    const [departments, setDepartments] = useState([]);
    const [users, setUsers] = useState([]);
    const [taskForm, setTaskForm] = useState({
        title: '', description: '', status: 'todo', priority: 'medium',
        weight_percent: '', start_date: '', deadline: '',
        department_id: '', assignee_id: '',
    });

    const [meta, setMeta] = useState({});
    const [contracts, setContracts] = useState([]);
    const [workflowTopics, setWorkflowTopics] = useState([]);
    const [owners, setOwners] = useState([]);
    const [showProjectForm, setShowProjectForm] = useState(false);
    const [savingProject, setSavingProject] = useState(false);
    const [editingOriginalWorkflowTopicId, setEditingOriginalWorkflowTopicId] = useState(0);
    const [projectForm, setProjectForm] = useState({
        code: '',
        name: '',
        client_id: '',
        contract_id: '',
        service_type: DEFAULT_PROJECT_SERVICES[0].value,
        service_type_other: '',
        start_date: '',
        deadline: '',
        budget: '',
        status: DEFAULT_PROJECT_STATUSES[0].value,
        customer_requirement: '',
        owner_id: '',
        repo_url: '',
        website_url: '',
        workflow_topic_id: '',
    });

    const canManageTasks = useMemo(
        () => !!project?.permissions?.can_edit || ['admin', 'administrator', 'quan_ly'].includes(currentRole),
        [project, currentRole]
    );

    const canEditProject = useMemo(
        () => !!project?.permissions?.can_edit,
        [project]
    );

    const statusOptions = useMemo(() => {
        const values = meta.project_statuses || [];
        if (!values.length) return DEFAULT_PROJECT_STATUSES;
        return values.map((value) => ({ value, label: PROJECT_LABELS[value] || value }));
    }, [meta]);

    const serviceOptions = useMemo(() => {
        const values = meta.service_types || [];
        if (!values.length) return DEFAULT_PROJECT_SERVICES;
        return values.map((value) => ({ value, label: PROJECT_LABELS[value] || value }));
    }, [meta]);

    const ownerOptions = useMemo(
        () => owners.filter((o) => !BLOCKED_OWNER_ROLES.includes(String(o?.role || '').toLowerCase())),
        [owners]
    );

    const fetchGsc = async () => {
        setGscLoading(true);
        try {
            const response = await axios.get(`/api/v1/projects/${projectId}/search-console`, {
                params: { validate: 1, days: 3650 },
            });
            setGsc(response.data || null);
        } catch (e) {
            const message = e?.response?.data?.message || 'Không tải được dữ liệu Google Search Console.';
            setGsc((prev) => ({ ...(prev || {}), status: { ...(prev?.status || {}), sync_error: message } }));
            toast.error(message);
        } finally { setGscLoading(false); }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [projRes, taskRes] = await Promise.all([
                axios.get(`/api/v1/projects/${projectId}`),
                axios.get('/api/v1/tasks', { params: { project_id: projectId, per_page: 200 } }),
            ]);
            setProject(projRes.data || null);
            setTasks(taskRes.data?.data || []);
            await fetchGsc();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được dự án.');
        } finally { setLoading(false); }
    };

    const fetchLookups = async () => {
        try {
            const [dRes, uRes, metaRes, wfRes, ownRes] = await Promise.all([
                axios.get('/api/v1/departments'),
                axios.get('/api/v1/users/lookup'),
                axios.get('/api/v1/meta'),
                axios.get('/api/v1/workflow-topics', { params: { per_page: 200, is_active: true } }),
                axios.get('/api/v1/users/lookup', { params: { purpose: 'project_owner' } }),
            ]);
            setDepartments(dRes.data?.data || dRes.data || []);
            setUsers(uRes.data?.data || uRes.data || []);
            setMeta(metaRes.data || {});
            setWorkflowTopics(wfRes.data?.data || []);
            setOwners(ownRes.data?.data || []);
        } catch { /* ignore */ }
    };

    const fetchContractsForEdit = async (currentProject) => {
        try {
            const res = await axios.get('/api/v1/contracts', {
                params: {
                    per_page: 200,
                    available_only: true,
                    project_id: projectId,
                },
            });
            const rows = injectCurrentProjectContract(res.data?.data || [], currentProject);
            setContracts(rows);
        } catch {
            setContracts(injectCurrentProjectContract([], currentProject));
        }
    };

    const openProjectEdit = async () => {
        if (!project) return;
        setEditingOriginalWorkflowTopicId(Number(project.workflow_topic_id || project.workflow_topic?.id || 0));
        const resolvedContractId = project.contract_id || project.contract?.id || project.linked_contract?.id || '';
        setProjectForm({
            code: project.code || '',
            name: project.name || '',
            client_id: project.client_id ? String(project.client_id) : '',
            contract_id: resolvedContractId ? String(resolvedContractId) : '',
            service_type: project.service_type || DEFAULT_PROJECT_SERVICES[0].value,
            service_type_other: project.service_type_other || '',
            start_date: toDateInputValue(project.start_date),
            deadline: toDateInputValue(project.deadline),
            budget: project.budget ?? '',
            status: project.status || DEFAULT_PROJECT_STATUSES[0].value,
            customer_requirement: project.customer_requirement || '',
            owner_id: String(project.owner_id || project.owner?.id || ''),
            repo_url: project.repo_url || '',
            website_url: project.website_url || '',
            workflow_topic_id: String(project.workflow_topic_id || project.workflow_topic?.id || ''),
        });
        setShowProjectForm(true);
        await fetchContractsForEdit(project);
    };

    const saveProject = async () => {
        if (!canEditProject || !projectForm.name?.trim()) {
            toast.error('Vui lòng nhập tên dự án.');
            return;
        }
        setSavingProject(true);
        try {
            const payload = {
                ...projectForm,
                client_id: projectForm.client_id ? Number(projectForm.client_id) : null,
                contract_id: projectForm.contract_id ? Number(projectForm.contract_id) : null,
                budget: projectForm.budget === '' ? null : Number(projectForm.budget),
                start_date: projectForm.start_date || null,
                deadline: projectForm.deadline || null,
                service_type_other: projectForm.service_type === 'khac' ? projectForm.service_type_other : null,
                owner_id: projectForm.owner_id ? Number(projectForm.owner_id) : null,
                repo_url: projectForm.repo_url?.trim() ? projectForm.repo_url.trim() : null,
                website_url: projectForm.website_url?.trim() ? projectForm.website_url.trim() : null,
                workflow_topic_id: projectForm.workflow_topic_id ? Number(projectForm.workflow_topic_id) : null,
            };
            const previousTopicId = Number(editingOriginalWorkflowTopicId || 0);
            const nextTopicId = Number(payload.workflow_topic_id || 0);
            const isChangingBetweenTopics = previousTopicId > 0 && nextTopicId > 0 && previousTopicId !== nextTopicId;
            if (isChangingBetweenTopics) {
                const oldTopic = workflowTopics.find((t) => Number(t.id) === previousTopicId);
                const newTopic = workflowTopics.find((t) => Number(t.id) === nextTopicId);
                const oldTopicName = oldTopic?.name || `#${previousTopicId}`;
                const newTopicName = newTopic?.name || `#${nextTopicId}`;
                const confirmed = window.confirm(
                    `Bạn đang đổi Topic Barem từ "${oldTopicName}" sang "${newTopicName}".\n\n`
                    + 'Hệ thống sẽ xóa toàn bộ công việc/đầu việc hiện tại của dự án và tạo lại theo barem mới.\n'
                    + 'Bạn có chắc chắn muốn tiếp tục không?',
                );
                if (!confirmed) {
                    setSavingProject(false);
                    return;
                }
                payload.confirm_reapply_workflow = true;
            }
            await axios.put(`/api/v1/projects/${projectId}`, payload);
            toast.success('Đã cập nhật dự án.');
            setShowProjectForm(false);
            await fetchData();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Cập nhật dự án thất bại.');
        } finally {
            setSavingProject(false);
        }
    };

    useEffect(() => { fetchData(); fetchLookups(); }, [projectId]);

    const updateGscNotification = async (enabled) => {
        if (gscNotifySaving) return;
        setGscNotifySaving(true);
        try {
            const response = await axios.put(`/api/v1/projects/${projectId}/search-console/notification`, { enabled: !!enabled });
            const payload = response?.data?.data || null;
            if (payload) setGsc(payload);
            else await fetchGsc();
            toast.success(response?.data?.message || (enabled ? 'Đã bật thông báo GSC.' : 'Đã tắt thông báo GSC.'));
        } catch (e) {
            const message = e?.response?.data?.message || 'Không cập nhật được trạng thái thông báo GSC.';
            const payload = e?.response?.data?.data || null;
            if (payload) setGsc(payload);
            else await fetchGsc();
            toast.error(message);
        } finally {
            setGscNotifySaving(false);
        }
    };

    // Group tasks by assignee
    const taskGroups = useMemo(() => {
        const map = {};
        tasks.forEach((task) => {
            const key = String(task?.assignee?.id || 0);
            if (!map[key]) {
                map[key] = { id: task?.assignee?.id || 0, name: task?.assignee?.name || 'Chưa gán', rows: [] };
            }
            map[key].rows.push(task);
        });
        return Object.values(map).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    }, [tasks]);

    const tabs = useMemo(() => [
        { key: 'all', label: 'Tất cả', count: tasks.length },
        ...taskGroups.map((g) => ({ key: String(g.id), label: g.name, count: g.rows.length })),
    ], [tasks, taskGroups]);

    const visibleTasks = useMemo(() => {
        if (activeTab === 'all') return tasks;
        return tasks.filter((t) => String(t?.assignee?.id || 0) === activeTab);
    }, [tasks, activeTab]);

    // Task form actions
    const openTaskForm = (task = null) => {
        const projectDefaultStatus = project?.status === 'hoan_thanh'
            ? 'done'
            : project?.status === 'dang_trien_khai'
                ? 'doing'
                : 'todo';

        setEditingTaskId(task?.id || null);
        const projectTaskDefaults = taskDefaultsFromProject(project);
        setTaskForm({
            title: task?.title || '',
            description: task?.description || (!task && project?.customer_requirement ? String(project.customer_requirement) : ''),
            status: task?.status || projectDefaultStatus,
            priority: task?.priority || 'medium',
            weight_percent: task?.weight_percent ?? '',
            start_date: task?.start_at
                ? toDateInputValue(task.start_at)
                : (!task ? (projectTaskDefaults.start || '') : ''),
            deadline: task?.deadline
                ? toDateInputValue(task.deadline)
                : (!task ? (projectTaskDefaults.end || '') : ''),
            department_id: task?.department_id || project?.owner?.department_id || '',
            assignee_id: task?.assignee_id || project?.owner_id || '',
        });
        setShowTaskForm(true);
    };

    const currentTotalWeight = useMemo(() => {
        return tasks.reduce((sum, t) => sum + (Number(t.weight_percent) || 0), 0);
    }, [tasks]);

    const editingTaskWeight = useMemo(() => {
        if (!editingTaskId) return 0;
        const tt = tasks.find(x => x.id === editingTaskId);
        return Number(tt?.weight_percent || 0);
    }, [tasks, editingTaskId]);

    const remainingWeight = Math.max(0, 100 - currentTotalWeight + editingTaskWeight);

    const saveTask = async () => {
        if (!taskForm.title.trim()) { toast.error('Tiêu đề công việc là bắt buộc.'); return; }

        const wp = taskForm.weight_percent === '' ? 0 : Number(taskForm.weight_percent);
        if (wp > remainingWeight) {
            toast.error(`Tổng tỷ trọng không được lố 100%. Mức nhập tối đa hiện tại: ${remainingWeight}%`);
            return;
        }

        setSavingTask(true);
        try {
            const payload = {
                ...taskForm,
                project_id: projectId,
                weight_percent: taskForm.weight_percent === '' ? null : Number(taskForm.weight_percent),
                department_id: taskForm.department_id ? Number(taskForm.department_id) : null,
                assignee_id: taskForm.assignee_id ? Number(taskForm.assignee_id) : null,
                start_at: taskForm.start_date || null,
                deadline: taskForm.deadline || null,
            };
            if (editingTaskId) {
                await axios.put(`/api/v1/tasks/${editingTaskId}`, payload);
                toast.success('Đã cập nhật công việc.');
            } else {
                await axios.post('/api/v1/tasks', payload);
                toast.success('Đã tạo công việc.');
            }
            setShowTaskForm(false);
            await fetchData();
        } catch (e) { toast.error(e?.response?.data?.message || 'Lưu công việc thất bại.'); }
        finally { setSavingTask(false); }
    };

    const deleteTask = async (taskId) => {
        if (!window.confirm('Xóa công việc này?')) return;
        try {
            await axios.delete(`/api/v1/tasks/${taskId}`);
            toast.success('Đã xóa công việc.');
            await fetchData();
        } catch (e) { toast.error(e?.response?.data?.message || 'Xóa thất bại.'); }
    };

    const quickStatus = async (task, nextStatus) => {
        try {
            await axios.put(`/api/v1/tasks/${task.id}`, {
                ...task, project_id: projectId, status: nextStatus,
                department_id: task.department_id || null,
                assignee_id: task.assignee_id || null,
            });
            toast.success('Đã đổi trạng thái.');
            await fetchData();
        } catch (e) { toast.error(e?.response?.data?.message || 'Đổi trạng thái thất bại.'); }
    };

    const stats = project ? [
        { label: 'Tiến độ', value: `${project.progress_percent ?? 0}%` },
        { label: 'Công việc', value: String(tasks.length) },
        { label: 'Trạng thái', value: PROJECT_STATUS[project.status] || project.status },
        { label: 'Hạn chót', value: project.deadline ? formatDate(project.deadline) : '—' },
    ] : [];

    const gscTrend = gsc?.trend || [];
    const gscLatest = gsc?.latest || null;
    const gscSummary = gsc?.summary || null;
    const gscTrendChart = useMemo(() => {
        if (Array.isArray(gscTrend) && gscTrend.length > 0) return gscTrend;
        if (!gscLatest) return [];

        const priorDate = gscLatest?.prior_date ? String(gscLatest.prior_date) : '';
        const metricDate = gscLatest?.metric_date ? String(gscLatest.metric_date) : '';
        const priorClicks = Number(gscLatest?.prior_clicks || 0);
        const lastClicks = Number(gscLatest?.last_clicks || 0);

        const rows = [];
        if (priorDate) {
            rows.push({
                date: priorDate,
                clicks: priorClicks,
                delta_clicks: 0,
            });
        }
        if (metricDate) {
            rows.push({
                date: metricDate,
                clicks: lastClicks,
                delta_clicks: Number(gscLatest?.delta_clicks || (lastClicks - priorClicks)),
            });
        }
        return rows;
    }, [gscLatest, gscTrend]);
    const gscStatus = gsc?.status || {};
    const gscNotifyEnabled = !!gscStatus?.project_notify_enabled;
    const gscCanManageNotification = !!gscStatus?.can_manage_notification;
    const gscCanEnableNotification = !!gscStatus?.can_enable_notification;
    const gscEnableBlockReason = String(gscStatus?.enable_block_reason || '').trim();
    const gscTrackingStartedAt = gscStatus?.tracking_started_at || null;
    const gscLastSyncedAt = gscStatus?.last_synced_at || null;
    const gscCanToggleNotification = gscCanManageNotification && (gscNotifyEnabled || gscCanEnableNotification);
    const gscMaxClicks = useMemo(() => {
        const max = Math.max(...gscTrendChart.map((item) => Number(item?.clicks || 0)), 0);
        return max > 0 ? max : 1;
    }, [gscTrendChart]);

    return (
        <PageContainer
            auth={props.auth}
            title="Chi tiết dự án"
            description="Theo dõi thông tin dự án, hợp đồng và danh sách công việc."
            stats={stats}
        >
            {loading && <p className="text-sm text-text-muted">Đang tải...</p>}
            {!loading && project && (
                <div className="space-y-6">
                    {/* Breadcrumb */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                        <a href="/du-an" className="hover:text-primary">Dự án</a>
                        <span>›</span>
                        <span className="font-semibold text-slate-700">{project.name}</span>
                    </div>

                    {/* Project info card */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">{project.name}</h3>
                                <p className="text-xs text-text-muted">{project.code || '—'}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${PROJECT_STATUS_STYLES[project.status] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                    {PROJECT_STATUS[project.status] || project.status}
                                </span>
                                <a className="text-sm text-primary font-semibold" href={`/du-an/${project.id}/luong`}>Luồng</a>
                                <a className="text-sm text-slate-600 font-semibold" href={`/du-an/${project.id}/kho`}>Lưu Tài Liệu</a>
                                {canEditProject && (
                                    <button
                                        type="button"
                                        onClick={openProjectEdit}
                                        className="rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-primary/40 hover:text-primary"
                                    >
                                        Sửa dự án
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4 text-sm">
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Hợp đồng</div>
                                <div className="mt-1 font-semibold text-slate-900">{project.contract?.code || 'Chưa có'}</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Khách hàng</div>
                                <div className="mt-1 font-semibold text-slate-900">{project.client?.name || '—'}</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Phụ trách triển khai</div>
                                <div className="mt-1 font-semibold text-slate-900">{project.owner?.name || '—'}</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Tiến độ</div>
                                <div className="mt-1 flex items-center gap-2">
                                    <div className="h-2 flex-1 rounded-full bg-slate-200">
                                        <div className={`h-2 rounded-full ${progressBarFillClass(project.progress_percent)} transition-all`} style={{ width: `${Math.min(100, project.progress_percent || 0)}%` }} />
                                    </div>
                                    <span className="font-semibold text-slate-900">{project.progress_percent ?? 0}%</span>
                                </div>
                            </div>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-4 text-sm">
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Deadline</div>
                                <div className="mt-1 font-semibold text-slate-900">{formatDate(project.deadline)}</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Bắt đầu</div>
                                <div className="mt-1 font-semibold text-slate-900">{formatDate(project.start_date)}</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Link Lưu Tài Liệu</div>
                                <div className="mt-1">{project.repo_url ? <a className="text-primary font-semibold text-xs" href={absoluteHttpUrl(project.repo_url)} target="_blank" rel="noreferrer">Mở kho</a> : <span className="text-text-muted">—</span>}</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Website</div>
                                <div className="mt-1">{project.website_url ? <a className="text-primary font-semibold text-xs" href={absoluteHttpUrl(project.website_url)} target="_blank" rel="noreferrer">Mở website</a> : <span className="text-text-muted">—</span>}</div>
                            </div>
                        </div>
                    </div>

                    {/* Topic barem */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                        <h4 className="font-semibold text-slate-900">Topic barem</h4>
                        <p className="mt-1 text-xs text-text-muted">
                            Barem công việc mẫu gắn với dự án (quy trình dịch vụ). Dùng khi tạo công việc/đầu việc theo khung chuẩn.
                        </p>
                        {project.workflow_topic_id ? (
                            <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-base font-semibold text-slate-900">
                                            {project.workflow_topic?.name || `Topic #${project.workflow_topic_id}`}
                                        </p>
                                        {project.workflow_topic?.code && (
                                            <p className="mt-1 text-sm text-text-muted">Mã: <span className="font-medium text-slate-700">{project.workflow_topic.code}</span></p>
                                        )}
                                        {project.workflow_topic && (
                                            <p className="mt-2 text-xs text-text-muted">
                                                Trạng thái topic:{' '}
                                                <span className={`font-semibold ${project.workflow_topic.is_active ? 'text-emerald-700' : 'text-slate-500'}`}>
                                                    {project.workflow_topic.is_active ? 'Đang bật' : 'Đang tắt'}
                                                </span>
                                            </p>
                                        )}
                                    </div>
                                    <a
                                        href={`/quy-trinh-dich-vu/${project.workflow_topic_id}`}
                                        className="shrink-0 rounded-xl bg-primary/10 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/15"
                                    >
                                        Xem quy trình barem
                                    </a>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-text-muted">
                                Dự án chưa gán topic barem. {canEditProject ? 'Bấm « Sửa dự án » để chọn barem (hoặc để trống nếu tự tạo công việc).' : ''}
                            </div>
                        )}
                    </div>

                    {/* GSC Section */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h4 className="font-semibold text-slate-900">Google Search Console</h4>
                                {gscTrackingStartedAt && (
                                    <p className="mt-1 text-[11px] text-text-muted">
                                        Biểu đồ tính từ ngày thêm website: {formatDate(gscTrackingStartedAt)}
                                        {gscLastSyncedAt ? ` • Đồng bộ gần nhất: ${formatDate(gscLastSyncedAt)}` : ''}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={`text-xs font-semibold ${gscNotifyEnabled ? 'text-emerald-700' : 'text-slate-500'}`}>
                                    {gscNotifyEnabled ? 'Đang bật thông báo' : 'Đang tắt thông báo'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => updateGscNotification(!gscNotifyEnabled)}
                                    disabled={gscNotifySaving || gscLoading || !gscCanToggleNotification}
                                    className={`relative inline-flex h-7 w-12 items-center rounded-full border transition ${
                                        gscNotifyEnabled ? 'border-primary bg-primary' : 'border-slate-300 bg-slate-200'
                                    } disabled:cursor-not-allowed disabled:opacity-50`}
                                    aria-label="Bật/tắt thông báo Google Search Console"
                                >
                                    <span
                                        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                                            gscNotifyEnabled ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                    />
                                </button>
                            </div>
                        </div>

                        {!project.website_url && (
                            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                                Dự án chưa có website. Hãy cập nhật URL website hợp lệ trước khi bật thông báo GSC.
                            </div>
                        )}

                        {gscEnableBlockReason && !gscNotifyEnabled && (
                            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                                {gscEnableBlockReason}
                            </div>
                        )}

                        {gscStatus?.sync_error && (
                            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{gscStatus.sync_error}</div>
                        )}

                        {!gscLoading && gscLatest && (
                            <div className="mt-3 grid gap-3 md:grid-cols-4">
                                <div className="rounded-xl border border-slate-200/80 p-3">
                                    <div className="text-xs text-text-muted">Clicks</div>
                                    <div className="text-base font-semibold text-slate-900">{formatNumber(gscLatest.last_clicks)}</div>
                                    <div className={`text-xs ${Number(gscLatest.delta_clicks || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                        {Number(gscLatest.delta_clicks || 0) >= 0 ? '+' : ''}{formatNumber(gscLatest.delta_clicks)}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-slate-200/80 p-3">
                                    <div className="text-xs text-text-muted">Impressions</div>
                                    <div className="text-base font-semibold text-slate-900">{formatNumber(gscLatest.last_impressions)}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200/80 p-3">
                                    <div className="text-xs text-text-muted">TB Clicks/ngày</div>
                                    <div className="text-base font-semibold text-slate-900">{gscSummary ? formatNumber(gscSummary.avg_clicks_per_day) : '—'}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200/80 p-3">
                                    <div className="text-xs text-text-muted">Alerts</div>
                                    <div className="text-base font-semibold text-slate-900">{formatNumber(gscLatest.alerts_total || 0)}</div>
                                </div>
                            </div>
                        )}

                        {gscTrendChart.length > 0 && (
                            <div className="mt-4">
                                <div className="mb-2 flex items-center justify-between">
                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                        Biểu đồ tăng trưởng clicks
                                    </p>
                                    <p className="text-[11px] text-text-muted">
                                        {gscTrendChart.length} mốc dữ liệu
                                    </p>
                                </div>
                                <div className="flex items-end gap-1 overflow-x-auto pb-2">
                                {gscTrendChart.map((item) => {
                                    const clicks = Number(item.clicks || 0);
                                    const h = Math.max(4, Math.round((clicks / gscMaxClicks) * 100));
                                    return (
                                        <div key={item.date} className="min-w-[28px] text-center">
                                            <div className="h-24 flex items-end justify-center">
                                                <div className={`w-5 rounded-t ${Number(item.delta_clicks || 0) >= 0 ? 'bg-emerald-500/70' : 'bg-rose-500/70'}`} style={{ height: `${h}%` }}
                                                    title={`${formatVietnamDate(item.date)}: ${formatNumber(clicks)} clicks`} />
                                            </div>
                                            <div className="text-[9px] text-text-muted mt-1" title={formatVietnamDate(item.date)}>{formatVietnamDateShort(item.date)}</div>
                                        </div>
                                    );
                                })}
                                </div>
                            </div>
                        )}

                        {gscLoading && <p className="mt-3 text-sm text-text-muted">Đang tải...</p>}
                        {!gscLoading && !gscLatest && <p className="mt-3 text-sm text-text-muted">Chưa có dữ liệu.</p>}
                    </div>

                    {/* Task list with tabs */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <div>
                                <h4 className="font-semibold text-slate-900">Danh sách công việc</h4>
                                <p className="text-xs text-text-muted mt-1">{tasks.length} công việc trong dự án</p>
                            </div>
                            {canManageTasks && (
                                <button type="button" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white" onClick={() => openTaskForm(null)}>
                                    Thêm công việc
                                </button>
                            )}
                        </div>

                        {/* Assignee tabs */}
                        {tabs.length > 1 && (
                            <div className="flex flex-wrap gap-2 mb-4 border-b border-slate-200/60 pb-3">
                                {tabs.map((tab) => (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => setActiveTab(tab.key)}
                                        className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                                            activeTab === tab.key
                                                ? 'bg-primary text-white shadow-sm'
                                                : 'border border-slate-200/80 bg-white text-slate-600 hover:border-primary/30 hover:text-primary'
                                        }`}
                                    >
                                        {tab.label} ({tab.count})
                                    </button>
                                ))}
                            </div>
                        )}

                        {visibleTasks.length === 0 && (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-text-muted">
                                Chưa có công việc nào.
                            </div>
                        )}

                        {visibleTasks.length > 0 && (
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                                            <th className="py-2">Công việc</th>
                                            <th className="py-2">Phụ trách</th>
                                            <th className="py-2">Trạng thái</th>
                                            <th className="py-2">Ưu tiên</th>
                                            <th className="py-2">Tiến độ</th>
                                            <th className="py-2">Tỷ trọng</th>
                                            <th className="py-2">Deadline</th>
                                            <th className="py-2 text-right">Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleTasks.map((task) => (
                                            <tr key={task.id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => { window.location.href = `/cong-viec/${task.id}`; }}>
                                                <td className="py-2.5">
                                                    <p className="font-medium text-slate-900">{task.title}</p>
                                                    {task.description && <p className="text-xs text-text-muted truncate max-w-[200px]">{task.description}</p>}
                                                </td>
                                                <td className="py-2.5 text-xs text-slate-600">{task.assignee?.name || '—'}</td>
                                                <td className="py-2.5">
                                                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${TASK_STATUS_STYLES[task.status] || TASK_STATUS_STYLES.todo}`}>
                                                        {TASK_STATUS[task.status] || task.status}
                                                    </span>
                                                </td>
                                                <td className="py-2.5">
                                                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium}`}>
                                                        {PRIORITY[task.priority] || task.priority || 'Trung Bình'}
                                                    </span>
                                                </td>
                                                <td className="py-2.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-1.5 w-16 rounded-full bg-slate-100">
                                                            <div className={`h-1.5 rounded-full ${progressBarFillClass(task.progress_percent)}`} style={{ width: `${Math.min(100, task.progress_percent || 0)}%` }} />
                                                        </div>
                                                        <span className="text-xs text-slate-600">{task.progress_percent ?? 0}%</span>
                                                    </div>
                                                </td>
                                                <td className="py-2.5 text-xs text-slate-600">{Number(task.weight_percent ?? 0)}%</td>
                                                <td className="py-2.5 text-xs text-slate-600">{formatDate(task.deadline)}</td>
                                                <td className="py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center justify-end gap-1">
                                                        <a href={`/cong-viec/${task.id}`} className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5">Chi tiết</a>
                                                        {canManageTasks && (
                                                            <>
                                                                <button type="button" className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100" onClick={() => openTaskForm(task)}>Sửa</button>
                                                                {task.status !== 'done' && (
                                                                    <button type="button" className="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-50" onClick={() => quickStatus(task, 'done')}>✓</button>
                                                                )}
                                                                {currentRole === 'admin' && (
                                                                    <button type="button" className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50" onClick={() => deleteTask(task.id)}>Xóa</button>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Task Form Modal */}
            <Modal
                open={showTaskForm}
                onClose={() => setShowTaskForm(false)}
                title={editingTaskId ? 'Sửa công việc' : 'Thêm công việc mới'}
                description={project ? `Dự án: ${project.name}` : ''}
                size="lg"
            >
                <div className="space-y-4 text-sm">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                            <label className="text-xs text-text-muted">Tiêu đề *</label>
                            <input className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={taskForm.title} onChange={(e) => setTaskForm((s) => ({ ...s, title: e.target.value }))} />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-xs text-text-muted">Mô tả</label>
                            <textarea className="mt-2 min-h-[80px] w-full rounded-xl border border-slate-200/80 px-3 py-2" value={taskForm.description} onChange={(e) => setTaskForm((s) => ({ ...s, description: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Trạng thái</label>
                            <select className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={taskForm.status} onChange={(e) => setTaskForm((s) => ({ ...s, status: e.target.value }))}>
                                {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Ưu tiên</label>
                            <select className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={taskForm.priority} onChange={(e) => setTaskForm((s) => ({ ...s, priority: e.target.value }))}>
                                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Phòng ban</label>
                            <select className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={taskForm.department_id} onChange={(e) => setTaskForm((s) => ({ ...s, department_id: e.target.value }))}>
                                <option value="">-- Chọn --</option>
                                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Nhân sự phụ trách</label>
                            <select className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={taskForm.assignee_id} onChange={(e) => setTaskForm((s) => ({ ...s, assignee_id: e.target.value }))}>
                                <option value="">-- Chọn --</option>
                                {users.filter((u) => !['admin', 'administrator', 'ke_toan'].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">
                                Tỷ trọng (%)
                                <span className={`ml-1 font-semibold ${remainingWeight < Number(taskForm.weight_percent || 0) ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    - Còn trống: {remainingWeight}%
                                </span>
                            </label>
                            <input type="number" min="1" max={remainingWeight || 100} className={`mt-2 w-full rounded-xl border px-3 py-2 ${remainingWeight < Number(taskForm.weight_percent || 0) ? 'border-rose-300 ring-4 ring-rose-50' : 'border-slate-200/80'}`} value={taskForm.weight_percent} onChange={(e) => setTaskForm((s) => ({ ...s, weight_percent: e.target.value }))} />
                            {remainingWeight < Number(taskForm.weight_percent || 0) && (
                                <p className="mt-1 text-xs text-rose-600">Vượt quá {remainingWeight}% tỷ trọng cho phép!</p>
                            )}
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Ngày bắt đầu</label>
                            <input type="date" className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={taskForm.start_date} onChange={(e) => setTaskForm((s) => ({ ...s, start_date: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Deadline</label>
                            <input type="date" className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={taskForm.deadline} onChange={(e) => setTaskForm((s) => ({ ...s, deadline: e.target.value }))} />
                        </div>
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                        <button type="button" className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white" onClick={saveTask} disabled={savingTask}>
                            {savingTask ? 'Đang lưu...' : editingTaskId ? 'Cập nhật' : 'Tạo công việc'}
                        </button>
                        <button type="button" className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700" onClick={() => setShowTaskForm(false)}>Hủy</button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={showProjectForm}
                onClose={() => setShowProjectForm(false)}
                title="Sửa dự án"
                description={project ? `Dự án: ${project.name}` : ''}
                size="lg"
            >
                <div className="space-y-5 text-sm">
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Mã dự án</label>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-slate-600"
                            value={projectForm.code || ''}
                            readOnly
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Tên dự án *</label>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Tên dự án hiển thị với đội triển khai"
                            value={projectForm.name}
                            onChange={(e) => setProjectForm((s) => ({ ...s, name: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Loại dịch vụ</label>
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={projectForm.service_type}
                            onChange={(e) => setProjectForm((s) => ({ ...s, service_type: e.target.value }))}
                        >
                            {serviceOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Barem công việc theo Topic</label>
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={projectForm.workflow_topic_id}
                            onChange={(e) => setProjectForm((s) => ({ ...s, workflow_topic_id: e.target.value }))}
                        >
                            <option value="">Không dùng barem</option>
                            {workflowTopics.map((topic) => (
                                <option key={topic.id} value={String(topic.id)}>
                                    {topic.name} {topic.code ? `• ${topic.code}` : ''} ({topic.tasks?.length || 0} công việc mẫu)
                                </option>
                            ))}
                        </select>
                        <p className="mt-1 text-xs text-text-muted">
                            Đổi topic khác topic hiện tại sẽ xóa công việc/đầu việc và tạo lại theo barem mới (cần xác nhận).
                        </p>
                    </div>
                    {projectForm.service_type === 'khac' && (
                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Tên dịch vụ khác</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                placeholder="Nhập đúng tên dịch vụ cần triển khai"
                                value={projectForm.service_type_other}
                                onChange={(e) => setProjectForm((s) => ({ ...s, service_type_other: e.target.value }))}
                            />
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Hợp đồng liên kết</label>
                            <select
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={projectForm.contract_id}
                                onChange={(e) => {
                                    const id = e.target.value;
                                    setProjectForm((s) => {
                                        if (!id) {
                                            return { ...s, contract_id: '', start_date: '', deadline: '' };
                                        }
                                        const c = contracts.find((x) => String(x.id) === String(id));
                                        const d = datesFromContract(c);
                                        return { ...s, contract_id: id, start_date: d.start, deadline: d.end };
                                    });
                                }}
                            >
                                <option value="">Chọn hợp đồng (tuỳ chọn)</option>
                                {contracts.map((c) => (
                                    <option key={c.id} value={String(c.id)}>
                                        {c.code} • {c.title}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Người phụ trách triển khai</label>
                            <select
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={projectForm.owner_id}
                                onChange={(e) => setProjectForm((s) => ({ ...s, owner_id: e.target.value }))}
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
                            <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" type="date" value={projectForm.start_date} onChange={(e) => setProjectForm((s) => ({ ...s, start_date: e.target.value }))} />
                        </div>
                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Hạn chót</label>
                            <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" type="date" value={projectForm.deadline} onChange={(e) => setProjectForm((s) => ({ ...s, deadline: e.target.value }))} />
                        </div>
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Ngân sách (tuỳ chọn)</label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={projectForm.budget}
                            onChange={(e) => setProjectForm((s) => ({ ...s, budget: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Link lưu tài liệu dự án (tuỳ chọn)</label>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="URL link lưu tài liệu dự án (tuỳ chọn)"
                            value={projectForm.repo_url}
                            onChange={(e) => setProjectForm((s) => ({ ...s, repo_url: e.target.value }))}
                        />
                    </div>
                    <ProjectWebsiteGscField
                        active={showProjectForm}
                        value={projectForm.website_url}
                        onChange={(url) => setProjectForm((s) => ({ ...s, website_url: url }))}
                    />
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Trạng thái dự án</label>
                        <select className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={projectForm.status} onChange={(e) => setProjectForm((s) => ({ ...s, status: e.target.value }))}>
                            {statusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Yêu cầu khách hàng</label>
                        <textarea className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" rows={3} placeholder="Mô tả yêu cầu, phạm vi triển khai" value={projectForm.customer_requirement} onChange={(e) => setProjectForm((s) => ({ ...s, customer_requirement: e.target.value }))} />
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="flex-1 rounded-2xl bg-primary py-2.5 font-semibold text-white disabled:opacity-60" onClick={saveProject} type="button" disabled={savingProject}>
                            {savingProject ? 'Đang lưu...' : 'Cập nhật dự án'}
                        </button>
                        <button className="flex-1 rounded-2xl border border-slate-200 py-2.5 font-semibold" onClick={() => setShowProjectForm(false)} type="button" disabled={savingProject}>
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>
        </PageContainer>
    );
}
