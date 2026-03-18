import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import AppIcon from '@/Components/AppIcon';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';

const DEFAULT_PRIORITIES = [
    { value: 'low', label: 'Thấp' },
    { value: 'medium', label: 'Trung bình' },
    { value: 'high', label: 'Cao' },
    { value: 'urgent', label: 'Khẩn cấp' },
];

const PRIORITY_LABELS = {
    low: 'Thấp',
    medium: 'Trung bình',
    high: 'Cao',
    urgent: 'Khẩn cấp',
};

const LABELS = {
    todo: 'Cần làm',
    doing: 'Đang làm',
    done: 'Hoàn tất',
    blocked: 'Bị chặn',
};

const STATUS_STYLES = {
    todo: 'bg-slate-100 text-slate-700 border-slate-200',
    doing: 'bg-blue-50 text-blue-700 border-blue-200',
    done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blocked: 'bg-rose-50 text-rose-700 border-rose-200',
};

const PRIORITY_STYLES = {
    low: 'bg-slate-100 text-slate-700 border-slate-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    urgent: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function TasksBoard(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const canCreate = ['admin', 'quan_ly'].includes(userRole);
    const canEdit = ['admin', 'quan_ly'].includes(userRole);
    const canDelete = ['admin', 'quan_ly'].includes(userRole);

    const [loading, setLoading] = useState(false);
    const [tasks, setTasks] = useState([]);
    const [projects, setProjects] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [userOptions, setUserOptions] = useState([]);
    const [meta, setMeta] = useState({});
    const [viewMode, setViewMode] = useState('list');
    const queryParams = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    const initialChatTaskId = useMemo(() => {
        if (typeof window === 'undefined') return 0;
        const raw = new URLSearchParams(window.location.search).get('chat_task_id');
        const value = Number(raw || 0);
        if (!Number.isFinite(value) || value <= 0) return 0;
        return Math.trunc(value);
    }, []);
    const pendingChatTaskIdRef = useRef(initialChatTaskId);
    const queryChatHandledRef = useRef(initialChatTaskId <= 0);
    const queryChatOpeningRef = useRef(false);
    const [filters, setFilters] = useState({
        project_id: queryParams.get('project_id') || '',
        status: queryParams.get('status') || '',
        assignee_id: queryParams.get('assignee_id') || '',
        search: queryParams.get('search') || '',
        deadline_from: queryParams.get('deadline_from') || '',
        deadline_to: queryParams.get('deadline_to') || '',
        per_page: 30,
        page: 1,
    });
    const [metaPaging, setMetaPaging] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [tasksFetched, setTasksFetched] = useState(false);

    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [importFile, setImportFile] = useState(null);
    const [importing, setImporting] = useState(false);
    const [savingTask, setSavingTask] = useState(false);
    const [form, setForm] = useState({
        project_id: '',
        department_id: '',
        title: '',
        description: '',
        priority: 'medium',
        status: 'todo',
        deadline: '',
        progress_percent: 0,
        assignee_id: '',
    });

    const [showReport, setShowReport] = useState(false);
    const [reportTask, setReportTask] = useState(null);
    const [reportForm, setReportForm] = useState({
        status: '',
        progress_percent: '',
        note: '',
        attachment: null,
    });
    const [reporting, setReporting] = useState(false);

    const [showReview, setShowReview] = useState(false);
    const [reviewTask, setReviewTask] = useState(null);
    const [pendingUpdates, setPendingUpdates] = useState([]);
    const [reviewingUpdate, setReviewingUpdate] = useState(null);
    const [reviewForm, setReviewForm] = useState({
        status: '',
        progress_percent: '',
        note: '',
        review_note: '',
    });
    const [reviewing, setReviewing] = useState(false);

    const [showItems, setShowItems] = useState(false);
    const [itemsTask, setItemsTask] = useState(null);
    const [taskItems, setTaskItems] = useState([]);
    const [itemsLoading, setItemsLoading] = useState(false);
    const [itemForm, setItemForm] = useState({
        title: '',
        description: '',
        priority: 'medium',
        status: 'todo',
        progress_percent: '',
        start_date: '',
        deadline: '',
        assignee_id: '',
    });
    const [savingItem, setSavingItem] = useState(false);
    const savingItemRef = useRef(false);
    const [editingItemId, setEditingItemId] = useState(null);
    const [showItemReport, setShowItemReport] = useState(false);
    const [reportItem, setReportItem] = useState(null);
    const [itemReportForm, setItemReportForm] = useState({
        status: '',
        progress_percent: '',
        note: '',
        attachment: null,
    });
    const [showItemReview, setShowItemReview] = useState(false);
    const [reviewItem, setReviewItem] = useState(null);
    const [itemUpdates, setItemUpdates] = useState([]);

    const [showTaskChat, setShowTaskChat] = useState(false);
    const [chatTask, setChatTask] = useState(null);
    const [chatLoading, setChatLoading] = useState(false);
    const [chatSending, setChatSending] = useState(false);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatMessage, setChatMessage] = useState('');
    const [chatAttachment, setChatAttachment] = useState(null);
    const [chatParticipants, setChatParticipants] = useState([]);
    const [chatTaggedUsers, setChatTaggedUsers] = useState([]);
    const [chatMentionCandidates, setChatMentionCandidates] = useState([]);
    const [chatMention, setChatMention] = useState({
        open: false,
        start: -1,
        end: -1,
        query: '',
    });
    const chatListRef = useRef(null);
    const chatInputRef = useRef(null);
    const chatAttachmentInputRef = useRef(null);

    const statusOptions = useMemo(() => {
        const values = meta.task_statuses || [];
        if (!values.length) {
            return ['todo', 'doing', 'done', 'blocked'];
        }
        return values;
    }, [meta]);

    const fetchMeta = async () => {
        try {
            const res = await axios.get('/api/v1/meta');
            setMeta(res.data || {});
        } catch {
            // ignore
        }
    };

    const fetchProjects = async () => {
        try {
            const res = await axios.get('/api/v1/projects', { params: { per_page: 200 } });
            setProjects(res.data?.data || []);
        } catch {
            // ignore
        }
    };

    const fetchDepartments = async () => {
        try {
            const res = await axios.get('/api/v1/departments');
            const rows = res.data || [];
            if (userRole === 'quan_ly') {
                const managerId = props?.auth?.user?.id;
                setDepartments(rows.filter((d) => String(d.manager_id) === String(managerId)));
            } else {
                setDepartments(rows);
            }
        } catch {
            // ignore
        }
    };

    const fetchUsers = async () => {
        try {
            const res = await axios.get('/api/v1/users/lookup');
            setUserOptions(res.data?.data || []);
        } catch {
            setUserOptions([]);
        }
    };

    const fetchTasks = async (page = filters.page, nextFilters = filters) => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/tasks', {
                params: {
                    per_page: nextFilters.per_page,
                    page,
                    ...(nextFilters.project_id ? { project_id: nextFilters.project_id } : {}),
                    ...(nextFilters.status ? { status: nextFilters.status } : {}),
                    ...(nextFilters.assignee_id ? { assignee_id: nextFilters.assignee_id } : {}),
                    ...(nextFilters.search ? { search: nextFilters.search } : {}),
                    ...(nextFilters.deadline_from ? { deadline_from: nextFilters.deadline_from } : {}),
                    ...(nextFilters.deadline_to ? { deadline_to: nextFilters.deadline_to } : {}),
                },
            });
            setTasks(res.data?.data || []);
            setMetaPaging({
                current_page: res.data?.current_page || 1,
                last_page: res.data?.last_page || 1,
                total: res.data?.total || 0,
            });
            setFilters((s) => ({ ...s, page: res.data?.current_page || 1 }));
            if (typeof window !== 'undefined') {
                const params = new URLSearchParams();
                ['project_id', 'status', 'assignee_id', 'search', 'deadline_from', 'deadline_to'].forEach((key) => {
                    if (nextFilters[key]) {
                        params.set(key, String(nextFilters[key]));
                    }
                });
                const query = params.toString();
                window.history.replaceState({}, '', query ? `/cong-viec?${query}` : '/cong-viec');
            }
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được danh sách công việc.');
        } finally {
            setLoading(false);
            setTasksFetched(true);
        }
    };

    const fetchTaskItems = async (taskId) => {
        if (!taskId) return;
        setItemsLoading(true);
        try {
            const res = await axios.get(`/api/v1/tasks/${taskId}/items`, {
                params: { per_page: 50 },
            });
            setTaskItems(res.data?.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được đầu việc.');
        } finally {
            setItemsLoading(false);
        }
    };

    const formatChatTime = (raw) => {
        if (!raw) return '';
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) return String(raw);
        return date.toLocaleString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
        });
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
        [...(chatTaggedUsers || []), ...(chatParticipants || [])].forEach((user) => {
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

        return {
            tokens,
            resolved: Array.from(resolvedByIdentity.values()),
            unresolved,
        };
    };

    const showChatMentionWarning = () => {
        if (!chatMessage.trim()) return false;
        const { tokens, unresolved } = collectMentionTargets(chatMessage);
        if (!tokens.length) return false;
        return unresolved.length > 0;
    };

    const renderChatMessageContent = (text, tagged = []) => {
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
                    className="rounded bg-emerald-100/80 px-1 font-semibold text-emerald-700"
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

    const fetchTaskChat = async (taskId, silent = false) => {
        if (!taskId) {
            setChatMessages([]);
            return;
        }
        if (!silent) setChatLoading(true);
        try {
            const res = await axios.get(`/api/v1/tasks/${taskId}/comments`, {
                params: { per_page: 60, page: 1 },
            });
            const rows = (res.data?.data || []).slice().reverse();
            setChatMessages(rows);
            if (chatListRef.current) {
                setTimeout(() => {
                    if (chatListRef.current) {
                        chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
                    }
                }, 0);
            }
        } catch (e) {
            if (!silent) {
                toast.error(e?.response?.data?.message || 'Không tải được hội thoại công việc.');
            }
        } finally {
            if (!silent) setChatLoading(false);
        }
    };

    const fetchChatParticipants = async (taskId) => {
        if (!taskId) {
            setChatParticipants([]);
            return;
        }
        try {
            const res = await axios.get(`/api/v1/tasks/${taskId}/chat-participants`);
            const rows = res.data?.data || [];
            setChatParticipants(rows);
        } catch {
            setChatParticipants([]);
        }
    };

    const applyMentionCandidates = (query) => {
        const keyword = normalizeToken(query || '');
        const filtered = mentionCandidates().filter((user) => {
            const name = normalizeToken(user?.name || '');
            const email = normalizeToken(user?.email || '');
            return !keyword || name.includes(keyword) || email.includes(keyword);
        }).slice(0, 8);
        setChatMentionCandidates(filtered);
        return filtered;
    };

    const closeMention = () => {
        setChatMention({ open: false, start: -1, end: -1, query: '' });
        setChatMentionCandidates([]);
    };

    const selectMention = (user) => {
        if (!user || chatMention.start < 0) return;
        const before = chatMessage.slice(0, chatMention.start);
        const after = chatMessage.slice(chatMention.start).replace(/^@([^\n@]*)/, `@${user.name} `);
        const nextMessage = `${before}${after}`;
        setChatMessage(nextMessage);
        setChatTaggedUsers((current) => {
            if (current.some((item) => mentionIdentity(item) === mentionIdentity(user))) {
                return current;
            }
            return [...current, { id: user.id, name: user.name, email: user.email }];
        });
        closeMention();
        setTimeout(() => {
            if (chatInputRef.current) {
                chatInputRef.current.focus();
            }
        }, 0);
    };

    const handleChatMessageChange = (value, cursorPosition) => {
        setChatMessage(value);
        const context = value.lastIndexOf('@', Math.max(0, cursorPosition - 1));
        if (context < 0) {
            closeMention();
            return;
        }
        const query = value.slice(context + 1, cursorPosition);
        const completedUser = matchCompletedMention(query);
        if (completedUser) {
            setChatTaggedUsers((current) => {
                if (current.some((item) => mentionIdentity(item) === mentionIdentity(completedUser))) {
                    return current;
                }
                return [...current, completedUser];
            });
            closeMention();
            return;
        }
        const candidates = applyMentionCandidates(query);
        if (!candidates.length) {
            closeMention();
            return;
        }
        setChatMention({
            open: true,
            start: context,
            end: cursorPosition,
            query,
        });
    };

    const openTaskChat = async (task) => {
        setChatTask(task);
        setShowTaskChat(true);
        setChatMessage('');
        setChatAttachment(null);
        closeMention();
        setChatTaggedUsers([]);
        await Promise.all([
            fetchTaskChat(task.id),
            fetchChatParticipants(task.id),
        ]);
    };

    const closeTaskChat = () => {
        setShowTaskChat(false);
        setChatTask(null);
        setChatMessages([]);
        setChatMessage('');
        setChatAttachment(null);
        setChatParticipants([]);
        setChatTaggedUsers([]);
        closeMention();
    };

    const sendTaskChat = async () => {
        if (!chatTask?.id) return;
        if (!chatMessage.trim() && !chatAttachment) return;
        const { tokens, resolved, unresolved } = collectMentionTargets(chatMessage);
        if (tokens.length > 0 && unresolved.length > 0) {
            toast.error('Vui lòng chọn người cần tag từ danh sách gợi ý.');
            return;
        }
        setChatSending(true);
        try {
            const ids = new Set();
            resolved.forEach((user) => {
                if (user.id) ids.add(user.id);
            });
            const data = new FormData();
            data.append('content', chatMessage.trim());
            ids.forEach((id) => data.append('tagged_user_ids[]', id));
            if (chatAttachment) {
                data.append('attachment', chatAttachment);
            }
            await axios.post(`/api/v1/tasks/${chatTask.id}/comments`, data, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setChatMessage('');
            setChatAttachment(null);
            setChatTaggedUsers([]);
            closeMention();
            if (chatAttachmentInputRef.current) {
                chatAttachmentInputRef.current.value = '';
            }
            await fetchTaskChat(chatTask.id, true);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Gửi tin nhắn thất bại.');
        } finally {
            setChatSending(false);
        }
    };

    const openTaskDetail = (taskId) => {
        if (!taskId) return;
        window.location.href = `/cong-viec/${taskId}`;
    };

    const resetItemForm = () => {
        setEditingItemId(null);
        setItemForm({
            title: '',
            description: '',
            priority: 'medium',
            status: statusOptions[0] || 'todo',
            progress_percent: '',
            start_date: '',
            deadline: '',
            assignee_id: '',
        });
    };

    const openItemsModal = (task) => {
        setItemsTask(task);
        setShowItems(true);
        resetItemForm();
        fetchTaskItems(task.id);
    };

    const startEditItem = (item) => {
        setEditingItemId(item.id);
        setItemForm({
            title: item.title || '',
            description: item.description || '',
            priority: item.priority || 'medium',
            status: item.status || statusOptions[0] || 'todo',
            progress_percent: item.progress_percent ?? '',
            start_date: item.start_date ? String(item.start_date).slice(0, 10) : '',
            deadline: item.deadline ? String(item.deadline).slice(0, 10) : '',
            assignee_id: item.assignee_id || '',
        });
    };

    const saveItem = async () => {
        if (!itemsTask) return;
        if (savingItemRef.current || savingItem) return;
        if (!itemForm.title.trim()) {
            toast.error('Vui lòng nhập tiêu đề đầu việc.');
            return;
        }
        if (!itemForm.assignee_id) {
            toast.error('Vui lòng chọn nhân sự phụ trách.');
            return;
        }
        savingItemRef.current = true;
        setSavingItem(true);
        try {
            if (editingItemId) {
                await axios.put(`/api/v1/tasks/${itemsTask.id}/items/${editingItemId}`, {
                    title: itemForm.title,
                    description: itemForm.description,
                    priority: itemForm.priority,
                    status: itemForm.status,
                    progress_percent: itemForm.progress_percent === '' ? null : Number(itemForm.progress_percent),
                    start_date: itemForm.start_date || null,
                    deadline: itemForm.deadline || null,
                    assignee_id: itemForm.assignee_id ? Number(itemForm.assignee_id) : null,
                });
                toast.success('Đã cập nhật đầu việc.');
            } else {
                await axios.post(`/api/v1/tasks/${itemsTask.id}/items`, {
                    title: itemForm.title,
                    description: itemForm.description,
                    priority: itemForm.priority,
                    status: itemForm.status,
                    progress_percent: itemForm.progress_percent === '' ? null : Number(itemForm.progress_percent),
                    start_date: itemForm.start_date || null,
                    deadline: itemForm.deadline || null,
                    assignee_id: itemForm.assignee_id ? Number(itemForm.assignee_id) : null,
                });
                toast.success('Đã tạo đầu việc.');
            }
            resetItemForm();
            await fetchTaskItems(itemsTask.id);
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu đầu việc thất bại.');
        } finally {
            savingItemRef.current = false;
            setSavingItem(false);
        }
    };

    const removeItem = async (itemId) => {
        if (!itemsTask) return;
        if (!confirm('Xóa đầu việc này?')) return;
        try {
            await axios.delete(`/api/v1/tasks/${itemsTask.id}/items/${itemId}`);
            toast.success('Đã xóa đầu việc.');
            await fetchTaskItems(itemsTask.id);
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa đầu việc thất bại.');
        }
    };

    const openItemReportModal = (item) => {
        setReportItem(item);
        setItemReportForm({ status: '', progress_percent: '', note: '', attachment: null });
        setShowItemReport(true);
    };

    const submitItemReport = async () => {
        if (!reportItem || !itemsTask) return;
        const formData = new FormData();
        if (itemReportForm.status) formData.append('status', itemReportForm.status);
        if (itemReportForm.progress_percent !== '') formData.append('progress_percent', itemReportForm.progress_percent);
        if (itemReportForm.note) formData.append('note', itemReportForm.note);
        if (itemReportForm.attachment) formData.append('attachment', itemReportForm.attachment);
        try {
            await axios.post(
                `/api/v1/tasks/${itemsTask.id}/items/${reportItem.id}/updates`,
                formData,
                { headers: { 'Content-Type': 'multipart/form-data' } },
            );
            toast.success('Đã gửi báo cáo đầu việc.');
            setShowItemReport(false);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Gửi báo cáo thất bại.');
        }
    };

    const openItemReviewModal = async (item) => {
        if (!itemsTask) return;
        setReviewItem(item);
        setShowItemReview(true);
        setReviewingUpdate(null);
        setReviewForm({ status: '', progress_percent: '', note: '', review_note: '' });
        try {
            const res = await axios.get(`/api/v1/tasks/${itemsTask.id}/items/${item.id}/updates`, { params: { per_page: 30 } });
            setItemUpdates(res.data?.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được báo cáo.');
            setItemUpdates([]);
        }
    };

    const approveItemUpdate = async (update, payload = {}) => {
        if (!itemsTask || !reviewItem) return;
        try {
            await axios.post(`/api/v1/tasks/${itemsTask.id}/items/${reviewItem.id}/updates/${update.id}/approve`, payload);
            toast.success('Đã duyệt báo cáo.');
            await openItemReviewModal(reviewItem);
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Duyệt báo cáo thất bại.');
        }
    };

    const rejectItemUpdate = async (update, reviewNote) => {
        if (!itemsTask || !reviewItem) return;
        try {
            await axios.post(`/api/v1/tasks/${itemsTask.id}/items/${reviewItem.id}/updates/${update.id}/reject`, {
                review_note: reviewNote,
            });
            toast.success('Đã từ chối báo cáo.');
            await openItemReviewModal(reviewItem);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Từ chối báo cáo thất bại.');
        }
    };

    const selectItemUpdate = (update) => {
        setReviewingUpdate(update);
        setReviewForm({
            status: update?.status || '',
            progress_percent: update?.progress_percent ?? '',
            note: update?.note || '',
            review_note: '',
        });
    };

    const submitImport = async (e) => {
        e.preventDefault();
        if (!importFile) {
            toast.error('Vui lòng chọn file Excel.');
            return;
        }
        setImporting(true);
        try {
            const formData = new FormData();
            formData.append('file', importFile);
            const res = await axios.post('/api/v1/imports/tasks', formData);
            const report = res.data || {};
            toast.success(`Import hoàn tất: ${report.created || 0} tạo mới, ${report.updated || 0} cập nhật.`);
            setShowImport(false);
            setImportFile(null);
            await fetchTasks(1, { ...filters, page: 1 });
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Import thất bại.');
        } finally {
            setImporting(false);
        }
    };

    useEffect(() => {
        fetchMeta();
        fetchProjects();
        fetchDepartments();
        fetchUsers();
        fetchTasks(1, { ...filters, page: 1 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!showTaskChat || !chatTask?.id) return undefined;
        const timer = setInterval(() => {
            fetchTaskChat(chatTask.id, true);
        }, 15000);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showTaskChat, chatTask?.id]);

    useEffect(() => {
        if (queryChatHandledRef.current || queryChatOpeningRef.current) return;
        if (!tasksFetched || loading) return;

        const taskId = pendingChatTaskIdRef.current;
        if (!taskId) {
            queryChatHandledRef.current = true;
            return;
        }

        let cancelled = false;
        queryChatOpeningRef.current = true;

        const removeQueryChatParam = () => {
            if (typeof window === 'undefined') return;
            const params = new URLSearchParams(window.location.search);
            if (!params.has('chat_task_id')) return;
            params.delete('chat_task_id');
            const query = params.toString();
            window.history.replaceState({}, '', query ? `/cong-viec?${query}` : '/cong-viec');
        };

        const openFromQuery = async () => {
            try {
                let targetTask = tasks.find((task) => Number(task?.id) === taskId);
                if (!targetTask) {
                    const response = await axios.get(`/api/v1/tasks/${taskId}`);
                    targetTask = response.data || null;
                }
                if (!cancelled && targetTask?.id) {
                    await openTaskChat(targetTask);
                }
            } catch (e) {
                if (!cancelled) {
                    toast.error(e?.response?.data?.message || 'Không mở được hội thoại từ thông báo.');
                }
            } finally {
                if (!cancelled) {
                    queryChatHandledRef.current = true;
                    queryChatOpeningRef.current = false;
                    pendingChatTaskIdRef.current = 0;
                    removeQueryChatParam();
                }
            }
        };

        openFromQuery();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tasksFetched, loading, tasks]);

    useEffect(() => {
        if (!chatMention.open) return;
        applyMentionCandidates(chatMention.query);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatParticipants]);

    const stats = useMemo(() => {
        const open = metaPaging.total;
        const overdue = tasks.filter((t) => {
            if (!t.deadline) return false;
            try { return new Date(t.deadline).getTime() < Date.now() && t.status !== 'done'; } catch { return false; }
        }).length;
        const done = tasks.filter((t) => t.status === 'done').length;
        return [
            { label: 'Công việc (trang hiện tại)', value: String(tasks.length) },
            { label: 'Tổng theo bộ lọc', value: String(open) },
            { label: 'Quá hạn (trang)', value: String(overdue) },
            { label: 'Hoàn tất (trang)', value: String(done) },
        ];
    }, [tasks, metaPaging.total]);

    const resetForm = () => {
        setEditingId(null);
        setForm({
            project_id: '',
            department_id: '',
            title: '',
            description: '',
            priority: 'medium',
            status: statusOptions[0] || 'todo',
            deadline: '',
            progress_percent: 0,
            assignee_id: '',
        });
    };

    const openCreate = () => {
        resetForm();
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        resetForm();
    };

    const selectedProject = useMemo(
        () => projects.find((p) => String(p.id) === String(form.project_id)),
        [projects, form.project_id]
    );
    const projectHasContract = !!selectedProject?.contract_id;

    const selectedDepartment = useMemo(
        () => departments.find((d) => String(d.id) === String(form.department_id)),
        [departments, form.department_id]
    );

    const staffOptions = useMemo(() => {
        if (selectedDepartment?.staff?.length) {
            return selectedDepartment.staff;
        }
        if (userRole === 'admin' && departments.length) {
            const all = departments.flatMap((d) => d.staff || []);
            const map = new Map();
            all.forEach((u) => {
                if (u?.id) map.set(u.id, u);
            });
            return Array.from(map.values());
        }
        return [];
    }, [selectedDepartment, departments, userRole]);

    const itemStaffOptions = useMemo(() => {
        if (!itemsTask) return [];
        const deptId = itemsTask.department_id || itemsTask.department?.id;
        const dept = departments.find((d) => String(d.id) === String(deptId));
        if (dept?.staff?.length) return dept.staff;
        if (userRole === 'admin') {
            const all = departments.flatMap((d) => d.staff || []);
            const map = new Map();
            all.forEach((u) => {
                if (u?.id) map.set(u.id, u);
            });
            return Array.from(map.values());
        }
        return [];
    }, [itemsTask, departments, userRole]);

    const startEdit = (t) => {
        setEditingId(t.id);
        setForm({
            project_id: t.project_id || '',
            department_id: t.department_id || t.assignee?.department_id || '',
            title: t.title || '',
            description: t.description || '',
            priority: t.priority || 'medium',
            status: t.status || statusOptions[0] || 'todo',
            deadline: t.deadline ? String(t.deadline).slice(0, 10) : '',
            progress_percent: t.progress_percent ?? 0,
            assignee_id: t.assignee_id || '',
        });
        setShowForm(true);
    };

    const save = async () => {
        if (savingTask) return;
        if (!canCreate && editingId == null) return toast.error('Bạn không có quyền tạo công việc.');
        if (!canEdit && editingId != null) return toast.error('Bạn không có quyền cập nhật công việc.');
        if (!form.project_id || !form.title?.trim()) return toast.error('Vui lòng chọn dự án và nhập tiêu đề.');
        if (!projectHasContract) return toast.error('Dự án chưa có hợp đồng, không thể tạo công việc.');
        setSavingTask(true);
        try {
            const payload = {
                project_id: Number(form.project_id),
                department_id: form.department_id ? Number(form.department_id) : null,
                title: form.title,
                description: form.description || null,
                priority: form.priority,
                status: form.status,
                deadline: form.deadline || null,
                progress_percent: form.progress_percent === '' ? null : Number(form.progress_percent),
                assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
            };
            if (editingId) {
                await axios.put(`/api/v1/tasks/${editingId}`, payload);
                toast.success('Đã cập nhật công việc.');
            } else {
                await axios.post('/api/v1/tasks', payload);
                toast.success('Đã tạo công việc.');
            }
            closeForm();
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu công việc thất bại.');
        } finally {
            setSavingTask(false);
        }
    };

    const remove = async (id) => {
        if (!canDelete) return toast.error('Bạn không có quyền xóa công việc.');
        if (!confirm('Xóa công việc này?')) return;
        try {
            await axios.delete(`/api/v1/tasks/${id}`);
            toast.success('Đã xóa công việc.');
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa công việc thất bại.');
        }
    };

    const columns = useMemo(() => {
        const buckets = {};
        for (const s of statusOptions) buckets[s] = [];
        for (const t of tasks) {
            const key = t.status || statusOptions[0];
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(t);
        }
        return statusOptions.map((s) => ({
            key: s,
            title: LABELS[s] || s,
            items: buckets[s] || [],
        }));
    }, [tasks, statusOptions]);

    const formatDate = (raw) => {
        if (!raw) return '';
        try {
            const d = new Date(raw);
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        } catch {
            return String(raw).slice(0, 10);
        }
    };

    const sortedByDeadline = useMemo(() => (
        [...tasks].sort((a, b) => {
            const da = a.deadline ? new Date(a.deadline).getTime() : 0;
            const db = b.deadline ? new Date(b.deadline).getTime() : 0;
            return da - db;
        })
    ), [tasks]);

    const buildAckStamp = () => {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d} ${hh}:${mm}:00`;
    };

    const acknowledgeTask = async (t) => {
        if (!['admin', 'quan_ly', 'nhan_vien'].includes(userRole)) {
            return toast.error('Bạn không có quyền xác nhận.');
        }
        try {
            await axios.put(`/api/v1/tasks/${t.id}`, {
                project_id: t.project_id,
                title: t.title,
                description: t.description || null,
                priority: t.priority || 'medium',
                status: t.status,
                start_at: t.start_at || null,
                deadline: t.deadline || null,
                completed_at: t.completed_at || null,
                progress_percent: t.progress_percent ?? 0,
                assigned_by: t.assigned_by || null,
                assignee_id: t.assignee_id || null,
                reviewer_id: t.reviewer_id || null,
                require_acknowledgement: t.require_acknowledgement ?? true,
                acknowledged_at: buildAckStamp(),
            });
            toast.success('Đã xác nhận nhận công việc.');
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xác nhận thất bại.');
        }
    };

    const openReportModal = (task) => {
        setReportTask(task);
        setReportForm({
            status: '',
            progress_percent: '',
            note: '',
            attachment: null,
        });
        setShowReport(true);
    };

    const submitReport = async () => {
        if (!reportTask) return;
        setReporting(true);
        try {
            const formData = new FormData();
            if (reportForm.status) formData.append('status', reportForm.status);
            if (reportForm.progress_percent !== '') formData.append('progress_percent', reportForm.progress_percent);
            if (reportForm.note) formData.append('note', reportForm.note);
            if (reportForm.attachment) formData.append('attachment', reportForm.attachment);
            await axios.post(`/api/v1/tasks/${reportTask.id}/updates`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success('Đã gửi báo cáo tiến độ.');
            setShowReport(false);
            setReportTask(null);
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Gửi báo cáo thất bại.');
        } finally {
            setReporting(false);
        }
    };

    const openReviewModal = async (task) => {
        setReviewTask(task);
        setShowReview(true);
        setReviewingUpdate(null);
        setReviewForm({ status: '', progress_percent: '', note: '', review_note: '' });
        try {
            const res = await axios.get(`/api/v1/tasks/${task.id}/updates`, { params: { per_page: 20 } });
            const rows = res.data?.data || [];
            const pending = rows.filter((u) => u.review_status === 'pending');
            setPendingUpdates(pending);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được báo cáo.');
        }
    };

    const selectUpdate = (update) => {
        setReviewingUpdate(update);
        setReviewForm({
            status: update.status || '',
            progress_percent: update.progress_percent ?? '',
            note: update.note || '',
            review_note: '',
        });
    };

    const approveUpdate = async () => {
        if (!reviewTask || !reviewingUpdate) return;
        setReviewing(true);
        try {
            await axios.post(`/api/v1/tasks/${reviewTask.id}/updates/${reviewingUpdate.id}/approve`, {
                status: reviewForm.status || null,
                progress_percent: reviewForm.progress_percent === '' ? null : Number(reviewForm.progress_percent),
                note: reviewForm.note || null,
            });
            toast.success('Đã duyệt báo cáo.');
            await openReviewModal(reviewTask);
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Duyệt thất bại.');
        } finally {
            setReviewing(false);
        }
    };

    const rejectUpdate = async () => {
        if (!reviewTask || !reviewingUpdate) return;
        if (!reviewForm.review_note.trim()) {
            toast.error('Vui lòng nhập lý do từ chối.');
            return;
        }
        setReviewing(true);
        try {
            await axios.post(`/api/v1/tasks/${reviewTask.id}/updates/${reviewingUpdate.id}/reject`, {
                review_note: reviewForm.review_note,
            });
            toast.success('Đã từ chối báo cáo.');
            await openReviewModal(reviewTask);
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Từ chối thất bại.');
        } finally {
            setReviewing(false);
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Quản lý công việc"
            description="Theo dõi công việc theo từng trạng thái, ưu tiên và hạn chót."
            stats={stats}
        >
            <div className="lg:col-span-2">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
                    <div className="flex flex-wrap gap-2">
                        {canCreate && (
                            <button
                                type="button"
                                className="rounded-2xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                                onClick={openCreate}
                            >
                                Thêm mới
                            </button>
                        )}
                        {canCreate && (
                            <button
                                type="button"
                                className="rounded-2xl border border-slate-200/80 px-4 py-2 text-sm font-semibold text-slate-700"
                                onClick={() => setShowImport(true)}
                            >
                                Import Excel
                            </button>
                        )}
                        <select
                            className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                            value={filters.project_id}
                            onChange={(e) => setFilters((s) => ({ ...s, project_id: e.target.value }))}
                        >
                            <option value="">Tất cả dự án</option>
                            {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
                        </select>
                        <select
                            className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                            value={filters.status}
                            onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}
                        >
                            <option value="">Tất cả trạng thái</option>
                            {statusOptions.map((s) => <option key={s} value={s}>{LABELS[s] || s}</option>)}
                        </select>
                        <select
                            className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                            value={filters.assignee_id}
                            onChange={(e) => setFilters((s) => ({ ...s, assignee_id: e.target.value }))}
                        >
                            <option value="">Tất cả nhân sự</option>
                            {userOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                        <input
                            className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                            placeholder="Tìm theo tiêu đề/mô tả"
                            value={filters.search}
                            onChange={(e) => setFilters((s) => ({ ...s, search: e.target.value }))}
                        />
                        <input
                            type="date"
                            className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                            value={filters.deadline_from}
                            onChange={(e) => setFilters((s) => ({ ...s, deadline_from: e.target.value }))}
                        />
                        <input
                            type="date"
                            className="rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                            value={filters.deadline_to}
                            onChange={(e) => setFilters((s) => ({ ...s, deadline_to: e.target.value }))}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        {[
                            { key: 'list', label: 'Danh sách' },
                            { key: 'kanban', label: 'Bảng Kanban' },
                            { key: 'timeline', label: 'Dòng thời gian' },
                            { key: 'gantt', label: 'Biểu đồ Gantt' },
                        ].map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setViewMode(tab.key)}
                                className={`px-3 py-2 rounded-2xl text-xs font-semibold ${
                                    viewMode === tab.key
                                        ? 'bg-primary text-white'
                                        : 'bg-white border border-slate-200/80 text-slate-600'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                        <button className="text-sm text-primary font-semibold" onClick={() => fetchTasks(1, { ...filters, page: 1 })} type="button">
                            Tải lại
                        </button>
                    </div>
                </div>

                    {viewMode === 'list' && (
                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-4">
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs uppercase tracking-wider text-text-subtle border-b border-slate-200">
                                            <th className="py-2">Công việc</th>
                                            <th className="py-2">Dự án</th>
                                            <th className="py-2">Trạng thái</th>
                                            <th className="py-2">Ưu tiên</th>
                                            <th className="py-2">Hạn chót</th>
                                            <th className="py-2">Tiến độ</th>
                                            <th className="py-2">Phòng ban</th>
                                            <th className="py-2">Phụ trách</th>
                                            <th className="py-2"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tasks.map((t) => {
                                            const canAck = t.require_acknowledgement && !t.acknowledged_at && (
                                                t.assignee_id === props?.auth?.user?.id || ['admin', 'quan_ly'].includes(userRole)
                                            );
                                            return (
                                                <tr
                                                    key={t.id}
                                                    className="border-b border-slate-100 cursor-pointer hover:bg-slate-50/70"
                                                    onClick={() => openTaskDetail(t.id)}
                                                >
                                                    <td className="py-3">
                                                        <div className="font-medium text-slate-900">{t.title}</div>
                                                        <div className="text-xs text-text-muted">{t.description || '—'}</div>
                                                    </td>
                                                    <td className="py-3 text-xs text-text-muted">
                                                        {t.project?.name || 'Chưa gán dự án'}
                                                    </td>
                                                    <td className="py-3">
                                                        <div className="flex flex-wrap gap-2">
                                                            <span
                                                                className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                                                                    STATUS_STYLES[t.status] || 'bg-slate-100 text-slate-700 border-slate-200'
                                                                }`}
                                                            >
                                                                {LABELS[t.status] || t.status}
                                                            </span>
                                                            {t.require_acknowledgement && !t.acknowledged_at && (
                                                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                                                                    Chưa xác nhận
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-3">
                                                        <span
                                                            className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                                                                PRIORITY_STYLES[t.priority] || 'bg-slate-100 text-slate-700 border-slate-200'
                                                            }`}
                                                        >
                                                            {PRIORITY_LABELS[t.priority] || t.priority || 'Trung bình'}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 text-xs text-text-muted">
                                                        {t.deadline ? String(t.deadline).slice(0, 10) : '—'}
                                                    </td>
                                                    <td className="py-3 text-xs text-text-muted">{t.progress_percent ?? 0}%</td>
                                                    <td className="py-3 text-xs text-text-muted">
                                                        {t.department?.name || '—'}
                                                    </td>
                                                    <td className="py-3 text-xs text-text-muted">
                                                        {t.assignee?.name || '—'}
                                                    </td>
                                                    <td className="py-3 text-right space-x-2">
                                                        {canEdit && (
                                                            <button className="text-xs font-semibold text-primary" onClick={(e) => { e.stopPropagation(); startEdit(t); }} type="button">
                                                                Sửa
                                                            </button>
                                                        )}
                                                        {canDelete && (
                                                            <button className="text-xs font-semibold text-rose-500" onClick={(e) => { e.stopPropagation(); remove(t.id); }} type="button">
                                                                Xóa
                                                            </button>
                                                        )}
                                                        <button className="text-xs font-semibold text-sky-600" onClick={(e) => { e.stopPropagation(); openItemsModal(t); }} type="button">
                                                            Đầu việc
                                                        </button>
                                                        <button className="text-xs font-semibold text-emerald-600 inline-flex items-center gap-1" onClick={(e) => { e.stopPropagation(); openTaskChat(t); }} type="button" title="Mở chat công việc">
                                                            <AppIcon name="chat" className="h-3.5 w-3.5" />
                                                            Chat
                                                        </button>
                                                        {canAck && (
                                                            <button className="text-xs font-semibold text-amber-600" onClick={(e) => { e.stopPropagation(); acknowledgeTask(t); }} type="button">
                                                                Xác nhận
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {loading && (
                                            <tr>
                                                <td className="py-6 text-center text-sm text-text-muted" colSpan={9}>
                                                    Đang tải...
                                                </td>
                                            </tr>
                                        )}
                                        {!loading && tasks.length === 0 && (
                                            <tr>
                                                <td className="py-6 text-center text-sm text-text-muted" colSpan={9}>
                                                    Chưa có công việc theo bộ lọc.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {viewMode === 'kanban' && (
                        <div className="flex gap-4 overflow-x-auto pb-2">
                            {columns.map((col) => (
                                <div key={col.key} className="min-w-[280px] flex-1">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-xs uppercase tracking-widest text-text-subtle font-semibold">{col.title} ({col.items.length})</h4>
                                    </div>
                                    <div className="space-y-3">
                                        {col.items.map((t) => {
                                            const canAck = t.require_acknowledgement && !t.acknowledged_at && (
                                                t.assignee_id === props?.auth?.user?.id || ['admin', 'quan_ly'].includes(userRole)
                                            );
                                            return (
                                                <div
                                                    key={t.id}
                                                    className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card cursor-pointer"
                                                    onClick={() => openTaskDetail(t.id)}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                                            {PRIORITY_LABELS[t.priority] || t.priority || 'Trung bình'}
                                                        </span>
                                                        <div className="flex items-center gap-2 text-xs text-text-muted">
                                                            {canEdit && (
                                                                <button className="hover:text-slate-900" onClick={(e) => { e.stopPropagation(); startEdit(t); }} type="button">Sửa</button>
                                                            )}
                                                            {canDelete && (
                                                                <button className="hover:text-danger" onClick={(e) => { e.stopPropagation(); remove(t.id); }} type="button">Xoá</button>
                                                            )}
                                                            <button className="hover:text-sky-600" onClick={(e) => { e.stopPropagation(); openItemsModal(t); }} type="button">Đầu việc</button>
                                                            <button className="hover:text-emerald-600 inline-flex items-center gap-1" onClick={(e) => { e.stopPropagation(); openTaskChat(t); }} type="button" title="Mở chat công việc">
                                                                <AppIcon name="chat" className="h-3.5 w-3.5" />
                                                                Chat
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <h3 className="mt-3 font-semibold text-slate-900">{t.title}</h3>
                                                    <p className="text-xs text-text-muted mt-1">{t.project?.name || 'Chưa gán dự án'}</p>
                                                    <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
                                                        <span>{t.deadline ? `Hạn chót ${String(t.deadline).slice(0, 10)}` : 'Chưa có hạn chót'}</span>
                                                        <span>{t.progress_percent ?? 0}%</span>
                                                    </div>
                                                    {t.require_acknowledgement && !t.acknowledged_at && (
                                                        <div className="mt-3 flex items-center justify-between text-xs">
                                                            <span className="text-warning font-semibold">Chưa xác nhận</span>
                                                            {canAck && (
                                                                <button className="text-primary font-semibold" onClick={(e) => { e.stopPropagation(); acknowledgeTask(t); }} type="button">
                                                                    Xác nhận nhận công việc
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {loading && <p className="text-sm text-text-muted">Đang tải...</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {viewMode === 'timeline' && (
                        <div className="space-y-4">
                            {sortedByDeadline.map((t) => (
                                <div key={t.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card flex gap-4">
                                    <div className="flex flex-col items-center">
                                        <span className="h-3 w-3 rounded-full bg-primary" />
                                        <span className="flex-1 w-px bg-slate-200 mt-2" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-semibold text-slate-900">{t.title}</h3>
                                            <span className="text-xs text-text-muted">{formatDate(t.deadline)}</span>
                                        </div>
                                        <p className="text-xs text-text-muted mt-1">{t.project?.name || 'Chưa gán dự án'}</p>
                                        <div className="mt-2 text-xs text-text-muted">Trạng thái: {LABELS[t.status] || t.status}</div>
                                    </div>
                                </div>
                            ))}
                            {loading && <p className="text-sm text-text-muted">Đang tải...</p>}
                            {!loading && sortedByDeadline.length === 0 && (
                                <p className="text-sm text-text-muted">Chưa có dữ liệu dòng thời gian.</p>
                            )}
                        </div>
                    )}

                    {viewMode === 'gantt' && (
                        <div className="space-y-3">
                            {sortedByDeadline.length === 0 && (
                                <p className="text-sm text-text-muted">Chưa có dữ liệu biểu đồ Gantt.</p>
                            )}
                            {sortedByDeadline.map((t) => {
                                const start = t.start_at ? new Date(t.start_at) : (t.deadline ? new Date(t.deadline) : new Date());
                                const end = t.deadline ? new Date(t.deadline) : new Date(start.getTime() + 3 * 86400000);
                                const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
                                return (
                                    <div key={t.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card">
                                        <div className="flex items-center justify-between text-xs text-text-muted mb-2">
                                            <span>{t.title}</span>
                                            <span>{formatDate(t.deadline) || 'Chưa có hạn chót'}</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                            <div className="h-2 bg-primary" style={{ width: `${Math.min(100, totalDays * 10)}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
            </div>

            {showTaskChat && (
                <div className="fixed bottom-6 right-6 z-40 w-[410px] max-w-[calc(100vw-20px)] rounded-3xl border border-slate-200/80 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
                    <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/80 px-4 py-3 rounded-t-3xl">
                        <div className="flex items-center gap-3">
                            <span className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
                                C
                            </span>
                            <div>
                                <p className="text-sm font-semibold text-slate-900">Đoạn chat</p>
                                <p className="text-xs text-slate-500 line-clamp-1">{chatTask?.title || 'Hội thoại công việc'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className="text-xs font-semibold text-primary"
                                onClick={() => {
                                    if (chatTask?.id) fetchTaskChat(chatTask.id);
                                }}
                            >
                                Làm mới
                            </button>
                            <button
                                type="button"
                                className="h-8 w-8 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100"
                                onClick={closeTaskChat}
                            >
                                ×
                            </button>
                        </div>
                    </div>

                    <div
                        ref={chatListRef}
                        className="max-h-[400px] min-h-[250px] overflow-y-auto px-4 py-3 space-y-2 bg-[#f0f2f5]"
                    >
                        {chatLoading && (
                            <p className="text-xs text-text-muted">Đang tải hội thoại...</p>
                        )}
                        {!chatLoading && chatMessages.length === 0 && (
                            <p className="text-xs text-text-muted">Chưa có tin nhắn. Hãy bắt đầu trao đổi.</p>
                        )}
                        {chatMessages.map((comment) => {
                            const mine = Number(comment.user_id || 0) === Number(props?.auth?.user?.id || 0);
                            const tags =
                                Array.isArray(comment.tagged_users) && comment.tagged_users.length
                                    ? comment.tagged_users.map((u) => u.name).join(', ')
                                    : Array.isArray(comment.tagged_user_ids)
                                        ? comment.tagged_user_ids.join(', ')
                                        : '';
                            const senderName = comment.user?.name || 'Nhân sự';
                            const avatarUrl = comment.user?.avatar_url || '';
                            const senderInitial = String(senderName).trim().slice(0, 1).toUpperCase() || 'U';
                            return (
                                <div key={comment.id} className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                                    {!mine && (
                                        <span className="mt-5 h-7 w-7 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 flex items-center justify-center">
                                            {avatarUrl ? (
                                                <img src={avatarUrl} alt={senderName} className="h-full w-full object-cover" />
                                            ) : senderInitial}
                                        </span>
                                    )}
                                    <div className="max-w-[80%]">
                                        <p className={`mb-1 text-[11px] ${mine ? 'text-right text-slate-500' : 'text-slate-500'}`}>
                                            {senderName} • {formatChatTime(comment.created_at)}
                                        </p>
                                        <div className={`rounded-2xl px-3 py-2 text-sm shadow-sm ${
                                            mine
                                                ? 'bg-primary text-white rounded-br-md'
                                                : 'bg-white border border-slate-200/80 text-slate-800 rounded-bl-md'
                                        }`}>
                                            <div className="whitespace-pre-wrap break-words">
                                                {comment.is_recalled ? 'Tin nhắn đã thu hồi.' : renderChatMessageContent(comment.content, comment.tagged_users || [])}
                                            </div>
                                            {!comment.is_recalled && comment.attachment_path && (
                                                <a
                                                    className={`mt-2 inline-block text-xs underline underline-offset-2 ${
                                                        mine ? 'text-white' : 'text-primary'
                                                    }`}
                                                    href={comment.attachment_path}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    download={comment.attachment_name || true}
                                                >
                                                    {comment.attachment_name || 'Tệp đính kèm'}
                                                </a>
                                            )}
                                            {!comment.is_recalled && tags && (
                                                <p className={`mt-1 text-[11px] ${mine ? 'text-white/90' : 'text-emerald-700'}`}>
                                                    Tag: {tags}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    {mine && (
                                        <span className="mt-5 h-7 w-7 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 flex items-center justify-center">
                                            {props?.auth?.user?.avatar_url ? (
                                                <img src={props.auth.user.avatar_url} alt={props.auth.user.name} className="h-full w-full object-cover" />
                                            ) : String(props?.auth?.user?.name || 'U').trim().slice(0, 1).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="border-t border-slate-200/80 p-3 bg-white rounded-b-3xl">
                        {chatTaggedUsers.length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-1.5">
                                {chatTaggedUsers.map((item) => (
                                    <span key={item.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                                        @{item.name}
                                        <button
                                            type="button"
                                            className="text-primary/70"
                                            onClick={() => setChatTaggedUsers((current) => current.filter((user) => user.id !== item.id))}
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className="relative">
                            {chatMention.open && chatMentionCandidates.length > 0 && (
                                <div className="absolute bottom-[52px] left-0 z-30 w-full rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                                    {chatMentionCandidates.map((user) => (
                                        <button
                                            key={user.id}
                                            type="button"
                                            className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50"
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                selectMention(user);
                                            }}
                                        >
                                            <span className="font-medium text-slate-800">{user.name}</span>
                                            <span className="text-xs text-slate-500">{user.email}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <input
                                    ref={chatInputRef}
                                    className="flex-1 rounded-full border border-slate-200/80 bg-slate-50 px-4 py-2.5 text-sm"
                                    placeholder="Nhập tin nhắn... (gõ @ để tag)"
                                    value={chatMessage}
                                    onChange={(e) => handleChatMessageChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
                                    onBlur={() => {
                                        setTimeout(() => {
                                            closeMention();
                                        }, 120);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            sendTaskChat();
                                        }
                                    }}
                                />
                                <input
                                    ref={chatAttachmentInputRef}
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => setChatAttachment(e.target.files?.[0] || null)}
                                />
                                <button
                                    type="button"
                                    className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                                    onClick={() => chatAttachmentInputRef.current?.click()}
                                >
                                    Tệp
                                </button>
                                <button
                                    type="button"
                                    className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                                    disabled={chatSending}
                                    onClick={sendTaskChat}
                                >
                                    Gửi
                                </button>
                            </div>
                            {showChatMentionWarning() && (
                                <p className="mt-2 text-xs text-amber-600">
                                    Bạn đang gõ @ nhưng chưa chọn người từ danh sách gợi ý.
                                </p>
                            )}
                            {chatAttachment && (
                                <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                    <span className="truncate">{chatAttachment.name}</span>
                                    <button
                                        type="button"
                                        className="text-rose-600"
                                        onClick={() => {
                                            setChatAttachment(null);
                                            if (chatAttachmentInputRef.current) {
                                                chatAttachmentInputRef.current.value = '';
                                            }
                                        }}
                                    >
                                        Bỏ
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <Modal
                open={showForm}
                onClose={closeForm}
                title={editingId ? `Sửa công việc #${editingId}` : 'Tạo công việc'}
                description="Nhập thông tin công việc và phân công."
                size="lg"
            >
                <div className="space-y-3 text-sm">
                    <select className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.project_id} onChange={(e) => setForm((s) => ({ ...s, project_id: e.target.value }))}>
                        <option value="">-- Chọn dự án * --</option>
                        {projects.map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                    </select>
                    {form.project_id && !projectHasContract && (
                        <p className="text-xs text-warning">Dự án chưa có hợp đồng, cần tạo hợp đồng trước khi tạo công việc.</p>
                    )}
                    <select
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        value={form.department_id}
                        onChange={(e) => setForm((s) => ({ ...s, department_id: e.target.value, assignee_id: '' }))}
                    >
                        <option value="">-- Chọn phòng ban --</option>
                        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <select
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        value={form.assignee_id}
                        onChange={(e) => setForm((s) => ({ ...s, assignee_id: e.target.value }))}
                    >
                        <option value="">-- Chọn nhân sự phụ trách --</option>
                        {staffOptions.map((u) => (
                            <option key={u.id} value={u.id}>{u.name} • {u.email}</option>
                        ))}
                    </select>
                    <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" placeholder="Tiêu đề *" value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} />
                    <textarea className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" rows={3} placeholder="Mô tả" value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-2">
                        <select className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.priority} onChange={(e) => setForm((s) => ({ ...s, priority: e.target.value }))}>
                            {DEFAULT_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                        <select className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
                            {statusOptions.map((s) => <option key={s} value={s}>{LABELS[s] || s}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" type="date" value={form.deadline} onChange={(e) => setForm((s) => ({ ...s, deadline: e.target.value }))} />
                        <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" type="number" min="0" max="100" value={form.progress_percent} onChange={(e) => setForm((s) => ({ ...s, progress_percent: e.target.value }))} />
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            className="flex-1 bg-primary text-white rounded-2xl py-2.5 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                            onClick={save}
                            type="button"
                            disabled={savingTask}
                        >
                            {savingTask
                                ? 'Đang lưu...'
                                : editingId
                                    ? 'Cập nhật công việc'
                                    : 'Tạo công việc'}
                        </button>
                        <button className="flex-1 border border-slate-200 rounded-2xl py-2.5 font-semibold" onClick={closeForm} type="button">
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={showImport}
                onClose={() => setShowImport(false)}
                title="Import công việc"
                description="Tải file Excel (.xls/.xlsx/.csv) để nhập công việc."
                size="md"
            >
                <form className="space-y-3 text-sm" onSubmit={submitImport}>
                    <div className="rounded-2xl border border-dashed border-slate-200/80 p-4 text-center">
                        <p className="text-xs text-text-muted mb-2">Chọn file công việc</p>
                        <input
                            id="import-task-file"
                            type="file"
                            accept=".xls,.xlsx,.csv"
                            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                            className="hidden"
                        />
                        <label
                            htmlFor="import-task-file"
                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                            Chọn file
                        </label>
                        <p className="text-xs text-text-muted mt-2">
                            {importFile ? importFile.name : 'Chưa chọn file'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="submit"
                            className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold"
                            disabled={importing}
                        >
                            {importing ? 'Đang import...' : 'Import'}
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold"
                            onClick={() => setShowImport(false)}
                        >
                            Hủy
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                open={showItems}
                onClose={() => setShowItems(false)}
                title={`Đầu việc${itemsTask ? ` • ${itemsTask.title}` : ''}`}
                description="Trưởng phòng chia đầu việc cho nhân sự và theo dõi báo cáo tiến độ."
                size="xl"
            >
                <div className="grid gap-4 lg:grid-cols-3">
                    <div className="lg:col-span-2 space-y-3">
                        {itemsLoading && <p className="text-sm text-text-muted">Đang tải đầu việc...</p>}
                        {!itemsLoading && taskItems.length === 0 && (
                            <p className="text-sm text-text-muted">Chưa có đầu việc nào.</p>
                        )}
                        {taskItems.map((item) => (
                            <div key={item.id} className="rounded-2xl border border-slate-200/80 p-4 bg-white">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-semibold text-slate-900">{item.title}</p>
                                        <p className="text-xs text-text-muted">
                                            Phụ trách: {item.assignee?.name || item.assignee?.email || '—'}
                                        </p>
                                    </div>
                                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                                        PRIORITY_STYLES[item.priority] || 'bg-slate-100 text-slate-700 border-slate-200'
                                    }`}>
                                        {PRIORITY_LABELS[item.priority] || item.priority || 'Trung bình'}
                                    </span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-muted">
                                    <span>Trạng thái: {LABELS[item.status] || item.status}</span>
                                    <span>Tiến độ: {item.progress_percent ?? 0}%</span>
                                    <span>Bắt đầu: {item.start_date ? String(item.start_date).slice(0, 10) : '—'}</span>
                                    <span>Hạn: {item.deadline ? String(item.deadline).slice(0, 10) : '—'}</span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                    {item.assignee_id === props?.auth?.user?.id && (
                                        <button className="rounded-xl bg-primary text-white px-3 py-2 font-semibold" onClick={() => openItemReportModal(item)} type="button">
                                            Báo cáo
                                        </button>
                                    )}
                                    {['admin', 'quan_ly'].includes(userRole) && (
                                        <button className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-700" onClick={() => openItemReviewModal(item)} type="button">
                                            Duyệt báo cáo
                                        </button>
                                    )}
                                    {['admin', 'quan_ly'].includes(userRole) && (
                                        <button className="text-primary font-semibold" onClick={() => startEditItem(item)} type="button">
                                            Sửa
                                        </button>
                                    )}
                                    {['admin', 'quan_ly'].includes(userRole) && (
                                        <button className="text-rose-600 font-semibold" onClick={() => removeItem(item.id)} type="button">
                                            Xóa
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="space-y-3">
                        {['admin', 'quan_ly'].includes(userRole) ? (
                            <div className="rounded-2xl border border-slate-200/80 p-4 bg-white">
                                <h4 className="font-semibold text-slate-900 mb-3">
                                    {editingItemId ? `Sửa đầu việc #${editingItemId}` : 'Tạo đầu việc'}
                                </h4>
                                <div className="space-y-2 text-sm">
                                    <select
                                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                        value={itemForm.assignee_id}
                                        onChange={(e) => setItemForm((s) => ({ ...s, assignee_id: e.target.value }))}
                                    >
                                        <option value="">-- Chọn nhân sự --</option>
                                        {itemStaffOptions.map((u) => (
                                            <option key={u.id} value={u.id}>{u.name} • {u.email}</option>
                                        ))}
                                    </select>
                                    <input
                                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                        placeholder="Tiêu đề đầu việc"
                                        value={itemForm.title}
                                        onChange={(e) => setItemForm((s) => ({ ...s, title: e.target.value }))}
                                    />
                                    <textarea
                                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                        rows={3}
                                        placeholder="Mô tả"
                                        value={itemForm.description}
                                        onChange={(e) => setItemForm((s) => ({ ...s, description: e.target.value }))}
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <select
                                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                            value={itemForm.priority}
                                            onChange={(e) => setItemForm((s) => ({ ...s, priority: e.target.value }))}
                                        >
                                            {DEFAULT_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                                        </select>
                                        <select
                                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                            value={itemForm.status}
                                            onChange={(e) => setItemForm((s) => ({ ...s, status: e.target.value }))}
                                        >
                                            {statusOptions.map((s) => <option key={s} value={s}>{LABELS[s] || s}</option>)}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                            type="date"
                                            value={itemForm.start_date}
                                            onChange={(e) => setItemForm((s) => ({ ...s, start_date: e.target.value }))}
                                        />
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={itemForm.progress_percent}
                                            onChange={(e) => setItemForm((s) => ({ ...s, progress_percent: e.target.value }))}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                            type="date"
                                            value={itemForm.deadline}
                                            onChange={(e) => setItemForm((s) => ({ ...s, deadline: e.target.value }))}
                                        />
                                        <div className="text-xs text-text-muted flex items-center px-2">
                                            % tiến độ cập nhật theo báo cáo
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                                            onClick={saveItem}
                                            disabled={savingItem}
                                        >
                                            {savingItem ? 'Đang lưu...' : editingItemId ? 'Cập nhật' : 'Tạo mới'}
                                        </button>
                                        <button
                                            type="button"
                                            className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold"
                                            onClick={resetItemForm}
                                        >
                                            Làm mới
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-text-muted">Chỉ trưởng phòng hoặc admin được tạo đầu việc.</p>
                        )}
                    </div>
                </div>
            </Modal>

            <Modal
                open={showItemReport}
                onClose={() => setShowItemReport(false)}
                title={`Báo cáo đầu việc${reportItem ? ` • ${reportItem.title}` : ''}`}
                description="Gửi cập nhật tiến độ đầu việc cho trưởng phòng."
                size="md"
            >
                <div className="space-y-3 text-sm">
                    <select
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        value={itemReportForm.status}
                        onChange={(e) => setItemReportForm((s) => ({ ...s, status: e.target.value }))}
                    >
                        <option value="">-- Trạng thái (tuỳ chọn) --</option>
                        {statusOptions.map((s) => (
                            <option key={s} value={s}>{LABELS[s] || s}</option>
                        ))}
                    </select>
                    <input
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        type="number"
                        min="0"
                        max="100"
                        placeholder="Tiến độ (%)"
                        value={itemReportForm.progress_percent}
                        onChange={(e) => setItemReportForm((s) => ({ ...s, progress_percent: e.target.value }))}
                    />
                    <textarea
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        rows={3}
                        placeholder="Nội dung báo cáo"
                        value={itemReportForm.note}
                        onChange={(e) => setItemReportForm((s) => ({ ...s, note: e.target.value }))}
                    />
                    <div className="rounded-2xl border border-dashed border-slate-200/80 p-4 text-center">
                        <input
                            id="task-item-report-file"
                            type="file"
                            onChange={(e) => setItemReportForm((s) => ({ ...s, attachment: e.target.files?.[0] || null }))}
                            className="hidden"
                        />
                        <label
                            htmlFor="task-item-report-file"
                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                            Chọn file
                        </label>
                        <p className="text-xs text-text-muted mt-2">
                            {itemReportForm.attachment ? itemReportForm.attachment.name : 'Chưa chọn file'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold"
                            onClick={submitItemReport}
                        >
                            Gửi báo cáo
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold"
                            onClick={() => setShowItemReport(false)}
                        >
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={showItemReview}
                onClose={() => setShowItemReview(false)}
                title={`Duyệt báo cáo đầu việc${reviewItem ? ` • ${reviewItem.title}` : ''}`}
                description="Chọn báo cáo để duyệt, chỉnh sửa hoặc từ chối."
                size="lg"
            >
                <div className="space-y-4 text-sm">
                    {itemUpdates.length === 0 && (
                        <p className="text-text-muted">Chưa có báo cáo chờ duyệt.</p>
                    )}
                    {itemUpdates.map((u) => (
                        <div key={u.id} className="rounded-2xl border border-slate-200/80 p-4 bg-white">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <p className="text-xs text-text-muted">#{u.id} • {u.submitter?.name || 'Nhân sự'}</p>
                                    <p className="font-semibold text-slate-900">{u.note || 'Không có ghi chú'}</p>
                                </div>
                                <button
                                    type="button"
                                    className="text-xs font-semibold text-primary"
                                    onClick={() => selectItemUpdate(u)}
                                >
                                    Xem & duyệt
                                </button>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-muted">
                                <span>Trạng thái: {u.status ? (LABELS[u.status] || u.status) : '—'}</span>
                                <span>Tiến độ: {u.progress_percent ?? '—'}%</span>
                            </div>
                            {u.attachment_path && (
                                <a className="text-xs text-primary mt-2 inline-block" href={u.attachment_path} target="_blank" rel="noreferrer">
                                    Xem file đính kèm
                                </a>
                            )}
                        </div>
                    ))}

                    {reviewingUpdate && (
                        <div className="rounded-2xl border border-slate-200/80 p-4 bg-slate-50">
                            <h4 className="font-semibold text-slate-900 mb-3">Duyệt báo cáo #{reviewingUpdate.id}</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <select
                                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                    value={reviewForm.status}
                                    onChange={(e) => setReviewForm((s) => ({ ...s, status: e.target.value }))}
                                >
                                    <option value="">-- Trạng thái --</option>
                                    {statusOptions.map((s) => (
                                        <option key={s} value={s}>{LABELS[s] || s}</option>
                                    ))}
                                </select>
                                <input
                                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                    type="number"
                                    min="0"
                                    max="100"
                                    placeholder="Tiến độ (%)"
                                    value={reviewForm.progress_percent}
                                    onChange={(e) => setReviewForm((s) => ({ ...s, progress_percent: e.target.value }))}
                                />
                            </div>
                            <textarea
                                className="mt-3 w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                rows={3}
                                placeholder="Ghi chú sau chỉnh sửa (tuỳ chọn)"
                                value={reviewForm.note}
                                onChange={(e) => setReviewForm((s) => ({ ...s, note: e.target.value }))}
                            />
                            <textarea
                                className="mt-3 w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                rows={2}
                                placeholder="Lý do từ chối (nếu không duyệt)"
                                value={reviewForm.review_note}
                                onChange={(e) => setReviewForm((s) => ({ ...s, review_note: e.target.value }))}
                            />
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className="rounded-2xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                                    onClick={() => approveItemUpdate(reviewingUpdate, {
                                        status: reviewForm.status || undefined,
                                        progress_percent: reviewForm.progress_percent === '' ? undefined : Number(reviewForm.progress_percent),
                                        note: reviewForm.note || undefined,
                                    })}
                                >
                                    Duyệt
                                </button>
                                <button
                                    type="button"
                                    className="rounded-2xl border border-rose-200 text-rose-600 px-4 py-2 text-sm font-semibold"
                                    onClick={() => {
                                        if (!reviewForm.review_note) {
                                            toast.error('Vui lòng nhập lý do từ chối.');
                                            return;
                                        }
                                        rejectItemUpdate(reviewingUpdate, reviewForm.review_note);
                                    }}
                                >
                                    Từ chối
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        </PageContainer>
    );
}
