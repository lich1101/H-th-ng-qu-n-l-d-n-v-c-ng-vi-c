import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';

const DEFAULT_PRIORITIES = [
    { value: 'low', label: 'Thấp' },
    { value: 'medium', label: 'Trung bình' },
    { value: 'high', label: 'Cao' },
    { value: 'urgent', label: 'Khẩn cấp' },
];

const PRIORITY_LABELS = {
    low: 'Thấp',
    medium: 'Trung bình',
    high: 'Cao',
    urgent: 'Khẩn cấp',
};

const LABELS = {
    todo: 'Cần làm',
    doing: 'Đang làm',
    done: 'Hoàn tất',
    blocked: 'Bị chặn',
};

const STATUS_STYLES = {
    todo: 'bg-slate-100 text-slate-700 border-slate-200',
    doing: 'bg-blue-50 text-blue-700 border-blue-200',
    done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blocked: 'bg-rose-50 text-rose-700 border-rose-200',
};

const PRIORITY_STYLES = {
    low: 'bg-slate-100 text-slate-700 border-slate-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    urgent: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function TasksBoard(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canCreate = ['admin', 'quan_ly'].includes(userRole);
    const canEdit = ['admin', 'quan_ly'].includes(userRole);
    const canDelete = ['admin', 'quan_ly'].includes(userRole);

    const [loading, setLoading] = useState(false);
    const [tasks, setTasks] = useState([]);
    const [projects, setProjects] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [meta, setMeta] = useState({});
    const [viewMode, setViewMode] = useState('list');
    const [filters, setFilters] = useState({
        project_id: '',
        status: '',
        per_page: 30,
        page: 1,
    });
    const [metaPaging, setMetaPaging] = useState({ current_page: 1, last_page: 1, total: 0 });

    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [importFile, setImportFile] = useState(null);
    const [importing, setImporting] = useState(false);
    const [savingTask, setSavingTask] = useState(false);
    const [form, setForm] = useState({
        project_id: '',
        department_id: '',
        title: '',
        description: '',
        priority: 'medium',
        status: 'todo',
        deadline: '',
        progress_percent: 0,
        assignee_id: '',
    });

    const [showReport, setShowReport] = useState(false);
    const [reportTask, setReportTask] = useState(null);
    const [reportForm, setReportForm] = useState({
        status: '',
        progress_percent: '',
        note: '',
        attachment: null,
    });
    const [reporting, setReporting] = useState(false);

    const [showReview, setShowReview] = useState(false);
    const [reviewTask, setReviewTask] = useState(null);
    const [pendingUpdates, setPendingUpdates] = useState([]);
    const [reviewingUpdate, setReviewingUpdate] = useState(null);
    const [reviewForm, setReviewForm] = useState({
        status: '',
        progress_percent: '',
        note: '',
        review_note: '',
    });
    const [reviewing, setReviewing] = useState(false);

    const [showItems, setShowItems] = useState(false);
    const [itemsTask, setItemsTask] = useState(null);
    const [taskItems, setTaskItems] = useState([]);
    const [itemsLoading, setItemsLoading] = useState(false);
    const [itemForm, setItemForm] = useState({
        title: '',
        description: '',
        priority: 'medium',
        status: 'todo',
        progress_percent: '',
        deadline: '',
        assignee_id: '',
    });
    const [savingItem, setSavingItem] = useState(false);
    const [editingItemId, setEditingItemId] = useState(null);
    const [showItemReport, setShowItemReport] = useState(false);
    const [reportItem, setReportItem] = useState(null);
    const [itemReportForm, setItemReportForm] = useState({
        status: '',
        progress_percent: '',
        note: '',
        attachment: null,
    });
    const [showItemReview, setShowItemReview] = useState(false);
    const [reviewItem, setReviewItem] = useState(null);
    const [itemUpdates, setItemUpdates] = useState([]);

    const statusOptions = useMemo(() => {
        const values = meta.task_statuses || [];
        if (!values.length) {
            return ['todo', 'doing', 'done', 'blocked'];
        }
        return values;
    }, [meta]);

    const fetchMeta = async () => {
        try {
            const res = await axios.get('/api/v1/meta');
            setMeta(res.data || {});
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

    const fetchDepartments = async () => {
        try {
            const res = await axios.get('/api/v1/departments');
            const rows = res.data || [];
            if (userRole === 'quan_ly') {
                const managerId = props?.auth?.user?.id;
                setDepartments(rows.filter((d) => String(d.manager_id) === String(managerId)));
            } else {
                setDepartments(rows);
            }
        } catch {
            // ignore
        }
    };

    const fetchTasks = async (page = filters.page, nextFilters = filters) => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/tasks', {
                params: {
                    per_page: nextFilters.per_page,
                    page,
                    ...(nextFilters.project_id ? { project_id: nextFilters.project_id } : {}),
                    ...(nextFilters.status ? { status: nextFilters.status } : {}),
                },
            });
            setTasks(res.data?.data || []);
            setMetaPaging({
                current_page: res.data?.current_page || 1,
                last_page: res.data?.last_page || 1,
                total: res.data?.total || 0,
            });
            setFilters((s) => ({ ...s, page: res.data?.current_page || 1 }));
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được danh sách công việc.');
        } finally {
            setLoading(false);
        }
    };

    const fetchTaskItems = async (taskId) => {
        if (!taskId) return;
        setItemsLoading(true);
        try {
            const res = await axios.get(`/api/v1/tasks/${taskId}/items`, {
                params: { per_page: 50 },
            });
            setTaskItems(res.data?.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được đầu việc.');
        } finally {
            setItemsLoading(false);
        }
    };

    const resetItemForm = () => {
        setEditingItemId(null);
        setItemForm({
            title: '',
            description: '',
            priority: 'medium',
            status: statusOptions[0] || 'todo',
            progress_percent: '',
            deadline: '',
            assignee_id: '',
        });
    };

    const openItemsModal = (task) => {
        setItemsTask(task);
        setShowItems(true);
        resetItemForm();
        fetchTaskItems(task.id);
    };

    const startEditItem = (item) => {
        setEditingItemId(item.id);
        setItemForm({
            title: item.title || '',
            description: item.description || '',
            priority: item.priority || 'medium',
            status: item.status || statusOptions[0] || 'todo',
            progress_percent: item.progress_percent ?? '',
            deadline: item.deadline ? String(item.deadline).slice(0, 10) : '',
            assignee_id: item.assignee_id || '',
        });
    };

    const saveItem = async () => {
        if (!itemsTask) return;
        if (savingItem) return;
        if (!itemForm.title.trim()) {
            toast.error('Vui lòng nhập tiêu đề đầu việc.');
            return;
        }
        if (!itemForm.assignee_id) {
            toast.error('Vui lòng chọn nhân sự phụ trách.');
            return;
        }
        setSavingItem(true);
        try {
            if (editingItemId) {
                await axios.put(`/api/v1/tasks/${itemsTask.id}/items/${editingItemId}`, {
                    title: itemForm.title,
                    description: itemForm.description,
                    priority: itemForm.priority,
                    status: itemForm.status,
                    progress_percent: itemForm.progress_percent === '' ? null : Number(itemForm.progress_percent),
                    deadline: itemForm.deadline || null,
                    assignee_id: itemForm.assignee_id ? Number(itemForm.assignee_id) : null,
                });
                toast.success('Đã cập nhật đầu việc.');
            } else {
                await axios.post(`/api/v1/tasks/${itemsTask.id}/items`, {
                    title: itemForm.title,
                    description: itemForm.description,
                    priority: itemForm.priority,
                    status: itemForm.status,
                    progress_percent: itemForm.progress_percent === '' ? null : Number(itemForm.progress_percent),
                    deadline: itemForm.deadline || null,
                    assignee_id: itemForm.assignee_id ? Number(itemForm.assignee_id) : null,
                });
                toast.success('Đã tạo đầu việc.');
            }
            resetItemForm();
            await fetchTaskItems(itemsTask.id);
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu đầu việc thất bại.');
        } finally {
            setSavingItem(false);
        }
    };

    const removeItem = async (itemId) => {
        if (!itemsTask) return;
        if (!confirm('Xóa đầu việc này?')) return;
        try {
            await axios.delete(`/api/v1/tasks/${itemsTask.id}/items/${itemId}`);
            toast.success('Đã xóa đầu việc.');
            await fetchTaskItems(itemsTask.id);
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa đầu việc thất bại.');
        }
    };

    const openItemReportModal = (item) => {
        setReportItem(item);
        setItemReportForm({ status: '', progress_percent: '', note: '', attachment: null });
        setShowItemReport(true);
    };

    const submitItemReport = async () => {
        if (!reportItem || !itemsTask) return;
        const formData = new FormData();
        if (itemReportForm.status) formData.append('status', itemReportForm.status);
        if (itemReportForm.progress_percent !== '') formData.append('progress_percent', itemReportForm.progress_percent);
        if (itemReportForm.note) formData.append('note', itemReportForm.note);
        if (itemReportForm.attachment) formData.append('attachment', itemReportForm.attachment);
        try {
            await axios.post(
                `/api/v1/tasks/${itemsTask.id}/items/${reportItem.id}/updates`,
                formData,
                { headers: { 'Content-Type': 'multipart/form-data' } },
            );
            toast.success('Đã gửi báo cáo đầu việc.');
            setShowItemReport(false);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Gửi báo cáo thất bại.');
        }
    };

    const openItemReviewModal = async (item) => {
        if (!itemsTask) return;
        setReviewItem(item);
        setShowItemReview(true);
        setReviewingUpdate(null);
        setReviewForm({ status: '', progress_percent: '', note: '', review_note: '' });
        try {
            const res = await axios.get(`/api/v1/tasks/${itemsTask.id}/items/${item.id}/updates`, { params: { per_page: 30 } });
            setItemUpdates(res.data?.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được báo cáo.');
            setItemUpdates([]);
        }
    };

    const approveItemUpdate = async (update, payload = {}) => {
        if (!itemsTask || !reviewItem) return;
        try {
            await axios.post(`/api/v1/tasks/${itemsTask.id}/items/${reviewItem.id}/updates/${update.id}/approve`, payload);
            toast.success('Đã duyệt báo cáo.');
            await openItemReviewModal(reviewItem);
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Duyệt báo cáo thất bại.');
        }
    };

    const rejectItemUpdate = async (update, reviewNote) => {
        if (!itemsTask || !reviewItem) return;
        try {
            await axios.post(`/api/v1/tasks/${itemsTask.id}/items/${reviewItem.id}/updates/${update.id}/reject`, {
                review_note: reviewNote,
            });
            toast.success('Đã từ chối báo cáo.');
            await openItemReviewModal(reviewItem);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Từ chối báo cáo thất bại.');
        }
    };

    const selectItemUpdate = (update) => {
        setReviewingUpdate(update);
        setReviewForm({
            status: update?.status || '',
            progress_percent: update?.progress_percent ?? '',
            note: update?.note || '',
            review_note: '',
        });
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
            const res = await axios.post('/api/v1/imports/tasks', formData);
            const report = res.data || {};
            toast.success(`Import hoàn tất: ${report.created || 0} tạo mới, ${report.updated || 0} cập nhật.`);
            setShowImport(false);
            setImportFile(null);
            await fetchTasks(1, { ...filters, page: 1 });
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Import thất bại.');
        } finally {
            setImporting(false);
        }
    };

    useEffect(() => {
        fetchMeta();
        fetchProjects();
        fetchDepartments();
        fetchTasks(1, { ...filters, page: 1 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stats = useMemo(() => {
        const open = metaPaging.total;
        const overdue = tasks.filter((t) => {
            if (!t.deadline) return false;
            try { return new Date(t.deadline).getTime() < Date.now() && t.status !== 'done'; } catch { return false; }
        }).length;
        const done = tasks.filter((t) => t.status === 'done').length;
        return [
            { label: 'Công việc (trang hiện tại)', value: String(tasks.length) },
            { label: 'Tổng theo bộ lọc', value: String(open) },
            { label: 'Quá hạn (trang)', value: String(overdue) },
            { label: 'Hoàn tất (trang)', value: String(done) },
        ];
    }, [tasks, metaPaging.total]);

    const resetForm = () => {
        setEditingId(null);
        setForm({
            project_id: '',
            department_id: '',
            title: '',
            description: '',
            priority: 'medium',
            status: statusOptions[0] || 'todo',
            deadline: '',
            progress_percent: 0,
            assignee_id: '',
        });
    };

    const openCreate = () => {
        resetForm();
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        resetForm();
    };

    const selectedProject = useMemo(
        () => projects.find((p) => String(p.id) === String(form.project_id)),
        [projects, form.project_id]
    );
    const projectHasContract = !!selectedProject?.contract_id;

    const selectedDepartment = useMemo(
        () => departments.find((d) => String(d.id) === String(form.department_id)),
        [departments, form.department_id]
    );

    const staffOptions = useMemo(() => {
        if (selectedDepartment?.staff?.length) {
            return selectedDepartment.staff;
        }
        if (userRole === 'admin' && departments.length) {
            const all = departments.flatMap((d) => d.staff || []);
            const map = new Map();
            all.forEach((u) => {
                if (u?.id) map.set(u.id, u);
            });
            return Array.from(map.values());
        }
        return [];
    }, [selectedDepartment, departments, userRole]);

    const itemStaffOptions = useMemo(() => {
        if (!itemsTask) return [];
        const deptId = itemsTask.department_id || itemsTask.department?.id;
        const dept = departments.find((d) => String(d.id) === String(deptId));
        if (dept?.staff?.length) return dept.staff;
        if (userRole === 'admin') {
            const all = departments.flatMap((d) => d.staff || []);
            const map = new Map();
            all.forEach((u) => {
                if (u?.id) map.set(u.id, u);
            });
            return Array.from(map.values());
        }
        return [];
    }, [itemsTask, departments, userRole]);

    const startEdit = (t) => {
        setEditingId(t.id);
        setForm({
            project_id: t.project_id || '',
            department_id: t.department_id || t.assignee?.department_id || '',
            title: t.title || '',
            description: t.description || '',
            priority: t.priority || 'medium',
            status: t.status || statusOptions[0] || 'todo',
            deadline: t.deadline ? String(t.deadline).slice(0, 10) : '',
            progress_percent: t.progress_percent ?? 0,
            assignee_id: t.assignee_id || '',
        });
        setShowForm(true);
    };

    const save = async () => {
        if (savingTask) return;
        if (!canCreate && editingId == null) return toast.error('Bạn không có quyền tạo công việc.');
        if (!canEdit && editingId != null) return toast.error('Bạn không có quyền cập nhật công việc.');
        if (!form.project_id || !form.title?.trim()) return toast.error('Vui lòng chọn dự án và nhập tiêu đề.');
        if (!projectHasContract) return toast.error('Dự án chưa có hợp đồng, không thể tạo công việc.');
        setSavingTask(true);
        try {
            const payload = {
                project_id: Number(form.project_id),
                department_id: form.department_id ? Number(form.department_id) : null,
                title: form.title,
                description: form.description || null,
                priority: form.priority,
                status: form.status,
                deadline: form.deadline || null,
                progress_percent: form.progress_percent === '' ? null : Number(form.progress_percent),
                assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
            };
            if (editingId) {
                await axios.put(`/api/v1/tasks/${editingId}`, payload);
                toast.success('Đã cập nhật công việc.');
            } else {
                await axios.post('/api/v1/tasks', payload);
                toast.success('Đã tạo công việc.');
            }
            closeForm();
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu công việc thất bại.');
        } finally {
            setSavingTask(false);
        }
    };

    const remove = async (id) => {
        if (!canDelete) return toast.error('Bạn không có quyền xóa công việc.');
        if (!confirm('Xóa công việc này?')) return;
        try {
            await axios.delete(`/api/v1/tasks/${id}`);
            toast.success('Đã xóa công việc.');
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa công việc thất bại.');
        }
    };

    const columns = useMemo(() => {
        const buckets = {};
        for (const s of statusOptions) buckets[s] = [];
        for (const t of tasks) {
            const key = t.status || statusOptions[0];
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(t);
        }
        return statusOptions.map((s) => ({
            key: s,
            title: LABELS[s] || s,
            items: buckets[s] || [],
        }));
    }, [tasks, statusOptions]);

    const formatDate = (raw) => {
        if (!raw) return '';
        try {
            const d = new Date(raw);
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        } catch {
            return String(raw).slice(0, 10);
        }
    };

    const sortedByDeadline = useMemo(() => (
        [...tasks].sort((a, b) => {
            const da = a.deadline ? new Date(a.deadline).getTime() : 0;
            const db = b.deadline ? new Date(b.deadline).getTime() : 0;
            return da - db;
        })
    ), [tasks]);

    const buildAckStamp = () => {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d} ${hh}:${mm}:00`;
    };

    const acknowledgeTask = async (t) => {
        if (!['admin', 'quan_ly', 'nhan_vien'].includes(userRole)) {
            return toast.error('Bạn không có quyền xác nhận.');
        }
        try {
            await axios.put(`/api/v1/tasks/${t.id}`, {
                project_id: t.project_id,
                title: t.title,
                description: t.description || null,
                priority: t.priority || 'medium',
                status: t.status,
                start_at: t.start_at || null,
                deadline: t.deadline || null,
                completed_at: t.completed_at || null,
                progress_percent: t.progress_percent ?? 0,
                assigned_by: t.assigned_by || null,
                assignee_id: t.assignee_id || null,
                reviewer_id: t.reviewer_id || null,
                require_acknowledgement: t.require_acknowledgement ?? true,
                acknowledged_at: buildAckStamp(),
            });
            toast.success('Đã xác nhận nhận công việc.');
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xác nhận thất bại.');
        }
    };

    const openReportModal = (task) => {
        setReportTask(task);
        setReportForm({
            status: '',
            progress_percent: '',
            note: '',
            attachment: null,
        });
        setShowReport(true);
    };

    const submitReport = async () => {
        if (!reportTask) return;
        setReporting(true);
        try {
            const formData = new FormData();
            if (reportForm.status) formData.append('status', reportForm.status);
            if (reportForm.progress_percent !== '') formData.append('progress_percent', reportForm.progress_percent);
            if (reportForm.note) formData.append('note', reportForm.note);
            if (reportForm.attachment) formData.append('attachment', reportForm.attachment);
            await axios.post(`/api/v1/tasks/${reportTask.id}/updates`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success('Đã gửi báo cáo tiến độ.');
            setShowReport(false);
            setReportTask(null);
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Gửi báo cáo thất bại.');
        } finally {
            setReporting(false);
        }
    };

    const openReviewModal = async (task) => {
        setReviewTask(task);
        setShowReview(true);
        setReviewingUpdate(null);
        setReviewForm({ status: '', progress_percent: '', note: '', review_note: '' });
        try {
            const res = await axios.get(`/api/v1/tasks/${task.id}/updates`, { params: { per_page: 20 } });
            const rows = res.data?.data || [];
            const pending = rows.filter((u) => u.review_status === 'pending');
            setPendingUpdates(pending);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được báo cáo.');
        }
    };

    const selectUpdate = (update) => {
        setReviewingUpdate(update);
        setReviewForm({
            status: update.status || '',
            progress_percent: update.progress_percent ?? '',
            note: update.note || '',
            review_note: '',
        });
    };

    const approveUpdate = async () => {
        if (!reviewTask || !reviewingUpdate) return;
        setReviewing(true);
        try {
            await axios.post(`/api/v1/tasks/${reviewTask.id}/updates/${reviewingUpdate.id}/approve`, {
                status: reviewForm.status || null,
                progress_percent: reviewForm.progress_percent === '' ? null : Number(reviewForm.progress_percent),
                note: reviewForm.note || null,
            });
            toast.success('Đã duyệt báo cáo.');
            await openReviewModal(reviewTask);
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Duyệt thất bại.');
        } finally {
            setReviewing(false);
        }
    };

    const rejectUpdate = async () => {
        if (!reviewTask || !reviewingUpdate) return;
        if (!reviewForm.review_note.trim()) {
            toast.error('Vui lòng nhập lý do từ chối.');
            return;
        }
        setReviewing(true);
        try {
            await axios.post(`/api/v1/tasks/${reviewTask.id}/updates/${reviewingUpdate.id}/reject`, {
                review_note: reviewForm.review_note,
            });
            toast.success('Đã từ chối báo cáo.');
            await openReviewModal(reviewTask);
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Từ chối thất bại.');
        } finally {
            setReviewing(false);
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Quản lý công việc"
            description="Theo dõi công việc theo từng trạng thái, ưu tiên và hạn chót."
            stats={stats}
        >
            <div className="lg:col-span-2">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
                    <div className="flex flex-wrap gap-2">
                        {canCreate && (
                            <button
                                type="button"
                                className="rounded-2xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                                onClick={openCreate}
                            >
                                Thêm mới
                            </button>
                        )}
                        {canCreate && (
                            <button
                                type="button"
                                className="rounded-2xl border border-slate-200/80 px-4 py-2 text-sm font-semibold text-slate-700"
                                onClick={() => setShowImport(true)}
                            >
                                Import Excel
                            </button>
                        )}
                        <select
                            className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                            value={filters.project_id}
                            onChange={(e) => setFilters((s) => ({ ...s, project_id: e.target.value }))}
                        >
                            <option value="">Tất cả dự án</option>
                            {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
                        </select>
                        <select
                            className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                            value={filters.status}
                            onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}
                        >
                            <option value="">Tất cả trạng thái</option>
                            {statusOptions.map((s) => <option key={s} value={s}>{LABELS[s] || s}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
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
                                className={`px-3 py-2 rounded-2xl text-xs font-semibold ${
                                    viewMode === tab.key
                                        ? 'bg-primary text-white'
                                        : 'bg-white border border-slate-200/80 text-slate-600'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                        <button className="text-sm text-primary font-semibold" onClick={() => fetchTasks(1, { ...filters, page: 1 })} type="button">
                            Tải lại
                        </button>
                    </div>
                </div>

                    {viewMode === 'list' && (
                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-4">
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs uppercase tracking-wider text-text-subtle border-b border-slate-200">
                                            <th className="py-2">Công việc</th>
                                            <th className="py-2">Dự án</th>
                                            <th className="py-2">Trạng thái</th>
                                            <th className="py-2">Ưu tiên</th>
                                            <th className="py-2">Hạn chót</th>
                                            <th className="py-2">Tiến độ</th>
                                            <th className="py-2">Phòng ban</th>
                                            <th className="py-2">Phụ trách</th>
                                            <th className="py-2"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tasks.map((t) => {
                                            const canAck = t.require_acknowledgement && !t.acknowledged_at && (
                                                t.assignee_id === props?.auth?.user?.id || ['admin', 'quan_ly'].includes(userRole)
                                            );
                                            return (
                                                <tr key={t.id} className="border-b border-slate-100">
                                                    <td className="py-3">
                                                        <div className="font-medium text-slate-900">{t.title}</div>
                                                        <div className="text-xs text-text-muted">{t.description || '—'}</div>
                                                    </td>
                                                    <td className="py-3 text-xs text-text-muted">
                                                        {t.project?.name || 'Chưa gán dự án'}
                                                    </td>
                                                    <td className="py-3">
                                                        <div className="flex flex-wrap gap-2">
                                                            <span
                                                                className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                                                                    STATUS_STYLES[t.status] || 'bg-slate-100 text-slate-700 border-slate-200'
                                                                }`}
                                                            >
                                                                {LABELS[t.status] || t.status}
                                                            </span>
                                                            {t.require_acknowledgement && !t.acknowledged_at && (
                                                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                                                                    Chưa xác nhận
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-3">
                                                        <span
                                                            className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                                                                PRIORITY_STYLES[t.priority] || 'bg-slate-100 text-slate-700 border-slate-200'
                                                            }`}
                                                        >
                                                            {PRIORITY_LABELS[t.priority] || t.priority || 'Trung bình'}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 text-xs text-text-muted">
                                                        {t.deadline ? String(t.deadline).slice(0, 10) : '—'}
                                                    </td>
                                                    <td className="py-3 text-xs text-text-muted">{t.progress_percent ?? 0}%</td>
                                                    <td className="py-3 text-xs text-text-muted">
                                                        {t.department?.name || '—'}
                                                    </td>
                                                    <td className="py-3 text-xs text-text-muted">
                                                        {t.assignee?.name || '—'}
                                                    </td>
                                                    <td className="py-3 text-right space-x-2">
                                                        {canEdit && (
                                                            <button className="text-xs font-semibold text-primary" onClick={() => startEdit(t)} type="button">
                                                                Sửa
                                                            </button>
                                                        )}
                                                        {canDelete && (
                                                            <button className="text-xs font-semibold text-rose-500" onClick={() => remove(t.id)} type="button">
                                                                Xóa
                                                            </button>
                                                        )}
                                                        <button className="text-xs font-semibold text-sky-600" onClick={() => openItemsModal(t)} type="button">
                                                            Đầu việc
                                                        </button>
                                                        {canAck && (
                                                            <button className="text-xs font-semibold text-amber-600" onClick={() => acknowledgeTask(t)} type="button">
                                                                Xác nhận
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {loading && (
                                            <tr>
                                                <td className="py-6 text-center text-sm text-text-muted" colSpan={9}>
                                                    Đang tải...
                                                </td>
                                            </tr>
                                        )}
                                        {!loading && tasks.length === 0 && (
                                            <tr>
                                                <td className="py-6 text-center text-sm text-text-muted" colSpan={9}>
                                                    Chưa có công việc theo bộ lọc.
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
                                        {col.items.map((t) => {
                                            const canAck = t.require_acknowledgement && !t.acknowledged_at && (
                                                t.assignee_id === props?.auth?.user?.id || ['admin', 'quan_ly'].includes(userRole)
                                            );
                                            return (
                                                <div key={t.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                                            {PRIORITY_LABELS[t.priority] || t.priority || 'Trung bình'}
                                                        </span>
                                                        <div className="flex items-center gap-2 text-xs text-text-muted">
                                                            {canEdit && (
                                                                <button className="hover:text-slate-900" onClick={() => startEdit(t)} type="button">Sửa</button>
                                                            )}
                                                            {canDelete && (
                                                                <button className="hover:text-danger" onClick={() => remove(t.id)} type="button">Xoá</button>
                                                            )}
                                                            <button className="hover:text-sky-600" onClick={() => openItemsModal(t)} type="button">Đầu việc</button>
                                                        </div>
                                                    </div>
                                                    <h3 className="mt-3 font-semibold text-slate-900">{t.title}</h3>
                                                    <p className="text-xs text-text-muted mt-1">{t.project?.name || 'Chưa gán dự án'}</p>
                                                    <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
                                                        <span>{t.deadline ? `Hạn chót ${String(t.deadline).slice(0, 10)}` : 'Chưa có hạn chót'}</span>
                                                        <span>{t.progress_percent ?? 0}%</span>
                                                    </div>
                                                    {t.require_acknowledgement && !t.acknowledged_at && (
                                                        <div className="mt-3 flex items-center justify-between text-xs">
                                                            <span className="text-warning font-semibold">Chưa xác nhận</span>
                                                            {canAck && (
                                                                <button className="text-primary font-semibold" onClick={() => acknowledgeTask(t)} type="button">
                                                                    Xác nhận nhận công việc
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {loading && <p className="text-sm text-text-muted">Đang tải...</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {viewMode === 'timeline' && (
                        <div className="space-y-4">
                            {sortedByDeadline.map((t) => (
                                <div key={t.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card flex gap-4">
                                    <div className="flex flex-col items-center">
                                        <span className="h-3 w-3 rounded-full bg-primary" />
                                        <span className="flex-1 w-px bg-slate-200 mt-2" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-semibold text-slate-900">{t.title}</h3>
                                            <span className="text-xs text-text-muted">{formatDate(t.deadline)}</span>
                                        </div>
                                        <p className="text-xs text-text-muted mt-1">{t.project?.name || 'Chưa gán dự án'}</p>
                                        <div className="mt-2 text-xs text-text-muted">Trạng thái: {LABELS[t.status] || t.status}</div>
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
                            {sortedByDeadline.map((t) => {
                                const start = t.start_at ? new Date(t.start_at) : (t.deadline ? new Date(t.deadline) : new Date());
                                const end = t.deadline ? new Date(t.deadline) : new Date(start.getTime() + 3 * 86400000);
                                const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
                                return (
                                    <div key={t.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card">
                                        <div className="flex items-center justify-between text-xs text-text-muted mb-2">
                                            <span>{t.title}</span>
                                            <span>{formatDate(t.deadline) || 'Chưa có hạn chót'}</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                            <div className="h-2 bg-primary" style={{ width: `${Math.min(100, totalDays * 10)}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
            </div>

            <Modal
                open={showForm}
                onClose={closeForm}
                title={editingId ? `Sửa công việc #${editingId}` : 'Tạo công việc'}
                description="Nhập thông tin công việc và phân công."
                size="lg"
            >
                <div className="space-y-3 text-sm">
                    <select className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.project_id} onChange={(e) => setForm((s) => ({ ...s, project_id: e.target.value }))}>
                        <option value="">-- Chọn dự án * --</option>
                        {projects.map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                    </select>
                    {form.project_id && !projectHasContract && (
                        <p className="text-xs text-warning">Dự án chưa có hợp đồng, cần tạo hợp đồng trước khi tạo công việc.</p>
                    )}
                    <select
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        value={form.department_id}
                        onChange={(e) => setForm((s) => ({ ...s, department_id: e.target.value, assignee_id: '' }))}
                    >
                        <option value="">-- Chọn phòng ban --</option>
                        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <select
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        value={form.assignee_id}
                        onChange={(e) => setForm((s) => ({ ...s, assignee_id: e.target.value }))}
                    >
                        <option value="">-- Chọn nhân sự phụ trách --</option>
                        {staffOptions.map((u) => (
                            <option key={u.id} value={u.id}>{u.name} • {u.email}</option>
                        ))}
                    </select>
                    <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" placeholder="Tiêu đề *" value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} />
                    <textarea className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" rows={3} placeholder="Mô tả" value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-2">
                        <select className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.priority} onChange={(e) => setForm((s) => ({ ...s, priority: e.target.value }))}>
                            {DEFAULT_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                        <select className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
                            {statusOptions.map((s) => <option key={s} value={s}>{LABELS[s] || s}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" type="date" value={form.deadline} onChange={(e) => setForm((s) => ({ ...s, deadline: e.target.value }))} />
                        <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" type="number" min="0" max="100" value={form.progress_percent} onChange={(e) => setForm((s) => ({ ...s, progress_percent: e.target.value }))} />
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            className="flex-1 bg-primary text-white rounded-2xl py-2.5 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                            onClick={save}
                            type="button"
                            disabled={savingTask}
                        >
                            {savingTask
                                ? 'Đang lưu...'
                                : editingId
                                    ? 'Cập nhật công việc'
                                    : 'Tạo công việc'}
                        </button>
                        <button className="flex-1 border border-slate-200 rounded-2xl py-2.5 font-semibold" onClick={closeForm} type="button">
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={showImport}
                onClose={() => setShowImport(false)}
                title="Import công việc"
                description="Tải file Excel (.xls/.xlsx/.csv) để nhập công việc."
                size="md"
            >
                <form className="space-y-3 text-sm" onSubmit={submitImport}>
                    <div className="rounded-2xl border border-dashed border-slate-200/80 p-4 text-center">
                        <p className="text-xs text-text-muted mb-2">Chọn file công việc</p>
                        <input
                            id="import-task-file"
                            type="file"
                            accept=".xls,.xlsx,.csv"
                            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                            className="hidden"
                        />
                        <label
                            htmlFor="import-task-file"
                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                            Chọn file
                        </label>
                        <p className="text-xs text-text-muted mt-2">
                            {importFile ? importFile.name : 'Chưa chọn file'}
                        </p>
                    </div>
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
                            onClick={() => setShowImport(false)}
                        >
                            Hủy
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                open={showItems}
                onClose={() => setShowItems(false)}
                title={`Đầu việc${itemsTask ? ` • ${itemsTask.title}` : ''}`}
                description="Trưởng phòng chia đầu việc cho nhân sự và theo dõi báo cáo tiến độ."
                size="xl"
            >
                <div className="grid gap-4 lg:grid-cols-3">
                    <div className="lg:col-span-2 space-y-3">
                        {itemsLoading && <p className="text-sm text-text-muted">Đang tải đầu việc...</p>}
                        {!itemsLoading && taskItems.length === 0 && (
                            <p className="text-sm text-text-muted">Chưa có đầu việc nào.</p>
                        )}
                        {taskItems.map((item) => (
                            <div key={item.id} className="rounded-2xl border border-slate-200/80 p-4 bg-white">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-semibold text-slate-900">{item.title}</p>
                                        <p className="text-xs text-text-muted">
                                            Phụ trách: {item.assignee?.name || item.assignee?.email || '—'}
                                        </p>
                                    </div>
                                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                                        PRIORITY_STYLES[item.priority] || 'bg-slate-100 text-slate-700 border-slate-200'
                                    }`}>
                                        {PRIORITY_LABELS[item.priority] || item.priority || 'Trung bình'}
                                    </span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-muted">
                                    <span>Trạng thái: {LABELS[item.status] || item.status}</span>
                                    <span>Tiến độ: {item.progress_percent ?? 0}%</span>
                                    <span>Hạn: {item.deadline ? String(item.deadline).slice(0, 10) : '—'}</span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                    {item.assignee_id === props?.auth?.user?.id && (
                                        <button className="rounded-xl bg-primary text-white px-3 py-2 font-semibold" onClick={() => openItemReportModal(item)} type="button">
                                            Báo cáo
                                        </button>
                                    )}
                                    {['admin', 'quan_ly'].includes(userRole) && (
                                        <button className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-700" onClick={() => openItemReviewModal(item)} type="button">
                                            Duyệt báo cáo
                                        </button>
                                    )}
                                    {['admin', 'quan_ly'].includes(userRole) && (
                                        <button className="text-primary font-semibold" onClick={() => startEditItem(item)} type="button">
                                            Sửa
                                        </button>
                                    )}
                                    {['admin', 'quan_ly'].includes(userRole) && (
                                        <button className="text-rose-600 font-semibold" onClick={() => removeItem(item.id)} type="button">
                                            Xóa
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="space-y-3">
                        {['admin', 'quan_ly'].includes(userRole) ? (
                            <div className="rounded-2xl border border-slate-200/80 p-4 bg-white">
                                <h4 className="font-semibold text-slate-900 mb-3">
                                    {editingItemId ? `Sửa đầu việc #${editingItemId}` : 'Tạo đầu việc'}
                                </h4>
                                <div className="space-y-2 text-sm">
                                    <select
                                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                        value={itemForm.assignee_id}
                                        onChange={(e) => setItemForm((s) => ({ ...s, assignee_id: e.target.value }))}
                                    >
                                        <option value="">-- Chọn nhân sự --</option>
                                        {itemStaffOptions.map((u) => (
                                            <option key={u.id} value={u.id}>{u.name} • {u.email}</option>
                                        ))}
                                    </select>
                                    <input
                                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                        placeholder="Tiêu đề đầu việc"
                                        value={itemForm.title}
                                        onChange={(e) => setItemForm((s) => ({ ...s, title: e.target.value }))}
                                    />
                                    <textarea
                                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                        rows={3}
                                        placeholder="Mô tả"
                                        value={itemForm.description}
                                        onChange={(e) => setItemForm((s) => ({ ...s, description: e.target.value }))}
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <select
                                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                            value={itemForm.priority}
                                            onChange={(e) => setItemForm((s) => ({ ...s, priority: e.target.value }))}
                                        >
                                            {DEFAULT_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                                        </select>
                                        <select
                                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                            value={itemForm.status}
                                            onChange={(e) => setItemForm((s) => ({ ...s, status: e.target.value }))}
                                        >
                                            {statusOptions.map((s) => <option key={s} value={s}>{LABELS[s] || s}</option>)}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                            type="date"
                                            value={itemForm.deadline}
                                            onChange={(e) => setItemForm((s) => ({ ...s, deadline: e.target.value }))}
                                        />
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={itemForm.progress_percent}
                                            onChange={(e) => setItemForm((s) => ({ ...s, progress_percent: e.target.value }))}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                                            onClick={saveItem}
                                            disabled={savingItem}
                                        >
                                            {savingItem ? 'Đang lưu...' : editingItemId ? 'Cập nhật' : 'Tạo mới'}
                                        </button>
                                        <button
                                            type="button"
                                            className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold"
                                            onClick={resetItemForm}
                                        >
                                            Làm mới
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-text-muted">Chỉ trưởng phòng hoặc admin được tạo đầu việc.</p>
                        )}
                    </div>
                </div>
            </Modal>

            <Modal
                open={showItemReport}
                onClose={() => setShowItemReport(false)}
                title={`Báo cáo đầu việc${reportItem ? ` • ${reportItem.title}` : ''}`}
                description="Gửi cập nhật tiến độ đầu việc cho trưởng phòng."
                size="md"
            >
                <div className="space-y-3 text-sm">
                    <select
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        value={itemReportForm.status}
                        onChange={(e) => setItemReportForm((s) => ({ ...s, status: e.target.value }))}
                    >
                        <option value="">-- Trạng thái (tuỳ chọn) --</option>
                        {statusOptions.map((s) => (
                            <option key={s} value={s}>{LABELS[s] || s}</option>
                        ))}
                    </select>
                    <input
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        type="number"
                        min="0"
                        max="100"
                        placeholder="Tiến độ (%)"
                        value={itemReportForm.progress_percent}
                        onChange={(e) => setItemReportForm((s) => ({ ...s, progress_percent: e.target.value }))}
                    />
                    <textarea
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        rows={3}
                        placeholder="Nội dung báo cáo"
                        value={itemReportForm.note}
                        onChange={(e) => setItemReportForm((s) => ({ ...s, note: e.target.value }))}
                    />
                    <div className="rounded-2xl border border-dashed border-slate-200/80 p-4 text-center">
                        <input
                            id="task-item-report-file"
                            type="file"
                            onChange={(e) => setItemReportForm((s) => ({ ...s, attachment: e.target.files?.[0] || null }))}
                            className="hidden"
                        />
                        <label
                            htmlFor="task-item-report-file"
                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                            Chọn file
                        </label>
                        <p className="text-xs text-text-muted mt-2">
                            {itemReportForm.attachment ? itemReportForm.attachment.name : 'Chưa chọn file'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold"
                            onClick={submitItemReport}
                        >
                            Gửi báo cáo
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold"
                            onClick={() => setShowItemReport(false)}
                        >
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={showItemReview}
                onClose={() => setShowItemReview(false)}
                title={`Duyệt báo cáo đầu việc${reviewItem ? ` • ${reviewItem.title}` : ''}`}
                description="Chọn báo cáo để duyệt, chỉnh sửa hoặc từ chối."
                size="lg"
            >
                <div className="space-y-4 text-sm">
                    {itemUpdates.length === 0 && (
                        <p className="text-text-muted">Chưa có báo cáo chờ duyệt.</p>
                    )}
                    {itemUpdates.map((u) => (
                        <div key={u.id} className="rounded-2xl border border-slate-200/80 p-4 bg-white">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <p className="text-xs text-text-muted">#{u.id} • {u.submitter?.name || 'Nhân sự'}</p>
                                    <p className="font-semibold text-slate-900">{u.note || 'Không có ghi chú'}</p>
                                </div>
                                <button
                                    type="button"
                                    className="text-xs font-semibold text-primary"
                                    onClick={() => selectItemUpdate(u)}
                                >
                                    Xem & duyệt
                                </button>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-muted">
                                <span>Trạng thái: {u.status ? (LABELS[u.status] || u.status) : '—'}</span>
                                <span>Tiến độ: {u.progress_percent ?? '—'}%</span>
                            </div>
                            {u.attachment_path && (
                                <a className="text-xs text-primary mt-2 inline-block" href={u.attachment_path} target="_blank" rel="noreferrer">
                                    Xem file đính kèm
                                </a>
                            )}
                        </div>
                    ))}

                    {reviewingUpdate && (
                        <div className="rounded-2xl border border-slate-200/80 p-4 bg-slate-50">
                            <h4 className="font-semibold text-slate-900 mb-3">Duyệt báo cáo #{reviewingUpdate.id}</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <select
                                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                    value={reviewForm.status}
                                    onChange={(e) => setReviewForm((s) => ({ ...s, status: e.target.value }))}
                                >
                                    <option value="">-- Trạng thái --</option>
                                    {statusOptions.map((s) => (
                                        <option key={s} value={s}>{LABELS[s] || s}</option>
                                    ))}
                                </select>
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                    type="number"
                                    min="0"
                                    max="100"
                                    placeholder="Tiến độ (%)"
                                    value={reviewForm.progress_percent}
                                    onChange={(e) => setReviewForm((s) => ({ ...s, progress_percent: e.target.value }))}
                                />
                            </div>
                            <textarea
                                className="mt-3 w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                rows={3}
                                placeholder="Ghi chú sau chỉnh sửa (tuỳ chọn)"
                                value={reviewForm.note}
                                onChange={(e) => setReviewForm((s) => ({ ...s, note: e.target.value }))}
                            />
                            <textarea
                                className="mt-3 w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                rows={2}
                                placeholder="Lý do từ chối (nếu không duyệt)"
                                value={reviewForm.review_note}
                                onChange={(e) => setReviewForm((s) => ({ ...s, review_note: e.target.value }))}
                            />
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className="rounded-2xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                                    onClick={() => approveItemUpdate(reviewingUpdate, {
                                        status: reviewForm.status || undefined,
                                        progress_percent: reviewForm.progress_percent === '' ? undefined : Number(reviewForm.progress_percent),
                                        note: reviewForm.note || undefined,
                                    })}
                                >
                                    Duyệt
                                </button>
                                <button
                                    type="button"
                                    className="rounded-2xl border border-rose-200 text-rose-600 px-4 py-2 text-sm font-semibold"
                                    onClick={() => {
                                        if (!reviewForm.review_note) {
                                            toast.error('Vui lòng nhập lý do từ chối.');
                                            return;
                                        }
                                        rejectItemUpdate(reviewingUpdate, reviewForm.review_note);
                                    }}
                                >
                                    Từ chối
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        </PageContainer>
    );
}
