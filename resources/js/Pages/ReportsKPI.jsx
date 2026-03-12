import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import RoleBarChart from '@/Components/RoleBarChart';

export default function ReportsKPI(props) {
    const [summary, setSummary] = useState({
        projects: { total: 0, in_progress: 0, pending_review: 0 },
        tasks: { total: 0, completed: 0, overdue: 0, on_time_rate: 0 },
        service_breakdown: [],
        links_live: 0,
        links_total: 0,
        links_pending: 0,
        content_words: 0,
        seo_score: 0,
        da_buckets: [],
        recent_links: [],
    });

    useEffect(() => {
        axios.get('/api/v1/reports/dashboard-summary').then((res) => {
            setSummary(res.data || {});
        });
    }, []);

    const stats = useMemo(() => (
        [
            { label: 'Tỷ lệ đúng hạn toàn hệ thống', value: `${summary.tasks?.on_time_rate ?? 0}%` },
            { label: 'Task hoàn thành', value: summary.tasks?.completed ?? 0 },
            { label: 'Dự án đang triển khai', value: summary.projects?.in_progress ?? 0 },
            { label: 'Task quá hạn', value: summary.tasks?.overdue ?? 0 },
        ]
    ), [summary]);

    const daBuckets = summary.da_buckets || [];

    return (
        <PageContainer
            auth={props.auth}
            title="Báo cáo & KPI"
            description="Theo dõi hiệu suất cá nhân, phòng ban, dự án và từng loại dịch vụ."
            stats={stats}
        >
            <div className="grid gap-5 xl:grid-cols-3">
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card xl:col-span-2">
                    <h3 className="font-semibold mb-4">Báo cáo theo dịch vụ</h3>
                    <RoleBarChart data={(summary.service_breakdown || []).map((item) => ({
                        label: item.label,
                        value: item.value,
                    }))} />
                </div>
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card">
                    <h3 className="font-semibold mb-4">Backlinks</h3>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span>Link đã live</span>
                            <span className="font-semibold text-primary">{summary.links_live}/{summary.links_total}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span>Đang chờ</span>
                            <span className="font-semibold text-warning">{summary.links_pending}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                                className="h-2 bg-primary"
                                style={{ width: summary.links_total ? `${(summary.links_live / summary.links_total) * 100}%` : '0%' }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-3 mt-6">
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card xl:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold">Phân bổ DA</h3>
                        <span className="text-xs text-text-muted">Tháng hiện tại</span>
                    </div>
                    <div className="flex items-end gap-4 h-40">
                        {[0, 1, 2, 3].map((idx) => {
                            const value = daBuckets[idx] ?? 0;
                            return (
                                <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                                    <div className="w-full bg-slate-100 rounded-t-xl relative" style={{ height: `${Math.max(20, value)}%` }}>
                                        <div
                                            className="absolute inset-x-0 bottom-0 rounded-t-xl"
                                            style={{ height: `${Math.max(20, value)}%`, background: idx === 2 ? '#135BEC' : '#BFDBFE' }}
                                        />
                                    </div>
                                    <span className="text-xs text-text-subtle font-semibold">DA {(idx + 1) * 20}+</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card">
                    <h3 className="font-semibold mb-4">Thống kê nội dung</h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold">Tổng số từ</p>
                                <p className="text-xs text-text-muted">Sản lượng tháng này</p>
                            </div>
                            <span className="font-semibold text-primary">{summary.content_words || 0}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold">Điểm SEO trung bình</p>
                                <p className="text-xs text-text-muted">Dữ liệu hệ thống</p>
                            </div>
                            <span className="font-semibold text-primary">{summary.seo_score || 0}/100</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-2 mt-6">
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card">
                    <h3 className="font-semibold mb-4">Audit content</h3>
                    <div className="space-y-3 text-sm">
                        <div className="flex items-center justify-between">
                            <span>Tổng URL audit</span>
                            <span className="font-semibold text-primary">{summary.audit_total || 0}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>Đã xử lý</span>
                            <span className="font-semibold text-success">{summary.audit_done || 0}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>Đang mở</span>
                            <span className="font-semibold text-warning">{summary.audit_open || 0}</span>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card">
                    <h3 className="font-semibold mb-4">Chăm sóc website</h3>
                    <div className="space-y-3 text-sm">
                        <div className="flex items-center justify-between">
                            <span>Tổng checklist</span>
                            <span className="font-semibold text-primary">{summary.website_total || 0}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>Đã index</span>
                            <span className="font-semibold text-success">{summary.website_indexed || 0}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>Traffic TB</span>
                            <span className="font-semibold text-primary">{summary.website_traffic_avg || 0}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>Ranking delta</span>
                            <span className="font-semibold text-primary">{summary.website_ranking_avg || 0}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-6 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Vị trí đặt link gần đây</h3>
                    <span className="text-xs text-text-muted">Cập nhật mới nhất</span>
                </div>
                {(summary.recent_links || []).length === 0 ? (
                    <p className="text-sm text-text-muted">Chưa có dữ liệu.</p>
                ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                        {summary.recent_links.map((item) => (
                            <div key={item.domain} className="border border-slate-200/80 rounded-2xl p-4">
                                <p className="font-semibold">{item.domain}</p>
                                <p className="text-xs text-text-muted">{item.da} • {item.status}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </PageContainer>
    );
}
