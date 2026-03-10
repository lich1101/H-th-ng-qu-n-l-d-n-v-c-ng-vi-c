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
            toast.success('Đã xóa lịch nhắc.');
            await fetchReminders(selectedTaskId);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa lịch nhắc thất bại.');
        }
    };

    const startEdit = (r) => {
        if (!canManage) return;
        setEditingId(r.id);
        setForm({
            channel: r.channel || 'in_app',
            trigger_type: r.trigger_type || 'days_3',
            scheduled_at: (r.scheduled_at || '').slice(0, 16).replace(' ', 'T'),
            status: r.status || 'pending',
        });
    };

    const stats = [
        { label: 'Nhắc deadline (trang)', value: String(reminders.length) },
        { label: 'Task đang chọn', value: selectedTaskId || '—' },
        { label: 'Role', value: userRole || '—' },
        { label: 'Quyền quản lý', value: canManage ? 'Admin/Trưởng phòng' : 'Xem' },
    ];

    return (
        <PageContainer
            auth={props.auth}
            title="Nhắc nhở deadline"
            description="Tự động cảnh báo khi còn 3 ngày, 1 ngày hoặc đã quá hạn. Admin/Trưởng phòng có quyền cấu hình."
            stats={stats}
        >
            <div className="grid gap-4 lg:grid-cols-3">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm lg:col-span-1">
                    <h3 className="font-semibold mb-3">Chọn task</h3>
                    <select
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm mb-3"
                        value={selectedTaskId}
                        onChange={(e) => {
                            const v = e.target.value;
                            setSelectedTaskId(v);
                            fetchReminders(v);
                        }}
                    >
                        <option value="">-- Chọn task --</option>
                        {tasks.map((t) => (
                            <option key={t.id} value={t.id}>
                                #{t.id} • {t.title}
                            </option>
                        ))}
                    </select>
                    <div className="space-y-2 text-xs text-slate-600">
                        <p>• Chỉ Admin/Trưởng phòng mới tạo/sửa/xóa lịch nhắc.</p>
                        <p>• Các kênh nhắc sẽ dùng cron + Notification Center để bắn thông báo.</p>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm lg:col-span-2">
                    <h3 className="font-semibold mb-3">Quản lý lịch nhắc</h3>
                    {loading && <p className="text-xs text-slate-500 mb-2">Đang tải...</p>}
                    <div className="grid gap-4 lg:grid-cols-2">
                        <div className="space-y-2 text-sm">
                            <h4 className="font-semibold text-slate-800">Form lịch nhắc</h4>
                            <select
                                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                                value={form.channel}
                                onChange={(e) => setForm((s) => ({ ...s, channel: e.target.value }))}
                                disabled={!canManage}
                            >
                                {CHANNELS.map((c) => (
                                    <option key={c.value} value={c.value}>
                                        {c.label}
                                    </option>
                                ))}
                            </select>
                            <select
                                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                                value={form.trigger_type}
                                onChange={(e) =>
                                    setForm((s) => ({ ...s, trigger_type: e.target.value }))
                                }
                                disabled={!canManage}
                            >
                                {TRIGGERS.map((t) => (
                                    <option key={t.value} value={t.value}>
                                        {t.label}
                                    </option>
                                ))}
                            </select>
                            <input
                                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                                type="datetime-local"
                                value={form.scheduled_at}
                                onChange={(e) =>
                                    setForm((s) => ({ ...s, scheduled_at: e.target.value }))
                                }
                                disabled={!canManage}
                            />
                            <select
                                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                                value={form.status}
                                onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}
                                disabled={!canManage}
                            >
                                <option value="pending">pending</option>
                                <option value="sent">sent</option>
                                <option value="cancelled">cancelled</option>
                            </select>
                            <button
                                type="button"
                                className="w-full rounded-lg px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold disabled:opacity-50"
                                onClick={save}
                                disabled={!canManage || !selectedTaskId}
                            >
                                {editingId ? 'Cập nhật lịch nhắc' : 'Tạo lịch nhắc'}
                            </button>
                            {editingId && (
                                <button
                                    type="button"
                                    className="w-full rounded-lg px-3 py-2 border border-slate-200 text-sm mt-1"
                                    onClick={resetForm}
                                >
                                    Hủy sửa
                                </button>
                            )}
                        </div>
                        <div className="space-y-2 text-sm">
                            <h4 className="font-semibold text-slate-800">Danh sách lịch nhắc</h4>
                            {reminders.map((r) => (
                                <div
                                    key={r.id}
                                    className="rounded-lg border border-slate-200 p-3 flex justify-between items-center"
                                >
                                    <div>
                                        <p className="font-medium">
                                            {r.trigger_type} • {r.channel}
                                        </p>
                                        <p className="text-xs text-slate-500 mt-1">
                                            Lịch gửi: {r.scheduled_at} • Trạng thái:{' '}
                                            {r.status || 'pending'}
                                        </p>
                                    </div>
                                    {canManage && (
                                        <div className="flex flex-col gap-1">
                                            <button
                                                type="button"
                                                className="text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100"
                                                onClick={() => startEdit(r)}
                                            >
                                                Sửa
                                            </button>
                                            <button
                                                type="button"
                                                className="text-xs px-2 py-1 rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                                onClick={() => remove(r)}
                                            >
                                                Xóa
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {!reminders.length && (
                                <p className="text-slate-500 text-sm">
                                    Chưa có lịch nhắc cho task này. Chọn task và tạo mới bên trái.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
