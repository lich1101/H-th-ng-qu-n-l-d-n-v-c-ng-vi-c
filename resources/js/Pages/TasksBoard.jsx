import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import AppIcon from '@/Components/AppIcon';
import FilterToolbar, {
    FILTER_GRID_RESPONSIVE,
    FILTER_GRID_SUBMIT_ROW,
    FILTER_SUBMIT_BUTTON_CLASS,
    FilterActionGroup,
    FilterField,
    filterControlClass,
} from '@/Components/FilterToolbar';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import PaginationControls from '@/Components/PaginationControls';
import TagMultiSelect from '@/Components/TagMultiSelect';
import { useToast } from '@/Contexts/ToastContext';
import { formatVietnamDate, formatVietnamDateTime, toDateInputValue } from '@/lib/vietnamTime';
import { taskDefaultsFromProject, taskItemDefaults } from '@/lib/timelineDefaults';
import { fetchStaffFilterOptions } from '@/lib/staffFilterOptions';

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

const REVIEW_STATUS_LABELS = {
    pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Từ chối',
};

const REVIEW_STATUS_STYLES = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
};

const BLOCKED_ASSIGNMENT_ROLES = ['admin', 'administrator', 'ke_toan'];

const clampPercent = (value) => {
    const parsed = Number(value || 0);
    if (Number.isNaN(parsed)) return 0;
    return Math.max(0, Math.min(100, parsed));
};

const parseMultiIds = (raw) => {
    if (!raw) return [];
    return String(raw)
        .split(/[\s,;|]+/)
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0);
};

function FieldLabel({ children }) {
    return (
        <label className="mb-3.5 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
            {children}
        </label>
    );
}

function InsightStat({ label, value, tone = 'slate' }) {
    const toneStyles = {
        slate: 'bg-slate-50 text-slate-900',
        blue: 'bg-blue-50 text-blue-700',
        emerald: 'bg-emerald-50 text-emerald-700',
        amber: 'bg-amber-50 text-amber-700',
        rose: 'bg-rose-50 text-rose-700',
    };
    return (
        <div className={`rounded-2xl px-4 py-3 ${toneStyles[tone] || toneStyles.slate}`}>
            <div className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">{label}</div>
            <div className="mt-1 text-base font-semibold">{value}</div>
        </div>
    );
}

