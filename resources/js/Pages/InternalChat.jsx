import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';

export default function InternalChat(props) {
    const toast = useToast();
    const user = props?.auth?.user;

    const [tasks, setTasks] = useState([]);
    const [selectedTaskId, setSelectedTaskId] = useState('');
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [content, setContent] = useState('');
    const [taggedIds, setTaggedIds] = useState('');
    const [attachment, setAttachment] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const fileInputRef = useRef(null);

    const canEditOrDelete = (comment) => {
        if (!user) return false;
        if (comment.user_id === user.id) return true;
        return ['admin', 'quan_ly'].includes(user.role);
    };

    const fetchTasks = async () => {
        try {
            const res = await axios.get('/api/v1/tasks', { params: { per_page: 200 } });
            setTasks(res.data?.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được danh sách công việc.');
        }
    };

    const fetchComments = async (taskId) => {
        if (!taskId) {
            setComments([]);
            return;
        }
        setLoading(true);
        try {
            const res = await axios.get(`/api/v1/tasks/${taskId}/comments`, {
                params: { per_page: 50 },
            });
            setComments(res.data?.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được hội thoại.');
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
        setContent('');
        setTaggedIds('');
        setAttachment(null);
    };

    const startEdit = (c) => {
        if (!canEditOrDelete(c)) {
            toast.error('Bạn không có quyền sửa bình luận này.');
            return;
        }
        setEditingId(c.id);
        setContent(c.content || '');
        if (c.tagged_user_ids) {
            setTaggedIds(String(c.tagged_user_ids));
        }
        setShowForm(true);
    };

    const save = async () => {
        if (!selectedTaskId) {
            toast.error('Vui lòng chọn công việc để chat.');
            return;
        }
        if (!content.trim()) {
            toast.error('Nội dung không được để trống.');
            return;
        }
        try {
            const ids = taggedIds
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean);
            const data = new FormData();
            data.append('content', content);
            ids.forEach((id) => data.append('tagged_user_ids[]', id));
            if (attachment) data.append('attachment', attachment);

            if (editingId) {
                data.append('_method', 'PUT');
                await axios.post(`/api/v1/tasks/${selectedTaskId}/comments/${editingId}`, data, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                toast.success('Đã cập nhật bình luận.');
            } else {
                await axios.post(`/api/v1/tasks/${selectedTaskId}/comments`, data, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                toast.success('Đã gửi bình luận.');
            }
            resetForm();
            setShowForm(false);
            await fetchComments(selectedTaskId);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Gửi bình luận thất bại.');
        }
    };

    const remove = async (c) => {
        if (!selectedTaskId) return;
        if (!canEditOrDelete(c)) {
            toast.error('Bạn không có quyền xóa bình luận này.');
            return;
        }
        if (!confirm('Xóa bình luận này?')) return;
        try {
            await axios.delete(`/api/v1/tasks/${selectedTaskId}/comments/${c.id}`);
            toast.success('Đã xóa bình luận.');
            await fetchComments(selectedTaskId);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa bình luận thất bại.');
        }
    };

    const stats = [
        { label: 'Bình luận', value: String(comments.length) },
        { label: 'Công việc đang chọn', value: selectedTaskId || '—' },
        { label: 'Người dùng', value: user?.email || '—' },
        { label: 'Vai trò', value: user?.role || '—' },
    ];

    return (
        <PageContainer
            auth={props.auth}
            title="Chat nội bộ"
            description="Trao đổi trực tiếp theo công việc, gắn thẻ người liên quan và lưu lịch sử xử lý."
            stats={stats}
        >
            <div className="grid gap-5 lg:grid-cols-3">
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card lg:col-span-1">
                    <h3 className="font-semibold text-slate-900 mb-4">Kênh công việc</h3>
                    <select
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                        value={selectedTaskId}
                        onChange={(e) => {
                            const v = e.target.value;
                            setSelectedTaskId(v);
                            fetchComments(v);
                        }}
                    >
                        <option value="">-- Chọn công việc --</option>
                        {tasks.map((t) => (
                            <option key={t.id} value={t.id}>
                                #{t.id} • {t.title}
                            </option>
                        ))}
                    </select>
                    <div className="mt-4 text-xs text-text-muted space-y-2">
                        <p>• Mỗi công việc tương ứng một kênh chat.</p>
                        <p>• Bạn chỉ sửa/xóa bình luận do mình tạo hoặc là Quản trị/Trưởng phòng.</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card lg:col-span-2 flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="font-semibold text-slate-900">Luồng hội thoại</h3>
                            {loading && <span className="text-xs text-text-muted">Đang tải...</span>}
                        </div>
                        <button
                            type="button"
                            className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white"
                            onClick={() => {
                                if (!selectedTaskId) {
                                    toast.error('Vui lòng chọn công việc để chat.');
                                    return;
                                }
                                resetForm();
                                setShowForm(true);
                            }}
                        >
                            Soạn tin
                        </button>
                    </div>
                    <div className="space-y-4 text-sm max-h-[360px] overflow-y-auto pr-1">
                        {comments.map((c) => (
                            <div key={c.id} className="flex gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                                    {(c.user?.name || 'U').charAt(0)}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-slate-900">{c.user?.name || 'Người dùng'}</span>
                                        <span className="text-xs text-text-muted">{c.created_at || ''}</span>
                                    </div>
                                    <div className="mt-2 rounded-2xl border border-slate-200/80 bg-slate-50 p-3 text-slate-700">
                                        {c.content}
                                    </div>
                                    {c.attachment_path && (
                                        <a className="text-xs text-primary mt-2 inline-block" href={c.attachment_path} target="_blank" rel="noreferrer">
                                            Tệp đính kèm
                                        </a>
                                    )}
                                    {c.tagged_user_ids && (
                                        <p className="text-xs text-text-muted mt-1">Tag: {String(c.tagged_user_ids)}</p>
                                    )}
                                    {canEditOrDelete(c) && (
                                        <div className="mt-2 flex gap-3 text-xs">
                                            <button className="text-primary" onClick={() => startEdit(c)} type="button">Sửa</button>
                                            <button className="text-danger" onClick={() => remove(c)} type="button">Xóa</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {!comments.length && (
                            <p className="text-sm text-text-muted">Chưa có trao đổi nào.</p>
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
                title={editingId ? 'Sửa bình luận' : 'Soạn bình luận'}
                description="Tag người liên quan và đính kèm tệp nếu cần."
            >
                <div className="grid gap-2 md:grid-cols-2 mb-3">
                    <input
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                        placeholder="Tag user IDs (vd: 12, 15)"
                        value={taggedIds}
                        onChange={(e) => setTaggedIds(e.target.value)}
                    />
                    <div className="rounded-2xl border border-dashed border-slate-200/80 p-2 bg-slate-50">
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                type="button"
                                className="rounded-xl bg-white border border-slate-200/80 px-3 py-2 text-xs font-semibold text-slate-700"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                Chọn tệp
                            </button>
                            <span className="text-xs text-text-muted">
                                {attachment?.name || 'Chưa chọn tệp'}
                            </span>
                        </div>
                        <input
                            ref={fileInputRef}
                            className="hidden"
                            type="file"
                            onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                        />
                    </div>
                </div>
                <textarea
                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                    rows={3}
                    placeholder="Nhập nội dung..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                />
                <div className="mt-3 flex items-center justify-end gap-3">
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
                        className="bg-primary text-white rounded-2xl px-4 py-2 text-sm font-semibold"
                        onClick={save}
                    >
                        {editingId ? 'Cập nhật' : 'Gửi'}
                    </button>
                </div>
            </Modal>
        </PageContainer>
    );
}
