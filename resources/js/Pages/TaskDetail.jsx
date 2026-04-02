import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Modal from '@/Components/Modal';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';
import { formatVietnamDate } from '@/lib/vietnamTime';

const TASK_STATUS = { todo: 'Cần làm', doing: 'Đang làm', done: 'Hoàn tất', blocked: 'Bị chặn' };
const TASK_STATUS_STYLES = {
    todo: 'bg-slate-100 text-slate-700 border-slate-200',
    doing: 'bg-blue-50 text-blue-700 border-blue-200',
    done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blocked: 'bg-rose-50 text-rose-700 border-rose-200',
};
const PRIORITY = { low: 'Thấp', medium: 'TB', high: 'Cao', urgent: 'Khẩn' };
const PRIORITY_STYLES = {
    low: 'bg-slate-100 text-slate-700 border-slate-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    urgent: 'bg-rose-50 text-rose-700 border-rose-200',
};

const formatDate = (raw) => formatVietnamDate(raw, raw ? String(raw).slice(0, 10) : '—');

export default function TaskDetail(props) {
    const toast = useToast();
    const taskId = props.taskId;
    const currentUserId = Number(props?.auth?.user?.id || 0);
    const currentUserRole = props?.auth?.user?.role || '';
    const canManageItems = ['admin', 'quan_ly'].includes(currentUserRole);

    const [task, setTask] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const [activeTab, setActiveTab] = useState('all');

    // Item form modal
    const [showItemForm, setShowItemForm] = useState(false);
    const [editingItemId, setEditingItemId] = useState(null);
    const [savingItem, setSavingItem] = useState(false);
    const [itemForm, setItemForm] = useState({
        title: '', description: '', status: 'todo', priority: 'medium',
        progress_percent: '', weight_percent: '', start_date: '', deadline: '',
        assignee_id: '', reviewer_id: '',
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            const [taskRes, itemRes] = await Promise.all([
                axios.get(`/api/v1/tasks/${taskId}`),
                axios.get(`/api/v1/tasks/${taskId}/items`, { params: { per_page: 200 } }),
            ]);
            setTask(taskRes.data || null);
            setItems(itemRes.data?.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được công việc.');
        } finally { setLoading(false); }
    };

    const fetchUsers = async () => {
        try {
            const res = await axios.get('/api/v1/users/lookup');
            setUsers(res.data?.data || []);
        } catch { /* ignore */ }
    };

    useEffect(() => { fetchData(); fetchUsers(); }, [taskId]);

    // Group items by assignee
    const itemGroups = useMemo(() => {
        const map = {};
        items.forEach((item) => {
            const key = String(item?.assignee?.id || 0);
            if (!map[key]) map[key] = { id: item?.assignee?.id || 0, name: item?.assignee?.name || 'Chưa gán', rows: [] };
            map[key].rows.push(item);
        });
        return Object.values(map).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    }, [items]);

    const tabs = useMemo(() => [
        { key: 'all', label: 'Tất cả', count: items.length },
        ...itemGroups.map((g) => ({ key: String(g.id), label: g.name, count: g.rows.length })),
    ], [items, itemGroups]);

    const visibleItems = useMemo(() => {
        if (activeTab === 'all') return items;
        return items.filter((i) => String(i?.assignee?.id || 0) === activeTab);
    }, [items, activeTab]);

    // Item form
    const openItemForm = (item = null) => {
        setEditingItemId(item?.id || null);
        setItemForm({
            title: item?.title || '',
            description: item?.description || '',
            status: item?.status || 'todo',
            priority: item?.priority || 'medium',
            progress_percent: item?.progress_percent ?? '',
            weight_percent: item?.weight_percent ?? '',
            start_date: item?.start_date ? String(item.start_date).slice(0, 10) : '',
            deadline: item?.deadline ? String(item.deadline).slice(0, 10) : '',
            assignee_id: item?.assignee_id || '',
        });
        setShowItemForm(true);
    };

    const availableWeight = useMemo(() => {
        const used = items
            .filter((i) => String(i.id) !== String(editingItemId))
            .reduce((sum, item) => sum + (Number(item.weight_percent) || 0), 0);
        return Math.max(0, 100 - used);
    }, [items, editingItemId]);

    const saveItem = async () => {
        if (!itemForm.title.trim()) { toast.error('Tiêu đề đầu việc là bắt buộc.'); return; }
        const weightVal = Number(itemForm.weight_percent) || 0;
        if (weightVal > availableWeight) { toast.error(`Tỷ trọng tối đa bạn có thể trích cho đầu việc này là ${availableWeight}%.`); return; }
        
        setSavingItem(true);
        try {
            const payload = {
                ...itemForm,
                progress_percent: itemForm.progress_percent === '' ? null : Number(itemForm.progress_percent),
                weight_percent: itemForm.weight_percent === '' ? null : Number(itemForm.weight_percent),
                assignee_id: itemForm.assignee_id ? Number(itemForm.assignee_id) : null,
                start_date: itemForm.start_date || null,
                deadline: itemForm.deadline || null,
            };
            if (editingItemId) {
                await axios.put(`/api/v1/tasks/${taskId}/items/${editingItemId}`, payload);
                toast.success('Đã cập nhật đầu việc.');
            } else {
                await axios.post(`/api/v1/tasks/${taskId}/items`, payload);
                toast.success('Đã tạo đầu việc.');
            }
            setShowItemForm(false);
            await fetchData();
        } catch (e) { toast.error(e?.response?.data?.message || 'Lưu đầu việc thất bại.'); }
        finally { setSavingItem(false); }
    };

    const deleteItem = async (itemId) => {
        if (!window.confirm('Xóa đầu việc này?')) return;
        try {
            await axios.delete(`/api/v1/tasks/${taskId}/items/${itemId}`);
            toast.success('Đã xóa đầu việc.');
            await fetchData();
        } catch (e) { toast.error(e?.response?.data?.message || 'Xóa thất bại.'); }
    };

    const stats = task ? [
        { label: 'Tiến độ', value: `${task.progress_percent ?? 0}%` },
        { label: 'Đầu việc', value: String(items.length) },
        { label: 'Trạng thái', value: TASK_STATUS[task.status] || task.status },
        { label: 'Deadline', value: task.deadline ? formatDate(task.deadline) : '—' },
    ] : [];

    return (
        <PageContainer
            auth={props.auth}
            title="Chi tiết công việc"
            description="Xem thông tin công việc, danh sách đầu việc và quản lý tiến độ."
            stats={stats}
        >
            {loading && <p className="text-sm text-text-muted">Đang tải...</p>}
            {!loading && task && (
                <div className="space-y-6">
                    {/* Breadcrumb */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                        <a href="/du-an" className="hover:text-primary">Dự án</a>
                        <span>›</span>
                        {task.project ? (
                            <a href={`/du-an/${task.project.id}`} className="hover:text-primary">{task.project.name || '—'}</a>
                        ) : <span>—</span>}
                        <span>›</span>
                        <span className="font-semibold text-slate-700">{task.title}</span>
                    </div>

                    {/* Task info card */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">{task.title}</h3>
                                {task.description && <p className="mt-1 text-sm text-text-muted">{task.description}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${TASK_STATUS_STYLES[task.status] || TASK_STATUS_STYLES.todo}`}>
                                    {TASK_STATUS[task.status] || task.status}
                                </span>
                                {task.priority && (
                                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium}`}>
                                        {PRIORITY[task.priority] || task.priority}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6 text-sm">
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Dự án</div>
                                <div className="mt-1 font-semibold text-slate-900">{task.project?.name || '—'}</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Phòng ban</div>
                                <div className="mt-1 font-semibold text-slate-900">{task.department?.name || '—'}</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Phụ trách</div>
                                <div className="mt-1 font-semibold text-slate-900">{task.assignee?.name || '—'}</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Tiến độ</div>
                                <div className="mt-1 flex items-center gap-2">
                                    <div className="h-2 flex-1 rounded-full bg-slate-200">
                                        <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, task.progress_percent || 0)}%` }} />
                                    </div>
                                    <span className="font-semibold text-slate-900">{task.progress_percent ?? 0}%</span>
                                </div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Tỷ trọng</div>
                                <div className="mt-1 font-semibold text-slate-900">{Number(task.weight_percent ?? 0)}%</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Deadline</div>
                                <div className="mt-1 font-semibold text-slate-900">{formatDate(task.deadline)}</div>
                            </div>
                        </div>
                    </div>

                    {/* Item list with tabs */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <div>
                                <h4 className="font-semibold text-slate-900">Danh sách đầu việc</h4>
                                <p className="text-xs text-text-muted mt-1">{items.length} đầu việc trong công việc</p>
                            </div>
                            {canManageItems && (
                                <button type="button" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white" onClick={() => openItemForm(null)}>
                                    Thêm đầu việc
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

                        {visibleItems.length === 0 && (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-text-muted">
                                Chưa có đầu việc nào.
                            </div>
                        )}

                        {visibleItems.length > 0 && (
                            <div className="space-y-3">
                                {visibleItems.map((item) => (
                                    <div key={item.id} className="rounded-2xl border border-slate-200/80 p-4 transition hover:border-primary/30 hover:bg-primary/5">
                                        <a href={`/dau-viec/${item.id}`} className="block">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="font-medium text-slate-900">{item.title}</p>
                                                    {item.description && <p className="text-xs text-text-muted mt-1 truncate max-w-[300px]">{item.description}</p>}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${TASK_STATUS_STYLES[item.status] || TASK_STATUS_STYLES.todo}`}>
                                                        {TASK_STATUS[item.status] || item.status}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-text-muted">
                                                <span>Phụ trách: {item.assignee?.name || '—'}</span>
                                                <span className="flex items-center gap-1">
                                                    Tiến độ:
                                                    <span className="inline-block h-1.5 w-12 rounded-full bg-slate-200">
                                                        <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(100, item.progress_percent || 0)}%` }} />
                                                    </span>
                                                    {item.progress_percent ?? 0}%
                                                </span>
                                                <span>Tỷ trọng: {Number(item.weight_percent ?? 0)}%</span>
                                                <span>Hạn: {formatDate(item.deadline)}</span>
                                            </div>
                                        </a>
                                        {/* Actions */}
                                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs border-t border-slate-100 pt-3">
                                            <a href={`/dau-viec/${item.id}`} className="rounded-lg px-2.5 py-1.5 font-semibold text-primary hover:bg-primary/5">Chi tiết & Phiếu duyệt</a>
                                            {canManageItems && (
                                                <>
                                                    <button type="button" className="rounded-lg px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-100" onClick={() => openItemForm(item)}>Sửa</button>
                                                    {currentUserRole === 'admin' && (
                                                        <button type="button" className="rounded-lg px-2.5 py-1.5 font-semibold text-rose-600 hover:bg-rose-50" onClick={() => deleteItem(item.id)}>Xóa</button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Item Form Modal */}
            <Modal
                open={showItemForm}
                onClose={() => setShowItemForm(false)}
                title={editingItemId ? 'Sửa đầu việc' : 'Thêm đầu việc mới'}
                description={task ? `Công việc: ${task.title}` : ''}
                size="lg"
            >
                <div className="space-y-4 text-sm">
                    {task && (
                        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                            <strong>Lịch trình công việc cha: </strong>
                            {task.start_date ? formatDate(task.start_date) : 'Chưa có'} — {task.deadline ? formatDate(task.deadline) : 'Chưa có'}
                        </div>
                    )}
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                            <label className="text-xs text-text-muted">Tiêu đề *</label>
                            <input className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={itemForm.title} onChange={(e) => setItemForm((s) => ({ ...s, title: e.target.value }))} />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-xs text-text-muted">Mô tả</label>
                            <textarea className="mt-2 min-h-[80px] w-full rounded-xl border border-slate-200/80 px-3 py-2" value={itemForm.description} onChange={(e) => setItemForm((s) => ({ ...s, description: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Trạng thái</label>
                            <select className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={itemForm.status} onChange={(e) => setItemForm((s) => ({ ...s, status: e.target.value }))}>
                                {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Ưu tiên</label>
                            <select className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={itemForm.priority} onChange={(e) => setItemForm((s) => ({ ...s, priority: e.target.value }))}>
                                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Nhân sự phụ trách</label>
                            <select className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={itemForm.assignee_id} onChange={(e) => setItemForm((s) => ({ ...s, assignee_id: e.target.value }))}>
                                <option value="">-- Chọn --</option>
                                {users.filter((u) => !['admin', 'administrator', 'ke_toan'].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Tỷ trọng (%) - Tối đa còn {availableWeight}%</label>
                            <input type="number" min="1" max={availableWeight} className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={itemForm.weight_percent} onChange={(e) => setItemForm((s) => ({ ...s, weight_percent: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Tiến độ (%)</label>
                            <input type="number" min="0" max="100" className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={itemForm.progress_percent} onChange={(e) => setItemForm((s) => ({ ...s, progress_percent: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Ngày bắt đầu</label>
                            <input type="date" className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={itemForm.start_date} onChange={(e) => setItemForm((s) => ({ ...s, start_date: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Deadline</label>
                            <input type="date" className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={itemForm.deadline} onChange={(e) => setItemForm((s) => ({ ...s, deadline: e.target.value }))} />
                        </div>
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                        <button type="button" className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white" onClick={saveItem} disabled={savingItem}>
                            {savingItem ? 'Đang lưu...' : editingItemId ? 'Cập nhật' : 'Tạo đầu việc'}
                        </button>
                        <button type="button" className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700" onClick={() => setShowItemForm(false)}>Hủy</button>
                    </div>
                </div>
            </Modal>
        </PageContainer>
    );
}