function TaskItemInsightChart({ points = [] }) {
    if (!points.length) {
        return (
            <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-text-muted">
                Chưa có dữ liệu biểu đồ tiến độ.
            </div>
        );
    }

    const width = 720;
    const height = 240;
    const paddingTop = 20;
    const paddingBottom = 34;
    const paddingLeft = 18;
    const paddingRight = 18;
    const chartHeight = height - paddingTop - paddingBottom;
    const chartWidth = width - paddingLeft - paddingRight;

    const pointX = (index) => (
        points.length === 1
            ? paddingLeft + chartWidth / 2
            : paddingLeft + (chartWidth / (points.length - 1)) * index
    );
    const pointY = (value) => paddingTop + chartHeight - (chartHeight * clampPercent(value) / 100);

    const buildPath = (key) => points
        .map((point, index) => `${pointX(index)},${pointY(point[key])}`)
        .join(' ');

    return (
        <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${width} ${height}`} className="h-[240px] w-full min-w-[620px]">
                {[0, 25, 50, 75, 100].map((tick) => (
                    <g key={tick}>
                        <line
                            x1={paddingLeft}
                            x2={width - paddingRight}
                            y1={pointY(tick)}
                            y2={pointY(tick)}
                            stroke="#E2E8F0"
                            strokeWidth="1"
                        />
                        <text
                            x={paddingLeft}
                            y={pointY(tick) - 6}
                            fill="#94A3B8"
                            fontSize="10"
                        >
                            {tick}%
                        </text>
                    </g>
                ))}
                <polyline
                    fill="none"
                    stroke="#2563EB"
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={buildPath('expected_progress')}
                />
                <polyline
                    fill="none"
                    stroke="#16A34A"
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={buildPath('actual_progress')}
                />
                {points.map((point, index) => (
                    <g key={`${point.date}-${index}`}>
                        <circle
                            cx={pointX(index)}
                            cy={pointY(point.actual_progress)}
                            r="4"
                            fill="#16A34A"
                        />
                        <text
                            x={pointX(index)}
                            y={height - 10}
                            textAnchor="middle"
                            fill="#94A3B8"
                            fontSize="10"
                        >
                            {point.label}
                        </text>
                    </g>
                ))}
            </svg>
        </div>
    );
}

export default function TasksBoard(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const currentUserId = Number(props?.auth?.user?.id || 0);

    const [loading, setLoading] = useState(false);
    const [tasks, setTasks] = useState([]);
    const [projects, setProjects] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [userOptions, setUserOptions] = useState([]);
    const [taskAssigneeFilterUsers, setTaskAssigneeFilterUsers] = useState([]);
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
        assignee_ids: parseMultiIds(queryParams.get('assignee_ids') || queryParams.get('assignee_id')),
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
    const [importReport, setImportReport] = useState(null);
    const [importJob, setImportJob] = useState(null);
    const [savingTask, setSavingTask] = useState(false);
    const [projectWeightReference, setProjectWeightReference] = useState([]);
    const [projectWeightLoading, setProjectWeightLoading] = useState(false);
    const [form, setForm] = useState({
        project_id: '',
        department_id: '',
        title: '',
        description: '',
        priority: 'medium',
        status: 'todo',
        start_at: '',
        deadline: '',
        weight_percent: 100,
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
        weight_percent: 100,
        start_date: '',
        deadline: '',
        assignee_id: '',
    });
    const [savingItem, setSavingItem] = useState(false);
    const savingItemRef = useRef(false);
    const [editingItemId, setEditingItemId] = useState(null);
    const [showItemReport, setShowItemReport] = useState(false);
    const [reportItem, setReportItem] = useState(null);
    const [editingItemUpdate, setEditingItemUpdate] = useState(null);
    const [itemReportForm, setItemReportForm] = useState({
        status: '',
        progress_percent: '',
        note: '',
        attachment: null,
    });
    const [showItemReview, setShowItemReview] = useState(false);
    const [reviewItem, setReviewItem] = useState(null);
    const [itemUpdates, setItemUpdates] = useState([]);
    const [showItemInsight, setShowItemInsight] = useState(false);
    const [insightItem, setInsightItem] = useState(null);
    const [itemInsight, setItemInsight] = useState(null);
    const [itemInsightLoading, setItemInsightLoading] = useState(false);

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

    const extractValidationMessages = (error) => {
        const errors = error?.response?.data?.errors;
        if (!errors || typeof errors !== 'object') return [];
        return Object.values(errors)
            .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
            .map((message) => String(message || '').trim())
            .filter(Boolean);
    };

    const getErrorMessage = (error, fallback) => {
        const validationMessages = extractValidationMessages(error);
        if (validationMessages.length > 0) return validationMessages[0];
        const message = error?.response?.data?.message;
        if (message && message !== 'The given data was invalid.') return message;
        return fallback;
    };

    const canApproveItemReports = (taskRecord = itemsTask) => {
        if (!taskRecord) return false;
        const projectOwnerId = Number(taskRecord?.project?.owner_id || 0);
        return userRole === 'admin' || projectOwnerId === currentUserId;
    };

    const canManageTaskRecord = (taskRecord) => {
        if (!taskRecord) return false;
        const projectOwnerId = Number(taskRecord?.project?.owner_id || 0);
        return userRole === 'admin' || projectOwnerId === currentUserId;
    };

    const canManageTaskItems = (taskRecord = itemsTask) => {
        if (!taskRecord) return false;
        const projectOwnerId = Number(taskRecord?.project?.owner_id || 0);
        const taskOwnerId = Number(taskRecord?.assignee_id || 0);
        return userRole === 'admin'
            || projectOwnerId === currentUserId
            || taskOwnerId === currentUserId;
    };

    const canSubmitItemReport = (item, taskRecord = itemsTask) => {
        if (!item) return false;
        const taskOwnerId = Number(taskRecord?.assignee_id || 0);
        return userRole === 'admin'
            || taskOwnerId === currentUserId
            || Number(item.assignee_id || 0) === currentUserId;
    };

    const canEditPendingItemUpdate = (item, update, taskRecord = itemsTask) => {
        if (!item || !update || update.review_status !== 'pending') return false;
        if (canApproveItemReports(taskRecord)) return true;
        return Number(item.assignee_id || 0) === currentUserId
            || Number(update?.submitter?.id || update?.submitted_by || 0) === currentUserId;
    };

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
            const [lookupRes, filterRows] = await Promise.all([
                axios.get('/api/v1/users/lookup', {
                    params: { purpose: 'operational_assignee' },
                }),
                fetchStaffFilterOptions('tasks'),
            ]);
            setUserOptions(lookupRes.data?.data || []);
            setTaskAssigneeFilterUsers(filterRows);
        } catch {
            setUserOptions([]);
            setTaskAssigneeFilterUsers([]);
        }
    };

    const handleTaskSearch = (val) => {
        const next = { ...filters, search: val, page: 1 };
        setFilters(next);
    };

    const applyTaskFilters = () => {
        setFilters((prev) => {
            const next = { ...prev, page: 1 };
            fetchTasks(1, next);
            return next;
        });
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
                    ...(Array.isArray(nextFilters.assignee_ids) && nextFilters.assignee_ids.length > 0 ? { assignee_ids: nextFilters.assignee_ids } : {}),
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
                ['project_id', 'status', 'search', 'deadline_from', 'deadline_to'].forEach((key) => {
                    if (nextFilters[key]) {
                        params.set(key, String(nextFilters[key]));
                    }
                });
                if (Array.isArray(nextFilters.assignee_ids) && nextFilters.assignee_ids.length > 0) {
                    params.set('assignee_ids', nextFilters.assignee_ids.join(','));
                }
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
        return formatVietnamDateTime(raw, raw ? String(raw) : '');
    };

    const formatDateTime = (raw) => {
        return formatVietnamDateTime(raw, raw ? String(raw) : '—');
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

    const resetItemForm = (taskRecord = itemsTask) => {
        setEditingItemId(null);
        const defaults = taskItemDefaults(taskRecord, taskRecord?.project || null);
        setItemForm({
            title: '',
            description: taskRecord?.description || '',
            priority: taskRecord?.priority || 'medium',
            status: taskRecord?.status || statusOptions[0] || 'todo',
            progress_percent: '',
            weight_percent: 100,
            start_date: defaults.start || '',
            deadline: defaults.end || '',
            assignee_id: taskRecord?.assignee_id || '',
        });
    };

    const openItemsModal = (task) => {
        setItemsTask(task);
        setShowItems(true);
        resetItemForm(task);
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
            weight_percent: item.weight_percent ?? 100,
            start_date: item.start_date ? toDateInputValue(item.start_date) : '',
            deadline: item.deadline ? toDateInputValue(item.deadline) : '',
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
        const taskItemDateMax = itemsTask?.deadline ? toDateInputValue(itemsTask.deadline) : '';
        if (taskItemDateMax && itemForm.start_date && String(itemForm.start_date) > taskItemDateMax) {
            toast.error('Ngày bắt đầu đầu việc không được sau deadline công việc.');
            return;
        }
        if (taskItemDateMax && itemForm.deadline && String(itemForm.deadline) > taskItemDateMax) {
            toast.error('Hạn đầu việc không được sau deadline công việc.');
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
                    weight_percent: itemForm.weight_percent === '' ? null : Number(itemForm.weight_percent),
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
                    weight_percent: itemForm.weight_percent === '' ? null : Number(itemForm.weight_percent),
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

    const openItemReportModal = (item, update = null) => {
        setReportItem(item);
        setEditingItemUpdate(update);
        setItemReportForm({
            status: update?.status || '',
            progress_percent: update?.progress_percent ?? '',
            note: update?.note || '',
            attachment: null,
        });
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
            if (editingItemUpdate) {
                formData.append('_method', 'PUT');
                await axios.post(
                    `/api/v1/tasks/${itemsTask.id}/items/${reportItem.id}/updates/${editingItemUpdate.id}`,
                    formData,
                    { headers: { 'Content-Type': 'multipart/form-data' } },
                );
                toast.success('Đã cập nhật phiếu duyệt đầu việc.');
            } else {
                await axios.post(
                    `/api/v1/tasks/${itemsTask.id}/items/${reportItem.id}/updates`,
                    formData,
                    { headers: { 'Content-Type': 'multipart/form-data' } },
                );
                toast.success('Đã gửi phiếu duyệt đầu việc.');
            }
            setShowItemReport(false);
            setEditingItemUpdate(null);
            if (showItemReview && reviewItem?.id === reportItem.id) {
                await openItemReviewModal(reportItem);
            }
            await fetchTaskItems(itemsTask.id);
            await fetchTasks(filters.page, filters);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu phiếu duyệt thất bại.');
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
            const rows = res.data?.data || [];
            setItemUpdates(rows);
            if (rows.length > 0) {
                selectItemUpdate(rows[0]);
            } else {
                setReviewingUpdate(null);
                setReviewForm({ status: '', progress_percent: '', note: '', review_note: '' });
            }
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được báo cáo.');
            setItemUpdates([]);
        }
    };

    const openItemInsightModal = async (item) => {
        if (!itemsTask) return;
        setInsightItem(item);
        setItemInsight(null);
        setShowItemInsight(true);
        setItemInsightLoading(true);
        try {
            const res = await axios.get(
                `/api/v1/tasks/${itemsTask.id}/items/${item.id}/progress-insight`
            );
            setItemInsight(res.data || null);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được biểu đồ tiến độ đầu việc.');
            setShowItemInsight(false);
        } finally {
            setItemInsightLoading(false);
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

    const deleteItemUpdate = async (update) => {
        if (!itemsTask || !reviewItem) return;
        if (!confirm('Xóa phiếu duyệt này?')) return;
        try {
            await axios.delete(`/api/v1/tasks/${itemsTask.id}/items/${reviewItem.id}/updates/${update.id}`);
            toast.success('Đã xóa phiếu duyệt.');
            await openItemReviewModal(reviewItem);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa phiếu duyệt thất bại.');
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
            setImportJob(res.data?.job || null);
            setImportReport(null);
            toast.success('Đã đưa file import công việc vào hàng đợi xử lý.');
        } catch (e) {
            const validationMessages = extractValidationMessages(e);
            const fallbackMessage = getErrorMessage(e, 'Import thất bại.');
            setImportJob(null);
            setImporting(false);
            setImportReport({
                created: 0,
                updated: 0,
                skipped: 0,
                warnings: [],
                errors: validationMessages.length > 0
                    ? validationMessages.map((message) => ({ row: '-', message }))
                    : [{ row: '-', message: fallbackMessage }],
            });
            toast.error(fallbackMessage);
        }
    };

    useEffect(() => {
        if (!showImport || !importJob?.id) return undefined;

        const poll = async () => {
            try {
                const res = await axios.get(`/api/v1/imports/jobs/${importJob.id}`);
                const nextJob = res.data || null;
                setImportJob(nextJob);

                if (nextJob?.status === 'completed') {
                    window.clearInterval(timer);
                    const report = nextJob.report || {};
                    setImporting(false);
                    setImportReport(report);
                    toast.success(
                        `Import hoàn tất: ${report.created || 0} tạo mới, ${report.updated || 0} cập nhật, ${report.skipped || 0} bỏ qua.`
                    );
                    await fetchTasks(1, { ...filters, page: 1 });
                } else if (nextJob?.status === 'failed') {
                    window.clearInterval(timer);
                    setImporting(false);
                    setImportReport(nextJob.report || {
                        created: 0,
                        updated: 0,
                        skipped: 0,
                        warnings: [],
                        errors: [{ row: '-', message: nextJob.error_message || 'Import thất bại.' }],
                    });
                    toast.error(nextJob?.error_message || 'Import thất bại.');
                }
            } catch (error) {
                window.clearInterval(timer);
                setImporting(false);
                toast.error(getErrorMessage(error, 'Không kiểm tra được tiến trình import công việc.'));
            }
        };

        const timer = window.setInterval(poll, 1500);
        poll();

        return () => window.clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showImport, importJob?.id]);

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
            start_at: '',
            deadline: '',
            weight_percent: 100,
            assignee_id: '',
        });
    };

    const openCreate = () => {
        resetForm();
        // Pre-fill from URL project_id if present
        const urlProjectId = queryParams.get('project_id');
        if (urlProjectId) {
            const proj = availableProjectOptions.find((p) => String(p.id) === String(urlProjectId));
            if (proj) {
                const td = taskDefaultsFromProject(proj);
                setForm((prev) => ({
                    ...prev,
                    project_id: String(proj.id),
                    department_id: proj.department_id ? String(proj.department_id) : prev.department_id,
                    assignee_id: proj.owner_id ? String(proj.owner_id) : prev.assignee_id,
                    start_at: td.start || prev.start_at,
                    deadline: td.end || (proj.deadline ? toDateInputValue(proj.deadline) : prev.deadline),
                    description: prev.description || proj.customer_requirement || '',
                }));
            }
        }
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        setProjectWeightReference([]);
        resetForm();
    };

    const selectedProject = useMemo(
        () => projects.find((p) => String(p.id) === String(form.project_id)),
        [projects, form.project_id]
    );
    const projectDeadlineInputMax = selectedProject?.deadline
        ? toDateInputValue(selectedProject.deadline)
        : '';
    const availableProjectOptions = useMemo(
        () => (userRole === 'admin'
            ? projects
            : projects.filter((project) => Number(project?.owner_id || 0) === currentUserId)),
        [projects, userRole, currentUserId]
    );
    const canCreate = useMemo(
        () => userRole === 'admin' || availableProjectOptions.length > 0,
        [userRole, availableProjectOptions]
    );
    const siblingProjectTasks = useMemo(
        () => projectWeightReference.filter((task) => Number(task.id) !== Number(editingId || 0)),
        [projectWeightReference, editingId]
    );
    const siblingProjectWeightTotal = useMemo(
        () => siblingProjectTasks.reduce((sum, task) => sum + Number(task.weight_percent || 0), 0),
        [siblingProjectTasks]
    );
    const projectedProjectWeightTotal = useMemo(
        () => siblingProjectWeightTotal + Number(form.weight_percent || 0),
        [siblingProjectWeightTotal, form.weight_percent]
    );
    const remainingProjectWeight = useMemo(
        () => Math.max(0, 100 - siblingProjectWeightTotal),
        [siblingProjectWeightTotal]
    );

    const selectedDepartment = useMemo(
        () => departments.find((d) => String(d.id) === String(form.department_id)),
        [departments, form.department_id]
    );

    const staffOptions = useMemo(() => {
        const isAllowedRole = (user) => !BLOCKED_ASSIGNMENT_ROLES.includes(String(user?.role || '').toLowerCase());
        if (selectedDepartment?.staff?.length) {
            return selectedDepartment.staff.filter(isAllowedRole);
        }
        if (userRole === 'admin' && departments.length) {
            const all = departments.flatMap((d) => d.staff || []);
            const map = new Map();
            all.forEach((u) => {
                if (u?.id && isAllowedRole(u)) map.set(u.id, u);
            });
            return Array.from(map.values());
        }
        return [];
    }, [selectedDepartment, departments, userRole]);

    const itemStaffOptions = useMemo(() => {
        const isAllowedRole = (user) => !BLOCKED_ASSIGNMENT_ROLES.includes(String(user?.role || '').toLowerCase());
        if (!itemsTask) return [];
        const deptId = itemsTask.department_id || itemsTask.department?.id;
        const dept = departments.find((d) => String(d.id) === String(deptId));
        if (dept?.staff?.length) return dept.staff.filter(isAllowedRole);
        if (userRole === 'admin') {
            const all = departments.flatMap((d) => d.staff || []);
            const map = new Map();
            all.forEach((u) => {
                if (u?.id && isAllowedRole(u)) map.set(u.id, u);
            });
            return Array.from(map.values());
        }
        return [];
    }, [itemsTask, departments, userRole]);

    const assignableUserOptions = useMemo(
        () => userOptions.filter((user) => !BLOCKED_ASSIGNMENT_ROLES.includes(String(user?.role || '').toLowerCase())),
        [userOptions]
    );
    const assigneeFilterOptions = useMemo(() => {
        const base = taskAssigneeFilterUsers.length > 0 ? taskAssigneeFilterUsers : assignableUserOptions;
        const allowed = base.filter((user) => !BLOCKED_ASSIGNMENT_ROLES.includes(String(user?.role || '').toLowerCase()));
        return allowed.map((user) => ({
            id: Number(user.id || 0),
            label: user.name || `Nhân sự #${user.id}`,
            meta: user.email || '',
        })).filter((user) => user.id > 0);
    }, [taskAssigneeFilterUsers, assignableUserOptions]);

    const siblingTaskItems = useMemo(
        () => taskItems.filter((item) => Number(item.id) !== Number(editingItemId || 0)),
        [taskItems, editingItemId]
    );
    const siblingItemWeightTotal = useMemo(
        () => siblingTaskItems.reduce((sum, item) => sum + Number(item.weight_percent || 0), 0),
        [siblingTaskItems]
    );
    const projectedItemWeightTotal = useMemo(
        () => siblingItemWeightTotal + Number(itemForm.weight_percent || 0),
        [siblingItemWeightTotal, itemForm.weight_percent]
    );
    const remainingItemWeight = useMemo(
        () => Math.max(0, 100 - siblingItemWeightTotal),
        [siblingItemWeightTotal]
    );

    const fetchProjectWeightReference = async (projectId) => {
        if (!projectId) {
            setProjectWeightReference([]);
            return;
        }
        setProjectWeightLoading(true);
        try {
            const res = await axios.get('/api/v1/tasks', {
                params: { project_id: Number(projectId), per_page: 200 },
            });
            setProjectWeightReference(res.data?.data || []);
        } catch {
            setProjectWeightReference([]);
        } finally {
            setProjectWeightLoading(false);
        }
    };

    useEffect(() => {
        if (!showForm || !form.project_id) {
            setProjectWeightReference([]);
            setProjectWeightLoading(false);
            return;
        }
        fetchProjectWeightReference(form.project_id);
    }, [showForm, form.project_id]);

    const startEdit = (t) => {
        setEditingId(t.id);
        setForm({
            project_id: t.project_id || '',
            department_id: t.department_id || t.assignee?.department_id || '',
            title: t.title || '',
            description: t.description || '',
            priority: t.priority || 'medium',
            status: t.status || statusOptions[0] || 'todo',
            start_at: t.start_at ? toDateInputValue(t.start_at) : '',
            deadline: t.deadline ? toDateInputValue(t.deadline) : '',
            weight_percent: t.weight_percent ?? 100,
            assignee_id: t.assignee_id || '',
        });
        setShowForm(true);
    };

    const save = async () => {
        if (savingTask) return;
        const editingTask = editingId ? tasks.find((task) => Number(task.id) === Number(editingId)) : null;
        if (!canCreate && editingId == null) return toast.error('Bạn không có quyền tạo công việc.');
        if (editingId != null && !canManageTaskRecord(editingTask)) return toast.error('Bạn không có quyền cập nhật công việc.');
        if (!form.project_id || !form.title?.trim()) return toast.error('Vui lòng chọn dự án và nhập tiêu đề.');
        if (form.start_at && form.deadline && String(form.start_at) > String(form.deadline)) {
            toast.error('Ngày bắt đầu không được sau hạn chót công việc.');
            return;
        }
        if (projectDeadlineInputMax && form.deadline && String(form.deadline) > projectDeadlineInputMax) {
            toast.error('Hạn công việc không được sau hạn dự án.');
            return;
        }
        if (projectDeadlineInputMax && form.start_at && String(form.start_at) > projectDeadlineInputMax) {
            toast.error('Ngày bắt đầu không được sau hạn dự án.');
            return;
        }
        setSavingTask(true);
        try {
            const payload = {
                project_id: Number(form.project_id),
                department_id: form.department_id ? Number(form.department_id) : null,
                title: form.title,
                description: form.description || null,
                priority: form.priority,
                status: form.status,
                start_at: form.start_at || null,
                deadline: form.deadline || null,
                weight_percent: form.weight_percent === '' ? null : Number(form.weight_percent),
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
        const targetTask = tasks.find((task) => Number(task.id) === Number(id));
        if (!canManageTaskRecord(targetTask)) return toast.error('Bạn không có quyền xóa công việc.');
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
        const full = formatVietnamDate(raw, '');
        if (!full) return '';
        const parts = full.split('/');
        return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : full;
    };

    const sortedByDeadline = useMemo(() => (
        [...tasks].sort((a, b) => {
            const da = a.deadline ? new Date(a.deadline).getTime() : 0;
            const db = b.deadline ? new Date(b.deadline).getTime() : 0;
            return da - db;
        })
    ), [tasks]);

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
                {(canCreate) && (
                    <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
                        <button
                            type="button"
                            className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm"
                            onClick={openCreate}
                        >
                            Thêm mới
                        </button>
                        <button
                            type="button"
                            className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                            onClick={() => {
                                setImportFile(null);
                                setImportReport(null);
                                setImportJob(null);
                                setImporting(false);
                                setShowImport(true);
                            }}
                        >
                            Import Excel
                        </button>
                    </div>
                )}
                <FilterToolbar enableSearch
                    title="Bộ lọc công việc"
                    description="Tìm nhanh công việc dựa trên tiêu đề, dự án, hoặc nhân sự phụ trách."
                    searchValue={filters.search}
                    onSearch={handleTaskSearch}
                    onSubmitFilters={applyTaskFilters}
                    actions={(
                        <FilterActionGroup className="justify-end">
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
                                    className={`rounded-2xl px-3.5 py-3 text-xs font-semibold transition ${
                                        viewMode === tab.key
                                            ? 'bg-primary text-white shadow-sm'
                                            : 'border border-slate-200/80 bg-white text-slate-600 hover:border-primary/30 hover:text-primary'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </FilterActionGroup>
                    )}
                >
                    <div className={FILTER_GRID_RESPONSIVE}>
                        <FilterField label="Dự án">
                            <select
                                className={filterControlClass}
                                value={filters.project_id}
                                onChange={(e) => setFilters((s) => ({ ...s, project_id: e.target.value }))}
                            >
                                <option value="">Tất cả dự án</option>
                                {(userRole === 'admin' ? projects : availableProjectOptions).map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
                            </select>
                        </FilterField>
                        <FilterField label="Trạng thái">
                            <select
                                className={filterControlClass}
                                value={filters.status}
                                onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}
                            >
                                <option value="">Tất cả trạng thái</option>
                                {statusOptions.map((s) => <option key={s} value={s}>{LABELS[s] || s}</option>)}
                            </select>
                        </FilterField>
                        <FilterField label="Nhân sự">
                            <TagMultiSelect
                                options={assigneeFilterOptions}
                                selectedIds={filters.assignee_ids}
                                onChange={(selectedIds) => setFilters((s) => ({ ...s, assignee_ids: selectedIds }))}
                                addPlaceholder="Tìm và thêm nhân sự"
                                emptyLabel="Để trống để xem toàn bộ nhân sự trong phạm vi."
                            />
                        </FilterField>
                        <FilterField label="Từ hạn">
                            <input
                                type="date"
                                className={filterControlClass}
                                value={filters.deadline_from}
                                onChange={(e) => setFilters((s) => ({ ...s, deadline_from: e.target.value }))}
                            />
                        </FilterField>
                        <FilterField label="Đến hạn">
                            <input
                                type="date"
                                className={filterControlClass}
                                value={filters.deadline_to}
                                onChange={(e) => setFilters((s) => ({ ...s, deadline_to: e.target.value }))}
                            />
                        </FilterField>
                        <FilterActionGroup className={FILTER_GRID_SUBMIT_ROW}>
                            <button type="submit" className={FILTER_SUBMIT_BUTTON_CLASS}>
                                Lọc
                            </button>
                        </FilterActionGroup>
                    </div>
                </FilterToolbar>

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
                                            <th className="py-2">Tỷ trọng</th>
                                            <th className="py-2">Phòng ban</th>
                                            <th className="py-2">Phụ trách</th>
                                            <th className="py-2"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tasks.map((t) => {
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
                                                        {t.deadline ? formatVietnamDate(t.deadline) : '—'}
                                                    </td>
                                                    <td className="py-3 text-xs text-text-muted">{t.progress_percent ?? 0}%</td>
                                                    <td className="py-3 text-xs text-text-muted">{Number(t.weight_percent ?? 0)}%</td>
                                                    <td className="py-3 text-xs text-text-muted">
                                                        {t.department?.name || '—'}
                                                    </td>
                                                    <td className="py-3 text-xs text-text-muted">
                                                        {t.assignee?.name || '—'}
                                                    </td>
                                                    <td className="py-3 text-right space-x-2">
                                                        {canManageTaskRecord(t) && (
                                                            <button className="text-xs font-semibold text-primary" onClick={(e) => { e.stopPropagation(); startEdit(t); }} type="button">
                                                                Sửa
                                                            </button>
                                                        )}
                                                        {canManageTaskRecord(t) && (
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
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {loading && (
                                            <tr>
                                                <td className="py-6 text-center text-sm text-text-muted" colSpan={10}>
                                                    Đang tải...
                                                </td>
                                            </tr>
                                        )}
                                        {!loading && tasks.length === 0 && (
                                            <tr>
                                                <td className="py-6 text-center text-sm text-text-muted" colSpan={10}>
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
                                                            {canManageTaskRecord(t) && (
                                                                <button className="hover:text-slate-900" onClick={(e) => { e.stopPropagation(); startEdit(t); }} type="button">Sửa</button>
                                                            )}
                                                            {canManageTaskRecord(t) && (
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
                                                        <span>{t.deadline ? `Hạn chót ${formatVietnamDate(t.deadline)}` : 'Chưa có hạn chót'}</span>
                                                        <span>{t.progress_percent ?? 0}%</span>
                                                    </div>
                                                    <div className="mt-1 text-xs text-text-muted">
                                                        Tỷ trọng: {Number(t.weight_percent ?? 0)}%
                                                    </div>
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

                    <PaginationControls
                        page={metaPaging.current_page}
                        lastPage={metaPaging.last_page}
                        total={metaPaging.total}
                        perPage={filters.per_page}
                        label="công việc"
                        loading={loading}
                        onPageChange={(page) => fetchTasks(page, filters)}
                        onPerPageChange={(perPage) => {
                            const next = { ...filters, per_page: perPage, page: 1 };
                            setFilters(next);
                            fetchTasks(1, next);
                        }}
                    />
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
                <div className="space-y-5 text-sm">
                    <div>
                        <FieldLabel>Dự án liên kết</FieldLabel>
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={form.project_id}
                            onChange={(e) => {
                                const id = e.target.value;
                                const proj = availableProjectOptions.find((p) => String(p.id) === String(id));
                                const td = proj ? taskDefaultsFromProject(proj) : { start: '', end: '' };
                                setForm((s) => ({
                                    ...s,
                                    project_id: id,
                                    start_at: td.start || '',
                                    deadline: td.end || '',
                                }));
                            }}
                        >
                            <option value="">-- Chọn dự án * --</option>
                            {availableProjectOptions.map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                        </select>
                    </div>
                    {form.project_id && !selectedProject?.contract_id && (
                        <p className="text-xs text-text-muted">Dự án này chưa liên kết hợp đồng, hệ thống xử lý theo luồng dự án nội bộ.</p>
                    )}
                    <div>
                        <FieldLabel>Phòng ban phụ trách</FieldLabel>
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={form.department_id}
                            onChange={(e) => setForm((s) => ({ ...s, department_id: e.target.value, assignee_id: '' }))}
                        >
                            <option value="">-- Chọn phòng ban --</option>
                            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <FieldLabel>Nhân sự phụ trách công việc</FieldLabel>
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
                    </div>
                    <div>
                        <FieldLabel>Tiêu đề công việc</FieldLabel>
                        <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} />
                    </div>
                    <div>
                        <FieldLabel>Mô tả công việc</FieldLabel>
                        <textarea className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" rows={3} value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <FieldLabel>Mức độ ưu tiên</FieldLabel>
                            <select className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.priority} onChange={(e) => setForm((s) => ({ ...s, priority: e.target.value }))}>
                                {DEFAULT_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <FieldLabel>Trạng thái công việc</FieldLabel>
                            <select className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
                                {statusOptions.map((s) => <option key={s} value={s}>{LABELS[s] || s}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <FieldLabel>Ngày bắt đầu</FieldLabel>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                type="date"
                                max={projectDeadlineInputMax || undefined}
                                value={form.start_at}
                                onChange={(e) => setForm((s) => ({ ...s, start_at: e.target.value }))}
                            />
                        </div>
                        <div>
                            <FieldLabel>Hạn chót công việc</FieldLabel>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                type="date"
                                max={projectDeadlineInputMax || undefined}
                                value={form.deadline}
                                onChange={(e) => setForm((s) => ({ ...s, deadline: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <FieldLabel>Tỷ trọng trong dự án (%)</FieldLabel>
                            <input className="w-full rounded-2xl border border-slate-200/80 px-3 py-2" type="number" min="1" max="100" value={form.weight_percent} onChange={(e) => setForm((s) => ({ ...s, weight_percent: e.target.value }))} />
                            <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
                                    disabled={!form.project_id || remainingProjectWeight <= 0}
                                    onClick={() => setForm((s) => ({ ...s, weight_percent: String(Math.max(1, remainingProjectWeight)) }))}
                                >
                                    Điền phần còn lại ({remainingProjectWeight}%)
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className={`rounded-2xl border px-4 py-3 text-xs ${projectWeightLoading ? 'border-slate-200 bg-slate-50 text-text-muted' : projectedProjectWeightTotal === 100 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : projectedProjectWeightTotal > 100 ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                        {projectWeightLoading
                            ? 'Đang kiểm tra tổng tỷ trọng công việc trong dự án...'
                            : `Tổng tỷ trọng công việc của dự án sau khi lưu sẽ là ${projectedProjectWeightTotal}%. Mốc hợp lý là 100%.`}
                    </div>
                    <div className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50 px-4 py-3 text-xs leading-6 text-text-muted">
                        Tiến độ công việc sẽ được hệ thống tự tính từ tổng tiến độ đầu việc nhân với tỷ trọng của từng đầu việc. Công việc chỉ đóng góp vào tiến độ dự án theo tỷ trọng công việc bạn nhập ở trên.
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
                onClose={() => {
                    setShowImport(false);
                    setImportFile(null);
                    setImportReport(null);
                    setImportJob(null);
                    setImporting(false);
                }}
                title="Import công việc"
                description="Tải file Excel (.xls/.xlsx/.csv) để nhập công việc."
                size="md"
            >
                <form className="space-y-3 text-sm" onSubmit={submitImport}>
                    <div className="rounded-2xl border border-dashed border-slate-200/80 p-4 text-center">
                        <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                            onClick={() => window.open('/api/v1/imports/tasks/template', '_blank', 'noopener,noreferrer')}
                        >
                            Tải file mẫu
                        </button>
                        <p className="text-xs text-text-muted mt-3 mb-2">
                            Chọn file công việc. Hệ thống sẽ tự nối khách hàng, tìm dự án phù hợp hoặc tạo dự án nhập liệu nếu chưa có.
                        </p>
                        <input
                            id="import-task-file"
                            type="file"
                            accept=".xls,.xlsx,.csv"
                            onChange={(e) => {
                                setImportFile(e.target.files?.[0] || null);
                                setImportReport(null);
                                setImportJob(null);
                            }}
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
                    {importReport && (
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3 space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                                Kết quả import
                            </div>
                            <p className="text-xs text-slate-700">
                                Tạo mới: {importReport.created || 0} • Cập nhật: {importReport.updated || 0} • Bỏ qua: {importReport.skipped || 0}
                            </p>
                            {Array.isArray(importReport.errors) && importReport.errors.length > 0 && (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5">
                                    <div className="text-xs font-semibold text-rose-700">Dòng lỗi không import được</div>
                                    <div className="mt-1 max-h-32 space-y-1 overflow-y-auto text-xs text-rose-700">
                                        {importReport.errors.map((item, idx) => (
                                            <div key={`err-${idx}`}>
                                                Dòng {item.row ?? '-'}: {item.message || 'Lỗi không xác định'}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {Array.isArray(importReport.warnings) && importReport.warnings.length > 0 && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                                    <div className="text-xs font-semibold text-amber-700">Cảnh báo dữ liệu (đã import nhưng có trường để trống)</div>
                                    <div className="mt-1 max-h-28 space-y-1 overflow-y-auto text-xs text-amber-700">
                                        {importReport.warnings.map((item, idx) => (
                                            <div key={`warn-${idx}`}>
                                                Dòng {item.row ?? '-'}: {item.message || 'Cảnh báo dữ liệu'}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {importJob && (
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-3 text-xs">
                                <div className="font-semibold uppercase tracking-[0.14em] text-text-subtle">Tiến trình import</div>
                                <div className="font-semibold text-slate-700">
                                    {importJob.processed_rows || 0}/{importJob.total_rows || 0} dòng
                                </div>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                                <div
                                    className={`h-full rounded-full transition-all ${importJob.status === 'failed' ? 'bg-rose-500' : 'bg-primary'}`}
                                    style={{ width: `${importJob.progress_percent || 0}%` }}
                                />
                            </div>
                            <div className="flex items-center justify-between text-xs text-text-muted">
                                <span>
                                    Trạng thái: {importJob.status === 'queued' ? 'Đang chờ' : importJob.status === 'processing' ? 'Đang xử lý' : importJob.status === 'completed' ? 'Hoàn tất' : 'Thất bại'}
                                </span>
                                <span>{importJob.progress_percent || 0}%</span>
                            </div>
                        </div>
                    )}
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
                            onClick={() => {
                                setShowImport(false);
                                setImportFile(null);
                                setImportReport(null);
                                setImportJob(null);
                                setImporting(false);
                            }}
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
                description="Phụ trách dự án hoặc phụ trách công việc chia đầu việc cho nhân sự và theo dõi phiếu duyệt tiến độ."
                size="xl"
            >
                <div className="grid gap-4 lg:grid-cols-3">
                    <div className="lg:col-span-2 space-y-3">
                        {itemsLoading && <p className="text-sm text-text-muted">Đang tải đầu việc...</p>}
                        {!itemsLoading && taskItems.length === 0 && (
                            <p className="text-sm text-text-muted">Chưa có đầu việc nào.</p>
                        )}
                        {taskItems.map((item) => (
                            <div
                                key={item.id}
                                className="rounded-2xl border border-slate-200/80 p-4 bg-white transition hover:border-primary/30 hover:bg-primary/5 cursor-pointer"
                                onClick={() => openItemReviewModal(item)}
                            >
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
                                    <span>Tỷ trọng: {Number(item.weight_percent ?? 0)}%</span>
                                    <span>Bắt đầu: {item.start_date ? formatVietnamDate(item.start_date) : '—'}</span>
                                    <span>Hạn: {item.deadline ? formatVietnamDate(item.deadline) : '—'}</span>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-xs font-semibold text-primary">
                                        Bấm vào đầu việc để mở danh sách phiếu duyệt
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-xs">
                                        {canSubmitItemReport(item) && (
                                            <button
                                                className="rounded-xl bg-primary text-white px-3 py-2 font-semibold"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openItemReportModal(item);
                                                }}
                                                type="button"
                                            >
                                                Tạo phiếu
                                            </button>
                                        )}
                                        <button
                                            className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-700"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openItemReviewModal(item);
                                            }}
                                            type="button"
                                        >
                                            Phiếu duyệt
                                        </button>
                                        {canApproveItemReports(itemsTask) && (
                                            <button
                                                className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-sky-700"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openItemInsightModal(item);
                                                }}
                                                type="button"
                                            >
                                                Biểu đồ
                                            </button>
                                        )}
                                        {canManageTaskItems(itemsTask) && (
                                            <button
                                                className="text-primary font-semibold"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    startEditItem(item);
                                                }}
                                                type="button"
                                            >
                                                Sửa đầu việc
                                            </button>
                                        )}
                                        {canManageTaskItems(itemsTask) && (
                                            <button
                                                className="text-rose-600 font-semibold"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeItem(item.id);
                                                }}
                                                type="button"
                                            >
                                                Xóa đầu việc
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="space-y-3">
                        {canManageTaskItems(itemsTask) ? (
                            <div className="rounded-2xl border border-slate-200/80 p-4 bg-white">
                                <h4 className="font-semibold text-slate-900 mb-3">
                                    {editingItemId ? `Sửa đầu việc #${editingItemId}` : 'Tạo đầu việc'}
                                </h4>
                                <div className="space-y-4 text-sm">
                                    <div>
                                        <FieldLabel>Nhân sự phụ trách đầu việc</FieldLabel>
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
                                    </div>
                                    <div>
                                        <FieldLabel>Tiêu đề đầu việc</FieldLabel>
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                            value={itemForm.title}
                                            onChange={(e) => setItemForm((s) => ({ ...s, title: e.target.value }))}
                                        />
                                    </div>
                                    <div>
                                        <FieldLabel>Mô tả đầu việc</FieldLabel>
                                        <textarea
                                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                            rows={3}
                                            value={itemForm.description}
                                            onChange={(e) => setItemForm((s) => ({ ...s, description: e.target.value }))}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <FieldLabel>Mức độ ưu tiên</FieldLabel>
                                            <select
                                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                                value={itemForm.priority}
                                                onChange={(e) => setItemForm((s) => ({ ...s, priority: e.target.value }))}
                                            >
                                                {DEFAULT_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <FieldLabel>Trạng thái đầu việc</FieldLabel>
                                            <select
                                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                                value={itemForm.status}
                                                onChange={(e) => setItemForm((s) => ({ ...s, status: e.target.value }))}
                                            >
                                                {statusOptions.map((s) => <option key={s} value={s}>{LABELS[s] || s}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <FieldLabel>Ngày bắt đầu</FieldLabel>
                                            <input
                                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                                type="date"
                                                max={itemsTask?.deadline ? toDateInputValue(itemsTask.deadline) : undefined}
                                                value={itemForm.start_date}
                                                onChange={(e) => setItemForm((s) => ({ ...s, start_date: e.target.value }))}
                                            />
                                        </div>
                                        <div>
                                            <FieldLabel>Tỷ trọng trong công việc (%)</FieldLabel>
                                            <input
                                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                                type="number"
                                                min="1"
                                                max="100"
                                                value={itemForm.weight_percent}
                                                onChange={(e) => setItemForm((s) => ({ ...s, weight_percent: e.target.value }))}
                                            />
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
                                                    disabled={remainingItemWeight <= 0}
                                                    onClick={() => setItemForm((s) => ({ ...s, weight_percent: String(Math.max(1, remainingItemWeight)) }))}
                                                >
                                                    Điền phần còn lại ({remainingItemWeight}%)
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className={`rounded-2xl border px-4 py-3 text-xs ${projectedItemWeightTotal === 100 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : projectedItemWeightTotal > 100 ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                                        {`Tổng tỷ trọng đầu việc của công việc sau khi lưu sẽ là ${projectedItemWeightTotal}%. Mốc hợp lý là 100%.`}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <FieldLabel>Deadline đầu việc</FieldLabel>
                                            <input
                                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                                type="date"
                                                max={itemsTask?.deadline ? toDateInputValue(itemsTask.deadline) : undefined}
                                                value={itemForm.deadline}
                                                onChange={(e) => setItemForm((s) => ({ ...s, deadline: e.target.value }))}
                                            />
                                        </div>
                                        <div>
                                            <FieldLabel>Tiến độ ban đầu (%)</FieldLabel>
                                            <input
                                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={itemForm.progress_percent}
                                                onChange={(e) => setItemForm((s) => ({ ...s, progress_percent: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50 px-4 py-3 text-xs text-text-muted">
                                        Đầu việc sẽ đóng góp vào tiến độ công việc theo tỷ trọng này. Phần nhắc chậm tiến độ theo ngày vẫn chỉ dùng để so với thời gian thực hiện.
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
                                            Đặt lại
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-text-muted">Chỉ phụ trách dự án, phụ trách công việc hoặc admin được tạo đầu việc.</p>
                        )}
                    </div>
                </div>
            </Modal>

            <Modal
                open={showItemReport}
                onClose={() => setShowItemReport(false)}
                title={`${editingItemUpdate ? 'Sửa phiếu duyệt đầu việc' : 'Tạo phiếu duyệt đầu việc'}${reportItem ? ` • ${reportItem.title}` : ''}`}
                description="Tạo hoặc chỉnh sửa phiếu báo cáo tiến độ đầu việc để quản lý phản hồi."
                size="md"
            >
                <div className="space-y-3 text-sm">
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Trạng thái báo cáo</label>
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
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Tiến độ đề xuất (%)</label>
                    <input
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        type="number"
                        min="0"
                        max="100"
                        placeholder="Tiến độ (%)"
                        value={itemReportForm.progress_percent}
                        onChange={(e) => setItemReportForm((s) => ({ ...s, progress_percent: e.target.value }))}
                    />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Nội dung phiếu duyệt</label>
                    <textarea
                        className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                        rows={3}
                        placeholder="Nội dung báo cáo"
                        value={itemReportForm.note}
                        onChange={(e) => setItemReportForm((s) => ({ ...s, note: e.target.value }))}
                    />
                    </div>
                    <div className="rounded-2xl border border-dashed border-slate-200/80 p-4 text-center">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">File đính kèm</div>
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
                            {editingItemUpdate ? 'Cập nhật phiếu' : 'Gửi phiếu'}
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
                title={`Phiếu duyệt đầu việc${reviewItem ? ` • ${reviewItem.title}` : ''}`}
                description="Danh sách phiếu ở bên trái, chi tiết và thao tác phản hồi ở bên phải."
                size="lg"
            >
                <div className="grid grid-cols-1 gap-4 text-sm xl:grid-cols-[minmax(260px,300px)_minmax(0,1fr)]">
                    <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-slate-900">Danh sách phiếu</div>
                            {canSubmitItemReport(reviewItem) && (
                                <button
                                    type="button"
                                    className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white"
                                    onClick={() => openItemReportModal(reviewItem)}
                                >
                                    Tạo phiếu
                                </button>
                            )}
                        </div>
                        {itemUpdates.length === 0 && (
                            <p className="rounded-2xl border border-slate-200/80 bg-white px-4 py-6 text-sm text-text-muted">
                                Chưa có phiếu duyệt nào cho đầu việc này.
                            </p>
                        )}
                        {itemUpdates.map((u) => (
                            <button
                                key={u.id}
                                type="button"
                                className={`w-full rounded-2xl border p-3 text-left transition ${
                                    reviewingUpdate?.id === u.id
                                        ? 'border-primary bg-primary/5'
                                        : 'border-slate-200/80 bg-white hover:border-primary/30'
                                }`}
                                onClick={() => selectItemUpdate(u)}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs text-text-muted">Phiếu #{u.id} • {u.submitter?.name || 'Nhân sự'}</p>
                                        <p className="mt-1 font-semibold text-slate-900">{REVIEW_STATUS_LABELS[u.review_status] || 'Chờ duyệt'}</p>
                                    </div>
                                    <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                                        REVIEW_STATUS_STYLES[u.review_status] || REVIEW_STATUS_STYLES.pending
                                    }`}>
                                        {u.progress_percent ?? '—'}%
                                    </span>
                                </div>
                                <div className="mt-2 text-xs text-text-muted line-clamp-2">
                                    {u.note || 'Không có ghi chú'}
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5">
                        {!reviewingUpdate && (
                            <div className="flex min-h-[260px] items-center justify-center text-sm text-text-muted">
                                Chọn một phiếu duyệt để xem chi tiết.
                            </div>
                        )}
                        {reviewingUpdate && (
                            <div className="space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-xs uppercase tracking-[0.14em] text-text-subtle">
                                            Phiếu duyệt #{reviewingUpdate.id}
                                        </div>
                                        <h4 className="mt-1 text-lg font-semibold text-slate-900">
                                            {REVIEW_STATUS_LABELS[reviewingUpdate.review_status] || 'Chờ duyệt'}
                                        </h4>
                                    </div>
                                    <div className="text-right text-xs text-text-muted">
                                        <div>Người gửi: {reviewingUpdate.submitter?.name || '—'}</div>
                                        <div className="mt-1">Lúc gửi: {formatDateTime(reviewingUpdate.created_at)}</div>
                                    </div>
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                        <div className="text-xs text-text-muted">Trạng thái báo cáo</div>
                                        <div className="mt-1 font-semibold text-slate-900">
                                            {reviewingUpdate.status ? (LABELS[reviewingUpdate.status] || reviewingUpdate.status) : '—'}
                                        </div>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                        <div className="text-xs text-text-muted">Tiến độ đề xuất</div>
                                        <div className="mt-1 font-semibold text-slate-900">{reviewingUpdate.progress_percent ?? '—'}%</div>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 px-4 py-3 md:col-span-2">
                                        <div className="text-xs text-text-muted">Ghi chú của người gửi</div>
                                        <div className="mt-1 text-sm text-slate-900">{reviewingUpdate.note || 'Không có ghi chú.'}</div>
                                    </div>
                                    {reviewingUpdate.review_note && (
                                        <div className="rounded-2xl bg-amber-50 px-4 py-3 md:col-span-2">
                                            <div className="text-xs text-amber-700">Phản hồi của người duyệt</div>
                                            <div className="mt-1 text-sm text-amber-900">{reviewingUpdate.review_note}</div>
                                        </div>
                                    )}
                                </div>

                                {reviewingUpdate.attachment_path && (
                                    <a
                                        className="inline-flex rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-primary"
                                        href={reviewingUpdate.attachment_path}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Xem file đính kèm
                                    </a>
                                )}

                                {canEditPendingItemUpdate(reviewItem, reviewingUpdate) && (
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                                            onClick={() => openItemReportModal(reviewItem, reviewingUpdate)}
                                        >
                                            Sửa phiếu
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-2xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600"
                                            onClick={() => deleteItemUpdate(reviewingUpdate)}
                                        >
                                            Xóa phiếu
                                        </button>
                                    </div>
                                )}

                                {canApproveItemReports(itemsTask) && reviewingUpdate.review_status === 'pending' && (
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                                        <div className="text-sm font-semibold text-slate-900">Phản hồi phiếu duyệt</div>
                                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                                            <div>
                                                <label className="text-xs text-text-muted">Trạng thái sau duyệt</label>
                                                <select
                                                    className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                                    value={reviewForm.status}
                                                    onChange={(e) => setReviewForm((s) => ({ ...s, status: e.target.value }))}
                                                >
                                                    <option value="">-- Giữ nguyên theo phiếu --</option>
                                                    {statusOptions.map((s) => (
                                                        <option key={s} value={s}>{LABELS[s] || s}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs text-text-muted">Tiến độ sau duyệt (%)</label>
                                                <input
                                                    className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    placeholder="Tiến độ (%)"
                                                    value={reviewForm.progress_percent}
                                                    onChange={(e) => setReviewForm((s) => ({ ...s, progress_percent: e.target.value }))}
                                                />
                                            </div>
                                        </div>
                                        <div className="mt-3">
                                            <label className="text-xs text-text-muted">Ghi chú sau duyệt</label>
                                            <textarea
                                                className="mt-2 min-h-[90px] w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                                placeholder="Có thể chỉnh nội dung cuối cùng trước khi duyệt."
                                                value={reviewForm.note}
                                                onChange={(e) => setReviewForm((s) => ({ ...s, note: e.target.value }))}
                                            />
                                        </div>
                                        <div className="mt-3">
                                            <label className="text-xs text-text-muted">Lý do từ chối</label>
                                            <textarea
                                                className="mt-2 min-h-[80px] w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                                rows={2}
                                                placeholder="Chỉ bắt buộc khi từ chối."
                                                value={reviewForm.review_note}
                                                onChange={(e) => setReviewForm((s) => ({ ...s, review_note: e.target.value }))}
                                            />
                                        </div>
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className="rounded-2xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                                                onClick={() => approveItemUpdate(reviewingUpdate, {
                                                    status: reviewForm.status || undefined,
                                                    progress_percent: reviewForm.progress_percent === '' ? undefined : Number(reviewForm.progress_percent),
                                                    note: reviewForm.note || undefined,
                                                })}
                                            >
                                                Duyệt phiếu
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
                                                Từ chối phiếu
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </Modal>

            <Modal
                open={showItemInsight}
                onClose={() => {
                    setShowItemInsight(false);
                    setInsightItem(null);
                    setItemInsight(null);
                }}
                title={`Biểu đồ tiến độ đầu việc${insightItem ? ` • ${insightItem.title}` : ''}`}
                description="So sánh tiến độ kỳ vọng và tiến độ thực tế theo từng ngày để nhìn rõ đầu việc đang vượt hay chậm tiến độ."
                size="lg"
            >
                <div className="space-y-4 text-sm">
                    {itemInsightLoading && (
                        <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50 text-text-muted">
                            Đang tải dữ liệu biểu đồ tiến độ...
                        </div>
                    )}

                    {!itemInsightLoading && !itemInsight && (
                        <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50 text-text-muted">
                            Chưa có dữ liệu tiến độ để hiển thị.
                        </div>
                    )}

                    {!itemInsightLoading && itemInsight && (
                        <>
                            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                                <InsightStat
                                    label="Nhân sự phụ trách"
                                    value={itemInsight?.summary?.assignee_name || '—'}
                                />
                                <InsightStat
                                    label="Tiến độ kỳ vọng hôm nay"
                                    value={`${clampPercent(itemInsight?.summary?.expected_progress_today)}%`}
                                    tone="blue"
                                />
                                <InsightStat
                                    label="Tiến độ thực tế"
                                    value={`${clampPercent(itemInsight?.summary?.actual_progress_today)}%`}
                                    tone="emerald"
                                />
                                <InsightStat
                                    label="Đang chậm"
                                    value={`${clampPercent(itemInsight?.summary?.lag_percent)}%`}
                                    tone={itemInsight?.summary?.is_late ? 'rose' : 'amber'}
                                />
                            </div>

                            <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div className="text-xs uppercase tracking-[0.14em] text-text-subtle">
                                            Tiến độ theo ngày
                                        </div>
                                        <div className="mt-1 text-base font-semibold text-slate-900">
                                            {itemInsight?.summary?.task_item_title || insightItem?.title || 'Đầu việc'}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-4 text-xs text-text-muted">
                                        <div className="inline-flex items-center gap-2">
                                            <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                                            Kỳ vọng
                                        </div>
                                        <div className="inline-flex items-center gap-2">
                                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                                            Thực tế
                                        </div>
                                    </div>
                                </div>

                                <TaskItemInsightChart points={itemInsight?.chart || []} />

                                <div className="mt-4 grid gap-3 md:grid-cols-3">
                                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                        <div className="text-xs text-text-muted">Ngày bắt đầu</div>
                                        <div className="mt-1 font-semibold text-slate-900">
                                            {itemInsight?.summary?.start_date || '—'}
                                        </div>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                        <div className="text-xs text-text-muted">Deadline</div>
                                        <div className="mt-1 font-semibold text-slate-900">
                                            {itemInsight?.summary?.deadline || '—'}
                                        </div>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                        <div className="text-xs text-text-muted">Phòng ban</div>
                                        <div className="mt-1 font-semibold text-slate-900">
                                            {itemInsight?.summary?.department_name || '—'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                                <div className="text-sm font-semibold text-slate-900">Lịch sử phiếu duyệt đã được chấp thuận</div>
                                <div className="mt-3 space-y-3">
                                    {(itemInsight?.approved_updates || []).length === 0 && (
                                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-text-muted">
                                            Chưa có phiếu duyệt nào được chấp thuận.
                                        </div>
                                    )}
                                    {(itemInsight?.approved_updates || []).map((update) => (
                                        <div
                                            key={update.id}
                                            className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3"
                                        >
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <div className="text-xs text-text-muted">
                                                        Phiếu #{update.id} • {update.submitter?.name || 'Nhân sự'}
                                                    </div>
                                                    <div className="mt-1 font-semibold text-slate-900">
                                                        {update.progress_percent ?? '—'}% • {LABELS[update.status] || update.status || 'Không đổi trạng thái'}
                                                    </div>
                                                </div>
                                                <div className="text-right text-xs text-text-muted">
                                                    <div>Gửi: {formatDateTime(update.created_at)}</div>
                                                    <div className="mt-1">Duyệt: {formatDateTime(update.reviewed_at)}</div>
                                                </div>
                                            </div>
                                            {update.note ? (
                                                <div className="mt-2 text-sm text-slate-700">
                                                    {update.note}
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </Modal>
        </PageContainer>
    );
}
