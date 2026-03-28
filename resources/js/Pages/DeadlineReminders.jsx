import React, { useEffect, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import PaginationControls from '@/Components/PaginationControls';
import { useToast } from '@/Contexts/ToastContext';

const CHANNELS = [
    { value: 'in_app', label: 'Trong ứng dụng' },
    { value: 'push', label: 'Thông báo đẩy' },
    { value: 'email', label: 'Email' },
    { value: 'telegram', label: 'Telegram' },
    { value: 'zalo', label: 'Zalo' },
];

const TRIGGERS = [
    { value: 'days_3', label: 'Trước 3 ngày' },
    { value: 'day_1', label: 'Trước 1 ngày' },
    { value: 'overdue', label: 'Khi quá hạn' },
    { value: 'custom', label: 'Tùy chọn' },
];

function FormField({ label, required = false, children, className = '' }) {
    return (
        <div className={className}>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                {label}{required ? ' *' : ''}
            </label>
            {children}
        </div>
    );
}

export default function DeadlineReminders(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canManage = ['admin', 'quan_ly'].includes(userRole);

    const [tasks, setTasks] = useState([]);
    const [selectedTaskId, setSelectedTaskId] = useState('');
    const [reminders, setReminders] = useState([]);
    const [reminderMeta, setReminderMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [reminderFilters, setReminderFilters] = useState({ per_page: 20, page: 1 });
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        channel: 'in_app',
        trigger_type: 'days_3',
        scheduled_at: '',
        status: 'pending',
    });

    const fetchTasks = async () => {
        try {
            const res = await axios.get('/api/v1/tasks', { params: { per_page: 200 } });
            setTasks(res.data?.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được danh sách công việc.');
        }
    };

    const fetchReminders = async (taskId, page = reminderFilters.page, nextFilters = reminderFilters) => {
        if (!taskId) {
            setReminders([]);
            setReminderMeta({ current_page: 1, last_page: 1, total: 0 });
            return;
        }
        setLoading(true);
        try {
            const res = await axios.get(`/api/v1/tasks/${taskId}/reminders`, {
                params: {
                    page,
                    per_page: nextFilters.per_page || 20,
                },
            });
            setReminders(res.data?.data || []);
            setReminderMeta({
                current_page: res.data?.current_page || 1,
                last_page: res.data?.last_page || 1,
                total: res.data?.total || 0,
            });
            setReminderFilters((prev) => ({ ...prev, page: res.data?.current_page || page }));
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được nhắc hạn.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const resetForm = () => {
        setEditingId(null);
        setForm({
            channel: 'in_app',
            trigger_type: 'days_3',
            scheduled_at: '',
            status: 'pending',
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

    const save = async () => {
        if (!selectedTaskId) {
            toast.error('Vui lòng chọn công việc.');
            return;
        }
        if (!form.scheduled_at) {
            toast.error('Vui lòng chọn thời gian gửi nhắc.');
            return;
        }
        if (!canManage) {
            toast.error('Bạn không có quyền quản lý nhắc hạn.');
            return;
        }
        try {
            const payload = {
                channel: form.channel,
                trigger_type: form.trigger_type,
                scheduled_at: form.scheduled_at,
                status: form.status || 'pending',
            };
            if (editingId) {
                await axios.put(`/api/v1/tasks/${selectedTaskId}/reminders/${editingId}`, payload);
                toast.success('Đã cập nhật nhắc hạn.');
            } else {
                await axios.post(`/api/v1/tasks/${selectedTaskId}/reminders`, payload);
                toast.success('Đã tạo nhắc hạn.');
            }
            closeForm();
            await fetchReminders(selectedTaskId, reminderFilters.page, reminderFilters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu nhắc hạn thất bại.');
        }
    };

    const remove = async (r) => {
        if (!selectedTaskId) return;
        if (!canManage) {
            toast.error('Bạn không có quyền xóa nhắc hạn.');
            return;
        }
        if (!confirm('Xóa lịch nhắc này?')) return;
        try {
            await axios.delete(`/api/v1/tasks/${selectedTaskId}/reminders/${r.id}`);
            toast.success('Đã xóa nhắc hạn.');
            await fetchReminders(selectedTaskId, reminderFilters.page, reminderFilters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa nhắc hạn thất bại.');
        }
    };

    const startEdit = (r) => {
        setEditingId(r.id);
        setForm({
            channel: r.channel || 'in_app',
            trigger_type: r.trigger_type || 'days_3',
            scheduled_at: r.scheduled_at ? r.scheduled_at.slice(0, 16) : '',
            status: r.status || 'pending',
        });
        setShowForm(true);
    };

    const stats = [
        { label: 'Tổng nhắc hạn', value: reminders.length },
        { label: 'Công việc đang chọn', value: selectedTaskId || '—' },
        { label: 'Vai trò', value: userRole || '—' },
        { label: 'Quyền quản lý', value: canManage ? 'Có' : 'Không' },
    ];

    return (
        <PageContainer
            auth={props.auth}
            title="Nhắc nhở hạn chót"
            description="Thiết lập lịch nhắc theo từng công việc, kênh gửi và mức kích hoạt ưu tiên."
            stats={stats}
        >
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-900">Danh sách nhắc hạn</h3>
                    <div className="flex items-center gap-2">
                        {canManage && (
                            <button
                                type="button"
                                className="rounded-2xl bg-primary text-white px-3 py-2 text-sm font-semibold"
                                onClick={openCreate}
                            >
                                Thêm mới
                            </button>
                        )}
                        {loading && <span className="text-xs text-text-muted">Đang tải...</span>}
                    </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                    {reminders.map((r) => (
                        <div key={r.id} className="rounded-2xl border border-slate-200/80 p-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                    {r.channel}
                                </span>
                                <span className="text-xs text-text-muted">{r.trigger_type}</span>
                            </div>
                            <p className="mt-3 text-sm font-semibold">{r.scheduled_at}</p>
                            <p className="text-xs text-text-muted mt-1">Trạng thái: {r.status}</p>
                            <div className="mt-3 flex gap-2">
                                {canManage && (
                                    <button className="text-xs text-primary" onClick={() => startEdit(r)} type="button">Sửa</button>
                                )}
                                {canManage && (
                                    <button className="text-xs text-danger" onClick={() => remove(r)} type="button">Xóa</button>
                                )}
                            </div>
                        </div>
                    ))}
                    {!reminders.length && (
                        <p className="text-sm text-text-muted">Chưa có nhắc hạn cho công việc này.</p>
                    )}
                </div>
                <PaginationControls
                    page={reminderMeta.current_page}
                    lastPage={reminderMeta.last_page}
                    total={reminderMeta.total}
                    perPage={reminderFilters.per_page}
                    label="nhắc hạn"
                    loading={loading}
                    onPageChange={(page) => fetchReminders(selectedTaskId, page, reminderFilters)}
                    onPerPageChange={(perPage) => {
                        const next = { ...reminderFilters, per_page: perPage, page: 1 };
                        setReminderFilters(next);
                        fetchReminders(selectedTaskId, 1, next);
                    }}
                />
            </div>

            <Modal
                open={showForm}
                onClose={closeForm}
                title={editingId ? 'Cập nhật nhắc hạn' : 'Tạo nhắc hạn'}
                description="Chọn công việc, kênh và thời gian nhắc."
                size="md"
            >
                <div className="space-y-3 text-sm">
                    <FormField label="Công việc áp dụng" required>
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={selectedTaskId}
                            onChange={(e) => {
                                const value = e.target.value;
                                const nextReminderFilters = { ...reminderFilters, page: 1 };
                                setSelectedTaskId(value);
                                setReminderFilters(nextReminderFilters);
                                fetchReminders(value, 1, nextReminderFilters);
                            }}
                        >
                            <option value="">-- Chọn công việc --</option>
                            {tasks.map((t) => (
                                <option key={t.id} value={t.id}>
                                    #{t.id} • {t.title}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField label="Kênh gửi nhắc">
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={form.channel}
                            onChange={(e) => setForm((s) => ({ ...s, channel: e.target.value }))}
                        >
                            {CHANNELS.map((c) => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                        </select>
                    </FormField>
                    <FormField label="Mốc kích hoạt">
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={form.trigger_type}
                            onChange={(e) => setForm((s) => ({ ...s, trigger_type: e.target.value }))}
                        >
                            {TRIGGERS.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </FormField>
                    <FormField label="Thời gian gửi" required>
                        <input
                            type="datetime-local"
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={form.scheduled_at}
                            onChange={(e) => setForm((s) => ({ ...s, scheduled_at: e.target.value }))}
                        />
                    </FormField>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="flex-1 bg-primary text-white rounded-2xl py-2.5 font-semibold"
                            onClick={save}
                        >
                            {editingId ? 'Cập nhật nhắc hạn' : 'Tạo nhắc hạn'}
                        </button>
                        <button
                            type="button"
                            className="flex-1 border border-slate-200 rounded-2xl py-2.5 font-semibold"
                            onClick={closeForm}
                        >
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>
        </PageContainer>
    );
}
