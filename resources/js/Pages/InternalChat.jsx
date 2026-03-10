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
    };

    const startEdit = (c) => {
        if (!canEditOrDelete(c)) {
            toast.error('Bạn không có quyền sửa comment này.');
            return;
        }
        setEditingId(c.id);
        setContent(c.content || '');
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
            if (editingId) {
                await axios.put(`/api/v1/tasks/${selectedTaskId}/comments/${editingId}`, {
                    content,
                });
                toast.success('Đã cập nhật comment.');
            } else {
                await axios.post(`/api/v1/tasks/${selectedTaskId}/comments`, {
                    content,
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
        { label: 'Comment (trang)', value: String(comments.length) },
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
            <div className="grid gap-4 lg:grid-cols-3">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm lg:col-span-1">
                    <h3 className="font-semibold mb-3">Kênh công việc (theo task)</h3>
                    <select
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm mb-3"
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
                    <div className="space-y-2 text-xs text-slate-600">
                        <p>• Mỗi task tương ứng một “kênh” chat.</p>
                        <p>• Bạn chỉ sửa/xóa comment do mình tạo hoặc là Admin/Trưởng phòng.</p>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm lg:col-span-2">
                    <h3 className="font-semibold mb-3">Luồng hội thoại</h3>
                    {loading && <p className="text-xs text-slate-500 mb-2">Đang tải...</p>}
                    <div className="space-y-3 text-sm max-h-[360px] overflow-y-auto mb-4">
                        {comments.map((c) => (
                            <div
                                key={c.id}
                                className="rounded-lg bg-slate-50 border border-slate-200 p-3 flex justify-between gap-3"
                            >
                                <div>
                                    <div className="text-xs text-slate-500 mb-1">
                                        @{c.user?.name || c.user?.email || 'user'} • #{c.id}
                                    </div>
                                    <div>{c.content}</div>
                                </div>
                                {canEditOrDelete(c) && (
                                    <div className="flex flex-col gap-1">
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100"
                                            onClick={() => startEdit(c)}
                                        >
                                            Sửa
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                            onClick={() => remove(c)}
                                        >
                                            Xóa
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                        {!comments.length && (
                            <p className="text-slate-500 text-sm">
                                Chưa có hội thoại cho task này. Chọn task và gửi comment đầu tiên.
                            </p>
                        )}
                    </div>
                    <div className="space-y-2 text-sm">
                        <textarea
                            className="w-full rounded-lg border border-slate-200 px-3 py-2"
                            rows={3}
                            placeholder="Nhập nội dung trao đổi..."
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                        />
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">
                                {editingId ? `Đang sửa comment #${editingId}` : 'Tạo comment mới'}
                            </span>
                            <div className="flex gap-2">
                                {editingId && (
                                    <button
                                        type="button"
                                        className="text-xs px-3 py-1 rounded border border-slate-200"
                                        onClick={resetForm}
                                    >
                                        Hủy sửa
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="text-xs px-3 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white font-semibold disabled:opacity-50"
                                    onClick={save}
                                    disabled={!selectedTaskId}
                                >
                                    {editingId ? 'Lưu sửa' : 'Gửi'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
