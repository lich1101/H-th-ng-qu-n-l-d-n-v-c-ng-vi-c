import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import RoleBarChart from '@/Components/RoleBarChart';
import DonutChart from '@/Components/DonutChart';

export default function Dashboard(props) {
    const [summary, setSummary] = useState({});
    const [report, setReport] = useState({});
    const [loading, setLoading] = useState(false);

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

    return (
        <PageContainer
            auth={props.auth}
            title="Tổng quan hệ thống"
            description="Theo dõi nhanh tiến độ dự án, hiệu suất nhân sự và các hạng mục cần xử lý trong ngày."
            stats={stats}
        >
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
