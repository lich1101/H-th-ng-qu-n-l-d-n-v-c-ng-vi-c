import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import RoleBarChart from '@/Components/RoleBarChart';
import DonutChart from '@/Components/DonutChart';
import { firebaseReady, ensureFirebaseAuth, onFirebaseConnectionChange } from '@/lib/firebase';

export default function Dashboard(props) {
    const [summary, setSummary] = useState({});
    const [report, setReport] = useState({});
    const [loading, setLoading] = useState(false);
    const [statusLoading, setStatusLoading] = useState(false);
    const [systemStatus, setSystemStatus] = useState({});
    const [firebaseAuthOk, setFirebaseAuthOk] = useState(false);
    const [realtimeConnected, setRealtimeConnected] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [summaryRes, reportRes] = await Promise.all([
                    axios.get('/api/v1/public/summary'),
                    axios.get('/api/v1/reports/dashboard-summary'),
                ]);
                setSummary(summaryRes.data || {});
                setReport(reportRes.data || {});
            } catch {
                // ignore
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const isAdmin = props?.auth?.user?.role === 'admin';

    useEffect(() => {
        if (!isAdmin) return () => {};
        let unsubscribe = () => {};
        let cancelled = false;

        const fetchStatus = async () => {
            setStatusLoading(true);
            try {
                const statusRes = await axios.get('/api/v1/system/status');
                if (!cancelled) setSystemStatus(statusRes.data || {});
            } catch {
                if (!cancelled) setSystemStatus({});
            }

            try {
                const tokenRes = await axios.get('/api/v1/firebase/token');
                const token = tokenRes.data?.token || '';
                if (firebaseReady && token) {
                    const authed = await ensureFirebaseAuth(token);
                    if (cancelled) return;
                    setFirebaseAuthOk(authed);
                    if (authed) {
                        unsubscribe = onFirebaseConnectionChange((connected) => {
                            if (!cancelled) setRealtimeConnected(connected);
                        });
                    }
                }
            } catch {
                if (!cancelled) setFirebaseAuthOk(false);
            } finally {
                if (!cancelled) setStatusLoading(false);
            }
        };

        fetchStatus();
        return () => {
            cancelled = true;
            if (unsubscribe) unsubscribe();
        };
    }, [isAdmin]);

    const stats = useMemo(() => (
        [
            {
                label: 'Dự án đang triển khai',
                value: String(summary.projects_in_progress ?? 0),
                note: 'Theo dõi theo trạng thái dự án',
            },
            {
                label: 'Công việc sắp đến hạn (3 ngày)',
                value: String(summary.tasks_due_soon ?? 0),
                note: 'Ưu tiên xử lý gấp',
            },
            {
                label: 'Công việc quá hạn',
                value: String(summary.tasks_overdue ?? 0),
                note: 'Cần nhắc và cập nhật',
            },
            {
                label: 'Tỷ lệ đúng hạn',
                value: `${summary.on_time_rate ?? 0}%`,
                note: 'Tính theo toàn bộ công việc',
            },
        ]
    ), [summary]);

    const progressItems = summary.project_progress || [];
    const activities = summary.recent_activities || [];
    const overloadList = summary.workload_overload || [];
    const serviceBreakdown = (report.service_breakdown || []).map((item) => ({
        label: item.label,
        value: item.value,
    }));
    const projectsTotal = Number(report.projects_total || 0);
    const projectsInProgress = Number(report.projects_in_progress || 0);
    const projectsPending = Number(report.projects_pending_review || 0);
    const projectsOther = Math.max(0, projectsTotal - projectsInProgress - projectsPending);
    const projectStatusData = [
        { label: 'Đang triển khai', value: projectsInProgress, color: '#10B981' },
        { label: 'Chờ duyệt', value: projectsPending, color: '#F59E0B' },
        { label: 'Khác', value: projectsOther, color: '#94A3B8' },
    ];

    const firebaseStatus = systemStatus.firebase || {};
    const pushTokens = systemStatus.push_tokens || {};
    const pushPlatforms = pushTokens.by_platform || {};

    const StatusPill = ({ ok, label }) => (
        <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }`}
        >
            <span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            {label}
        </span>
    );

    return (
        <PageContainer
            auth={props.auth}
            title="Tổng quan hệ thống"
            description="Theo dõi nhanh tiến độ dự án, hiệu suất nhân sự và các hạng mục cần xử lý trong ngày."
            stats={stats}
        >
            {isAdmin && (
                <div className="mb-6 grid gap-5 lg:grid-cols-3">
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-slate-900">Trạng thái kết nối</h3>
                            <span className="text-xs text-text-muted">Realtime & thông báo</span>
                        </div>
                        {statusLoading ? (
                            <p className="text-sm text-text-muted">Đang kiểm tra kết nối...</p>
                        ) : (
                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-xl border border-slate-200/80 p-4 space-y-2">
                                    <p className="text-xs uppercase tracking-wide text-text-subtle">Firebase server</p>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-slate-700">Cấu hình</span>
                                        <StatusPill ok={Boolean(firebaseStatus.enabled)} label={firebaseStatus.enabled ? 'Sẵn sàng' : 'Chưa cấu hình'} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-slate-700">Realtime DB</span>
                                        <StatusPill
                                            ok={Boolean(firebaseStatus.database_enabled)}
                                            label={firebaseStatus.database_enabled ? 'OK' : 'Thiếu DB URL'}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-slate-700">Push access token</span>
                                        <StatusPill
                                            ok={Boolean(firebaseStatus.access_token)}
                                            label={firebaseStatus.access_token ? 'OK' : 'Chưa lấy được'}
                                        />
                                    </div>
                                </div>

                                <div className="rounded-xl border border-slate-200/80 p-4 space-y-2">
                                    <p className="text-xs uppercase tracking-wide text-text-subtle">Realtime Web</p>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-slate-700">Firebase JS</span>
                                        <StatusPill ok={firebaseReady} label={firebaseReady ? 'Đã cấu hình' : 'Thiếu cấu hình'} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-slate-700">Đăng nhập RTDB</span>
                                        <StatusPill ok={firebaseAuthOk} label={firebaseAuthOk ? 'OK' : 'Chưa xác thực'} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-slate-700">Kết nối realtime</span>
                                        <StatusPill
                                            ok={Boolean(realtimeConnected)}
                                            label={realtimeConnected === null ? 'Đang kiểm tra' : realtimeConnected ? 'Đang kết nối' : 'Mất kết nối'}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-slate-900">Thiết bị nhận thông báo</h3>
                            <span className="text-xs text-text-muted">FCM tokens</span>
                        </div>
                        {statusLoading ? (
                            <p className="text-sm text-text-muted">Đang tải dữ liệu...</p>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-700">Tổng thiết bị</span>
                                    <span className="text-sm font-semibold text-slate-900">{pushTokens.total ?? 0}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-text-muted">
                                    <span>iOS</span>
                                    <span className="font-semibold text-slate-700">{pushPlatforms.ios ?? 0}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-text-muted">
                                    <span>Android</span>
                                    <span className="font-semibold text-slate-700">{pushPlatforms.android ?? 0}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-text-muted">
                                    <span>Web</span>
                                    <span className="font-semibold text-slate-700">{pushPlatforms.web ?? 0}</span>
                                </div>
                                <div className="pt-2 border-t border-slate-200/80 text-xs text-text-muted">
                                    Cập nhật gần nhất: {pushTokens.last_updated_at || '—'}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="grid gap-5 xl:grid-cols-3">
                <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-slate-900">Tiến độ dự án</h3>
                        <span className="text-xs text-text-muted">Cập nhật thời gian thực</span>
                    </div>
                    {loading && progressItems.length === 0 ? (
                        <p className="text-sm text-text-muted">Đang tải dữ liệu...</p>
                    ) : progressItems.length === 0 ? (
                        <p className="text-sm text-text-muted">Chưa có dữ liệu tiến độ.</p>
                    ) : (
                        <div className="flex gap-4 overflow-x-auto pb-2">
                            {progressItems.map((item) => (
                                <div key={item.name} className="min-w-[240px] rounded-2xl border border-slate-200/80 p-4">
                                    <p className="font-semibold text-slate-900">{item.name}</p>
                                    <p className="text-xs text-text-muted mt-1">{item.team}</p>
                                    <div className="flex justify-end text-xs font-semibold mt-3">{item.progress}%</div>
                                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                        <div
                                            className="h-2 rounded-full bg-primary"
                                            style={{ width: `${item.progress}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-slate-900">Tổng hợp dịch vụ</h3>
                        <span className="text-xs text-text-muted">Theo dự án</span>
                    </div>
                    {serviceBreakdown.length === 0 ? (
                        <p className="text-sm text-text-muted">Chưa có dữ liệu dịch vụ.</p>
                    ) : (
                        <div className="space-y-4">
                            <DonutChart data={serviceBreakdown} centerLabel="Dịch vụ" />
                            <RoleBarChart data={serviceBreakdown} />
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-3">
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-slate-900">Hoạt động gần đây</h3>
                        <span className="text-xs text-text-muted">Log hệ thống</span>
                    </div>
                    {activities.length === 0 ? (
                        <p className="text-sm text-text-muted">Chưa có hoạt động mới.</p>
                    ) : (
                        <div className="space-y-4">
                            {activities.map((item, idx) => (
                                <div key={`${item.time}-${idx}`} className="flex items-start gap-3">
                                    <div className="mt-1 h-2 w-2 rounded-full bg-slate-300" />
                                    <div>
                                        <p className="text-sm text-slate-800">
                                            <span className="font-semibold">{item.user}</span> {item.content}
                                        </p>
                                        <p className="text-xs text-text-muted mt-1">{item.time}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-slate-900">Tình trạng dự án</h3>
                        <span className="text-xs text-text-muted">Tổng hợp</span>
                    </div>
                    <DonutChart data={projectStatusData} centerLabel="Dự án" />
                </div>
            </div>

            <div className="mt-6 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-900">Nhân sự quá tải</h3>
                    <span className="text-xs text-text-muted">Theo task đang xử lý</span>
                </div>
                {overloadList.length === 0 ? (
                    <p className="text-sm text-text-muted">Chưa có nhân sự quá tải.</p>
                ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                        {overloadList.map((item) => (
                            <div key={item.user_id} className="rounded-2xl border border-slate-200/80 p-4">
                                <p className="font-semibold text-slate-900">{item.name}</p>
                                <p className="text-xs text-text-muted mt-1">{item.role}</p>
                                <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
                                    <span>Công việc đang xử lý</span>
                                    <span className="font-semibold text-warning">{item.active_tasks}</span>
                                </div>
                                <div className="mt-1 flex items-center justify-between text-xs text-text-muted">
                                    <span>Công việc quá hạn</span>
                                    <span className="font-semibold text-danger">{item.overdue_tasks}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </PageContainer>
    );
}
