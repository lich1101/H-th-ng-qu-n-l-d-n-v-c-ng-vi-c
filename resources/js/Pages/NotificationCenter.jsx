import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';

export default function NotificationCenter(props) {
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('all');
    const [notifications, setNotifications] = useState([]);
    const [reminders, setReminders] = useState([]);
    const [logs, setLogs] = useState([]);

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
        if (diffMinutes < 60) return `${diffMinutes} phút trước`;
        const diffHours = Math.floor(diffMinutes / 60);
        if (diffHours < 24) return `${diffHours} giờ trước`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return `${diffDays} ngày trước`;
        return new Date(timestamp).toLocaleString('vi-VN');
    };

    const normalizeRows = (payload) => {
        const notifyRows = (payload?.notifications || []).map((item) => ({
            key: `in_app:${item.id}`,
            source_type: 'in_app',
            source_id: item.id,
            title: item.title || 'Thông báo',
            body: item.body || '',
            created_at: item.created_at,
            is_read: !!item.is_read,
            kind: 'Thông báo',
        }));

        const reminderRows = (payload?.reminders || []).map((item) => ({
            key: `deadline_reminder:${item.id}`,
            source_type: 'deadline_reminder',
            source_id: item.id,
            title: item.task_title || 'Nhắc hạn công việc',
            body: `${item.trigger_type || 'nhắc hạn'} • ${item.status || 'pending'} • ${item.channel || 'in_app'}`,
            created_at: item.sent_at || item.scheduled_at,
            is_read: !!item.is_read,
            kind: 'Nhắc hạn',
        }));

        const logRows = (payload?.logs || []).map((item) => ({
            key: `activity_log:${item.id}`,
            source_type: 'activity_log',
            source_id: item.id,
            title: item.actor ? `${item.actor} vừa thao tác` : 'Hoạt động hệ thống',
            body: `${item.action || 'activity'} • ${item.subject_type || 'object'} #${item.subject_id || ''}`,
            created_at: item.created_at,
            is_read: !!item.is_read,
            kind: 'Hoạt động',
        }));

        return [...notifyRows, ...reminderRows, ...logRows].sort(
            (a, b) => toTimestamp(b.created_at) - toTimestamp(a.created_at)
        );
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/v1/notifications/in-app', {
                params: { notify_limit: 80, reminder_limit: 80, log_limit: 80 },
            });
            setNotifications(response.data.notifications || []);
            setReminders(response.data.reminders || []);
            setLogs(response.data.logs || []);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const timer = setInterval(fetchData, 30000);
        return () => clearInterval(timer);
    }, []);

    const markRead = async (sourceType, sourceId) => {
        await axios.post('/api/v1/notifications/in-app/read', {
            source_type: sourceType,
            source_id: sourceId,
        });
        fetchData();
    };

    const markAllRead = async (sourceType = null) => {
        await axios.post('/api/v1/notifications/in-app/read-all', {
            source_type: sourceType || undefined,
        });
        fetchData();
    };

    const clearRead = async (sourceType) => {
        await axios.post('/api/v1/notifications/in-app/clear-read', {
            source_type: sourceType,
        });
        fetchData();
    };

    const rows = useMemo(
        () => normalizeRows({ notifications, reminders, logs }),
        [notifications, reminders, logs]
    );

    const unreadCount = useMemo(
        () => rows.filter((item) => !item.is_read).length,
        [rows]
    );

    const visibleRows = useMemo(() => {
        if (activeTab === 'unread') {
            return rows.filter((item) => !item.is_read);
        }
        return rows;
    }, [rows, activeTab]);

    const recentRows = useMemo(() => {
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        return visibleRows.filter((item) => toTimestamp(item.created_at) >= oneDayAgo);
    }, [visibleRows]);

    const olderRows = useMemo(() => {
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        return visibleRows.filter((item) => toTimestamp(item.created_at) < oneDayAgo);
    }, [visibleRows]);

    const renderRow = (item) => (
        <div
            key={item.key}
            className={`rounded-2xl px-4 py-3 border transition ${
                item.is_read
                    ? 'bg-white border-slate-200/80'
                    : 'bg-blue-50/70 border-blue-100'
            }`}
        >
            <div className="flex items-start gap-3">
                <span className="mt-0.5 h-11 w-11 rounded-full bg-slate-200 text-slate-700 text-xs font-semibold shrink-0 flex items-center justify-center">
                    {item.kind.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 leading-5">{item.title}</p>
                    {item.body && (
                        <p className="mt-1 text-sm text-slate-600 leading-5 line-clamp-2">{item.body}</p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs font-semibold text-primary">
                            {relativeTime(item.created_at)}
                        </span>
                        {!item.is_read && (
                            <span className="h-2 w-2 rounded-full bg-primary inline-block" />
                        )}
                    </div>
                </div>
                {!item.is_read && (
                    <button
                        type="button"
                        className="text-xs text-primary font-semibold shrink-0"
                        onClick={() => markRead(item.source_type, item.source_id)}
                    >
                        Đọc
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <PageContainer
            auth={props.auth}
            title="Trung tâm thông báo"
            description="Theo dõi thông báo theo kiểu feed tập trung, lọc nhanh trạng thái chưa đọc."
            stats={[
                { label: 'Tổng mục', value: rows.length },
                { label: 'Chưa đọc', value: unreadCount },
                { label: 'Cập nhật tự động', value: '30s/lần' },
            ]}
        >
            <div className="mx-auto max-w-4xl">
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
                        <h3 className="text-2xl font-bold text-slate-900 mr-auto">Thông báo</h3>
                        <button
                            type="button"
                            className={`rounded-full px-3 py-1 text-sm font-semibold ${
                                activeTab === 'all'
                                    ? 'bg-primary/10 text-primary'
                                    : 'bg-slate-100 text-slate-700'
                            }`}
                            onClick={() => setActiveTab('all')}
                        >
                            Tất cả
                        </button>
                        <button
                            type="button"
                            className={`rounded-full px-3 py-1 text-sm font-semibold ${
                                activeTab === 'unread'
                                    ? 'bg-primary/10 text-primary'
                                    : 'bg-slate-100 text-slate-700'
                            }`}
                            onClick={() => setActiveTab('unread')}
                        >
                            Chưa đọc
                        </button>
                        <button
                            type="button"
                            className="text-xs text-primary font-semibold"
                            onClick={() => markAllRead(null)}
                        >
                            Đọc tất cả
                        </button>
                        <button
                            type="button"
                            className="text-xs text-slate-500 font-semibold"
                            onClick={() => clearRead('all')}
                        >
                            Xóa đã xem
                        </button>
                    </div>

                    <div className="p-4 space-y-4">
                        {loading && (
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                                Đang tải thông báo...
                            </div>
                        )}

                        {!loading && recentRows.length > 0 && (
                            <div className="space-y-3">
                                <p className="text-sm font-semibold text-slate-700 px-1">Mới</p>
                                {recentRows.map(renderRow)}
                            </div>
                        )}

                        {!loading && olderRows.length > 0 && (
                            <div className="space-y-3">
                                <p className="text-sm font-semibold text-slate-700 px-1">Trước đó</p>
                                {olderRows.map(renderRow)}
                            </div>
                        )}

                        {!loading && visibleRows.length === 0 && (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                                {activeTab === 'unread'
                                    ? 'Không có thông báo chưa đọc.'
                                    : 'Chưa có thông báo mới.'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
