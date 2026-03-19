import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import AppIcon from '@/Components/AppIcon';
import Dropdown from '@/Components/Dropdown';
import { Link, usePage } from '@inertiajs/inertia-react';

export default function Authenticated({ auth, header, children }) {
    const { settings } = usePage().props;
    const [showSidebar, setShowSidebar] = useState(false);
    const currentRole = auth?.user?.role || '';
    const brandName = settings?.brand_name || 'Job ClickOn';
    const brandSubtitle = settings?.brand_subtitle || 'Khách hàng • Phòng ban • Kế toán';
    const logoUrl = settings?.logo_url;
    const [avatarUrl, setAvatarUrl] = useState(auth?.user?.avatar_url || '');
    const fileInputRef = useRef(null);
    const notificationButtonRef = useRef(null);
    const notificationPanelRef = useRef(null);
    const chatButtonRef = useRef(null);
    const chatPanelRef = useRef(null);
    const [notificationOpen, setNotificationOpen] = useState(false);
    const [notificationTab, setNotificationTab] = useState('all');
    const [notificationLoading, setNotificationLoading] = useState(false);
    const [notificationItems, setNotificationItems] = useState([]);
    const [notificationUnread, setNotificationUnread] = useState(0);
    const [chatOpen, setChatOpen] = useState(false);
    const [chatTab, setChatTab] = useState('all');
    const [chatSearch, setChatSearch] = useState('');
    const [chatItems, setChatItems] = useState([]);
    const [chatLoading, setChatLoading] = useState(false);
    const [chatUnread, setChatUnread] = useState(0);
    const CHAT_NOTIFICATION_TYPES = useMemo(
        () => new Set(['task_chat_message', 'task_comment_tag']),
        []
    );

    useEffect(() => {
        if (!settings?.primary_color) return;
        const hex = settings.primary_color.replace('#', '').trim();
        if (hex.length !== 6) return;
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return;
        document.documentElement.style.setProperty('--color-primary', `${r} ${g} ${b}`);
    }, [settings?.primary_color]);

    const toTimestamp = (value) => {
        if (!value) return 0;
        const timestamp = new Date(value).getTime();
        return Number.isFinite(timestamp) ? timestamp : 0;
    };

    const relativeTime = (value) => {
        const timestamp = toTimestamp(value);
        if (!timestamp) return 'Vừa xong';
        const diffMs = Date.now() - timestamp;
        const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
        if (diffMinutes < 60) return `${diffMinutes} phút`;
        const diffHours = Math.floor(diffMinutes / 60);
        if (diffHours < 24) return `${diffHours} giờ`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return `${diffDays} ngày`;
        return new Date(timestamp).toLocaleDateString('vi-VN');
    };

    const parseCount = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < 0) return null;
        return Math.trunc(numeric);
    };

    const buildNotificationCollections = (payload) => {
        const inAppRows = (payload?.notifications || []).map((item) => {
            const data = item?.data && typeof item.data === 'object' ? item.data : {};
            const taskId = Number(item?.task_id || data?.task_id || 0);
            const commentId = Number(item?.comment_id || data?.comment_id || 0);
            return {
                key: `in_app:${item.id}`,
                source_type: 'in_app',
                source_id: item.id,
                notification_type: item.type || 'general',
                title: item.title || 'Thông báo',
                body: item.body || '',
                data,
                task_id: taskId > 0 ? taskId : null,
                comment_id: commentId > 0 ? commentId : null,
                created_at: item.created_at,
                is_read: !!item.is_read,
                kind: 'Thông báo',
            };
        });

        const notifyRows = inAppRows.filter((item) => !CHAT_NOTIFICATION_TYPES.has(item.notification_type));

        const reminderRows = (payload?.reminders || []).map((item) => ({
            key: `deadline_reminder:${item.id}`,
            source_type: 'deadline_reminder',
            source_id: item.id,
            notification_type: 'deadline_reminder',
            title: item.task_title || 'Nhắc hạn công việc',
            body: `${item.trigger_type || 'nhắc hạn'} • ${item.status || 'pending'}`,
            task_id: item?.task_id ? Number(item.task_id) : null,
            created_at: item.sent_at || item.scheduled_at,
            is_read: !!item.is_read,
            kind: 'Nhắc hạn',
        }));

        const logRows = (payload?.logs || []).map((item) => ({
            key: `activity_log:${item.id}`,
            source_type: 'activity_log',
            source_id: item.id,
            notification_type: 'activity_log',
            title: item.actor ? `${item.actor} vừa thao tác` : 'Hoạt động hệ thống',
            body: `${item.action || 'activity'} • ${item.subject_type || 'object'} #${item.subject_id || ''}`,
            created_at: item.created_at,
            is_read: !!item.is_read,
            kind: 'Hoạt động',
        }));

        const notificationRows = [...notifyRows, ...reminderRows, ...logRows]
            .sort((a, b) => toTimestamp(b.created_at) - toTimestamp(a.created_at))
            .slice(0, 40);

        return {
            notificationRows,
            unreadNotificationCount: notificationRows.filter((item) => !item.is_read).length,
            unreadChatCount: inAppRows.filter((item) => (
                CHAT_NOTIFICATION_TYPES.has(item.notification_type) && !item.is_read
            )).length,
        };
    };

    const fetchNotifications = async ({ silent = false } = {}) => {
        if (!silent) setNotificationLoading(true);
        try {
            const response = await axios.get('/api/v1/notifications/in-app', {
                params: { notify_limit: 30, reminder_limit: 20, log_limit: 20 },
            });
            const collections = buildNotificationCollections(response.data || {});
            setNotificationItems(collections.notificationRows);
            const unreadNotificationFromApi = parseCount(response.data?.unread_notification);
            const unreadChatFromApi = parseCount(response.data?.unread_chat);
            setNotificationUnread(
                unreadNotificationFromApi ?? collections.unreadNotificationCount
            );
            setChatUnread(unreadChatFromApi ?? collections.unreadChatCount);
        } catch (error) {
            console.error(error);
        } finally {
            if (!silent) setNotificationLoading(false);
        }
    };

    const fetchChatConversations = async ({ silent = false } = {}) => {
        if (!silent) setChatLoading(true);
        try {
            const response = await axios.get('/api/v1/task-conversations', {
                params: { limit: 500 },
            });
            setChatItems(response.data?.data || []);
        } catch (error) {
            console.error(error);
        } finally {
            if (!silent) setChatLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
        fetchChatConversations();
        const timer = setInterval(() => {
            fetchNotifications({ silent: true });
            fetchChatConversations({ silent: true });
        }, 30000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!notificationOpen && !chatOpen) return;

        const onClickOutside = (event) => {
            const target = event.target;
            if (
                notificationPanelRef.current?.contains(target)
                || notificationButtonRef.current?.contains(target)
                || chatPanelRef.current?.contains(target)
                || chatButtonRef.current?.contains(target)
            ) {
                return;
            }
            setNotificationOpen(false);
            setChatOpen(false);
        };

        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [notificationOpen, chatOpen]);

    const roleLabels = {
        admin: 'Quản trị',
        administrator: 'Administrator',
        quan_ly: 'Quản lý',
        nhan_vien: 'Nhân sự',
        ke_toan: 'Kế toán',
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

    const handleAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const data = new FormData();
            data.append('avatar', file);
            const res = await axios.post('/api/v1/profile/avatar', data, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setAvatarUrl(res.data?.avatar_url || '');
        } catch (err) {
            console.error(err);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const menuGroups = useMemo(
        () => [
            {
                label: 'Tổng quan',
                items: [
                    {
                        label: 'Tổng quan',
                        icon: 'dashboard',
                        routeName: 'dashboard',
                        href: route('dashboard'),
                        roles: ['admin', 'administrator', 'quan_ly', 'nhan_vien', 'ke_toan'],
                    },
                ],
            },
            {
                label: 'CRM',
                items: [
                    { label: 'Khách hàng', icon: 'users', routeName: 'crm.index', href: route('crm.index'), roles: ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'] },
                    { label: 'Cơ hội', icon: 'trend', routeName: 'opportunities.index', href: route('opportunities.index'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Form tư vấn', icon: 'form', routeName: 'lead-forms.index', href: route('lead-forms.index'), roles: ['admin'] },
                    { label: 'Facebook Pages', icon: 'facebook', routeName: 'facebook.pages', href: route('facebook.pages'), roles: ['admin', 'quan_ly'] },
                ],
            },
            {
                label: 'Sales',
                items: [
                    { label: 'Hợp đồng', icon: 'file', routeName: 'contracts.index', href: route('contracts.index'), roles: ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'] },
                    { label: 'Sản phẩm', icon: 'box', routeName: 'products.index', href: route('products.index'), roles: ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'] },
                ],
            },
            {
                label: 'Operations',
                items: [
                    { label: 'Dự án', icon: 'project', routeName: 'projects.kanban', href: route('projects.kanban'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Công việc', icon: 'tasks', routeName: 'tasks.board', href: route('tasks.board'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Công việc theo nhân sự', icon: 'users', routeName: 'tasks.by-staff', href: route('tasks.by-staff'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Đầu việc', icon: 'tasks', routeName: 'task-items.board', href: route('task-items.board'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Bàn giao dự án', icon: 'handover', routeName: 'handover.index', href: route('handover.index'), roles: ['admin', 'nhan_vien'] },
                    { label: 'Lịch họp', icon: 'calendar', routeName: 'meetings.index', href: route('meetings.index'), roles: ['admin', 'quan_ly'] },
                ],
            },
            {
                label: 'Reports',
                items: [
                    { label: 'Báo cáo KPI', icon: 'chart', routeName: 'reports.kpi', href: route('reports.kpi'), roles: ['admin', 'quan_ly'] },
                    { label: 'Doanh thu công ty', icon: 'chart', routeName: 'reports.company', href: route('reports.company'), roles: ['admin'] },
                ],
            },
            {
                label: 'System',
                items: [
                    { label: 'Phòng ban', icon: 'department', routeName: 'departments.index', href: route('departments.index'), roles: ['admin', 'quan_ly'] },
                    { label: 'Trạng thái khách hàng', icon: 'tag', routeName: 'lead-types.index', href: route('lead-types.index'), roles: ['admin'] },
                    { label: 'Hạng doanh thu', icon: 'award', routeName: 'revenue-tiers.index', href: route('revenue-tiers.index'), roles: ['admin'] },
                    { label: 'Quy trình dịch vụ', icon: 'workflow', routeName: 'services.workflows', href: route('services.workflows'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Thông báo', icon: 'bell', routeName: 'notifications.center', href: route('notifications.center'), roles: ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'] },
                    { label: 'Nhật ký hệ thống', icon: 'history', routeName: 'activity.logs', href: route('activity.logs'), roles: ['admin', 'quan_ly'] },
                    { label: 'Tài khoản người dùng', icon: 'users', routeName: 'accounts.dashboard', href: route('accounts.dashboard'), roles: ['admin'] },
                    { label: 'Phân quyền', icon: 'shield', routeName: 'roles.permissions', href: route('roles.permissions'), roles: ['admin'] },
                    { label: 'Cài đặt hệ thống', icon: 'settings', routeName: 'settings.system', href: route('settings.system'), roles: ['administrator'] },
                ],
            },
        ],
        []
    );

    const visibleGroups = menuGroups
        .map((group) => ({
            ...group,
            items: group.items.filter((item) => item.roles.includes(currentRole)),
        }))
        .filter((group) => group.items.length > 0);

    const [collapsedGroups, setCollapsedGroups] = useState(() => {
        const next = {};
        visibleGroups.forEach((group) => {
            const active = group.items.some((item) => route().current(item.routeName));
            next[group.label] = !active;
        });
        return next;
    });

    useEffect(() => {
        const next = {};
        visibleGroups.forEach((group) => {
            const active = group.items.some((item) => route().current(item.routeName));
            next[group.label] = !active;
        });
        setCollapsedGroups(next);
    }, [currentRole]);

    const toggleGroup = (label) => {
        setCollapsedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
    };

    const filteredNotificationItems = useMemo(() => {
        if (notificationTab === 'unread') {
            return notificationItems.filter((item) => !item.is_read);
        }
        return notificationItems;
    }, [notificationItems, notificationTab]);

    const quickUnreadCount = notificationUnread;

    const filteredChatItems = useMemo(() => {
        const source = chatTab === 'unread'
            ? chatItems.filter((item) => Number(item?.unread_count || 0) > 0)
            : chatItems;
        const keyword = chatSearch.trim().toLowerCase();
        if (!keyword) return source;
        return source.filter((item) => (
            [
                item.title,
                item.body,
                item.project_name,
                item.project_code,
                item.department_name,
                item.assignee_name,
                item.last_actor_name,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(keyword)
        ));
    }, [chatItems, chatSearch, chatTab]);

    const quickChatUnreadCount = chatUnread;

    const markSingleNotificationRead = async (item, options = {}) => {
        const shouldRefresh = options.refresh !== false;
        if (!item || item.is_read) return;
        try {
            await axios.post('/api/v1/notifications/in-app/read', {
                source_type: item.source_type,
                source_id: item.source_id,
            });
            if (shouldRefresh) {
                await fetchNotifications({ silent: true });
            }
        } catch (error) {
            console.error(error);
        }
    };

    const isChatItem = (item) => CHAT_NOTIFICATION_TYPES.has(item?.notification_type || '');

    const extractTaskId = (item) => {
        const directTaskId = Number(item?.task_id || 0);
        if (Number.isFinite(directTaskId) && directTaskId > 0) return directTaskId;
        const payload = item?.data && typeof item.data === 'object' ? item.data : {};
        const payloadTaskId = Number(payload?.task_id || 0);
        if (Number.isFinite(payloadTaskId) && payloadTaskId > 0) return payloadTaskId;
        return null;
    };

    const openTaskChatFromItem = (item) => {
        const taskId = extractTaskId(item);
        if (taskId) {
            window.location.href = `/cong-viec?chat_task_id=${taskId}`;
            return;
        }
        window.location.href = '/cong-viec';
    };

    const handleNotificationItemClick = async (item) => {
        const shouldNavigateChat = isChatItem(item);
        await markSingleNotificationRead(item, { refresh: !shouldNavigateChat });
        if (shouldNavigateChat) {
            openTaskChatFromItem(item);
        }
    };

    const markTaskConversationRead = async (item) => {
        const taskId = extractTaskId(item);
        if (!taskId || Number(item?.unread_count || 0) <= 0) {
            return;
        }
        try {
            await axios.post('/api/v1/notifications/in-app/read-task-chat', {
                task_id: taskId,
            });
        } catch (error) {
            console.error(error);
        }
    };

    const handleChatItemClick = async (item) => {
        await markTaskConversationRead(item);
        openTaskChatFromItem(item);
    };

    const markAllNotificationsRead = async () => {
        try {
            if (notificationUnread <= 0) return;
            await Promise.all([
                axios.post('/api/v1/notifications/in-app/read-all', { source_type: 'non_chat_in_app' }),
                axios.post('/api/v1/notifications/in-app/read-all', { source_type: 'deadline_reminder' }),
                axios.post('/api/v1/notifications/in-app/read-all', { source_type: 'activity_log' }),
            ]);
            await fetchNotifications({ silent: true });
        } catch (error) {
            console.error(error);
        }
    };

    const markAllChatsRead = async () => {
        try {
            if (chatUnread <= 0) return;
            await axios.post('/api/v1/notifications/in-app/read-all', { source_type: 'chat_in_app' });
            await Promise.all([
                fetchNotifications({ silent: true }),
                fetchChatConversations({ silent: true }),
            ]);
        } catch (error) {
            console.error(error);
        }
    };

    return (
            <div className="min-h-screen bg-app-bg text-slate-900">
            <div className="flex min-h-screen">
                <aside
                    className={`fixed inset-y-0 left-0 z-40 w-72 bg-white border-r border-slate-200/80 transform transition-transform duration-200 group ${
                        showSidebar ? 'translate-x-0' : '-translate-x-full'
                    } lg:translate-x-0`}
                >
                    <div className="h-full flex flex-col">
                        <div className="px-6 py-6 border-b border-slate-200">
                            <div className="flex items-center gap-3">
                                {logoUrl ? (
                                    <img src={logoUrl} alt={brandName} className="h-9 w-9 rounded-xl object-contain" />
                                ) : (
                                    <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-semibold">
                                        {brandName.slice(0, 1).toUpperCase()}
                                    </div>
                                )}
                                <div>
                                    <p className="text-lg font-semibold">Quản lý nội bộ</p>
                                </div>
                            </div>
                        </div>

                        <nav className="flex-1 overflow-y-hidden group-hover:overflow-y-auto px-4 py-5 space-y-4">
                            {visibleGroups.map((group) => (
                                <div key={group.label} className="space-y-2">
                                    <button
                                        type="button"
                                        onClick={() => toggleGroup(group.label)}
                                        className="w-full flex items-center justify-between px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-subtle"
                                    >
                                        <span>{group.label}</span>
                                        <span
                                            className={`inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-transform ${
                                                collapsedGroups[group.label] ? 'rotate-180' : ''
                                            }`}
                                        >
                                            <AppIcon name="chevron-down" className="h-3 w-3" strokeWidth={2} />
                                        </span>
                                    </button>
                                    <div
                                        className={`space-y-1 overflow-hidden transition-all duration-200 ${
                                            collapsedGroups[group.label]
                                                ? 'max-h-0 opacity-0'
                                                : 'max-h-[480px] opacity-100'
                                        }`}
                                    >
                                        {group.items.map((menu) => {
                                            const active = route().current(menu.routeName);
                                            return (
                                                <Link
                                                    key={menu.routeName}
                                                    href={menu.href}
                                                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition ${
                                                        active
                                                            ? 'bg-primary/10 text-primary'
                                                            : 'text-slate-600 hover:bg-slate-100'
                                                    }`}
                                                    onClick={() => setShowSidebar(false)}
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <span className="text-slate-500">
                                                            <AppIcon name={menu.icon} className="h-4 w-4" />
                                                        </span>
                                                        <span>{menu.label}</span>
                                                    </span>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </nav>

                        <div className="px-6 py-4 border-t border-slate-200 text-xs text-text-muted">
                            Phiên bản nội bộ v1.0
                        </div>
                    </div>
                </aside>

                <div className="flex-1 lg:ml-72">
                    <header className="bg-white/80 backdrop-blur border-b border-slate-200 sticky top-0 z-30">
                        <div className="px-4 md:px-8 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowSidebar((prev) => !prev)}
                                    className="lg:hidden inline-flex items-center justify-center rounded-md border border-slate-300 px-2 py-1 text-slate-700"
                                >
                                    Menu
                                </button>
                                <div>
                                    <p className="text-xs text-text-subtle">Hệ thống quản lý dự án</p>
                                    <p className="font-semibold">Bảng điều khiển</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="hidden md:inline-flex rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 text-xs">
                                    {roleLabels[currentRole] || currentRole || 'user'}
                                </span>
                                <div className="relative">
                                    <button
                                        ref={notificationButtonRef}
                                        type="button"
                                        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                                        onClick={() => {
                                            setChatOpen(false);
                                            setNotificationOpen((prev) => !prev);
                                            if (!notificationOpen) {
                                                fetchNotifications({ silent: true });
                                            }
                                        }}
                                        aria-label="Mở thông báo"
                                    >
                                        <AppIcon name="bell" className="h-5 w-5" />
                                        {notificationUnread > 0 && (
                                            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center">
                                                {notificationUnread > 99 ? '99+' : notificationUnread}
                                            </span>
                                        )}
                                    </button>

                                    {notificationOpen && (
                                        <div
                                            ref={notificationPanelRef}
                                            className="absolute right-0 mt-2 w-[380px] max-w-[92vw] rounded-2xl border border-slate-200 bg-white shadow-2xl z-50"
                                        >
                                            <div className="px-4 pt-4 pb-3 border-b border-slate-100">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-2xl font-bold text-slate-900">Thông báo</p>
                                                    <button
                                                        type="button"
                                                        className="text-xs text-primary font-semibold"
                                                        onClick={markAllNotificationsRead}
                                                    >
                                                        Đọc tất cả
                                                    </button>
                                                </div>
                                                <div className="mt-3 flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        className={`rounded-full px-3 py-1 text-sm font-semibold ${
                                                            notificationTab === 'all'
                                                                ? 'bg-primary/10 text-primary'
                                                                : 'bg-slate-100 text-slate-700'
                                                        }`}
                                                        onClick={() => setNotificationTab('all')}
                                                    >
                                                        Tất cả
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`rounded-full px-3 py-1 text-sm font-semibold ${
                                                            notificationTab === 'unread'
                                                                ? 'bg-primary/10 text-primary'
                                                                : 'bg-slate-100 text-slate-700'
                                                        }`}
                                                        onClick={() => setNotificationTab('unread')}
                                                    >
                                                        Chưa đọc
                                                    </button>
                                                    <Link
                                                        href={route('notifications.center')}
                                                        className="ml-auto text-xs text-primary font-semibold"
                                                    >
                                                        Xem tất cả
                                                    </Link>
                                                </div>
                                            </div>

                                            <div className="max-h-[440px] overflow-y-auto p-2">
                                                {notificationLoading && (
                                                    <div className="px-3 py-8 text-sm text-center text-slate-500">
                                                        Đang tải thông báo...
                                                    </div>
                                                )}

                                                {!notificationLoading && filteredNotificationItems.map((item) => (
                                                    <button
                                                        key={item.key}
                                                        type="button"
                                                        className={`w-full text-left flex items-start gap-3 rounded-xl px-3 py-3 transition ${
                                                            item.is_read
                                                                ? 'hover:bg-slate-50'
                                                                : 'bg-blue-50/60 hover:bg-blue-50'
                                                        }`}
                                                        onClick={() => handleNotificationItemClick(item)}
                                                    >
                                                        <span className="mt-0.5 h-10 w-10 shrink-0 rounded-full bg-slate-200 text-slate-600 text-[11px] font-semibold flex items-center justify-center">
                                                            {item.kind.slice(0, 1)}
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block text-sm font-semibold text-slate-900 line-clamp-2">
                                                                {item.title}
                                                            </span>
                                                            {item.body && (
                                                                <span className="mt-0.5 block text-xs text-slate-600 line-clamp-2">
                                                                    {item.body}
                                                                </span>
                                                            )}
                                                            <span className="mt-1 block text-[11px] font-semibold text-primary">
                                                                {relativeTime(item.created_at)}
                                                            </span>
                                                        </span>
                                                        {!item.is_read && (
                                                            <span className="mt-1 inline-flex h-5 min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white shrink-0">
                                                                1
                                                            </span>
                                                        )}
                                                    </button>
                                                ))}

                                                {!notificationLoading && filteredNotificationItems.length === 0 && (
                                                    <div className="px-3 py-8 text-sm text-center text-slate-500">
                                                        {notificationTab === 'unread'
                                                            ? 'Không có thông báo chưa đọc.'
                                                            : 'Chưa có thông báo mới.'}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
                                                Chưa đọc: <span className="font-semibold text-slate-700">{quickUnreadCount}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="relative">
                                    <button
                                        ref={chatButtonRef}
                                        type="button"
                                        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                                        onClick={() => {
                                            setNotificationOpen(false);
                                            setChatOpen((prev) => !prev);
                                            if (!chatOpen) {
                                                fetchNotifications({ silent: true });
                                                fetchChatConversations({ silent: true });
                                            }
                                        }}
                                        aria-label="Mở đoạn chat"
                                    >
                                        <AppIcon name="chat" className="h-5 w-5" />
                                        {chatUnread > 0 && (
                                            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center">
                                                {chatUnread > 99 ? '99+' : chatUnread}
                                            </span>
                                        )}
                                    </button>

                                    {chatOpen && (
                                        <div
                                            ref={chatPanelRef}
                                            className="absolute right-0 mt-2 w-[380px] max-w-[92vw] rounded-2xl border border-slate-200 bg-white shadow-2xl z-50"
                                        >
                                            <div className="px-4 pt-4 pb-3 border-b border-slate-100">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-2xl font-bold text-slate-900">Đoạn chat</p>
                                                    <button
                                                        type="button"
                                                        className="text-xs text-primary font-semibold"
                                                        onClick={markAllChatsRead}
                                                    >
                                                        Đọc tất cả
                                                    </button>
                                                </div>
                                                <div className="mt-3">
                                                    <input
                                                        value={chatSearch}
                                                        onChange={(e) => setChatSearch(e.target.value)}
                                                        className="w-full rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                                                        placeholder="Tìm theo công việc, dự án, nội dung..."
                                                    />
                                                </div>
                                                <div className="mt-3 flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        className={`rounded-full px-3 py-1 text-sm font-semibold ${
                                                            chatTab === 'all'
                                                                ? 'bg-primary/10 text-primary'
                                                                : 'bg-slate-100 text-slate-700'
                                                        }`}
                                                        onClick={() => setChatTab('all')}
                                                    >
                                                        Tất cả
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`rounded-full px-3 py-1 text-sm font-semibold ${
                                                            chatTab === 'unread'
                                                                ? 'bg-primary/10 text-primary'
                                                                : 'bg-slate-100 text-slate-700'
                                                        }`}
                                                        onClick={() => setChatTab('unread')}
                                                    >
                                                        Chưa đọc
                                                    </button>
                                                    <Link
                                                        href={route('tasks.board')}
                                                        className="ml-auto text-xs text-primary font-semibold"
                                                    >
                                                        Xem công việc
                                                    </Link>
                                                </div>
                                            </div>

                                            <div className="max-h-[440px] overflow-y-auto p-2">
                                                {chatLoading && (
                                                    <div className="px-3 py-8 text-sm text-center text-slate-500">
                                                        Đang tải đoạn chat...
                                                    </div>
                                                )}

                                                {!chatLoading && filteredChatItems.map((item) => (
                                                    <button
                                                        key={item.key}
                                                        type="button"
                                                        className={`w-full text-left flex items-start gap-3 rounded-xl px-3 py-3 transition ${
                                                            Number(item.unread_count || 0) <= 0
                                                                ? 'hover:bg-slate-50'
                                                                : 'bg-blue-50/60 hover:bg-blue-50'
                                                        }`}
                                                        onClick={() => handleChatItemClick(item)}
                                                    >
                                                        <span className="mt-0.5 h-10 w-10 shrink-0 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-semibold flex items-center justify-center">
                                                            {(item.title || 'C').slice(0, 1).toUpperCase()}
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block text-sm font-semibold text-slate-900 line-clamp-2">
                                                                {item.title}
                                                            </span>
                                                            <span className="mt-0.5 block text-[11px] text-slate-500 line-clamp-1">
                                                                {[item.project_name, item.department_name, item.assignee_name].filter(Boolean).join(' • ') || 'Công việc nội bộ'}
                                                            </span>
                                                            <span className="mt-1 block text-xs text-slate-600 line-clamp-2">
                                                                {item.body}
                                                            </span>
                                                            <span className="mt-1 flex items-center justify-between gap-3 text-[11px]">
                                                                <span className="font-semibold text-primary">
                                                                    {relativeTime(item.activity_at)}
                                                                </span>
                                                                <span className="truncate text-slate-400">
                                                                    {item.last_actor_name ? `${item.last_actor_name} • ` : ''}{item.comment_count || 0} tin
                                                                </span>
                                                            </span>
                                                        </span>
                                                        {Number(item.unread_count || 0) > 0 && (
                                                            <span className="mt-1 inline-flex h-5 min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white shrink-0">
                                                                {item.unread_count > 99 ? '99+' : item.unread_count}
                                                            </span>
                                                        )}
                                                    </button>
                                                ))}

                                                {!chatLoading && filteredChatItems.length === 0 && (
                                                    <div className="px-3 py-8 text-sm text-center text-slate-500">
                                                        {chatTab === 'unread'
                                                            ? 'Không có hội thoại công việc nào chưa đọc.'
                                                            : 'Chưa có hội thoại công việc nào.'}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
                                                Đoạn chat chưa đọc: <span className="font-semibold text-slate-700">{quickChatUnreadCount}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <Dropdown>
                                    <Dropdown.Trigger>
                                        <span className="inline-flex rounded-md">
                                            <button
                                                type="button"
                                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white hover:bg-slate-100"
                                                aria-label="Mở tài khoản"
                                            >
                                                {avatarUrl ? (
                                                    <img
                                                        src={avatarUrl}
                                                        alt={auth.user.name}
                                                        className="h-10 w-10 rounded-full object-cover"
                                                    />
                                                ) : (
                                                    <span className="h-10 w-10 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                                                        {initials(auth.user.name)}
                                                    </span>
                                                )}
                                            </button>
                                        </span>
                                    </Dropdown.Trigger>

                                    <Dropdown.Content>
                                        <button
                                            type="button"
                                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            Đổi avatar
                                        </button>
                                        <Dropdown.Link href={route('logout')} method="post" as="button">
                                            Đăng xuất
                                        </Dropdown.Link>
                                    </Dropdown.Content>
                                </Dropdown>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleAvatarChange}
                                />
                            </div>
                        </div>
                    </header>

                    {header && <div className="px-4 md:px-8 py-6">{header}</div>}

                    <main className="px-4 md:px-8 pb-10">{children}</main>
                </div>
            </div>
        </div>
    );
}
