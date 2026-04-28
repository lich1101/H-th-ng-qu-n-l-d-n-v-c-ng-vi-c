import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import AppIcon from '@/Components/AppIcon';
import ChatbotAssistantPanel from '@/Components/ChatbotAssistantPanel';
import Dropdown from '@/Components/Dropdown';
import { useToast } from '@/Contexts/ToastContext';
import { formatVietnamDate } from '@/lib/vietnamTime';
import { Link, usePage } from '@inertiajs/inertia-react';

export default function Authenticated({ auth, header, children }) {
    const toast = useToast();
    const { settings, chatbotQuickOpen = false, chatbotInitialBotId = null, impersonation } = usePage().props;
    const [showSidebar, setShowSidebar] = useState(false);
    /** Desktop (lg+): ẩn sidebar để nội dung rộng hơn; lưu theo phiên trình duyệt */
    const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);

    useEffect(() => {
        try {
            const saved = localStorage.getItem('layout-desktop-sidebar-open');
            if (saved === '0' || saved === 'false') {
                setDesktopSidebarOpen(false);
            }
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem('layout-desktop-sidebar-open', desktopSidebarOpen ? '1' : '0');
        } catch {
            // ignore
        }
    }, [desktopSidebarOpen]);
    const currentRole = auth?.user?.role || '';
    const canUseChatbot = ['admin', 'administrator', 'quan_ly', 'nhan_vien', 'ke_toan'].includes(currentRole);
    const brandName = settings?.brand_name || 'Jobs ClickOn';
    const brandSubtitle = settings?.brand_subtitle || 'Khách hàng • Phòng ban • Kế toán';
    const logoUrl = settings?.logo_url;
    const [avatarUrl, setAvatarUrl] = useState(auth?.user?.avatar_url || '');
    const fileInputRef = useRef(null);
    const botButtonRef = useRef(null);
    const botPanelRef = useRef(null);
    const notificationButtonRef = useRef(null);
    const notificationPanelRef = useRef(null);
    const chatButtonRef = useRef(null);
    const chatPanelRef = useRef(null);
    const [activeQuickPanel, setActiveQuickPanel] = useState(null);
    const [botLoading, setBotLoading] = useState(false);
    const [botItems, setBotItems] = useState([]);
    const [notificationTab, setNotificationTab] = useState('all');
    const [notificationLoading, setNotificationLoading] = useState(false);
    const [notificationItems, setNotificationItems] = useState([]);
    const [notificationUnread, setNotificationUnread] = useState(0);
    const [chatTab, setChatTab] = useState('all');
    const [chatSearch, setChatSearch] = useState('');
    const [chatItems, setChatItems] = useState([]);
    const [chatLoading, setChatLoading] = useState(false);
    const [chatUnread, setChatUnread] = useState(0);
    const [assistantDockOpen, setAssistantDockOpen] = useState(!!chatbotQuickOpen);
    const [assistantDockBotId, setAssistantDockBotId] = useState(() => {
        const parsed = Number(chatbotInitialBotId || 0);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    });
    const CHAT_NOTIFICATION_TYPES = useMemo(
        () => new Set(['task_chat_message', 'task_comment_tag']),
        []
    );
    const botOpen = activeQuickPanel === 'bot';
    const notificationOpen = activeQuickPanel === 'notification';
    const chatOpen = activeQuickPanel === 'chat';

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
        return formatVietnamDate(timestamp);
    };

    const parseCount = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < 0) return null;
        return Math.trunc(numeric);
    };

    const closeQuickPanels = () => setActiveQuickPanel(null);
    const openAssistantDock = (botId = null) => {
        const parsed = Number(botId || 0);
        if (Number.isFinite(parsed) && parsed > 0) {
            setAssistantDockBotId(parsed);
        } else if (!assistantDockBotId && botItems.length > 0) {
            setAssistantDockBotId(Number(botItems[0]?.id || 0) || null);
        }
        setAssistantDockOpen(true);
        closeQuickPanels();
    };
    const closeAssistantDock = () => {
        setAssistantDockOpen(false);
        if (route().current('chatbot.assistant')) {
            window.location.href = route('dashboard');
        }
    };

    const toggleQuickPanel = (panelKey) => {
        setActiveQuickPanel((prev) => (prev === panelKey ? null : panelKey));
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
        const notificationRows = [...notifyRows]
            .sort((a, b) => toTimestamp(b.created_at) - toTimestamp(a.created_at))
            .slice(0, 40);

        const unreadNonChatFromApi = parseCount(payload?.unread_breakdown?.in_app_non_chat);

        return {
            notificationRows,
            unreadNotificationCount:
                unreadNonChatFromApi ?? notificationRows.filter((item) => !item.is_read).length,
            unreadChatCount: inAppRows.filter((item) => (
                CHAT_NOTIFICATION_TYPES.has(item.notification_type) && !item.is_read
            )).length,
        };
    };

    const fetchNotifications = async ({ silent = false } = {}) => {
        if (!silent) setNotificationLoading(true);
        try {
            const response = await axios.get('/api/v1/notifications/in-app', {
                params: { notify_limit: 80, reminder_limit: 0, log_limit: 0 },
            });
            const collections = buildNotificationCollections(response.data || {});
            setNotificationItems(collections.notificationRows);
            const unreadNotificationFromApi = parseCount(
                response.data?.unread_breakdown?.in_app_non_chat
            );
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

    const fetchChatbotBots = async ({ silent = false } = {}) => {
        if (!silent) setBotLoading(true);
        try {
            const response = await axios.get('/api/v1/chatbot/bots');
            setBotItems(response.data?.bots || []);
        } catch (error) {
            console.error(error);
        } finally {
            if (!silent) setBotLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
        fetchChatConversations();
        if (canUseChatbot) {
            fetchChatbotBots();
        }
        const timer = setInterval(() => {
            fetchNotifications({ silent: true });
            fetchChatConversations({ silent: true });
            if (canUseChatbot) {
                fetchChatbotBots({ silent: true });
            }
        }, 30000);
        return () => clearInterval(timer);
    }, [canUseChatbot]);

    useEffect(() => {
        if (!canUseChatbot || !chatbotQuickOpen) return;
        const parsed = Number(chatbotInitialBotId || 0);
        setAssistantDockBotId(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
        setAssistantDockOpen(true);
        closeQuickPanels();
    }, [canUseChatbot, chatbotInitialBotId, chatbotQuickOpen]);

    useEffect(() => {
        if (!notificationOpen && !chatOpen && !botOpen) return;

        const onClickOutside = (event) => {
            const target = event.target;
            if (
                botPanelRef.current?.contains(target)
                || botButtonRef.current?.contains(target)
                || notificationPanelRef.current?.contains(target)
                || notificationButtonRef.current?.contains(target)
                || chatPanelRef.current?.contains(target)
                || chatButtonRef.current?.contains(target)
            ) {
                return;
            }
            setActiveQuickPanel(null);
        };

        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [notificationOpen, chatOpen, botOpen]);

    useEffect(() => {
        if (!activeQuickPanel) return undefined;

        const onEscape = (event) => {
            if (event.key === 'Escape') {
                setActiveQuickPanel(null);
            }
        };

        window.addEventListener('keydown', onEscape);
        return () => window.removeEventListener('keydown', onEscape);
    }, [activeQuickPanel]);

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
                    {
                        label: 'Tổng quan dự án',
                        icon: 'chart',
                        routeName: 'projects.dashboard',
                        href: route('projects.dashboard'),
                        roles: ['admin', 'administrator'],
                    },
                ],
            },
            {
                label: 'CRM',
                items: [
                    { label: 'Khách hàng', icon: 'users', routeName: 'crm.index', href: route('crm.index'), roles: ['admin', 'administrator', 'quan_ly', 'nhan_vien', 'ke_toan'] },
                    { label: 'Kho số', icon: 'box', routeName: 'crm.pool.index', href: route('crm.pool.index'), roles: ['admin', 'administrator', 'quan_ly', 'nhan_vien'] },
                    { label: 'Phiếu chuyển phụ trách', icon: 'handover', routeName: 'crm.transfers.index', href: route('crm.transfers.index'), roles: ['admin', 'administrator', 'quan_ly', 'nhan_vien', 'ke_toan'] },
                    { label: 'Cơ hội', icon: 'trend', routeName: 'opportunities.index', href: route('opportunities.index'), roles: ['admin', 'administrator', 'quan_ly', 'nhan_vien'] },
                    { label: 'Form tư vấn', icon: 'form', routeName: 'lead-forms.index', href: route('lead-forms.index'), roles: ['admin', 'administrator', 'quan_ly', 'nhan_vien', 'ke_toan'] },
                    { label: 'Facebook Pages', icon: 'facebook', routeName: 'facebook.pages', href: route('facebook.pages'), roles: ['admin', 'administrator', 'quan_ly', 'nhan_vien', 'ke_toan'] },
                ],
            },
            {
                label: 'Sales',
                items: [
                    { label: 'Hợp đồng', icon: 'file', routeName: 'contracts.index', href: route('contracts.index'), roles: ['admin', 'administrator', 'quan_ly', 'nhan_vien', 'ke_toan'] },
                    { label: 'Danh mục sản phẩm', icon: 'tag', routeName: 'product-categories.index', href: route('product-categories.index'), roles: ['admin'] },
                    { label: 'Sản phẩm', icon: 'box', routeName: 'products.index', href: route('products.index'), roles: ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'] },
                ],
            },
            {
                label: 'Operations',
                items: [
                    { label: 'Dự án', icon: 'project', routeName: 'projects.kanban', href: route('projects.kanban'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Công việc', icon: 'tasks', routeName: 'tasks.board', href: route('tasks.board'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Đầu việc', icon: 'tasks', routeName: 'task-items.board', href: route('task-items.board'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Bàn giao dự án', icon: 'handover', routeName: 'handover.index', href: route('handover.index'), roles: ['admin', 'nhan_vien'] },
                    { label: 'Lịch họp', icon: 'calendar', routeName: 'meetings.index', href: route('meetings.index'), roles: ['admin', 'quan_ly'] },
                    { label: 'Chấm công', icon: 'alarm', routeName: 'attendance.index', href: route('attendance.index'), roles: ['admin', 'administrator', 'quan_ly', 'nhan_vien', 'ke_toan'] },
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
                    { label: 'Trạng thái cơ hội', icon: 'tag', routeName: 'settings.opportunity-statuses', href: route('settings.opportunity-statuses'), roles: ['admin', 'administrator'] },
                    { label: 'Hạng doanh thu', icon: 'award', routeName: 'revenue-tiers.index', href: route('revenue-tiers.index'), roles: ['admin'] },
                    { label: 'Barem công việc', icon: 'workflow', routeName: 'services.workflows', href: route('services.workflows'), roles: ['admin', 'administrator', 'quan_ly', 'nhan_vien'] },
                    { label: 'Tải ứng dụng', icon: 'download', routeName: 'app-downloads.index', href: route('app-downloads.index'), roles: ['admin', 'administrator', 'quan_ly', 'nhan_vien', 'ke_toan'] },
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
            next[group.label] = false;
        });
        return next;
    });

    useEffect(() => {
        const next = {};
        visibleGroups.forEach((group) => {
            next[group.label] = false;
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
    const quickReadCount = useMemo(
        () => notificationItems.filter((item) => item.source_type === 'in_app' && item.is_read).length,
        [notificationItems]
    );

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

    const toPositiveInt = (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return null;
        const normalized = Math.trunc(parsed);
        return normalized > 0 ? normalized : null;
    };

    const extractEntityId = (item, key) => {
        const payload = item?.data && typeof item.data === 'object' ? item.data : {};
        return toPositiveInt(item?.[key] ?? payload?.[key]);
    };

    const checkEntityExists = async (url, validator = null) => {
        try {
            const response = await axios.get(url);
            if (response.status !== 200) return false;
            if (typeof validator === 'function') {
                return !!validator(response?.data);
            }
            return true;
        } catch (_) {
            return false;
        }
    };

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
            closeQuickPanels();
            window.location.href = `/cong-viec?chat_task_id=${taskId}`;
            return;
        }
        closeQuickPanels();
        window.location.href = '/cong-viec';
    };

    const openNotificationTarget = async (item) => {
        const type = String(item?.notification_type || '').toLowerCase();
        const clientId = extractEntityId(item, 'client_id');
        const contractId = extractEntityId(item, 'contract_id');
        const projectId = extractEntityId(item, 'project_id');
        const taskItemId = extractEntityId(item, 'task_item_id');
        const taskId = extractTaskId(item);
        const opportunityId = extractEntityId(item, 'opportunity_id');
        const meetingId = extractEntityId(item, 'meeting_id');
        const isOpportunityNotification = type === 'crm_notification'
            || type.includes('opportunity')
            || (opportunityId && opportunityId > 0);

        const isClientNotification = type === 'facebook_lead'
            || type === 'new_client'
            || type === 'client_form_lead'
            || type === 'crm_new_lead'
            || type === 'lead_form_new_lead'
            || type === 'crm_phone_duplicate_merged'
            || type.startsWith('crm_client_');

        if (isOpportunityNotification) {
            if (opportunityId) {
                const exists = await checkEntityExists(`/api/v1/opportunities/${opportunityId}`);
                if (!exists) {
                    toast.error('Cơ hội không tồn tại.');
                    return false;
                }
                closeQuickPanels();
                window.location.href = route('opportunities.detail', opportunityId);
                return true;
            }
            closeQuickPanels();
            window.location.href = route('opportunities.index');
            return true;
        }

        if (isClientNotification) {
            if (!clientId) {
                toast.error('Khách hàng không tồn tại.');
                return false;
            }
            const exists = await checkEntityExists(
                `/api/v1/crm/clients/${clientId}`,
                (payload) => Number(payload?.id || 0) === clientId
            );
            if (!exists) {
                toast.error('Khách hàng không tồn tại.');
                return false;
            }
            closeQuickPanels();
            window.location.href = route('crm.client.show', clientId);
            return true;
        }

        if (isChatItem(item)) {
            if (!taskId) {
                toast.error('Công việc không tồn tại.');
                return false;
            }
            const exists = await checkEntityExists(`/api/v1/tasks/${taskId}`);
            if (!exists) {
                toast.error('Công việc không tồn tại.');
                return false;
            }
            openTaskChatFromItem(item);
            return true;
        }

        if (type === 'task_item_update_pending'
            || type === 'task_item_update_feedback'
            || type === 'task_item_assigned'
            || type === 'task_item_progress_late') {
            if (taskItemId) {
                const itemExists = await checkEntityExists(`/api/v1/task-items/${taskItemId}`);
                if (itemExists) {
                    closeQuickPanels();
                    window.location.href = route('task-items.detail', taskItemId);
                    return true;
                }
            }
            if (taskId) {
                const taskExists = await checkEntityExists(`/api/v1/tasks/${taskId}`);
                if (taskExists) {
                    closeQuickPanels();
                    window.location.href = route('tasks.detail', taskId);
                    return true;
                }
            }
            toast.error('Đầu việc không tồn tại.');
            return false;
        }

        if (type === 'task_assigned'
            || type === 'task_update_pending'
            || type === 'task_update_feedback'
            || type === 'deadline_reminder') {
            if (!taskId) {
                toast.error('Công việc không tồn tại.');
                return false;
            }
            const exists = await checkEntityExists(`/api/v1/tasks/${taskId}`);
            if (!exists) {
                toast.error('Công việc không tồn tại.');
                return false;
            }
            closeQuickPanels();
            window.location.href = route('tasks.detail', taskId);
            return true;
        }

        if (type.includes('contract')) {
            if (!contractId) {
                closeQuickPanels();
                window.location.href = route('contracts.index');
                return true;
            }
            const exists = await checkEntityExists(`/api/v1/contracts/${contractId}`);
            if (!exists) {
                toast.error('Hợp đồng không tồn tại.');
                return false;
            }
            closeQuickPanels();
            window.location.href = route('contracts.detail', contractId);
            return true;
        }

        if (type.includes('project') || type.includes('handover')) {
            if (!projectId) {
                closeQuickPanels();
                window.location.href = route('projects.kanban');
                return true;
            }
            const exists = await checkEntityExists(`/api/v1/projects/${projectId}`);
            if (!exists) {
                toast.error('Dự án không tồn tại.');
                return false;
            }
            closeQuickPanels();
            window.location.href = route('projects.detail', projectId);
            return true;
        }

        if (type.startsWith('meeting_') || meetingId) {
            closeQuickPanels();
            window.location.href = route('meetings.index');
            return true;
        }

        if (type.includes('attendance')) {
            closeQuickPanels();
            window.location.href = route('attendance.index');
            return true;
        }

        return false;
    };

    const handleNotificationItemClick = async (item) => {
        await markSingleNotificationRead(item, { refresh: false });
        const opened = await openNotificationTarget(item);
        if (!opened) {
            await fetchNotifications({ silent: true });
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
            await axios.post('/api/v1/notifications/in-app/read-all', {
                source_type: 'non_chat_in_app',
            });
            await fetchNotifications({ silent: true });
        } catch (error) {
            console.error(error);
        }
    };

    const clearReadNotifications = async () => {
        try {
            if (quickReadCount <= 0) return;
            await axios.post('/api/v1/notifications/in-app/clear-read', { source_type: 'in_app' });
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

    const [leavingImpersonation, setLeavingImpersonation] = useState(false);
    const leaveImpersonation = async () => {
        if (leavingImpersonation) return;
        setLeavingImpersonation(true);
        try {
            await axios.post(route('impersonate.leave'));
            window.location.assign('/dashboard');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không thể thoát phiên đăng nhập nhanh.');
            setLeavingImpersonation(false);
        }
    };

    return (
            <div className="min-h-screen overflow-x-hidden bg-app-bg text-slate-900">
            <div className="flex min-h-screen min-w-0">
                <aside
                    className={`fixed inset-y-0 left-0 z-40 w-72 bg-white border-r border-slate-200/80 transform transition-transform duration-200 ease-out group ${
                        showSidebar ? 'translate-x-0' : '-translate-x-full'
                    } ${desktopSidebarOpen ? 'lg:translate-x-0' : 'lg:-translate-x-full'}`}
                >
                    <div className="h-full flex flex-col">
                        <div className="px-6 py-6 border-slate-200">
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
                                            const isAssistantMenu = menu.routeName === 'chatbot.assistant';
                                            const active = isAssistantMenu
                                                ? (assistantDockOpen || route().current(menu.routeName))
                                                : route().current(menu.routeName);
                                            const sharedClassName = `flex w-full items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition ${
                                                active
                                                    ? 'bg-primary/10 text-primary'
                                                    : 'text-slate-600 hover:bg-slate-100'
                                            }`;

                                            if (isAssistantMenu) {
                                                return (
                                                    <button
                                                        key={menu.routeName}
                                                        type="button"
                                                        className={sharedClassName}
                                                        onClick={() => {
                                                            setShowSidebar(false);
                                                            openAssistantDock();
                                                        }}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <span className="text-slate-500">
                                                                <AppIcon name={menu.icon} className="h-4 w-4" />
                                                            </span>
                                                            <span>{menu.label}</span>
                                                        </span>
                                                    </button>
                                                );
                                            }

                                            return (
                                                <Link
                                                    key={menu.routeName}
                                                    href={menu.href}
                                                    className={sharedClassName}
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

                <div
                    className={`min-w-0 flex-1 transition-[margin] duration-200 ease-out ${
                        desktopSidebarOpen ? 'lg:ml-72' : 'lg:ml-0'
                    }`}
                >
                    {impersonation?.active && impersonation?.original && auth?.user && (
                        <div
                            role="status"
                            className="sticky top-0 z-[35] flex flex-wrap items-center justify-between gap-3 border-b border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950 shadow-sm md:px-8"
                        >
                            <div className="flex min-w-0 flex-1 items-start gap-2">
                                <span className="mt-0.5 text-lg leading-none" aria-hidden>
                                    ⚠️
                                </span>
                                <div className="min-w-0">
                                    <p>
                                        Bạn đang đăng nhập nhanh với tài khoản:{' '}
                                        <span className="font-semibold">{auth.user.name}</span>
                                        {auth.user.email ? (
                                            <span className="text-teal-800/90"> ({auth.user.email})</span>
                                        ) : null}
                                    </p>
                                    <p className="mt-1 text-xs text-teal-900/85">
                                        Tài khoản gốc:{' '}
                                        <span className="font-semibold">{impersonation.original.name}</span>
                                        {impersonation.original.email
                                            ? ` (${impersonation.original.email})`
                                            : ''}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={leaveImpersonation}
                                disabled={leavingImpersonation}
                                className="shrink-0 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {leavingImpersonation ? 'Đang xử lý...' : 'Thoát về tài khoản gốc'}
                            </button>
                        </div>
                    )}
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
                                <button
                                    type="button"
                                    onClick={() => setDesktopSidebarOpen((prev) => !prev)}
                                    className="hidden lg:inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                                    title={desktopSidebarOpen ? 'Ẩn menu bên trái (nội dung rộng hơn)' : 'Hiện menu bên trái'}
                                    aria-expanded={desktopSidebarOpen}
                                    aria-label={desktopSidebarOpen ? 'Ẩn menu điều hướng' : 'Hiện menu điều hướng'}
                                >
                                    <AppIcon name="bars-3" className="h-5 w-5" />
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
                                {canUseChatbot && (
                                    <div className="relative">
                                        <button
                                            ref={botButtonRef}
                                            type="button"
                                            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                                            onClick={() => {
                                                const shouldOpen = !botOpen;
                                                toggleQuickPanel('bot');
                                                if (shouldOpen) {
                                                    fetchChatbotBots({ silent: true });
                                                }
                                            }}
                                            aria-label="Mở danh sách chatbot"
                                        >
                                            <AppIcon name="assistant" className="h-5 w-5" />
                                        </button>

                                        {botOpen && (
                                            <div
                                                ref={botPanelRef}
                                                className="absolute right-0 mt-2 w-[360px] max-w-[92vw] rounded-2xl border border-slate-200 bg-white shadow-2xl z-50"
                                            >
                                                <div className="border-b border-slate-100 px-4 pt-4 pb-3">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <p className="text-xl font-bold text-slate-900">Danh sách chatbot</p>
                                                        <button
                                                            type="button"
                                                            className="text-xs font-semibold text-primary"
                                                            onClick={() => openAssistantDock()}
                                                        >
                                                            Mở popup chat
                                                        </button>
                                                    </div>
                                                    <p className="mt-1 text-xs text-slate-500">
                                                        Chọn nhanh chatbot để mở đúng bot trên trang chat.
                                                    </p>
                                                </div>

                                                <div className="max-h-[420px] overflow-y-auto p-2">
                                                    {botLoading && (
                                                        <div className="px-3 py-8 text-center text-sm text-slate-500">
                                                            Đang tải chatbot...
                                                        </div>
                                                    )}

                                                    {!botLoading && botItems.length === 0 && (
                                                        <div className="px-3 py-8 text-center text-sm text-slate-500">
                                                            Chưa có chatbot nào đang bật.
                                                        </div>
                                                    )}

                                                    {!botLoading && botItems.map((bot) => (
                                                        <button
                                                            key={bot.id}
                                                            type="button"
                                                            className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-slate-50"
                                                            onClick={() => openAssistantDock(bot.id)}
                                                        >
                                                            {bot.avatar_url ? (
                                                                <img
                                                                    src={bot.avatar_url}
                                                                    alt={bot.name}
                                                                    className="h-10 w-10 shrink-0 rounded-full border border-slate-200 object-cover"
                                                                />
                                                            ) : (
                                                                <span
                                                                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base"
                                                                    style={{ backgroundColor: `${bot.accent_color || '#6366F1'}1A`, color: bot.accent_color || '#6366F1' }}
                                                                >
                                                                    {bot.icon || '🤖'}
                                                                </span>
                                                            )}
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block truncate text-sm font-semibold text-slate-900">
                                                                    {bot.name}
                                                                </span>
                                                                <span className="mt-0.5 block truncate text-xs text-slate-500">
                                                                    {bot.description || 'Trợ lý AI cho hội thoại nội bộ'}
                                                                </span>
                                                            </span>
                                                            <span className="flex flex-col items-end gap-1">
                                                                {bot.is_default && (
                                                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                                                        Mặc định
                                                                    </span>
                                                                )}
                                                                {!bot.configured && (
                                                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                                                        Thiếu cấu hình
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="relative">
                                    <button
                                        ref={notificationButtonRef}
                                        type="button"
                                        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                                        onClick={() => {
                                            const shouldOpen = !notificationOpen;
                                            toggleQuickPanel('notification');
                                            if (shouldOpen) {
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
                                                    <button
                                                        type="button"
                                                        className="text-xs text-slate-500 font-semibold disabled:opacity-50"
                                                        onClick={clearReadNotifications}
                                                        disabled={quickReadCount <= 0}
                                                    >
                                                        Xóa đã xem
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
                                                    <span className="ml-auto text-xs text-slate-400 font-semibold">
                                                        {filteredNotificationItems.length} mục
                                                    </span>
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
                                            const shouldOpen = !chatOpen;
                                            toggleQuickPanel('chat');
                                            if (shouldOpen) {
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
                                            className="absolute right-0 mt-2 z-[60] flex w-[420px] max-h-[72vh] min-h-[360px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                                        >
                                            <div className="border-b border-slate-100 bg-white px-4 pt-4 pb-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-xl font-bold text-slate-900">Đoạn chat nhóm công việc</p>
                                                        <p className="mt-0.5 text-xs text-slate-500">
                                                            Tự đóng popup hiện tại khi bạn mở popup khác từ header.
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                                                            onClick={markAllChatsRead}
                                                        >
                                                            Đọc tất cả
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
                                                            onClick={closeQuickPanels}
                                                            aria-label="Đóng popup chat"
                                                        >
                                                            <AppIcon name="x-mark" className="h-4 w-4" />
                                                        </button>
                                                    </div>
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
                                                        onClick={closeQuickPanels}
                                                    >
                                                        Xem công việc
                                                    </Link>
                                                </div>
                                            </div>

                                            <div className="flex-1 overflow-y-auto bg-slate-50/40 p-2">
                                                {chatLoading && (
                                                    <div className="px-3 py-8 text-sm text-center text-slate-500">
                                                        Đang tải đoạn chat...
                                                    </div>
                                                )}

                                                {!chatLoading && filteredChatItems.map((item) => (
                                                    <button
                                                        key={item.key}
                                                        type="button"
                                                        className={`mb-1 w-full text-left flex items-start gap-3 rounded-xl border px-3 py-3 transition ${
                                                            Number(item.unread_count || 0) <= 0
                                                                ? 'border-slate-200/80 bg-white hover:border-slate-300'
                                                                : 'border-blue-200 bg-blue-50/80 hover:border-blue-300'
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

                                            <div className="border-t border-slate-100 bg-white px-4 py-3 text-xs text-slate-500">
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

                    <main className="min-w-0 overflow-x-hidden px-4 pb-10 md:px-8">{children}</main>
                </div>
            </div>

            {canUseChatbot && assistantDockOpen && (
                <div className="pointer-events-none fixed inset-0 z-[70]">
                    <div className="pointer-events-auto absolute bottom-5 right-5 w-[min(96vw,520px)]">
                        <div className="overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-[0_28px_90px_-40px_rgba(15,23,42,0.58)]">
                            <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-3.5 py-2.5">
                                <div className="flex items-center gap-2.5">
                                    <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                                    <p className="text-sm font-semibold text-slate-900">Trợ lý AI</p>
                                </div>
                                <button
                                    type="button"
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
                                    onClick={closeAssistantDock}
                                    aria-label="Đóng popup trợ lý AI"
                                >
                                    <AppIcon name="x-mark" className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="h-[76vh] min-h-[520px] max-h-[820px] bg-gradient-to-b from-slate-50/70 to-white p-2.5">
                                <ChatbotAssistantPanel
                                    auth={auth}
                                    embedded
                                    initialBotId={assistantDockBotId}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
