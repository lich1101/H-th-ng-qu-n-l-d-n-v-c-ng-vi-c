import React, { useEffect, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

export default function HandoverCenter(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canCreate = ['admin', 'truong_phong_san_xuat', 'nhan_su_san_xuat'].includes(userRole);
    const canDelete = ['admin', 'truong_phong_san_xuat', 'nhan_su_san_xuat'].includes(userRole);

    const [tasks, setTasks] = useState([]);
    const [attachments, setAttachments] = useState([]);
    const [selectedTaskId, setSelectedTaskId] = useState('');
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({
        type: 'link',
        title: '',
        external_url: '',
        version: 1,
        is_handover: true,
        note: '',
    });

    const fetchTasks = async () => {
        try {
            const res = await axios.get('/api/v1/tasks', { params: { per_page: 200 } });
            setTasks(res.data?.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được danh sách task.');
        }
    };

    const fetchAttachments = async (taskId) => {
        if (!taskId) {
            setAttachments([]);
            return;
        }
        setLoading(true);
        try {
            const res = await axios.get(`/api/v1/tasks/${taskId}/attachments`, {
                params: { per_page: 50 },
            });
            setAttachments(res.data?.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được file bàn giao.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const resetForm = () => {
        setForm({
            type: 'link',
            title: '',
            external_url: '',
            version: 1,
            is_handover: true,
            note: '',
        });
    };

    const save = async () => {
        if (!selectedTaskId) {
            toast.error('Vui lòng chọn task cần bàn giao.');
            return;
        }
        if (!canCreate) {
            toast.error('Bạn không có quyền tạo file bàn giao.');
            return;
        }
        if (!form.external_url?.trim()) {
            toast.error('Vui lòng nhập đường dẫn file (Google Drive/YouTube/URL nội bộ).');
            return;
        }
        try {
            await axios.post(`/api/v1/tasks/${selectedTaskId}/attachments`, {
                type: form.type,
                title: form.title || null,
                external_url: form.external_url,
                file_path: null,
                version: form.version || 1,
                is_handover: !!form.is_handover,
                note: form.note || null,
            });
            toast.success('Đã thêm file bàn giao.');
            resetForm();
            await fetchAttachments(selectedTaskId);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Thêm file bàn giao thất bại.');
        }
    };

    const remove = async (att) => {
        if (!canDelete) {
            toast.error('Bạn không có quyền xóa file bàn giao.');
            return;
        }
        if (!selectedTaskId) return;
        if (!confirm('Xóa file bàn giao này?')) return;
        try {
            await axios.delete(`/api/v1/tasks/${selectedTaskId}/attachments/${att.id}`);
            toast.success('Đã xóa file bàn giao.');
            await fetchAttachments(selectedTaskId);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa file bàn giao thất bại.');
        }
    };

    const stats = [
        { label: 'Task có file bàn giao (trang)', value: String(attachments.length) },
        { label: 'Vai trò hiện tại', value: userRole || '—' },
        { label: 'Quyền tạo', value: canCreate ? 'Có' : 'Không' },
        { label: 'Quyền xóa', value: canDelete ? 'Có' : 'Không' },
    ];

    return (
        <PageContainer
            auth={props.auth}
            title="Trung tâm bàn giao"
            description="Quản lý tài liệu, video, version upload và trạng thái bàn giao theo task."
            stats={stats}
        >
            <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <h3 className="font-semibold mb-3">Chọn task</h3>
                    <select
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={selectedTaskId}
                        onChange={(e) => {
                            const value = e.target.value;
                            setSelectedTaskId(value);
                            fetchAttachments(value);
                        }}
                    >
                        <option value="">-- Chọn task --</option>
                        {tasks.map((t) => (
                            <option key={t.id} value={t.id}>
                                #{t.id} • {t.title}
                            </option>
                        ))}
                    </select>
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-2 text-sm">
                        <h4 className="font-semibold">Thêm file bàn giao</h4>
                        <select
                            className="w-full rounded-lg border border-slate-200 px-3 py-2"
                            value={form.type}
                            onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))}
                        >
                            <option value="link">Link tài liệu</option>
                            <option value="video">Video</option>
                            <option value="file">File khác</option>
                        </select>
                        <input
                            className="w-full rounded-lg border border-slate-200 px-3 py-2"
                            placeholder="Tiêu đề hiển thị"
                            value={form.title}
                            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                        />
                        <input
                            className="w-full rounded-lg border border-slate-200 px-3 py-2"
                            placeholder="URL Google Drive/YouTube/Link nội bộ *"
                            value={form.external_url}
                            onChange={(e) => setForm((s) => ({ ...s, external_url: e.target.value }))}
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                                type="number"
                                min="1"
                                placeholder="Version"
                                value={form.version}
                                onChange={(e) => setForm((s) => ({ ...s, version: Number(e.target.value || 1) }))}
                            />
                            <label className="flex items-center gap-2 text-xs text-slate-600">
                                <input
                                    type="checkbox"
                                    checked={form.is_handover}
                                    onChange={(e) => setForm((s) => ({ ...s, is_handover: e.target.checked }))}
                                />
                                Đánh dấu là file bàn giao
                            </label>
                        </div>
                        <textarea
                            className="w-full rounded-lg border border-slate-200 px-3 py-2"
                            rows={3}
                            placeholder="Ghi chú"
                            value={form.note}
                            onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
                        />
                        <button
                            type="button"
                            className="w-full rounded-lg px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold disabled:opacity-50"
                            onClick={save}
                            disabled={loading}
                        >
                            Thêm file bàn giao
                        </button>
                    </div>
                </div>

                <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <h3 className="font-semibold mb-3">Lịch sử upload theo version</h3>
                    {loading && <p className="text-xs text-slate-500 mb-2">Đang tải...</p>}
                    <div className="space-y-2 text-sm">
                        {attachments.map((a) => (
                            <div
                                key={a.id}
                                className="rounded-lg border border-slate-200 p-3 flex justify-between items-center"
                            >
                                <div>
                                    <p className="font-medium">
                                        {a.title || `${a.type} v${a.version}`}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Version v{a.version} •{' '}
                                        {a.external_url || a.file_path || 'Không có URL'} •{' '}
                                        {a.is_handover ? 'Bàn giao' : 'Tham khảo'}
                                    </p>
                                    {a.note && (
                                        <p className="text-xs text-slate-500 mt-1">Ghi chú: {a.note}</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {a.external_url && (
                                        <a
                                            href={a.external_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs text-sky-700 hover:underline"
                                        >
                                            Mở link
                                        </a>
                                    )}
                                    {canDelete && (
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                            onClick={() => remove(a)}
                                        >
                                            Xóa
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                        {!attachments.length && (
                            <p className="text-slate-500 text-sm">
                                Chưa có file bàn giao cho task này. Chọn task bên trái để xem/ghi nhận bàn giao.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
