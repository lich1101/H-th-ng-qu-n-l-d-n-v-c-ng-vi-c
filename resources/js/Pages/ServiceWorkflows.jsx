import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import AppIcon from '@/Components/AppIcon';
import Modal from '@/Components/Modal';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';
import TopicListPage from '@/Pages/ServiceWorkflows/components/TopicListPage';
import TopicTasksPage from '@/Pages/ServiceWorkflows/components/TopicTasksPage';
import TaskItemsPage from '@/Pages/ServiceWorkflows/components/TaskItemsPage';

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

    const routeTopicId = props?.topicId ? Number(props.topicId) : null;
    const routeTopicTaskId = props?.topicTaskId ? Number(props.topicTaskId) : null;
    const isTopicsPage = !routeTopicId;
    const isTasksPage = !!routeTopicId && !routeTopicTaskId;
    const isItemsPage = !!routeTopicId && !!routeTopicTaskId;

    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [topics, setTopics] = useState([]);

    const [showTopicCreateForm, setShowTopicCreateForm] = useState(false);
    const [topicCreateForm, setTopicCreateForm] = useState({
        name: '',
        code: '',
        description: '',
        is_active: true,
    });

    const [showTopicEditForm, setShowTopicEditForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [topicEditForm, setTopicEditForm] = useState({
        name: '',
        code: '',
        description: '',
        is_active: true,
        tasks: [emptyTask(1)],
    });

    const [showTaskForm, setShowTaskForm] = useState(false);
    const [taskForm, setTaskForm] = useState(emptyTask(1));

    const [showItemForm, setShowItemForm] = useState(false);
    const [itemForm, setItemForm] = useState(emptyItem(1));

    const fetchTopics = async (keyword = '') => {
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
    }, [routeTopicId, routeTopicTaskId]);

    const selectedTopic = useMemo(
        () => topics.find((topic) => Number(topic.id) === Number(routeTopicId)) || null,
        [topics, routeTopicId]
    );

    const selectedTask = useMemo(
        () => (selectedTopic?.tasks || []).find((task) => Number(task.id) === Number(routeTopicTaskId)) || null,
        [selectedTopic, routeTopicTaskId]
    );

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

        const rows = await fetchTopics('');
        const nextTopic = (rows || []).find((row) => Number(row.id) === Number(topic.id));
        if (nextTopic && routeTopicTaskId) {
            const stillExists = (nextTopic.tasks || []).some((task) => Number(task.id) === Number(routeTopicTaskId));
            if (!stillExists) {
                window.location.href = `/quy-trinh-dich-vu/${nextTopic.id}`;
            }
        }

        return true;
    };

    const openCreateTopic = () => {
        setTopicCreateForm({
            name: '',
            code: '',
            description: '',
            is_active: true,
        });
        setShowTopicCreateForm(true);
    };

    const openEditTopic = (topic) => {
        setEditingId(topic.id);
        setTopicEditForm({
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
        setShowTopicEditForm(true);
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

            toast.success('Đã tạo topic barem mới.');
            setShowTopicCreateForm(false);
            const topicId = Number(res?.data?.id || 0);
            if (topicId > 0) {
                window.location.href = `/quy-trinh-dich-vu/${topicId}`;
            } else {
                await fetchTopics('');
            }
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Tạo topic barem thất bại.');
        }
    };

    const saveEditTopic = async () => {
        if (!canEdit) {
            toast.error('Bạn không có quyền cập nhật barem.');
            return;
        }
        if (!editingId) return;
        if (!topicEditForm.name?.trim()) {
            toast.error('Vui lòng nhập tên topic barem.');
            return;
        }

        const hasEmptyTaskTitle = (topicEditForm.tasks || []).some((task) => !String(task.title || '').trim());
        if (hasEmptyTaskTitle) {
            toast.error('Mỗi công việc mẫu cần có tiêu đề.');
            return;
        }

        const hasEmptyItemTitle = (topicEditForm.tasks || []).some((task) => (
            (task.items || []).some((item) => !String(item.title || '').trim())
        ));
        if (hasEmptyItemTitle) {
            toast.error('Mỗi đầu việc mẫu cần có tiêu đề.');
            return;
        }

        try {
            await axios.put(`/api/v1/workflow-topics/${editingId}`, {
                name: topicEditForm.name?.trim(),
                code: topicEditForm.code?.trim() || null,
                description: topicEditForm.description?.trim() || null,
                is_active: !!topicEditForm.is_active,
                tasks: (topicEditForm.tasks || []).map((task, taskIndex) => normalizeTaskForPayload(task, taskIndex)),
            });
            toast.success('Đã cập nhật topic barem.');
            setShowTopicEditForm(false);
            setEditingId(null);
            await fetchTopics(isTopicsPage ? search : '');
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
            if (Number(routeTopicId) === Number(topic.id)) {
                window.location.href = '/quy-trinh-dich-vu';
                return;
            }
            await fetchTopics(isTopicsPage ? search : '');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Xoá topic thất bại.');
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

    const updateEditTaskField = (taskIndex, field, value) => {
        setTopicEditForm((prev) => {
            const nextTasks = [...prev.tasks];
            nextTasks[taskIndex] = { ...nextTasks[taskIndex], [field]: value };
            return { ...prev, tasks: nextTasks };
        });
    };

    const updateEditItemField = (taskIndex, itemIndex, field, value) => {
        setTopicEditForm((prev) => {
            const nextTasks = [...prev.tasks];
            const nextItems = [...(nextTasks[taskIndex].items || [])];
            nextItems[itemIndex] = { ...nextItems[itemIndex], [field]: value };
            nextTasks[taskIndex] = { ...nextTasks[taskIndex], items: nextItems };
            return { ...prev, tasks: nextTasks };
        });
    };

    const addEditTask = () => {
        setTopicEditForm((prev) => ({
            ...prev,
            tasks: [...prev.tasks, emptyTask(prev.tasks.length + 1)],
        }));
    };

    const removeEditTask = (taskIndex) => {
        setTopicEditForm((prev) => ({
            ...prev,
            tasks: prev.tasks.filter((_, idx) => idx !== taskIndex),
        }));
    };

    const addEditItem = (taskIndex) => {
        setTopicEditForm((prev) => {
            const nextTasks = [...prev.tasks];
            const nextItems = [...(nextTasks[taskIndex].items || []), emptyItem((nextTasks[taskIndex].items || []).length + 1)];
            nextTasks[taskIndex] = { ...nextTasks[taskIndex], items: nextItems };
            return { ...prev, tasks: nextTasks };
        });
    };

    const removeEditItem = (taskIndex, itemIndex) => {
        setTopicEditForm((prev) => {
            const nextTasks = [...prev.tasks];
            const nextItems = (nextTasks[taskIndex].items || []).filter((_, idx) => idx !== itemIndex);
            nextTasks[taskIndex] = { ...nextTasks[taskIndex], items: nextItems };
            return { ...prev, tasks: nextTasks };
        });
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
                    onClick={openCreateTopic}
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

                {isTopicsPage && (
                    <TopicListPage
                        loading={loading}
                        topics={topics}
                        search={search}
                        onSearchChange={setSearch}
                        onSearch={() => fetchTopics(search)}
                        onOpenTopic={(topic) => { window.location.href = `/quy-trinh-dich-vu/${topic.id}`; }}
                        onEditTopic={openEditTopic}
                        onRemoveTopic={removeTopic}
                        canEdit={canEdit}
                    />
                )}

                {isTasksPage && (
                    <TopicTasksPage
                        selectedTopic={selectedTopic}
                        canEdit={canEdit}
                        onBack={() => { window.location.href = '/quy-trinh-dich-vu'; }}
                        onOpenTask={(task) => {
                            if (!selectedTopic) return;
                            window.location.href = `/quy-trinh-dich-vu/${selectedTopic.id}/cong-viec/${task.id}`;
                        }}
                        onOpenAddTask={() => {
                            setTaskForm(emptyTask((selectedTopic?.tasks || []).length + 1));
                            setShowTaskForm(true);
                        }}
                    />
                )}

                {isItemsPage && (
                    <TaskItemsPage
                        selectedTopic={selectedTopic}
                        selectedTask={selectedTask}
                        canEdit={canEdit}
                        onBack={() => {
                            if (!selectedTopic) return;
                            window.location.href = `/quy-trinh-dich-vu/${selectedTopic.id}`;
                        }}
                        onOpenAddItem={() => {
                            setItemForm(emptyItem((selectedTask?.items || []).length + 1));
                            setShowItemForm(true);
                        }}
                    />
                )}
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
                open={showTopicEditForm}
                onClose={() => setShowTopicEditForm(false)}
                title={editingId ? `Sửa topic barem #${editingId}` : 'Sửa topic barem'}
                description="Thiết lập công việc và đầu việc mẫu của topic."
                size="xl"
            >
                <div className="space-y-5 text-sm">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Tên topic</label>
                            <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={topicEditForm.name} onChange={(e) => setTopicEditForm((prev) => ({ ...prev, name: e.target.value }))} />
                        </div>
                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Mã topic</label>
                            <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={topicEditForm.code} onChange={(e) => setTopicEditForm((prev) => ({ ...prev, code: e.target.value }))} />
                        </div>
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Mô tả</label>
                        <textarea className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" rows={2} value={topicEditForm.description} onChange={(e) => setTopicEditForm((prev) => ({ ...prev, description: e.target.value }))} />
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3">
                        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                            <input type="checkbox" checked={!!topicEditForm.is_active} onChange={(e) => setTopicEditForm((prev) => ({ ...prev, is_active: e.target.checked }))} />
                            Đang hoạt động
                        </label>
                    </div>

                    <div className="space-y-4">
                        {topicEditForm.tasks.map((task, taskIndex) => (
                            <div key={`task-${taskIndex}`} className="rounded-2xl border border-slate-200 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <h4 className="font-semibold text-slate-900">Công việc mẫu #{taskIndex + 1}</h4>
                                    <button type="button" className="text-xs font-semibold text-rose-600" onClick={() => removeEditTask(taskIndex)}>
                                        Xoá công việc
                                    </button>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Tiêu đề công việc</label>
                                        <input className="w-full rounded-xl border border-slate-200 px-3 py-2" value={task.title} onChange={(e) => updateEditTaskField(taskIndex, 'title', e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Mô tả</label>
                                        <input className="w-full rounded-xl border border-slate-200 px-3 py-2" value={task.description || ''} onChange={(e) => updateEditTaskField(taskIndex, 'description', e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Ưu tiên</label>
                                        <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={task.priority} onChange={(e) => updateEditTaskField(taskIndex, 'priority', e.target.value)}>
                                            {TASK_PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Trạng thái</label>
                                        <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={task.status} onChange={(e) => updateEditTaskField(taskIndex, 'status', e.target.value)}>
                                            {TASK_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Tỷ trọng (%)</label>
                                        <input type="number" min="1" max="100" className="w-full rounded-xl border border-slate-200 px-3 py-2" value={task.weight_percent} onChange={(e) => updateEditTaskField(taskIndex, 'weight_percent', e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Bắt đầu sau (ngày)</label>
                                        <input type="number" min="0" className="w-full rounded-xl border border-slate-200 px-3 py-2" value={task.start_offset_days} onChange={(e) => updateEditTaskField(taskIndex, 'start_offset_days', e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Thời lượng (ngày)</label>
                                        <input type="number" min="1" className="w-full rounded-xl border border-slate-200 px-3 py-2" value={task.duration_days} onChange={(e) => updateEditTaskField(taskIndex, 'duration_days', e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-text-subtle">Thứ tự</label>
                                        <input type="number" min="0" className="w-full rounded-xl border border-slate-200 px-3 py-2" value={task.sort_order} onChange={(e) => updateEditTaskField(taskIndex, 'sort_order', e.target.value)} />
                                    </div>
                                </div>

                                <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    <div className="flex items-center justify-between">
                                        <h5 className="text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Đầu việc mẫu</h5>
                                        <button type="button" className="text-xs font-semibold text-primary" onClick={() => addEditItem(taskIndex)}>
                                            + Thêm đầu việc
                                        </button>
                                    </div>

                                    {(task.items || []).map((item, itemIndex) => (
                                        <div key={`item-${taskIndex}-${itemIndex}`} className="rounded-xl border border-slate-200 bg-white p-3">
                                            <div className="mb-2 flex items-center justify-between">
                                                <p className="text-xs font-semibold text-slate-700">Đầu việc #{itemIndex + 1}</p>
                                                <button type="button" className="text-[11px] font-semibold text-rose-600" onClick={() => removeEditItem(taskIndex, itemIndex)}>
                                                    Xoá
                                                </button>
                                            </div>
                                            <div className="grid gap-2 md:grid-cols-2">
                                                <div>
                                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-subtle">Tiêu đề đầu việc</label>
                                                    <input className="w-full rounded-xl border border-slate-200 px-3 py-2" value={item.title} onChange={(e) => updateEditItemField(taskIndex, itemIndex, 'title', e.target.value)} />
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-subtle">Mô tả</label>
                                                    <input className="w-full rounded-xl border border-slate-200 px-3 py-2" value={item.description || ''} onChange={(e) => updateEditItemField(taskIndex, itemIndex, 'description', e.target.value)} />
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-subtle">Ưu tiên</label>
                                                    <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={item.priority} onChange={(e) => updateEditItemField(taskIndex, itemIndex, 'priority', e.target.value)}>
                                                        {TASK_PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-subtle">Trạng thái</label>
                                                    <select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={item.status} onChange={(e) => updateEditItemField(taskIndex, itemIndex, 'status', e.target.value)}>
                                                        {TASK_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-subtle">Tỷ trọng (%)</label>
                                                    <input type="number" min="1" max="100" className="w-full rounded-xl border border-slate-200 px-3 py-2" value={item.weight_percent} onChange={(e) => updateEditItemField(taskIndex, itemIndex, 'weight_percent', e.target.value)} />
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-subtle">Bắt đầu sau (ngày)</label>
                                                    <input type="number" min="0" className="w-full rounded-xl border border-slate-200 px-3 py-2" value={item.start_offset_days} onChange={(e) => updateEditItemField(taskIndex, itemIndex, 'start_offset_days', e.target.value)} />
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-subtle">Thời lượng (ngày)</label>
                                                    <input type="number" min="1" className="w-full rounded-xl border border-slate-200 px-3 py-2" value={item.duration_days} onChange={(e) => updateEditItemField(taskIndex, itemIndex, 'duration_days', e.target.value)} />
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-text-subtle">Thứ tự</label>
                                                    <input type="number" min="0" className="w-full rounded-xl border border-slate-200 px-3 py-2" value={item.sort_order} onChange={(e) => updateEditItemField(taskIndex, itemIndex, 'sort_order', e.target.value)} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <button type="button" className="w-full rounded-2xl border border-dashed border-slate-300 py-2 text-sm font-semibold text-slate-600" onClick={addEditTask}>
                        + Thêm công việc mẫu
                    </button>

                    <div className="grid grid-cols-2 gap-3">
                        <button type="button" className="rounded-2xl bg-primary py-2.5 font-semibold text-white" onClick={saveEditTopic}>Cập nhật barem</button>
                        <button type="button" className="rounded-2xl border border-slate-200 py-2.5 font-semibold text-slate-700" onClick={() => setShowTopicEditForm(false)}>Huỷ</button>
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
