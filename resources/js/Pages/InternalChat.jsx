import React, { useEffect, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
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

    const canEditOrDelete = (comment) => {
        if (!user) return false;
        if (comment.user_id === user.id) return true;
        return ['admin', 'truong_phong_san_xuat'].includes(user.role);
    };

    const fetchTasks = async () => {
        try {
            const res = await axios.get('/api/v1/tasks', { params: { per_page: 200 } });
            setTasks(res.data?.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được danh sách task.');
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
            toast.error('Bạn không có quyền sửa comment này.');
            return;
        }
        setEditingId(c.id);
        setContent(c.content || '');
        if (c.tagged_user_ids) {
            setTaggedIds(String(c.tagged_user_ids));
        }
    };

    const save = async () => {
        if (!selectedTaskId) {
            toast.error('Vui lòng chọn task để chat.');
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
                toast.success('Đã cập nhật comment.');
            } else {
                await axios.post(`/api/v1/tasks/${selectedTaskId}/comments`, data, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                toast.success('Đã gửi comment.');
            }
            resetForm();
            await fetchComments(selectedTaskId);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Gửi comment thất bại.');
        }
    };

    const remove = async (c) => {
        if (!selectedTaskId) return;
        if (!canEditOrDelete(c)) {
            toast.error('Bạn không có quyền xóa comment này.');
            return;
        }
        if (!confirm('Xóa comment này?')) return;
        try {
            await axios.delete(`/api/v1/tasks/${selectedTaskId}/comments/${c.id}`);
            toast.success('Đã xóa comment.');
            await fetchComments(selectedTaskId);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa comment thất bại.');
        }
    };

    const stats = [
        { label: 'Comment', value: String(comments.length) },
        { label: 'Task đang chọn', value: selectedTaskId || '—' },
        { label: 'User', value: user?.email || '—' },
        { label: 'Role', value: user?.role || '—' },
    ];

    return (
        <PageContainer
            auth={props.auth}
            title="Chat nội bộ"
            description="Trao đổi trực tiếp theo task, tag người liên quan và lưu lịch sử xử lý."
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
                        <option value="">-- Chọn task --</option>
                        {tasks.map((t) => (
                            <option key={t.id} value={t.id}>
                                #{t.id} • {t.title}
                            </option>
                        ))}
                    </select>
                    <div className="mt-4 text-xs text-text-muted space-y-2">
                        <p>• Mỗi task tương ứng một kênh chat.</p>
                        <p>• Bạn chỉ sửa/xóa comment do mình tạo hoặc là Admin/Trưởng phòng.</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card lg:col-span-2 flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-slate-900">Luồng hội thoại</h3>
                        {loading && <span className="text-xs text-text-muted">Đang tải...</span>}
                    </div>
                    <div className="space-y-4 text-sm max-h-[360px] overflow-y-auto pr-1">
                        {comments.map((c) => (
                            <div key={c.id} className="flex gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                                    {(c.user?.name || 'U').charAt(0)}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-slate-900">{c.user?.name || 'User'}</span>
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
                    <div className="mt-4 pt-4 border-t border-slate-200/80">
                        <div className="grid gap-2 md:grid-cols-2 mb-3">
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                placeholder="Tag user IDs (vd: 12, 15)"
                                value={taggedIds}
                                onChange={(e) => setTaggedIds(e.target.value)}
                            />
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                type="file"
                                onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                            />
                        </div>
                        <textarea
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                            rows={3}
                            placeholder="Nhập nội dung..."
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                        />
                        <div className="mt-3 flex items-center gap-3">
                            <button
                                type="button"
                                className="bg-primary text-white rounded-2xl px-4 py-2 text-sm font-semibold"
                                onClick={save}
                            >
                                {editingId ? 'Cập nhật' : 'Gửi'}
                            </button>
                            {editingId && (
                                <button className="text-xs text-text-muted" type="button" onClick={resetForm}>
                                    Hủy chỉnh sửa
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
