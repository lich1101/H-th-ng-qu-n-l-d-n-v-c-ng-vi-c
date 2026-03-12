import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';

export default function HandoverCenter(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canCreate = ['admin', 'quan_ly', 'nhan_vien'].includes(userRole);
    const canDelete = ['admin', 'quan_ly', 'nhan_vien'].includes(userRole);

    const [tasks, setTasks] = useState([]);
    const [attachments, setAttachments] = useState([]);
    const [selectedTaskId, setSelectedTaskId] = useState('');
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef(null);
    const [showForm, setShowForm] = useState(false);
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
            toast.error(e?.response?.data?.message || 'Không tải được danh sách công việc.');
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
            toast.error(e?.response?.data?.message || 'Không tải được tệp bàn giao.');
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
            toast.error('Vui lòng chọn công việc cần bàn giao.');
            return;
        }
        if (!canCreate) {
            toast.error('Bạn không có quyền tạo tệp bàn giao.');
            return;
        }
        if (!form.external_url?.trim() && !form.file) {
            toast.error('Vui lòng nhập đường dẫn hoặc chọn tệp tải lên.');
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
            toast.success('Đã thêm tệp bàn giao.');
            resetForm();
            setShowForm(false);
            await fetchAttachments(selectedTaskId);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Thêm tệp bàn giao thất bại.');
        }
    };

    const remove = async (att) => {
        if (!canDelete) {
            toast.error('Bạn không có quyền xóa tệp bàn giao.');
            return;
        }
        if (!selectedTaskId) return;
        if (!confirm('Xóa tệp bàn giao này?')) return;
        try {
            await axios.delete(`/api/v1/tasks/${selectedTaskId}/attachments/${att.id}`);
            toast.success('Đã xóa tệp bàn giao.');
            await fetchAttachments(selectedTaskId);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa tệp bàn giao thất bại.');
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
            description="Quản lý tài liệu, video, phiên bản tải lên và trạng thái bàn giao theo công việc."
            stats={stats}
        >
            <div className="grid gap-5 lg:grid-cols-3">
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 lg:col-span-1">
                    <h3 className="font-semibold text-slate-900 mb-4">Chọn công việc bàn giao</h3>
                    <select
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                        value={selectedTaskId}
                        onChange={(e) => {
                            const value = e.target.value;
                            setSelectedTaskId(value);
                            fetchAttachments(value);
                        }}
                    >
                        <option value="">-- Chọn công việc --</option>
                        {tasks.map((t) => (
                            <option key={t.id} value={t.id}>
                                #{t.id} • {t.title}
                            </option>
                        ))}
                    </select>

                    <div className="mt-5 pt-5 border-t border-slate-200/80 space-y-3 text-sm">
                        <p className="text-xs text-text-muted">
                            Chọn công việc để xem lịch sử tải lên và thêm mới bàn giao.
                        </p>
                        <button
                            type="button"
                            className="w-full rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold disabled:opacity-60"
                            onClick={() => {
                                if (!selectedTaskId) {
                                    toast.error('Vui lòng chọn công việc trước khi bàn giao.');
                                    return;
                                }
                                setShowForm(true);
                            }}
                            disabled={!selectedTaskId}
                        >
                            Thêm file bàn giao
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 lg:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-slate-900">Lịch sử tải lên</h3>
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
                                Chưa có file bàn giao cho công việc này. Chọn công việc bên trái để xem/ghi nhận bàn giao.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <Modal
                open={showForm}
                onClose={() => {
                    setShowForm(false);
                    resetForm();
                }}
                title="Thêm tệp bàn giao"
                description="Tải lên tài liệu hoặc gắn liên kết bàn giao theo công việc."
            >
                <div className="space-y-3 text-sm">
                    <select
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        value={form.type}
                        onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))}
                    >
                        <option value="link">Liên kết tài liệu</option>
                        <option value="video">Video</option>
                        <option value="file">Tệp khác</option>
                    </select>
                    <input
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        placeholder="Tiêu đề hiển thị"
                        value={form.title}
                        onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                    />
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="URL Google Drive/YouTube/Liên kết nội bộ *"
                            value={form.external_url}
                            onChange={(e) => setForm((s) => ({ ...s, external_url: e.target.value }))}
                        />
                    <div className="rounded-2xl border border-dashed border-slate-200/80 p-3 bg-slate-50">
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                className="rounded-xl bg-white border border-slate-200/80 px-3 py-2 text-xs font-semibold text-slate-700"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                Chọn tệp tải lên
                            </button>
                            <span className="text-xs text-text-muted">
                                {form.file?.name || 'Chưa chọn tệp'}
                            </span>
                        </div>
                        <input
                            ref={fileInputRef}
                            className="hidden"
                            type="file"
                            onChange={(e) => setForm((s) => ({ ...s, file: e.target.files?.[0] || null }))}
                        />
                        <p className="text-[11px] text-text-muted mt-2">
                            Ưu tiên tải lên tệp nếu không có liên kết công khai.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            type="number"
                            min="1"
                            placeholder="Phiên bản"
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
                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
                            onClick={() => {
                                setShowForm(false);
                                resetForm();
                            }}
                        >
                            Hủy
                        </button>
                        <button
                            type="button"
                            className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white"
                            onClick={save}
                            disabled={loading}
                        >
                            Thêm file bàn giao
                        </button>
                    </div>
                </div>
            </Modal>
        </PageContainer>
    );
}
