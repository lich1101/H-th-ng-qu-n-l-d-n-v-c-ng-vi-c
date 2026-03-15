import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { onChildAdded, onChildChanged, ref, query, orderByChild, limitToLast } from 'firebase/database';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';
import { firebaseReady, getFirebaseDb, ensureFirebaseAuth } from '@/lib/firebase';

export default function InternalChat(props) {
    const toast = useToast();
    const user = props?.auth?.user;

    const [tasks, setTasks] = useState([]);
    const [selectedTaskId, setSelectedTaskId] = useState('');
    const [selectedTask, setSelectedTask] = useState(null);
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [content, setContent] = useState('');
    const [participants, setParticipants] = useState([]);
    const [taggedUsers, setTaggedUsers] = useState([]);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionAnchor, setMentionAnchor] = useState(-1);
    const [attachment, setAttachment] = useState(null);
    const [firebaseToken, setFirebaseToken] = useState('');
    const fileInputRef = useRef(null);
    const listRef = useRef(null);
    const messageIdsRef = useRef(new Set());

    const canEditOrDelete = (comment) => {
        if (!user) return false;
        if (comment.user_id === user.id) return true;
        return ['admin', 'quan_ly'].includes(user.role);
    };

    const isNearBottom = () => {
        const el = listRef.current;
        if (!el) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };

    const scrollToBottom = (smooth = false) => {
        const el = listRef.current;
        if (!el) return;
        el.scrollTo({
            top: el.scrollHeight,
            behavior: smooth ? 'smooth' : 'auto',
        });
    };

    const normalizeMessage = (raw, key) => {
        if (!raw) return null;
        const msg = { ...raw };
        if (!msg.id && key) msg.id = key;
        return msg;
    };

    const fetchTasks = async () => {
        try {
            const res = await axios.get('/api/v1/tasks', { params: { per_page: 200 } });
            setTasks(res.data?.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được danh sách công việc.');
        }
    };

    const fetchComments = async (taskId, { page: nextPage = 1, append = false } = {}) => {
        if (!taskId) {
            setComments([]);
            return;
        }
        if (!append) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }
        try {
            const res = await axios.get(`/api/v1/tasks/${taskId}/comments`, {
                params: { per_page: 20, page: nextPage },
            });
            const rows = (res.data?.data || []).slice().reverse();
            const current = res.data?.current_page || nextPage;
            const last = res.data?.last_page || nextPage;
            setHasMore(current < last);
            setPage(current);
            if (!append) {
                messageIdsRef.current = new Set(rows.map((r) => String(r.id)));
                setComments(rows);
                setTimeout(() => scrollToBottom(false), 0);
            } else {
                const el = listRef.current;
                const prevHeight = el?.scrollHeight || 0;
                const prevTop = el?.scrollTop || 0;
                const newRows = rows.filter((r) => !messageIdsRef.current.has(String(r.id)));
                newRows.forEach((r) => messageIdsRef.current.add(String(r.id)));
                setComments((prev) => [...newRows, ...prev]);
                setTimeout(() => {
                    if (!el) return;
                    const newHeight = el.scrollHeight;
                    el.scrollTop = prevTop + (newHeight - prevHeight);
                }, 0);
            }
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được hội thoại.');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const fetchParticipants = async (taskId) => {
        if (!taskId) {
            setParticipants([]);
            return;
        }
        try {
            const res = await axios.get(`/api/v1/tasks/${taskId}/chat-participants`);
            setParticipants(res.data?.data || []);
        } catch (e) {
            setParticipants([]);
        }
    };

    useEffect(() => {
        fetchTasks();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!firebaseReady) return;
        axios
            .get('/api/v1/firebase/token')
            .then((res) => setFirebaseToken(res.data?.token || ''))
            .catch(() => setFirebaseToken(''));
    }, []);

    useEffect(() => {
        if (!selectedTaskId) {
            setComments([]);
            setParticipants([]);
            setSelectedTask(null);
            return undefined;
        }
        const task = tasks.find((t) => String(t.id) === String(selectedTaskId));
        setSelectedTask(task || null);
        fetchParticipants(selectedTaskId);
        fetchComments(selectedTaskId, { page: 1, append: false });

        let cleanup = () => {};

        const setup = async () => {
            if (!firebaseReady) {
                return;
            }
            const authed = await ensureFirebaseAuth(firebaseToken);
            if (!authed) {
                return;
            }
            const db = getFirebaseDb();
            if (!db) {
                return;
            }
            const chatQuery = query(
                ref(db, `task_chats/${selectedTaskId}/messages`),
                orderByChild('created_at'),
                limitToLast(20)
            );
            const unsubAdd = onChildAdded(chatQuery, (snapshot) => {
                const msg = normalizeMessage(snapshot.val(), snapshot.key);
                if (!msg) return;
                const key = String(msg.id || snapshot.key);
                if (messageIdsRef.current.has(key)) return;
                messageIdsRef.current.add(key);
                setComments((prev) => [...prev, msg]);
                if (isNearBottom() || msg.user_id === user?.id) {
                    setTimeout(() => scrollToBottom(true), 0);
                }
            });
            const unsubChange = onChildChanged(chatQuery, (snapshot) => {
                const msg = normalizeMessage(snapshot.val(), snapshot.key);
                if (!msg) return;
                const key = String(msg.id || snapshot.key);
                setComments((prev) =>
                    prev.map((c) => (String(c.id) === key ? { ...c, ...msg } : c))
                );
            });
            cleanup = () => {
                unsubAdd?.();
                unsubChange?.();
            };
        };

        setup();

        return () => cleanup();
    }, [selectedTaskId, firebaseToken, tasks]);

    const resetForm = () => {
        setEditingId(null);
        setContent('');
        setTaggedUsers([]);
        setMentionQuery('');
        setMentionOpen(false);
        setMentionAnchor(-1);
        setAttachment(null);
    };

    const startEdit = (c) => {
        if (!canEditOrDelete(c)) {
            toast.error('Bạn không có quyền sửa bình luận này.');
            return;
        }
        setEditingId(c.id);
        setContent(c.content || '');
        if (Array.isArray(c.tagged_users) && c.tagged_users.length) {
            setTaggedUsers(
                c.tagged_users.map((u) => ({ id: u.id, name: u.name || 'Người dùng' }))
            );
        } else if (Array.isArray(c.tagged_user_ids)) {
            setTaggedUsers(
                c.tagged_user_ids.map((id) => ({ id, name: `User #${id}` }))
            );
        }
        setTimeout(() => scrollToBottom(true), 0);
    };

    const save = async () => {
        if (!selectedTaskId) {
            toast.error('Vui lòng chọn công việc để chat.');
            return;
        }
        if (selectedTask?.status === 'done') {
            toast.error('Công việc đã hoàn thành, không thể gửi tin nhắn.');
            return;
        }
        if (!content.trim()) {
            toast.error('Nội dung không được để trống.');
            return;
        }
        try {
            const ids = taggedUsers.map((u) => u.id).filter(Boolean);
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
            if (!firebaseReady || !firebaseToken) {
                await fetchComments(selectedTaskId, { page: 1, append: false });
            }
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Gửi bình luận thất bại.');
        }
    };

    const handleContentChange = (value) => {
        setContent(value);
        const match = value.match(/@([^\s@]*)$/);
        if (match) {
            setMentionQuery(match[1]);
            setMentionOpen(true);
            setMentionAnchor(value.lastIndexOf('@'));
        } else {
            setMentionOpen(false);
            setMentionQuery('');
            setMentionAnchor(-1);
        }
    };

    const handlePickMention = (user) => {
        if (mentionAnchor < 0) return;
        const before = content.slice(0, mentionAnchor);
        const after = content.slice(mentionAnchor).replace(/@([^\s@]*)/, `@${user.name} `);
        const next = `${before}${after}`;
        setContent(next);
        setMentionOpen(false);
        setMentionQuery('');
        setMentionAnchor(-1);
        setTaggedUsers((prev) => {
            if (prev.some((u) => u.id === user.id)) return prev;
            return [...prev, { id: user.id, name: user.name }];
        });
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

                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card lg:col-span-2 flex flex-col min-h-[520px]">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h3 className="font-semibold text-slate-900">Luồng hội thoại</h3>
                            <p className="text-xs text-text-muted">
                                {selectedTask ? `#${selectedTask.id} • ${selectedTask.title}` : 'Chọn công việc để bắt đầu.'}
                            </p>
                        </div>
                        {loading && <span className="text-xs text-text-muted">Đang tải...</span>}
                    </div>
                    <div
                        ref={listRef}
                        className="flex-1 overflow-y-auto pr-2 space-y-3"
                        onScroll={(e) => {
                            if (
                                e.currentTarget.scrollTop <= 24 &&
                                hasMore &&
                                !loadingMore &&
                                !loading
                            ) {
                                fetchComments(selectedTaskId, { page: page + 1, append: true });
                            }
                        }}
                    >
                        {loadingMore && (
                            <div className="text-xs text-text-muted text-center">Đang tải thêm...</div>
                        )}
                        {!comments.length && !loading && (
                            <p className="text-sm text-text-muted">Chưa có trao đổi nào.</p>
                        )}
                        {comments.map((c) => {
                            const author = c.user?.name || c.user_name || 'Người dùng';
                            const isMine = user && c.user_id === user.id;
                            const tags =
                                Array.isArray(c.tagged_users) && c.tagged_users.length
                                    ? c.tagged_users.map((u) => u.name).join(', ')
                                    : Array.isArray(c.tagged_user_ids)
                                        ? c.tagged_user_ids.join(', ')
                                        : '';
                            return (
                                <div
                                    key={c.id || `${c.user_id}-${c.created_at}`}
                                    className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`max-w-[75%] ${isMine ? 'text-right' : 'text-left'}`}>
                                        <div className="text-xs text-text-muted mb-1">
                                            {author} • {c.created_at || ''}
                                        </div>
                                        <div
                                            className={`chat-fade rounded-2xl border px-4 py-3 text-sm ${
                                                isMine
                                                    ? 'bg-primary/10 border-primary/20 text-slate-900'
                                                    : 'bg-slate-50 border-slate-200/80 text-slate-700'
                                            }`}
                                        >
                                            {c.content}
                                        </div>
                                        {c.attachment_path && (
                                            <a
                                                className="text-xs text-primary mt-2 inline-block"
                                                href={c.attachment_path}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                Tệp đính kèm
                                            </a>
                                        )}
                                        {tags && (
                                            <p className="text-xs text-text-muted mt-1">Tag: {tags}</p>
                                        )}
                                        {canEditOrDelete(c) && (
                                            <div className="mt-2 flex gap-3 text-xs justify-end">
                                                <button className="text-primary" onClick={() => startEdit(c)} type="button">
                                                    Sửa
                                                </button>
                                                <button className="text-danger" onClick={() => remove(c)} type="button">
                                                    Xóa
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-4 border-t border-slate-200/80 pt-3">
                        {selectedTask?.status === 'done' && (
                            <p className="text-xs text-text-muted mb-2">
                                Công việc đã hoàn thành, không thể gửi tin nhắn.
                            </p>
                        )}
                        {taggedUsers.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                                {taggedUsers.map((u) => (
                                    <span
                                        key={u.id}
                                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
                                    >
                                        @{u.name}
                                        <button
                                            type="button"
                                            className="text-xs text-primary"
                                            onClick={() =>
                                                setTaggedUsers((prev) => prev.filter((x) => x.id !== u.id))
                                            }
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <textarea
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                            rows={2}
                            placeholder="Nhập nội dung..."
                            value={content}
                            disabled={!selectedTaskId || selectedTask?.status === 'done'}
                            onChange={(e) => handleContentChange(e.target.value)}
                        />
                        {mentionOpen && (
                            <div className="mt-2 rounded-2xl border border-slate-200/80 bg-white shadow-card max-h-44 overflow-y-auto">
                                {(participants || [])
                                    .filter((u) =>
                                        u.name?.toLowerCase().includes(mentionQuery.toLowerCase())
                                    )
                                    .slice(0, 8)
                                    .map((u) => (
                                        <button
                                            key={u.id}
                                            type="button"
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                                            onClick={() => handlePickMention(u)}
                                        >
                                            @{u.name}{' '}
                                            <span className="text-xs text-text-muted">({u.role})</span>
                                        </button>
                                    ))}
                                {!participants.length && (
                                    <div className="px-3 py-2 text-xs text-text-muted">Chưa có danh sách người dùng.</div>
                                )}
                            </div>
                        )}
                        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    className="rounded-xl bg-white border border-slate-200/80 px-3 py-2 text-xs font-semibold text-slate-700"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={!selectedTaskId || selectedTask?.status === 'done'}
                                >
                                    Đính kèm
                                </button>
                                <span className="text-xs text-text-muted">
                                    {attachment?.name || 'Chưa chọn tệp'}
                                </span>
                                <input
                                    ref={fileInputRef}
                                    className="hidden"
                                    type="file"
                                    onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                {editingId && (
                                    <button
                                        type="button"
                                        className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
                                        onClick={resetForm}
                                    >
                                        Hủy sửa
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="bg-primary text-white rounded-2xl px-4 py-2 text-sm font-semibold"
                                    onClick={save}
                                    disabled={!selectedTaskId || selectedTask?.status === 'done'}
                                >
                                    {editingId ? 'Cập nhật' : 'Gửi'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
