import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import AppIcon from '@/Components/AppIcon';
import Modal from '@/Components/Modal';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

const TASK_PRIORITY_OPTIONS = [
    { value: 'low', label: 'Thấp' },
    { value: 'medium', label: 'Trung bình' },
    { value: 'high', label: 'Cao' },
];

const TASK_STATUS_OPTIONS = [
    { value: 'todo', label: 'Cần làm' },
    { value: 'doing', label: 'Đang làm' },
    { value: 'blocked', label: 'Bị chặn' },
    { value: 'done', label: 'Hoàn tất' },
];

const emptyItem = (sortOrder = 1) => ({
    id: null,
    title: '',
    description: '',
    priority: 'medium',
    status: 'todo',
    weight_percent: 10,
    start_offset_days: 0,
    duration_days: 1,
    sort_order: sortOrder,
});

const emptyTask = (sortOrder = 1) => ({
    id: null,
    title: '',
    description: '',
    priority: 'medium',
    status: 'todo',
    weight_percent: 10,
    start_offset_days: 0,
    duration_days: 1,
    sort_order: sortOrder,
    items: [emptyItem(1)],
});

export default function ServiceWorkflows(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canEdit = ['admin', 'administrator', 'quan_ly'].includes(userRole);

    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [topics, setTopics] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({
        name: '',
        code: '',
        description: '',
        is_active: true,
        tasks: [emptyTask(1)],
    });

    const fetchTopics = async (keyword = search) => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/workflow-topics', {
                params: {
                    per_page: 200,
                    ...(keyword?.trim() ? { search: keyword.trim() } : {}),
                },
            });
            setTopics(res.data?.data || []);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được danh sách barem.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTopics('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stats = useMemo(() => {
        const total = topics.length;
        const active = topics.filter((t) => !!t.is_active).length;
        const totalTasks = topics.reduce((sum, topic) => sum + (topic.tasks?.length || 0), 0);
        const totalItems = topics.reduce((sum, topic) => (
            sum + (topic.tasks || []).reduce((s, task) => s + (task.items?.length || 0), 0)
        ), 0);
        return [
            { label: 'Topic barem', value: total },
            { label: 'Đang hoạt động', value: active },
            { label: 'Công việc mẫu', value: totalTasks },
            { label: 'Đầu việc mẫu', value: totalItems },
        ];
    }, [topics]);

    const resetForm = () => {
        setEditingId(null);
        setForm({
            name: '',
            code: '',
            description: '',
            is_active: true,
            tasks: [emptyTask(1)],
        });
    };

    const openCreate = () => {
        resetForm();
        setShowForm(true);
    };

    const openEdit = (topic) => {
        setEditingId(topic.id);
        setForm({
            name: topic.name || '',
            code: topic.code || '',
            description: topic.description || '',
            is_active: !!topic.is_active,
            tasks: (topic.tasks || []).map((task, taskIndex) => ({
                id: task.id,
                title: task.title || '',
                description: task.description || '',
                priority: task.priority || 'medium',
                status: task.status || 'todo',
                weight_percent: Number(task.weight_percent || 1),
                start_offset_days: Number(task.start_offset_days || 0),
                duration_days: Number(task.duration_days || 1),
                sort_order: Number(task.sort_order || taskIndex + 1),
                items: (task.items || []).map((item, itemIndex) => ({
                    id: item.id,
                    title: item.title || '',
                    description: item.description || '',
                    priority: item.priority || 'medium',
                    status: item.status || 'todo',
                    weight_percent: Number(item.weight_percent || 1),
                    start_offset_days: Number(item.start_offset_days || 0),
                    duration_days: Number(item.duration_days || 1),
                    sort_order: Number(item.sort_order || itemIndex + 1),
                })),
            })),
        });
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        resetForm();
    };

    const updateTaskField = (taskIndex, field, value) => {
        setForm((prev) => {
            const nextTasks = [...prev.tasks];
            nextTasks[taskIndex] = { ...nextTasks[taskIndex], [field]: value };
            return { ...prev, tasks: nextTasks };
        });
    };

    const updateItemField = (taskIndex, itemIndex, field, value) => {
        setForm((prev) => {
            const nextTasks = [...prev.tasks];
            const nextItems = [...(nextTasks[taskIndex].items || [])];
            nextItems[itemIndex] = { ...nextItems[itemIndex], [field]: value };
            nextTasks[taskIndex] = { ...nextTasks[taskIndex], items: nextItems };
            return { ...prev, tasks: nextTasks };
        });
    };

    const addTask = () => {
        setForm((prev) => ({
            ...prev,
            tasks: [...prev.tasks, emptyTask(prev.tasks.length + 1)],
        }));
    };

    const removeTask = (taskIndex) => {
        setForm((prev) => ({
            ...prev,
            tasks: prev.tasks.filter((_, idx) => idx !== taskIndex),
        }));
    };

    const addItem = (taskIndex) => {
        setForm((prev) => {
            const nextTasks = [...prev.tasks];
            const nextItems = [...(nextTasks[taskIndex].items || []), emptyItem((nextTasks[taskIndex].items || []).length + 1)];
            nextTasks[taskIndex] = { ...nextTasks[taskIndex], items: nextItems };
            return { ...prev, tasks: nextTasks };
        });
    };

    const removeItem = (taskIndex, itemIndex) => {
        setForm((prev) => {
            const nextTasks = [...prev.tasks];
            const nextItems = (nextTasks[taskIndex].items || []).filter((_, idx) => idx !== itemIndex);
            nextTasks[taskIndex] = { ...nextTasks[taskIndex], items: nextItems };
            return { ...prev, tasks: nextTasks };
        });
    };

    const normalizePayload = () => ({
        name: form.name?.trim(),
        code: form.code?.trim() || null,
        description: form.description?.trim() || null,
        is_active: !!form.is_active,
        tasks: (form.tasks || []).map((task, taskIndex) => ({
            id: task.id || undefined,
            title: task.title?.trim(),
            description: task.description?.trim() || null,
            priority: task.priority || 'medium',
            status: task.status || 'todo',
            weight_percent: Number(task.weight_percent || 1),
            start_offset_days: Number(task.start_offset_days || 0),
            duration_days: Number(task.duration_days || 1),
            sort_order: Number(task.sort_order || taskIndex + 1),
            items: (task.items || []).map((item, itemIndex) => ({
                id: item.id || undefined,
                title: item.title?.trim(),
                description: item.description?.trim() || null,
                priority: item.priority || 'medium',
                status: item.status || 'todo',
                weight_percent: Number(item.weight_percent || 1),
                start_offset_days: Number(item.start_offset_days || 0),
                duration_days: Number(item.duration_days || 1),
                sort_order: Number(item.sort_order || itemIndex + 1),
            })),
        })),
    });

    const saveTopic = async () => {
        if (!canEdit) {
            toast.error('Bạn không có quyền cập nhật barem.');
            return;
        }
        if (!form.name?.trim()) {
            toast.error('Vui lòng nhập tên topic barem.');
            return;
        }
        const hasEmptyTaskTitle = (form.tasks || []).some((task) => !task.title?.trim());
        if (hasEmptyTaskTitle) {
            toast.error('Mỗi công việc mẫu cần có tiêu đề.');
            return;
        }
        const hasEmptyItemTitle = (form.tasks || []).some((task) => (task.items || []).some((item) => !item.title?.trim()));
        if (hasEmptyItemTitle) {
            toast.error('Mỗi đầu việc mẫu cần có tiêu đề.');
            return;
        }

        try {
            const payload = normalizePayload();
            if (editingId) {
                await axios.put(`/api/v1/workflow-topics/${editingId}`, payload);
                toast.success('Đã cập nhật topic barem.');
            } else {
                await axios.post('/api/v1/workflow-topics', payload);
                toast.success('Đã tạo topic barem mới.');
            }
            closeForm();
            await fetchTopics();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Lưu topic barem thất bại.');
        }
    };

    const removeTopic = async (topic) => {
        if (!canEdit) {
            toast.error('Bạn không có quyền xoá barem.');
            return;
        }
        if (!window.confirm(`Xóa topic barem "${topic.name}"?`)) {
            return;
        }
        try {
            await axios.delete(`/api/v1/workflow-topics/${topic.id}`);
            toast.success('Đã xoá topic barem.');
            await fetchTopics();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Xoá topic thất bại.');
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Barem công việc theo Topic"
            description="Tạo topic barem gồm công việc mẫu và đầu việc mẫu để khi tạo dự án chỉ cần chọn barem là hệ thống tự sinh kế hoạch."
            actions={canEdit ? (
                <button
                    type="button"
                    className="inline-flex items-center rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white"
                    onClick={openCreate}
                >
                    <AppIcon name="plus" className="mr-2 h-4 w-4" />
                    Tạo topic barem
                </button>
            ) : null}
        >
            <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-4">
                    {stats.map((item) => (
                        <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-[0.12em] text-text-subtle">{item.label}</p>
                            <p className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</p>
                        </div>
                    ))}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4 md:p-6">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Danh sách topic barem</h3>
                            <p className="text-sm text-text-muted">Mỗi topic chứa bộ công việc và đầu việc con để dùng khi tạo dự án.</p>
                        </div>
                        <div className="flex w-full max-w-xl gap-2">
                            <input
                                className="h-11 flex-1 rounded-2xl border border-slate-200/80 bg-white px-4 text-sm"
                                placeholder="Tìm theo topic, công việc mẫu hoặc đầu việc mẫu"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                            <button type="button" className="rounded-2xl border border-slate-200 px-4 text-sm font-semibold" onClick={() => fetchTopics(search)}>
                                Lọc
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="py-10 text-center text-sm text-text-muted">Đang tải barem...</div>
                    ) : (
                        <div className="space-y-4">
                            {topics.map((topic) => (
                                <div key={topic.id} className="rounded-2xl border border-slate-200/80 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <div className="text-xs text-text-muted">#{topic.id} {topic.code ? `• ${topic.code}` : ''}</div>
                                            <h4 className="text-base font-semibold text-slate-900">{topic.name}</h4>
                                            <p className="mt-1 text-sm text-text-muted">{topic.description || 'Không có mô tả.'}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${topic.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                                                {topic.is_active ? 'Đang dùng' : 'Đang tắt'}
                                            </span>
                                            {canEdit && (
                                                <>
                                                    <button type="button" className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold" onClick={() => openEdit(topic)}>
                                                        Sửa
                                                    </button>
                                                    <button type="button" className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600" onClick={() => removeTopic(topic)}>
                                                        Xóa
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                                        {(topic.tasks || []).map((task) => (
                                            <div key={task.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="font-semibold text-slate-900">{task.title}</p>
                                                    <span className="text-xs text-text-muted">{task.weight_percent}%</span>
                                                </div>
                                                <p className="mt-1 text-xs text-text-muted">Bắt đầu +{task.start_offset_days} ngày • Thời lượng {task.duration_days} ngày</p>
                                                <p className="mt-2 text-xs text-slate-700">{task.description || '—'}</p>
                                                <p className="mt-2 text-xs text-text-muted">Đầu việc mẫu: {task.items?.length || 0}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {topics.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-text-muted">
                                    Chưa có topic barem nào.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <Modal
                open={showForm}
                onClose={closeForm}
                title={editingId ? `Sửa topic barem #${editingId}` : 'Tạo topic barem mới'}
                description="Thiết lập công việc và đầu việc mẫu để auto sinh khi tạo dự án."
                size="xl"
            >
                <div className="space-y-5 text-sm">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Tên topic</label>
                            <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Ví dụ: Website Care chuẩn" />
                        </div>
                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Mã topic</label>
                            <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))} placeholder="WEBCARE_STD" />
                        </div>
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Mô tả</label>
                        <textarea className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" rows={2} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Mô tả mục đích barem này..." />
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3">
                        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                            <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))} />
                            Đang hoạt động (cho phép chọn ở form tạo dự án)
                        </label>
                    </div>

                    <div className="space-y-4">
                        {form.tasks.map((task, taskIndex) => (
                            <div key={`task-${taskIndex}`} className="rounded-2xl border border-slate-200 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <h4 className="font-semibold text-slate-900">Công việc mẫu #{taskIndex + 1}</h4>
                                    <button type="button" className="text-xs font-semibold text-rose-600" onClick={() => removeTask(taskIndex)}>
                                        Xoá công việc
                                    </button>
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Tiêu đề công việc</label>
                                        <input className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Nhập tiêu đề công việc mẫu" value={task.title} onChange={(e) => updateTaskField(taskIndex, 'title', e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Mô tả ngắn</label>
                                        <input className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Nhập mô tả ngắn" value={task.description || ''} onChange={(e) => updateTaskField(taskIndex, 'description', e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Ưu tiên</label>
                                        <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={task.priority} onChange={(e) => updateTaskField(taskIndex, 'priority', e.target.value)}>
                                            {TASK_PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Trạng thái</label>
                                        <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={task.status} onChange={(e) => updateTaskField(taskIndex, 'status', e.target.value)}>
                                            {TASK_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Tỷ trọng (%)</label>
                                        <input type="number" min="1" max="100" className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="1 - 100" value={task.weight_percent} onChange={(e) => updateTaskField(taskIndex, 'weight_percent', e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Bắt đầu sau (ngày)</label>
                                        <input type="number" min="0" className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Số ngày tính từ ngày bắt đầu dự án" value={task.start_offset_days} onChange={(e) => updateTaskField(taskIndex, 'start_offset_days', e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Thời lượng (ngày)</label>
                                        <input type="number" min="1" className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Số ngày thực hiện" value={task.duration_days} onChange={(e) => updateTaskField(taskIndex, 'duration_days', e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Thứ tự</label>
                                        <input type="number" min="0" className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Thứ tự hiển thị" value={task.sort_order} onChange={(e) => updateTaskField(taskIndex, 'sort_order', e.target.value)} />
                                    </div>
                                </div>

                                <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    <div className="flex items-center justify-between">
                                        <h5 className="text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Đầu việc mẫu</h5>
                                        <button type="button" className="text-xs font-semibold text-primary" onClick={() => addItem(taskIndex)}>
                                            + Thêm đầu việc
                                        </button>
                                    </div>

                                    {(task.items || []).map((item, itemIndex) => (
                                        <div key={`item-${taskIndex}-${itemIndex}`} className="rounded-xl border border-slate-200 bg-white p-3">
                                            <div className="mb-2 flex items-center justify-between">
                                                <p className="text-xs font-semibold text-slate-700">Đầu việc #{itemIndex + 1}</p>
                                                <button type="button" className="text-[11px] font-semibold text-rose-600" onClick={() => removeItem(taskIndex, itemIndex)}>
                                                    Xoá
                                                </button>
                                            </div>
                                            <div className="grid gap-2 md:grid-cols-2">
                                                <div>
                                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-subtle">Tiêu đề đầu việc</label>
                                                    <input className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Nhập tiêu đề đầu việc mẫu" value={item.title} onChange={(e) => updateItemField(taskIndex, itemIndex, 'title', e.target.value)} />
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-subtle">Mô tả</label>
                                                    <input className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Nhập mô tả đầu việc" value={item.description || ''} onChange={(e) => updateItemField(taskIndex, itemIndex, 'description', e.target.value)} />
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-subtle">Ưu tiên</label>
                                                    <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={item.priority} onChange={(e) => updateItemField(taskIndex, itemIndex, 'priority', e.target.value)}>
                                                        {TASK_PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-subtle">Trạng thái</label>
                                                    <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={item.status} onChange={(e) => updateItemField(taskIndex, itemIndex, 'status', e.target.value)}>
                                                        {TASK_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-subtle">Tỷ trọng (%)</label>
                                                    <input type="number" min="1" max="100" className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="1 - 100" value={item.weight_percent} onChange={(e) => updateItemField(taskIndex, itemIndex, 'weight_percent', e.target.value)} />
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-subtle">Bắt đầu sau (ngày)</label>
                                                    <input type="number" min="0" className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="So với công việc cha" value={item.start_offset_days} onChange={(e) => updateItemField(taskIndex, itemIndex, 'start_offset_days', e.target.value)} />
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-subtle">Thời lượng (ngày)</label>
                                                    <input type="number" min="1" className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Số ngày thực hiện" value={item.duration_days} onChange={(e) => updateItemField(taskIndex, itemIndex, 'duration_days', e.target.value)} />
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-subtle">Thứ tự</label>
                                                    <input type="number" min="0" className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Thứ tự hiển thị" value={item.sort_order} onChange={(e) => updateItemField(taskIndex, itemIndex, 'sort_order', e.target.value)} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <button type="button" className="w-full rounded-2xl border border-dashed border-slate-300 py-2 text-sm font-semibold text-slate-600" onClick={addTask}>
                        + Thêm công việc mẫu
                    </button>

                    <div className="grid grid-cols-2 gap-3">
                        <button type="button" className="rounded-2xl bg-primary py-2.5 font-semibold text-white" onClick={saveTopic}>
                            {editingId ? 'Cập nhật barem' : 'Tạo barem'}
                        </button>
                        <button type="button" className="rounded-2xl border border-slate-200 py-2.5 font-semibold text-slate-700" onClick={closeForm}>
                            Huỷ
                        </button>
                    </div>
                </div>
            </Modal>
        </PageContainer>
    );
}
