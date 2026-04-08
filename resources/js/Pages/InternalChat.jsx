import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { onChildAdded, onChildChanged, ref, query, orderByChild, limitToLast } from 'firebase/database';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';
import { firebaseReady, getFirebaseDb, ensureFirebaseAuth } from '@/lib/firebase';
import { formatVietnamDateTime } from '@/lib/vietnamTime';

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
    const [participantsMeta, setParticipantsMeta] = useState(null);
    const [taggedUsers, setTaggedUsers] = useState([]);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionAnchor, setMentionAnchor] = useState(-1);
    const [attachment, setAttachment] = useState(null);
    const [taskQuery, setTaskQuery] = useState('');
    const [firebaseToken, setFirebaseToken] = useState('');
    const fileInputRef = useRef(null);
    const listRef = useRef(null);
    const messageIdsRef = useRef(new Set());

    const canEditOrDelete = (comment) => {
        if (!user) return false;
        return comment.user_id === user.id && !comment.is_recalled;
    };

    const selectedTaskChatLocked = selectedTask?.chat_enabled === false
        || selectedTask?.project?.handover_status === 'approved';

    const selectedTaskChatDisabledReason = selectedTask?.chat_disabled_reason
        || (selectedTaskChatLocked ? 'Dự án đã bàn giao xong, chat công việc đã bị khóa.' : '');

    const formatTime = (raw) => {
        if (!raw) return '';
        return formatVietnamDateTime(raw, raw);
    };

    const normalizeToken = (value) => {
        return (value || '')
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '')
            .trim();
    };

    const normalizeMentionPhrase = (value) => {
        return (value || '')
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const mentionIdentity = (user) => {
        if (!user) return '';
        if (user.id) return `id:${user.id}`;
        if (user.email) return `email:${String(user.email).toLowerCase()}`;
        const name = normalizeMentionPhrase(user.name || '');
        return name ? `name:${name}` : '';
    };

    const mentionCandidates = () => {
        const unique = new Map();
        [...(taggedUsers || []), ...(participants || [])].forEach((user) => {
            const key = mentionIdentity(user);
            if (!key || unique.has(key)) return;
            unique.set(key, {
                id: user.id,
                name: user.name || '',
                email: user.email || '',
                avatar_url: user.avatar_url || '',
                role: user.role || '',
            });
        });
        return Array.from(unique.values());
    };

    const startsWithMentionBoundary = (phrase, candidate) => {
        if (phrase === candidate) return true;
        if (!phrase.startsWith(candidate) || phrase.length <= candidate.length) {
            return false;
        }
        const next = phrase.slice(candidate.length, candidate.length + 1);
        return /[\s.,!?:;)\]}]/.test(next);
    };

    const matchCompletedMention = (value) => {
        const phrase = normalizeMentionPhrase(value);
        if (!phrase) return null;

        let bestMatch = null;
        let bestLength = -1;

        mentionCandidates().forEach((user) => {
            [normalizeMentionPhrase(user.name), normalizeMentionPhrase(user.email)]
                .filter(Boolean)
                .forEach((candidate) => {
                    if (startsWithMentionBoundary(phrase, candidate) && candidate.length > bestLength) {
                        bestMatch = user;
                        bestLength = candidate.length;
                    }
                });
        });

        return bestMatch;
    };

    const extractMentions = (value) => {
        const tokens = [];
        const regex = /@([^\s@]+)/g;
        let match;
        const content = value || '';
        while ((match = regex.exec(content)) !== null) {
            if (match[1]) tokens.push(match[1]);
        }
        return Array.from(new Set(tokens));
    };

    const containsExactMention = (normalizedText, candidate) => {
        if (!candidate) return false;
        const needle = `@${candidate}`;
        let start = 0;
        while (true) {
            const index = normalizedText.indexOf(needle, start);
            if (index < 0) return false;
            const end = index + needle.length;
            if (end >= normalizedText.length) return true;
            if (/[\s.,!?:;)\]}]/.test(normalizedText.slice(end, end + 1))) {
                return true;
            }
            start = index + 1;
        }
    };

    const extractExactMentionMatches = (value) => {
        const normalizedText = normalizeMentionPhrase(value);
        if (!normalizedText) return [];

        const matches = new Map();
        mentionCandidates().forEach((user) => {
            const key = mentionIdentity(user);
            if (!key) return;
            const candidates = [normalizeMentionPhrase(user.name), normalizeMentionPhrase(user.email)].filter(Boolean);
            if (candidates.some((candidate) => containsExactMention(normalizedText, candidate))) {
                matches.set(key, user);
            }
        });

        return Array.from(matches.values());
    };

    const collectMentionTargets = (value) => {
        const tokens = extractMentions(value);
        const resolvedByIdentity = new Map();

        extractExactMentionMatches(value).forEach((user) => {
            const key = mentionIdentity(user);
            if (!key) return;
            resolvedByIdentity.set(key, {
                id: user.id,
                name: user.name,
                email: user.email,
            });
        });

        if (!tokens.length) {
            return {
                tokens: [],
                resolved: Array.from(resolvedByIdentity.values()),
                unresolved: [],
            };
        }

        const unresolved = [];
        tokens.forEach((token) => {
            const key = normalizeToken(token);
            if (!key) return;
            const match = mentionCandidates().find((u) => {
                    const nameKey = normalizeToken(u.name || '');
                    const emailKey = normalizeToken(u.email || '');
                    return nameKey === key || emailKey === key || emailKey.includes(key);
                });
            if (match) {
                resolvedByIdentity.set(mentionIdentity(match), {
                    id: match.id,
                    name: match.name,
                    email: match.email,
                });
            } else {
                const coveredByExactMatch = Array.from(resolvedByIdentity.values()).some((user) => {
                    const nameKey = normalizeToken(user.name || '');
                    const emailKey = normalizeToken(user.email || '');
                    return (nameKey && nameKey.startsWith(key)) || (emailKey && emailKey.startsWith(key));
                });
                if (!coveredByExactMatch) {
                    unresolved.push(token);
                }
            }
        });
        return { tokens, resolved: Array.from(resolvedByIdentity.values()), unresolved };
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

    const renderMessageContent = (text, tagged = []) => {
        const value = text || '';
        if (!value) return null;

        const linkifyText = (raw, keyPrefix) => {
            return raw
                .split(/(https?:\/\/[^\s]+)/g)
                .filter((part) => part !== '')
                .map((part, idx) => {
                    if (/^https?:\/\//i.test(part)) {
                        return (
                            <a
                                key={`${keyPrefix}-link-${idx}`}
                                className="text-sky-600 underline underline-offset-2"
                                href={part}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {part}
                            </a>
                        );
                    }

                    return <span key={`${keyPrefix}-text-${idx}`}>{part}</span>;
                });
        };

        const mentionPatterns = Array.from(
            new Set(
                (tagged || [])
                    .flatMap((user) => [
                        user?.name ? `@${user.name}` : '',
                        user?.email ? `@${user.email}` : '',
                    ])
                    .filter(Boolean)
            )
        ).sort((a, b) => b.length - a.length);

        if (!mentionPatterns.length) {
            return linkifyText(value, 'plain');
        }

        const ranges = [];
        let cursor = 0;
        while (cursor < value.length) {
            const matchedPattern = mentionPatterns.find((pattern) => {
                const slice = value.slice(cursor, cursor + pattern.length);
                if (slice.toLowerCase() !== pattern.toLowerCase()) return false;
                const next = value.slice(cursor + pattern.length, cursor + pattern.length + 1);
                return !next || /[\s.,!?:;)\]}]/.test(next);
            });

            if (matchedPattern) {
                ranges.push({ start: cursor, end: cursor + matchedPattern.length });
                cursor += matchedPattern.length;
                continue;
            }

            cursor += 1;
        }

        if (!ranges.length) {
            return linkifyText(value, 'plain');
        }

        const nodes = [];
        let current = 0;
        ranges.forEach((range, idx) => {
            if (range.start > current) {
                nodes.push(...linkifyText(value.slice(current, range.start), `plain-${idx}`));
            }
            nodes.push(
                <span
                    key={`mention-${idx}`}
                    className="text-emerald-700 font-semibold bg-emerald-100/80 px-1 rounded"
                >
                    {value.slice(range.start, range.end)}
                </span>
            );
            current = range.end;
        });

        if (current < value.length) {
            nodes.push(...linkifyText(value.slice(current), 'plain-tail'));
        }

        return nodes;
    };

    const initials = (name) => {
        const parts = (name || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        if (!parts.length) return 'U';
        if (parts.length === 1) return parts[0][0]?.toUpperCase() || 'U';
        return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
    };

    const renderAvatar = (comment) => {
        const name = comment.user?.name || comment.user_name || 'Người dùng';
        const avatarUrl = comment.user?.avatar_url || '';
        if (avatarUrl) {
            return (
                <img
                    src={avatarUrl}
                    alt={name}
                    className="h-9 w-9 rounded-full object-cover border border-slate-200"
                />
            );
        }
        return (
            <div className="h-9 w-9 rounded-full bg-primary/10 text-primary font-semibold text-xs flex items-center justify-center border border-slate-200">
                {initials(name)}
            </div>
        );
    };

    const showMessageInfo = (comment) => {
        const time = formatTime(comment.created_at || '');
        toast.success(time ? `Thời gian: ${time}` : 'Không có thời gian.');
    };

    const fetchTasks = async () => {
        try {
            const res = await axios.get('/api/v1/task-conversations', { params: { limit: 200 } });
            const rows = (res.data?.data || []).map((row) => ({
                id: row.task_id,
                title: row.title,
                status: row.task_status,
                comments_count: row.comment_count,
                body: row.body,
                project: {
                    name: row.project_name,
                    code: row.project_code,
                    handover_status: row.project_handover_status,
                },
                department_name: row.department_name,
                assignee_name: row.assignee_name,
                chat_enabled: row.chat_enabled !== false,
                chat_disabled_reason: row.chat_disabled_reason || '',
                unread_count: row.unread_count || 0,
            }));
            setTasks(rows);
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
            setParticipantsMeta(null);
            return;
        }
        try {
            const res = await axios.get(`/api/v1/tasks/${taskId}/chat-participants`);
            setParticipants(res.data?.data || []);
            setParticipantsMeta(res.data?.meta || null);
        } catch (e) {
            setParticipants([]);
            setParticipantsMeta(null);
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
            setParticipantsMeta(null);
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
            if (task?.chat_enabled === false || task?.project?.handover_status === 'approved') {
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
        if (c.is_recalled) {
            toast.error('Tin nhắn đã bị thu hồi, không thể chỉnh sửa.');
            return;
        }
        if (selectedTask?.status === 'done') {
            toast.error('Công việc đã hoàn thành, không thể chỉnh sửa.');
            return;
        }
        if (selectedTaskChatLocked) {
            toast.error(selectedTaskChatDisabledReason);
            return;
        }
        setEditingId(c.id);
        setContent(c.content || '');
        if (Array.isArray(c.tagged_users) && c.tagged_users.length) {
            setTaggedUsers(
                c.tagged_users.map((u) => ({
                    id: u.id,
                    name: u.name || 'Người dùng',
                    email: u.email || '',
                }))
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
        if (selectedTaskChatLocked) {
            toast.error(selectedTaskChatDisabledReason);
            return;
        }
        if (!content.trim()) {
            toast.error('Nội dung không được để trống.');
            return;
        }
        const { tokens, resolved, unresolved } = collectMentionTargets(content);
        const hasMention = tokens.length > 0;
        if (hasMention && unresolved.length > 0) {
            toast.error('Vui lòng chọn người cần tag từ danh sách gợi ý.');
            return;
        }
        try {
            const ids = new Set();
            const emails = new Set();
            resolved.forEach((u) => {
                if (u.id) ids.add(u.id);
                if (u.email) emails.add(u.email);
            });
            const data = new FormData();
            data.append('content', content);
            ids.forEach((id) => data.append('tagged_user_ids[]', id));
            emails.forEach((email) => data.append('tagged_user_emails[]', email));
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
        const anchor = value.lastIndexOf('@');
        if (anchor >= 0) {
            const query = value.slice(anchor + 1);
            const completedUser = matchCompletedMention(query);
            if (completedUser) {
                setTaggedUsers((prev) => {
                    if (prev.some((user) => mentionIdentity(user) === mentionIdentity(completedUser))) {
                        return prev;
                    }
                    return [...prev, completedUser];
                });
                setMentionOpen(false);
                setMentionQuery('');
                setMentionAnchor(-1);
                return;
            }
            setMentionQuery(query);
            setMentionOpen(true);
            setMentionAnchor(anchor);
        } else {
            setMentionOpen(false);
            setMentionQuery('');
            setMentionAnchor(-1);
        }
    };

    const handlePickMention = (user) => {
        if (mentionAnchor < 0) return;
        const before = content.slice(0, mentionAnchor);
        const after = content.slice(mentionAnchor).replace(/^@([^\n@]*)/, `@${user.name} `);
        const next = `${before}${after}`;
        setContent(next);
        setMentionOpen(false);
        setMentionQuery('');
        setMentionAnchor(-1);
        setTaggedUsers((prev) => {
            if (prev.some((u) => mentionIdentity(u) === mentionIdentity(user))) return prev;
            return [...prev, { id: user.id, name: user.name, email: user.email }];
        });
    };

    const showMentionWarning = () => {
        if (!content.trim()) return false;
        const { tokens, unresolved } = collectMentionTargets(content);
        if (!tokens.length) return false;
        return unresolved.length > 0;
    };

    const filteredTasks = tasks.filter((t) => {
        if (!taskQuery.trim()) return true;
        const needle = taskQuery.toLowerCase();
        return (
            String(t.id).includes(needle) ||
            (t.title || '').toLowerCase().includes(needle)
        );
    });

    const remove = async (c) => {
        if (!selectedTaskId) return;
        if (!canEditOrDelete(c)) {
            toast.error('Bạn không có quyền thu hồi bình luận này.');
            return;
        }
        if (c.is_recalled) {
            toast.error('Tin nhắn đã bị thu hồi.');
            return;
        }
        if (!confirm('Thu hồi tin nhắn này?')) return;
        try {
            await axios.delete(`/api/v1/tasks/${selectedTaskId}/comments/${c.id}`);
            toast.success('Đã thu hồi tin nhắn.');
            if (!firebaseReady || !firebaseToken) {
                await fetchComments(selectedTaskId);
            }
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Thu hồi tin nhắn thất bại.');
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
                    <input
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                        placeholder="Tìm công việc..."
                        value={taskQuery}
                        onChange={(e) => setTaskQuery(e.target.value)}
                    />
                    <div className="mt-3 max-h-[360px] overflow-y-auto space-y-2 pr-1">
                        {filteredTasks.map((t) => {
                            const active = String(t.id) === String(selectedTaskId);
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setSelectedTaskId(String(t.id))}
                                    className={`w-full text-left rounded-xl border px-3 py-2 text-sm transition ${
                                        active
                                            ? 'border-primary/30 bg-primary/5 text-primary'
                                            : 'border-slate-200/80 hover:bg-slate-50 text-slate-700'
                                    }`}
                                >
                                    <div className="font-semibold text-slate-900">
                                        #{t.id} • {t.title}
                                    </div>
                                    <div className="text-xs text-text-muted mt-1">
                                        {t.department_name || 'Chưa có phòng ban'}
                                    </div>
                                </button>
                            );
                        })}
                        {!filteredTasks.length && (
                            <p className="text-xs text-text-muted">Không có công việc phù hợp.</p>
                        )}
                    </div>
                    <div className="mt-4 text-xs text-text-muted space-y-2">
                        <p>• Mỗi công việc tương ứng một kênh chat.</p>
                        <p>• Bạn chỉ sửa/thu hồi bình luận do mình tạo.</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-card lg:col-span-2 flex flex-col min-h-[520px] h-[calc(100vh-240px)]">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h3 className="font-semibold text-slate-900">Luồng hội thoại</h3>
                            <p className="text-xs text-text-muted">
                                {selectedTask ? `#${selectedTask.id} • ${selectedTask.title}` : 'Chọn công việc để bắt đầu.'}
                            </p>
                        </div>
                        {loading && <span className="text-xs text-text-muted">Đang tải...</span>}
                    </div>
                    {selectedTask && (
                        <div className="mb-3 space-y-2">
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                <span className="font-semibold text-slate-800">Phạm vi chat:</span>{' '}
                                {(participantsMeta?.scope_labels || []).join(', ')}
                            </div>
                            {participants.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {participants.map((participant) => (
                                        <span
                                            key={participant.id}
                                            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700"
                                        >
                                            {participant.name}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {selectedTaskChatLocked && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                    {selectedTaskChatDisabledReason}
                                </div>
                            )}
                        </div>
                    )}
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
                            const isRecalled = c.is_recalled === true;
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
                                    {!isMine && <div className="mr-2 mt-5">{renderAvatar(c)}</div>}
                                    <div className={`max-w-[75%] ${isMine ? 'text-right' : 'text-left'}`}>
                                        <div className="text-xs text-text-muted mb-1">{author}</div>
                                        <div
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                showMessageInfo(c);
                                            }}
                                            className={`chat-fade rounded-2xl border px-4 py-3 text-sm break-words whitespace-pre-wrap ${
                                                isMine
                                                    ? 'bg-primary/10 border-primary/20 text-slate-900'
                                                    : 'bg-slate-50 border-slate-200/80 text-slate-700'
                                            }`}
                                        >
                                            {isRecalled ? (
                                                <span className="italic text-text-muted">
                                                    Tin nhắn đã bị thu hồi.
                                                </span>
                                            ) : (
                                                renderMessageContent(c.content, c.tagged_users || [])
                                            )}
                                        </div>
                                        {!isRecalled && c.attachment_path && (
                                            <a
                                                className="text-xs text-primary mt-2 inline-block"
                                                href={c.attachment_path}
                                                target="_blank"
                                                rel="noreferrer"
                                                download={c.attachment_name || true}
                                            >
                                                {c.attachment_name || 'Tệp đính kèm'}
                                            </a>
                                        )}
                                        {!isRecalled && tags && (
                                            <p className="text-xs text-emerald-700 mt-1">Tag: {tags}</p>
                                        )}
                                        {canEditOrDelete(c) && !isRecalled && !selectedTaskChatLocked && (
                                            <div className="mt-2 flex gap-3 text-xs justify-end">
                                                <button className="text-primary" onClick={() => startEdit(c)} type="button">
                                                    Sửa
                                                </button>
                                                <button className="text-danger" onClick={() => remove(c)} type="button">
                                                    Thu hồi
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    {isMine && (
                                        <div className="ml-2 mt-5">{renderAvatar(c)}</div>
                                    )}
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
                        {selectedTaskChatLocked && (
                            <p className="text-xs text-amber-700 mb-2">
                                {selectedTaskChatDisabledReason}
                            </p>
                        )}
                        {taggedUsers.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                                {taggedUsers.map((u) => (
                                    <span
                                        key={u.id}
                                        className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 px-2 py-1 text-xs text-emerald-700"
                                    >
                                        @{u.name}
                                        <button
                                            type="button"
                                            className="text-xs text-emerald-700"
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
                            disabled={!selectedTaskId || selectedTask?.status === 'done' || selectedTaskChatLocked}
                            onChange={(e) => handleContentChange(e.target.value)}
                        />
                        {showMentionWarning() && (
                            <p className="mt-2 text-xs text-amber-600">
                                Bạn đang gõ @ nhưng chưa chọn người từ danh sách gợi ý.
                            </p>
                        )}
                        {mentionOpen && (
                            <div className="mt-2 rounded-2xl border border-slate-200/80 bg-white shadow-card max-h-44 overflow-y-auto">
                                {(participants || [])
                                    .filter((u) => {
                                        const query = normalizeToken(mentionQuery);
                                        if (!query) return true;
                                        const name = normalizeToken(u.name || '');
                                        const email = normalizeToken(u.email || '');
                                        return name.includes(query) || email.includes(query);
                                    })
                                    .slice(0, 8)
                                    .map((u) => (
                                        <button
                                            key={u.id}
                                            type="button"
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                                            onClick={() => handlePickMention(u)}
                                        >
                                            @{u.name}{' '}
                                            <span className="text-xs text-text-muted">
                                                ({u.role}
                                                {u.email ? ` • ${u.email}` : ''})
                                            </span>
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
                                    disabled={!selectedTaskId || selectedTask?.status === 'done' || selectedTaskChatLocked}
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
                                    disabled={!selectedTaskId || selectedTask?.status === 'done' || selectedTaskChatLocked}
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
                                    disabled={!selectedTaskId || selectedTask?.status === 'done' || selectedTaskChatLocked}
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
