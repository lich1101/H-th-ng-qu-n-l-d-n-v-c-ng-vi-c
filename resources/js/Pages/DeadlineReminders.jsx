import React, { useEffect, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

const CHANNELS = [
    { value: 'in_app', label: 'In-app' },
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

export default function DeadlineReminders(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canManage = ['admin', 'truong_phong_san_xuat'].includes(userRole);

    const [tasks, setTasks] = useState([]);
    const [selectedTaskId, setSelectedTaskId] = useState('');
    const [reminders, setReminders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);
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
            toast.error(e?.response?.data?.message || 'Không tải được danh sách task.');
        }
    };

    const fetchReminders = async (taskId) => {
        if (!taskId) {
            setReminders([]);
            return;
        }
        setLoading(true);
        try {
            const res = await axios.get(`/api/v1/tasks/${taskId}/reminders`, {
                params: { per_page: 50 },
            });
            setReminders(res.data?.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được nhắc deadline.');
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

    const save = async () => {
        if (!selectedTaskId) {
            toast.error('Vui lòng chọn task.');
            return;
        }
        if (!form.scheduled_at) {
            toast.error('Vui lòng chọn thời gian gửi nhắc.');
            return;
        }
        if (!canManage) {
            toast.error('Bạn không có quyền quản lý nhắc deadline.');
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
                toast.success('Đã cập nhật nhắc deadline.');
            } else {
                await axios.post(`/api/v1/tasks/${selectedTaskId}/reminders`, payload);
                toast.success('Đã tạo nhắc deadline.');
            }
            resetForm();
            await fetchReminders(selectedTaskId);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu nhắc deadline thất bại.');
        }
    };

    const remove = async (r) => {
        if (!selectedTaskId) return;
        if (!canManage) {
            toast.error('Bạn không có quyền xóa nhắc deadline.');
            return;
        }
        if (!confirm('Xóa lịch nhắc này?')) return;
        try {
            await axios.delete(`/api/v1/tasks/${selectedTaskId}/reminders/${r.id}`);
            toast.success('Đã xóa nhắc deadline.');
            await fetchReminders(selectedTaskId);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa nhắc deadline thất bại.');
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
    };

    const stats = [
        { label: 'Tổng nhắc deadline', value: reminders.length },
        { label: 'Task đang chọn', value: selectedTaskId || '—' },
        { label: 'Vai trò', value: userRole || '—' },
        { label: 'Quyền quản lý', value: canManage ? 'Có' : 'Không' },
    ];

    return (
        <PageContainer
            auth={props.auth}
            title="Nhắc nhở deadline"
            description="Thiết lập lịch nhắc theo từng task, kênh gửi và trigger ưu tiên."
            stats={stats}
        >
            <div className="grid gap-5 lg:grid-cols-3">
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 lg:col-span-1">
                    <h3 className="font-semibold text-slate-900 mb-4">Thiết lập nhắc deadline</h3>
                    <div className="space-y-3 text-sm">
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={selectedTaskId}
                            onChange={(e) => {
                                const value = e.target.value;
                                setSelectedTaskId(value);
                                fetchReminders(value);
                            }}
                        >
                            <option value="">-- Chọn task --</option>
                            {tasks.map((t) => (
                                <option key={t.id} value={t.id}>
                                    #{t.id} • {t.title}
                                </option>
                            ))}
                        </select>
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={form.channel}
                            onChange={(e) => setForm((s) => ({ ...s, channel: e.target.value }))}
                        >
                            {CHANNELS.map((c) => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                        </select>
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={form.trigger_type}
                            onChange={(e) => setForm((s) => ({ ...s, trigger_type: e.target.value }))}
                        >
                            {TRIGGERS.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                        <input
                            type="datetime-local"
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={form.scheduled_at}
                            onChange={(e) => setForm((s) => ({ ...s, scheduled_at: e.target.value }))}
                        />
                        <button
                            type="button"
                            className="w-full bg-primary text-white rounded-2xl py-2.5 font-semibold"
                            onClick={save}
                        >
                            {editingId ? 'Cập nhật nhắc deadline' : 'Tạo nhắc deadline'}
                        </button>
                        {editingId && (
                            <button
                                type="button"
                                className="w-full text-xs text-text-muted"
                                onClick={resetForm}
                            >
                                Hủy chỉnh sửa
                            </button>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 lg:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-slate-900">Danh sách nhắc deadline</h3>
                        {loading && <span className="text-xs text-text-muted">Đang tải...</span>}
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
                            <p className="text-sm text-text-muted">Chưa có nhắc deadline cho task này.</p>
                        )}
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
