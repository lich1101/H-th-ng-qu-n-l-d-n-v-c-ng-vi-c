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
    const [viewMode, setViewMode] = useState('topics');
    const [selectedTopicId, setSelectedTopicId] = useState(null);
    const [selectedTaskId, setSelectedTaskId] = useState(null);
    const [showTopicCreateForm, setShowTopicCreateForm] = useState(false);
    const [topicCreateForm, setTopicCreateForm] = useState({
        name: '',
        code: '',
        description: '',
        is_active: true,
    });
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [taskForm, setTaskForm] = useState(emptyTask(1));
    const [showItemForm, setShowItemForm] = useState(false);
    const [itemForm, setItemForm] = useState(emptyItem(1));
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
            const rows = res.data?.data || [];
            setTopics(rows);
            return rows;
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được danh sách barem.');
            return [];
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
        setTopicCreateForm({
            name: '',
            code: '',
            description: '',
            is_active: true,
        });
        setShowTopicCreateForm(true);
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

    const selectedTopic = useMemo(
        () => topics.find((topic) => Number(topic.id) === Number(selectedTopicId)) || null,
        [topics, selectedTopicId]
    );

    const selectedTask = useMemo(
        () => (selectedTopic?.tasks || []).find((task) => Number(task.id) === Number(selectedTaskId)) || null,
        [selectedTopic, selectedTaskId]
    );

    const openTopicTasks = (topic) => {
        setSelectedTopicId(Number(topic.id));
        setSelectedTaskId(null);
        setViewMode('tasks');
    };

    const openTaskItems = (task) => {
        setSelectedTaskId(Number(task.id));
        setViewMode('items');
    };

    const backToTopics = () => {
        setViewMode('topics');
        setSelectedTopicId(null);
        setSelectedTaskId(null);
    };

    const backToTasks = () => {
        setViewMode('tasks');
        setSelectedTaskId(null);
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

    const normalizeTaskForPayload = (task, taskIndex = 0) => ({
        id: task.id || undefined,
        title: String(task.title || '').trim(),
        description: String(task.description || '').trim() || null,
        priority: task.priority || 'medium',
        status: task.status || 'todo',
        weight_percent: Number(task.weight_percent || 1),
        start_offset_days: Number(task.start_offset_days || 0),
        duration_days: Number(task.duration_days || 1),
        sort_order: Number(task.sort_order || taskIndex + 1),
        items: (task.items || []).map((item, itemIndex) => ({
            id: item.id || undefined,
            title: String(item.title || '').trim(),
            description: String(item.description || '').trim() || null,
            priority: item.priority || 'medium',
            status: item.status || 'todo',
            weight_percent: Number(item.weight_percent || 1),
            start_offset_days: Number(item.start_offset_days || 0),
            duration_days: Number(item.duration_days || 1),
            sort_order: Number(item.sort_order || itemIndex + 1),
        })),
    });

    const updateTopicWithTasks = async (topic, nextTasks, successMessage) => {
        if (!topic) return false;
        const payload = {
            name: topic.name || '',
            code: topic.code || null,
            description: topic.description || null,
            is_active: !!topic.is_active,
            tasks: (nextTasks || []).map((task, taskIndex) => normalizeTaskForPayload(task, taskIndex)),
        };
        await axios.put(`/api/v1/workflow-topics/${topic.id}`, payload);
        toast.success(successMessage);
        const rows = await fetchTopics(search);
        const nextTopic = (rows || []).find((row) => Number(row.id) === Number(topic.id));
        if (nextTopic) {
            setSelectedTopicId(Number(nextTopic.id));
            if (selectedTaskId) {
                const stillExists = (nextTopic.tasks || []).some((task) => Number(task.id) === Number(selectedTaskId));
                if (!stillExists) setSelectedTaskId(null);
            }
        }
        return true;
    };

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

    const saveCreateTopic = async () => {
        if (!canEdit) {
            toast.error('Bạn không có quyền tạo barem.');
            return;
        }
        if (!topicCreateForm.name?.trim()) {
            toast.error('Vui lòng nhập tên topic barem.');
            return;
        }
        try {
            const res = await axios.post('/api/v1/workflow-topics', {
                name: topicCreateForm.name.trim(),
                code: topicCreateForm.code?.trim() || null,
                description: topicCreateForm.description?.trim() || null,
                is_active: !!topicCreateForm.is_active,
                tasks: [],
            });
            const created = res.data;
            toast.success('Đã tạo topic barem mới.');
            setShowTopicCreateForm(false);
            const rows = await fetchTopics(search);
            const createdTopic = (rows || []).find((topic) => Number(topic.id) === Number(created?.id));
            if (createdTopic) {
                openTopicTasks(createdTopic);
            }
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Tạo topic barem thất bại.');
        }
    };

    const saveTaskToTopic = async () => {
        if (!selectedTopic) return;
        if (!taskForm.title?.trim()) {
            toast.error('Vui lòng nhập tiêu đề công việc mẫu.');
            return;
        }
        const currentTasks = selectedTopic.tasks || [];
        const nextTasks = [
            ...currentTasks,
            {
                ...taskForm,
                id: null,
                sort_order: currentTasks.length + 1,
                items: [],
            },
        ];
        try {
            const ok = await updateTopicWithTasks(selectedTopic, nextTasks, 'Đã thêm công việc mẫu.');
            if (ok) {
                setShowTaskForm(false);
                setTaskForm(emptyTask(1));
            }
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không thêm được công việc mẫu.');
        }
    };

    const saveItemToTask = async () => {
        if (!selectedTopic || !selectedTask) return;
        if (!itemForm.title?.trim()) {
            toast.error('Vui lòng nhập tiêu đề đầu việc mẫu.');
            return;
        }
        const nextTasks = (selectedTopic.tasks || []).map((task) => {
            if (Number(task.id) !== Number(selectedTask.id)) return task;
            const currentItems = task.items || [];
            return {
                ...task,
                items: [
                    ...currentItems,
                    {
                        ...itemForm,
                        id: null,
                        sort_order: currentItems.length + 1,
                    },
                ],
            };
        });
        try {
            const ok = await updateTopicWithTasks(selectedTopic, nextTasks, 'Đã thêm đầu việc mẫu.');
            if (ok) {
                setShowItemForm(false);
                setItemForm(emptyItem(1));
            }
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không thêm được đầu việc mẫu.');
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
                            {viewMode === 'topics' && (
                                <>
                                    <h3 className="text-lg font-semibold text-slate-900">Danh sách topic barem</h3>
                                    <p className="text-sm text-text-muted">Bấm vào từng topic để mở danh sách công việc mẫu của topic đó.</p>
                                </>
                            )}
                            {viewMode === 'tasks' && selectedTopic && (
                                <>
                                    <h3 className="text-lg font-semibold text-slate-900">Công việc mẫu • {selectedTopic.name}</h3>
                                    <p className="text-sm text-text-muted">Bấm vào công việc để xem chi tiết danh sách đầu việc.</p>
                                </>
                            )}
                            {viewMode === 'items' && selectedTask && (
                                <>
                                    <h3 className="text-lg font-semibold text-slate-900">Đầu việc mẫu • {selectedTask.title}</h3>
                                    <p className="text-sm text-text-muted">Danh sách đầu việc thuộc công việc mẫu đã chọn.</p>
                                </>
                            )}
                        </div>
                        <div className="flex w-full max-w-xl flex-wrap items-center justify-end gap-2">
                            {viewMode === 'topics' && (
                                <>
                                    <input
                                        className="h-11 flex-1 rounded-2xl border border-slate-200/80 bg-white px-4 text-sm"
                                        placeholder="Tìm theo topic, công việc mẫu hoặc đầu việc mẫu"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                    />
                                    <button type="button" className="rounded-2xl border border-slate-200 px-4 text-sm font-semibold" onClick={() => fetchTopics(search)}>
                                        Lọc
                                    </button>
                                </>
                            )}
                            {viewMode === 'tasks' && (
                                <>
                                    <button type="button" className="rounded-2xl border border-slate-200 px-4 text-sm font-semibold" onClick={backToTopics}>
                                        Quay lại topic
                                    </button>
                                    {canEdit && (
                                        <button
                                            type="button"
                                            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white"
                                            onClick={() => {
                                                setTaskForm(emptyTask((selectedTopic?.tasks || []).length + 1));
                                                setShowTaskForm(true);
                                            }}
                                        >
                                            + Thêm công việc
                                        </button>
                                    )}
                                </>
                            )}
                            {viewMode === 'items' && (
                                <>
                                    <button type="button" className="rounded-2xl border border-slate-200 px-4 text-sm font-semibold" onClick={backToTasks}>
                                        Quay lại công việc
                                    </button>
                                    {canEdit && (
                                        <button
                                            type="button"
                                            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white"
                                            onClick={() => {
                                                setItemForm(emptyItem((selectedTask?.items || []).length + 1));
                                                setShowItemForm(true);
                                            }}
                                        >
                                            + Thêm đầu việc
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {loading ? (
                        <div className="py-10 text-center text-sm text-text-muted">Đang tải barem...</div>
                    ) : (
                        <div className="space-y-4">
                            {viewMode === 'topics' && topics.map((topic) => (
                                <div key={topic.id} className="rounded-2xl border border-slate-200/80 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <button type="button" className="text-left" onClick={() => openTopicTasks(topic)}>
                                            <div className="text-xs text-text-muted">#{topic.id} {topic.code ? `• ${topic.code}` : ''}</div>
                                            <h4 className="text-base font-semibold text-slate-900 hover:text-primary">{topic.name}</h4>
                                            <p className="mt-1 text-sm text-text-muted">{topic.description || 'Không có mô tả.'}</p>
                                            <p className="mt-2 text-xs text-text-muted">Công việc mẫu: {(topic.tasks || []).length}</p>
                                        </button>
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
                                </div>
                            ))}

                            {viewMode === 'tasks' && selectedTopic && (
                                <div className="overflow-hidden rounded-2xl border border-slate-200/80">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-text-subtle">
                                            <tr>
                                                <th className="px-4 py-3 text-left">Công việc</th>
                                                <th className="px-4 py-3 text-left">Tỷ trọng</th>
                                                <th className="px-4 py-3 text-left">Timeline</th>
                                                <th className="px-4 py-3 text-left">Đầu việc mẫu</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(selectedTopic.tasks || []).map((task) => (
                                                <tr key={task.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => openTaskItems(task)}>
                                                    <td className="px-4 py-3">
                                                        <div className="font-semibold text-slate-900">{task.title}</div>
                                                        <div className="text-xs text-text-muted">{task.description || '—'}</div>
                                                    </td>
                                                    <td className="px-4 py-3">{task.weight_percent || 0}%</td>
                                                    <td className="px-4 py-3">+{task.start_offset_days || 0} ngày • {task.duration_days || 1} ngày</td>
                                                    <td className="px-4 py-3">{task.items?.length || 0}</td>
                                                </tr>
                                            ))}
                                            {(selectedTopic.tasks || []).length === 0 && (
                                                <tr>
                                                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-muted">Topic này chưa có công việc mẫu.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {viewMode === 'items' && selectedTask && (
                                <div className="overflow-hidden rounded-2xl border border-slate-200/80">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-text-subtle">
                                            <tr>
                                                <th className="px-4 py-3 text-left">Đầu việc</th>
                                                <th className="px-4 py-3 text-left">Tỷ trọng</th>
                                                <th className="px-4 py-3 text-left">Timeline</th>
                                                <th className="px-4 py-3 text-left">Trạng thái</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(selectedTask.items || []).map((item) => (
                                                <tr key={item.id} className="border-t border-slate-100">
                                                    <td className="px-4 py-3">
                                                        <div className="font-semibold text-slate-900">{item.title}</div>
                                                        <div className="text-xs text-text-muted">{item.description || '—'}</div>
                                                    </td>
                                                    <td className="px-4 py-3">{item.weight_percent || 0}%</td>
                                                    <td className="px-4 py-3">+{item.start_offset_days || 0} ngày • {item.duration_days || 1} ngày</td>
                                                    <td className="px-4 py-3">{item.status || 'todo'}</td>
                                                </tr>
                                            ))}
                                            {(selectedTask.items || []).length === 0 && (
                                                <tr>
                                                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-muted">Công việc này chưa có đầu việc mẫu.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {viewMode === 'topics' && topics.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-text-muted">
                                    Chưa có topic barem nào.
                                </div>
                            )}
                            {viewMode === 'tasks' && !selectedTopic && (
                                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-text-muted">
                                    Không tìm thấy topic barem.
                                </div>
                            )}
                            {viewMode === 'items' && !selectedTask && (
                                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-text-muted">
                                    Không tìm thấy công việc mẫu.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <Modal
                open={showTopicCreateForm}
                onClose={() => setShowTopicCreateForm(false)}
                title="Tạo topic barem mới"
                description="Bước 1: tạo topic trước, sau đó vào topic để thêm công việc và đầu việc."
                size="md"
            >
                <div className="space-y-4 text-sm">
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Tên topic</label>
                        <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={topicCreateForm.name} onChange={(e) => setTopicCreateForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Ví dụ: Website Care chuẩn" />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Mã topic</label>
                        <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={topicCreateForm.code} onChange={(e) => setTopicCreateForm((prev) => ({ ...prev, code: e.target.value }))} placeholder="WEBCARE_STD" />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Mô tả</label>
                        <textarea className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" rows={3} value={topicCreateForm.description} onChange={(e) => setTopicCreateForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Mô tả ngắn về barem topic..." />
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                        <input type="checkbox" checked={!!topicCreateForm.is_active} onChange={(e) => setTopicCreateForm((prev) => ({ ...prev, is_active: e.target.checked }))} />
                        Đang hoạt động
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <button type="button" className="rounded-2xl bg-primary py-2.5 font-semibold text-white" onClick={saveCreateTopic}>Tạo topic</button>
                        <button type="button" className="rounded-2xl border border-slate-200 py-2.5 font-semibold text-slate-700" onClick={() => setShowTopicCreateForm(false)}>Huỷ</button>
                    </div>
                </div>
            </Modal>

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

            <Modal
                open={showTaskForm}
                onClose={() => setShowTaskForm(false)}
                title="Thêm công việc mẫu"
                description={selectedTopic ? `Topic: ${selectedTopic.name}` : 'Thêm công việc vào topic barem'}
                size="md"
            >
                <div className="space-y-3 text-sm">
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Tiêu đề công việc</label>
                        <input className="w-full rounded-xl border border-slate-200 px-3 py-2" value={taskForm.title} onChange={(e) => setTaskForm((prev) => ({ ...prev, title: e.target.value }))} />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Mô tả</label>
                        <input className="w-full rounded-xl border border-slate-200 px-3 py-2" value={taskForm.description || ''} onChange={(e) => setTaskForm((prev) => ({ ...prev, description: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Ưu tiên</label>
                            <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={taskForm.priority} onChange={(e) => setTaskForm((prev) => ({ ...prev, priority: e.target.value }))}>
                                {TASK_PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Trạng thái</label>
                            <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={taskForm.status} onChange={(e) => setTaskForm((prev) => ({ ...prev, status: e.target.value }))}>
                                {TASK_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Tỷ trọng (%)</label>
                            <input type="number" min="1" max="100" className="w-full rounded-xl border border-slate-200 px-3 py-2" value={taskForm.weight_percent} onChange={(e) => setTaskForm((prev) => ({ ...prev, weight_percent: e.target.value }))} />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Bắt đầu sau (ngày)</label>
                            <input type="number" min="0" className="w-full rounded-xl border border-slate-200 px-3 py-2" value={taskForm.start_offset_days} onChange={(e) => setTaskForm((prev) => ({ ...prev, start_offset_days: e.target.value }))} />
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Thời lượng (ngày)</label>
                        <input type="number" min="1" className="w-full rounded-xl border border-slate-200 px-3 py-2" value={taskForm.duration_days} onChange={(e) => setTaskForm((prev) => ({ ...prev, duration_days: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <button type="button" className="rounded-2xl bg-primary py-2.5 font-semibold text-white" onClick={saveTaskToTopic}>Thêm công việc</button>
                        <button type="button" className="rounded-2xl border border-slate-200 py-2.5 font-semibold text-slate-700" onClick={() => setShowTaskForm(false)}>Huỷ</button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={showItemForm}
                onClose={() => setShowItemForm(false)}
                title="Thêm đầu việc mẫu"
                description={selectedTask ? `Công việc: ${selectedTask.title}` : 'Thêm đầu việc'}
                size="md"
            >
                <div className="space-y-3 text-sm">
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Tiêu đề đầu việc</label>
                        <input className="w-full rounded-xl border border-slate-200 px-3 py-2" value={itemForm.title} onChange={(e) => setItemForm((prev) => ({ ...prev, title: e.target.value }))} />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Mô tả</label>
                        <input className="w-full rounded-xl border border-slate-200 px-3 py-2" value={itemForm.description || ''} onChange={(e) => setItemForm((prev) => ({ ...prev, description: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Ưu tiên</label>
                            <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={itemForm.priority} onChange={(e) => setItemForm((prev) => ({ ...prev, priority: e.target.value }))}>
                                {TASK_PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Trạng thái</label>
                            <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={itemForm.status} onChange={(e) => setItemForm((prev) => ({ ...prev, status: e.target.value }))}>
                                {TASK_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Tỷ trọng (%)</label>
                            <input type="number" min="1" max="100" className="w-full rounded-xl border border-slate-200 px-3 py-2" value={itemForm.weight_percent} onChange={(e) => setItemForm((prev) => ({ ...prev, weight_percent: e.target.value }))} />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Bắt đầu sau (ngày)</label>
                            <input type="number" min="0" className="w-full rounded-xl border border-slate-200 px-3 py-2" value={itemForm.start_offset_days} onChange={(e) => setItemForm((prev) => ({ ...prev, start_offset_days: e.target.value }))} />
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Thời lượng (ngày)</label>
                        <input type="number" min="1" className="w-full rounded-xl border border-slate-200 px-3 py-2" value={itemForm.duration_days} onChange={(e) => setItemForm((prev) => ({ ...prev, duration_days: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <button type="button" className="rounded-2xl bg-primary py-2.5 font-semibold text-white" onClick={saveItemToTask}>Thêm đầu việc</button>
                        <button type="button" className="rounded-2xl border border-slate-200 py-2.5 font-semibold text-slate-700" onClick={() => setShowItemForm(false)}>Huỷ</button>
                    </div>
                </div>
            </Modal>
        </PageContainer>
    );
}
