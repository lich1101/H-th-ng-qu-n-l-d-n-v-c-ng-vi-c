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
        file: null,
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
            file: null,
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
        if (!form.external_url?.trim() && !form.file) {
            toast.error('Vui lòng nhập đường dẫn hoặc chọn file upload.');
            return;
        }
        try {
            if (form.file) {
                const data = new FormData();
                data.append('type', form.type);
                if (form.title) data.append('title', form.title);
                if (form.external_url) data.append('external_url', form.external_url);
                data.append('file', form.file);
                data.append('version', String(form.version || 1));
                data.append('is_handover', form.is_handover ? '1' : '0');
                if (form.note) data.append('note', form.note);
                await axios.post(`/api/v1/tasks/${selectedTaskId}/attachments`, data, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
            } else {
                await axios.post(`/api/v1/tasks/${selectedTaskId}/attachments`, {
                    type: form.type,
                    title: form.title || null,
                    external_url: form.external_url,
                    file_path: null,
                    version: form.version || 1,
                    is_handover: !!form.is_handover,
                    note: form.note || null,
                });
            }
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
        { label: 'File bàn giao', value: String(attachments.length) },
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
            <div className="grid gap-5 lg:grid-cols-3">
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 lg:col-span-1">
                    <h3 className="font-semibold text-slate-900 mb-4">Chọn task bàn giao</h3>
                    <select
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
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

                    <div className="mt-5 pt-5 border-t border-slate-200/80 space-y-3 text-sm">
                        <h4 className="font-semibold">Thêm file bàn giao</h4>
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={form.type}
                            onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))}
                        >
                            <option value="link">Link tài liệu</option>
                            <option value="video">Video</option>
                            <option value="file">File khác</option>
                        </select>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="Tiêu đề hiển thị"
                            value={form.title}
                            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                        />
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="URL Google Drive/YouTube/Link nội bộ *"
                            value={form.external_url}
                            onChange={(e) => setForm((s) => ({ ...s, external_url: e.target.value }))}
                        />
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            type="file"
                            onChange={(e) => setForm((s) => ({ ...s, file: e.target.files?.[0] || null }))}
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                type="number"
                                min="1"
                                placeholder="Version"
                                value={form.version}
                                onChange={(e) => setForm((s) => ({ ...s, version: Number(e.target.value || 1) }))}
                            />
                            <label className="flex items-center gap-2 text-xs text-text-muted">
                                <input
                                    type="checkbox"
                                    checked={form.is_handover}
                                    onChange={(e) => setForm((s) => ({ ...s, is_handover: e.target.checked }))}
                                />
                                Đánh dấu bàn giao
                            </label>
                        </div>
                        <textarea
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            rows={3}
                            placeholder="Ghi chú"
                            value={form.note}
                            onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
                        />
                        <button
                            type="button"
                            className="w-full rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold"
                            onClick={save}
                            disabled={loading}
                        >
                            Thêm file bàn giao
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 lg:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-slate-900">Lịch sử upload</h3>
                        {loading && <span className="text-xs text-text-muted">Đang tải...</span>}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        {attachments.map((a) => (
                            <div
                                key={a.id}
                                className="rounded-2xl border border-slate-200/80 p-4"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                        {a.type}
                                    </span>
                                    <span className="text-xs text-text-muted">v{a.version}</span>
                                </div>
                                <p className="mt-3 font-semibold text-slate-900">
                                    {a.title || `${a.type} v${a.version}`}
                                </p>
                                <p className="text-xs text-text-muted mt-1">
                                    {a.external_url || a.file_path || 'Không có URL'}
                                </p>
                                <p className="text-xs text-text-muted mt-1">
                                    {a.is_handover ? 'Bàn giao' : 'Tham khảo'}
                                </p>
                                {a.note && (
                                    <p className="text-xs text-text-muted mt-2">Ghi chú: {a.note}</p>
                                )}
                                <div className="mt-3 flex items-center gap-2">
                                    {a.external_url && (
                                        <a
                                            href={a.external_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs text-primary"
                                        >
                                            Mở link
                                        </a>
                                    )}
                                    {canDelete && (
                                        <button
                                            type="button"
                                            className="text-xs text-danger"
                                            onClick={() => remove(a)}
                                        >
                                            Xóa
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                        {!attachments.length && (
                            <p className="text-sm text-text-muted">
                                Chưa có file bàn giao cho task này. Chọn task bên trái để xem/ghi nhận bàn giao.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
