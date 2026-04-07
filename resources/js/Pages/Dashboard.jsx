import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import FilterToolbar, {
    FILTER_GRID_RESPONSIVE,
    FILTER_GRID_SUBMIT_ROW,
    FILTER_SUBMIT_BUTTON_CLASS,
    FILTER_SUBMIT_PRIMARY_BUTTON_CLASS,
    FilterActionGroup,
    FilterField,
    filterControlClass,
} from '@/Components/FilterToolbar';
import PageContainer from '@/Components/PageContainer';
import DonutChart from '@/Components/DonutChart';
import CustomerGrowthChart from '@/Components/CustomerGrowthChart';
import EmployeeRevenueBars from '@/Components/EmployeeRevenueBars';

const cardClass = 'rounded-[26px] border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/35 p-5 md:p-6 shadow-[0_26px_60px_-40px_rgba(15,23,42,0.5)]';
const sectionChipClass = 'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-[11px] font-semibold tracking-[0.08em]';

const serviceLabels = {
    seo_tong_the: 'SEO tổng thể',
    backlink: 'Backlink',
    audit: 'Audit',
    content: 'Content',
    website_care: 'Website Care',
    khac: 'Khác',
};

const formatCurrency = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;

const growthTone = (value) => {
    const numeric = Number(value || 0);
    if (numeric > 0) return 'text-emerald-600';
    if (numeric < 0) return 'text-rose-600';
    return 'text-slate-400';
};

const signedPercent = (value) => {
    const numeric = Number(value || 0);
    return `${numeric > 0 ? '+' : ''}${numeric.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
};

function SectionChip({ children, tone = 'slate' }) {
    const toneClass = {
        cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700',
        violet: 'border-violet-200 bg-violet-50 text-violet-700',
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        amber: 'border-amber-200 bg-amber-50 text-amber-700',
        slate: 'border-slate-200 bg-slate-50 text-slate-600',
    }[tone] || 'border-slate-200 bg-slate-50 text-slate-600';

    return (
        <span className={`${sectionChipClass} ${toneClass}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
            {children}
        </span>
    );
}

function SectionHeader({ title, description, chip, tone = 'slate' }) {
    return (
        <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
                <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                <p className="mt-1 text-sm text-text-muted">{description}</p>
            </div>
            {chip ? <SectionChip tone={tone}>{chip}</SectionChip> : null}
        </div>
    );
}

export default function Dashboard(props) {
    const [summary, setSummary] = useState({});
    const [report, setReport] = useState({});
    const [reportFilters, setReportFilters] = useState({ from: '', to: '' });
    const [draftReportFilters, setDraftReportFilters] = useState({ from: '', to: '' });
    const [availablePeriod, setAvailablePeriod] = useState({ from: '', to: '' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const fetchWithFallback = async (primaryUrl, fallbackUrl = null, params = {}) => {
                    try {
                        const primaryRes = await axios.get(primaryUrl, { params });
                        return primaryRes.data || {};
                    } catch {
                        if (!fallbackUrl) {
                            return {};
                        }

                        try {
                            const fallbackRes = await axios.get(fallbackUrl, { params });
                            return fallbackRes.data || {};
                        } catch {
                            return {};
                        }
                    }
                };

                const reportParams = {
                    ...(reportFilters.from ? { from: reportFilters.from } : {}),
                    ...(reportFilters.to ? { to: reportFilters.to } : {}),
                };

                const [summaryData, reportData] = await Promise.all([
                    fetchWithFallback('/dashboard/summary-data', '/api/v1/public/summary'),
                    fetchWithFallback('/dashboard/report-data', '/api/v1/reports/dashboard-summary', reportParams),
                ]);

                setSummary(summaryData);
                setReport(reportData);
                const nextAvailablePeriod = {
                    from: reportData?.period?.available_from || '',
                    to: reportData?.period?.available_to || '',
                };
                setAvailablePeriod(nextAvailablePeriod);
                setDraftReportFilters((prev) => ({
                    from: prev.from || reportData?.period?.current_from || '',
                    to: prev.to || reportData?.period?.current_to || '',
                }));
            } catch {
                // ignore dashboard bootstrap errors
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [reportFilters.from, reportFilters.to]);

    const serviceBreakdown = useMemo(() => {
        const palette = ['#3B82F6', '#34D399', '#F2C94C', '#F43F5E', '#8B5CF6', '#F97316', '#14B8A6'];
        const source = report.product_breakdown || report.service_breakdown || [];
        return source.map((item, index) => ({
            label: serviceLabels[item.label] || item.label || 'Khác',
            value: Number(item.value || 0),
            color: palette[index % palette.length],
        }));
    }, [report.product_breakdown, report.service_breakdown]);

    const employeeSummary = report.employee_summary || {};
    const staffSales = report.staff_sales_breakdown || [];
    const customerGrowth = report.customer_growth || [];
    const employeeStats = report.employee_stats || [];
    const roleBreakdown = useMemo(() => {
        const palette = ['#0EA5E9', '#10B981', '#F59E0B', '#A855F7', '#F43F5E'];
        return (report.employee_role_breakdown || []).map((item, index) => ({
            ...item,
            color: palette[index % palette.length],
        }));
    }, [report.employee_role_breakdown]);
    const activities = summary.recent_activities || [];
    const overloadList = summary.workload_overload || [];
    const periodRevenueTotal = Number(report.period_revenue_total || 0);

    const currentRevenue = useMemo(() => {
        const fromStaff = staffSales.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
        return fromStaff > 0 ? fromStaff : periodRevenueTotal;
    }, [periodRevenueTotal, staffSales]);

    const customerTotals = useMemo(() => ({
        created: customerGrowth.reduce((sum, item) => sum + Number(item.created_clients || 0), 0),
        firstPurchase: customerGrowth.reduce((sum, item) => sum + Number(item.first_purchase || 0), 0),
        repeatPurchase: customerGrowth.reduce((sum, item) => sum + Number(item.repeat_purchase || 0), 0),
    }), [customerGrowth]);

    const stats = useMemo(() => (
        [
            {
                label: 'Dự án đang triển khai',
                value: String(summary.projects_in_progress ?? 0),
                note: 'Theo dõi theo trạng thái dự án',
            },
            {
                label: 'Công việc quá hạn',
                value: String(summary.tasks_overdue ?? 0),
                note: 'Ưu tiên xử lý trong ngày',
            },
            {
                label: 'Nhân sự đang hoạt động',
                value: String(employeeSummary.active ?? 0),
                note: `${employeeSummary.total ?? 0} tài khoản thuộc khối vận hành`,
            },
            {
                label: 'Doanh thu lũy kế',
                value: formatCurrency(currentRevenue),
                note: report.period?.current_label || 'Toàn thời gian',
            },
        ]
    ), [currentRevenue, employeeSummary.active, employeeSummary.total, report.period?.current_label, summary.projects_in_progress, summary.tasks_overdue]);

    const applyReportFilters = () => {
        setReportFilters({
            from: draftReportFilters.from || '',
            to: draftReportFilters.to || '',
        });
    };

    const viewAllTime = () => {
        setReportFilters({
            from: availablePeriod.from || '',
            to: availablePeriod.to || '',
        });
        setDraftReportFilters({
            from: availablePeriod.from || '',
            to: availablePeriod.to || '',
        });
    };

    const resetReportFilters = () => {
        setReportFilters({ from: '', to: '' });
        setDraftReportFilters({
            from: report?.period?.current_from || '',
            to: report?.period?.current_to || '',
        });
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Tổng quan hệ thống"
            description="Tập trung các chỉ số quan trọng của doanh nghiệp trong một màn hình: cơ cấu dịch vụ, doanh số nhân viên, tăng trưởng khách hàng và hiệu suất nhân sự."
            stats={stats}
        >
            <div className="mb-5 flex flex-wrap items-center gap-2">
                <SectionChip tone="violet">Dashboard điều hành</SectionChip>
                <SectionChip tone="cyan">{report.period?.current_label || 'Kỳ hiện tại'}</SectionChip>
                <SectionChip tone="emerald">{staffSales.length} nhân sự có doanh số</SectionChip>
                {loading ? <SectionChip tone="amber">Đang đồng bộ dữ liệu</SectionChip> : null}
            </div>

            <FilterToolbar enableSearch
                title="Bộ lọc thời gian"
                description="Mặc định trang chủ hiển thị dữ liệu của tháng hiện tại. Bạn có thể thay đổi khoảng thời gian để quan sát chi tiết hơn."
                onSubmitFilters={applyReportFilters}
            >
                <div className={FILTER_GRID_RESPONSIVE}>
                    <FilterField label="Từ ngày" hint={availablePeriod.from ? `Dữ liệu từ ${availablePeriod.from}` : ''}>
                        <input
                            type="date"
                            className={filterControlClass}
                            value={draftReportFilters.from}
                            onChange={(event) => setDraftReportFilters((prev) => ({ ...prev, from: event.target.value }))}
                        />
                    </FilterField>
                    <FilterField label="Đến ngày" hint={availablePeriod.to ? `Dữ liệu đến ${availablePeriod.to}` : ''}>
                        <input
                            type="date"
                            className={filterControlClass}
                            value={draftReportFilters.to}
                            onChange={(event) => setDraftReportFilters((prev) => ({ ...prev, to: event.target.value }))}
                        />
                    </FilterField>
                    <FilterActionGroup className={FILTER_GRID_SUBMIT_ROW}>
                        <button type="submit" className={FILTER_SUBMIT_PRIMARY_BUTTON_CLASS}>
                            Áp dụng
                        </button>
                        <button type="button" onClick={viewAllTime} className={FILTER_SUBMIT_BUTTON_CLASS}>
                            Toàn thời gian
                        </button>
                        <button type="button" onClick={resetReportFilters} className={FILTER_SUBMIT_BUTTON_CLASS}>
                            Tháng hiện tại
                        </button>
                    </FilterActionGroup>
                </div>
            </FilterToolbar>

            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
                <section className={cardClass}>
                    <SectionHeader
                        title="Biểu đồ tròn cơ cấu dịch vụ"
                        description="Hiển thị tỷ trọng dự án theo nhóm dịch vụ đang vận hành trên hệ thống."
                        chip="Theo danh mục"
                        tone="violet"
                    />
                    <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                        {serviceBreakdown.length === 0 ? (
                            <p className="text-sm text-text-muted">Chưa có dữ liệu cơ cấu dịch vụ.</p>
                        ) : (
                            <DonutChart data={serviceBreakdown} centerLabel="Dịch vụ" layout="horizontal" size={220} thickness={30} />
                        )}
                    </div>
                </section>

                <section className={cardClass}>
                    <SectionHeader
                        title="Biểu đồ doanh số nhân viên"
                        description={`So sánh doanh số ký, thu tiền và số hợp đồng của từng nhân sự trong ${report.period?.current_label?.toLowerCase() || 'kỳ hiện tại'}.`}
                        chip="Dữ liệu theo người"
                        tone="cyan"
                    />
                    <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-2.5">
                        <EmployeeRevenueBars data={staffSales} />
                    </div>
                </section>
            </div>

            <section className={`${cardClass} mt-5`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-900">Tăng trưởng khách hàng</h3>
                        <p className="mt-1 text-sm text-text-muted">Theo dõi mua lần đầu, mua lại và khách hàng tạo mới trong 12 tháng gần nhất.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <div className="rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-600">Tạo mới</div>
                            <div className="mt-0.5 text-lg font-bold text-slate-900">{customerTotals.created}</div>
                        </div>
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Mua đầu</div>
                            <div className="mt-0.5 text-lg font-bold text-slate-900">{customerTotals.firstPurchase}</div>
                        </div>
                        <div className="rounded-xl border border-cyan-100 bg-cyan-50/70 px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-600">Mua lại</div>
                            <div className="mt-0.5 text-lg font-bold text-slate-900">{customerTotals.repeatPurchase}</div>
                        </div>
                    </div>
                </div>
                <div className="mt-4">
                    <CustomerGrowthChart data={customerGrowth} />
                </div>
            </section>

            <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.15fr)]">
                <section className={cardClass}>
                    <SectionHeader
                        title="Thống kê nhân sự"
                        description="Tổng hợp headcount để đối chiếu nhanh với bảng hiệu suất bên cạnh."
                        chip="Nhân sự toàn hệ thống"
                        tone="emerald"
                    />
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-4">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">Tổng nhân sự</div>
                            <div className="mt-2 text-3xl font-semibold text-slate-900">{employeeSummary.total ?? 0}</div>
                        </div>
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-4">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Đang hoạt động</div>
                            <div className="mt-2 text-3xl font-semibold text-slate-900">{employeeSummary.active ?? 0}</div>
                        </div>
                        <div className="rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-4">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-700">Quản lý</div>
                            <div className="mt-2 text-3xl font-semibold text-slate-900">{employeeSummary.managers ?? 0}</div>
                        </div>
                        <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-4">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">Nhân viên</div>
                            <div className="mt-2 text-3xl font-semibold text-slate-900">{employeeSummary.staff ?? 0}</div>
                        </div>
                    </div>
                    <div className="mt-5 rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-4">
                        {roleBreakdown.length === 0 ? (
                            <p className="text-sm text-text-muted">Chưa có dữ liệu phân bổ vai trò.</p>
                        ) : (
                            <DonutChart data={roleBreakdown} centerLabel="Vai trò" layout="vertical" size={196} thickness={30} />
                        )}
                    </div>
                </section>

                <section className={cardClass}>
                    <SectionHeader
                        title="Bảng thống kê nhân viên"
                        description="Bảng tổng hợp doanh thu, tỷ trọng, tăng giảm và các chỉ số CRM theo từng nhân sự."
                        chip="So sánh theo tháng"
                        tone="amber"
                    />
                    <div className="mt-5 overflow-x-auto rounded-[22px] border border-slate-200/80 bg-white">
                        <table className="min-w-[980px] divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-900">
                                <tr>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-100">Nhân viên</th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-100">Doanh thu</th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-100">Tỷ trọng (%)</th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-100">% Tăng giảm</th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-100">% Cùng kỳ</th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-100">Khách hàng mới</th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-100">Số cơ hội mới</th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-100">Số hợp đồng mới</th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-100">Hoạt động</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {loading && employeeStats.length === 0 ? (
                                    <tr>
                                        <td className="px-4 py-8 text-center text-text-muted" colSpan={9}>Đang tải thống kê nhân sự...</td>
                                    </tr>
                                ) : null}
                                {!loading && employeeStats.length === 0 ? (
                                    <tr>
                                        <td className="px-4 py-8 text-center text-text-muted" colSpan={9}>Chưa có dữ liệu thống kê nhân sự.</td>
                                    </tr>
                                ) : null}
                                {employeeStats.map((item) => (
                                    <tr key={item.staff_id} className="odd:bg-white even:bg-slate-50/45 hover:bg-cyan-50/50">
                                        <td className="px-4 py-3">
                                            <div className="font-semibold text-slate-900">{item.staff_name}</div>
                                            <div className="text-xs text-slate-500">{item.role_label} • {item.department || '—'}</div>
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(item.revenue)}</td>
                                        <td className="px-4 py-3 text-right text-slate-700">{Number(item.share_percent || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</td>
                                        <td className={`px-4 py-3 text-right font-semibold ${growthTone(item.growth_percent)}`}>{signedPercent(item.growth_percent)}</td>
                                        <td className={`px-4 py-3 text-right font-semibold ${growthTone(item.same_period_percent)}`}>{signedPercent(item.same_period_percent)}</td>
                                        <td className="px-4 py-3 text-right text-slate-700">{item.new_clients}</td>
                                        <td className="px-4 py-3 text-right text-slate-700">{item.new_opportunities}</td>
                                        <td className="px-4 py-3 text-right text-slate-700">{item.new_contracts}</td>
                                        <td className="px-4 py-3 text-right text-slate-700">{item.active_tasks}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
                <section className={cardClass}>
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold text-slate-900">Hoạt động gần đây</h3>
                        <SectionChip tone="slate">Log hệ thống</SectionChip>
                    </div>
                    <div className="mt-4 space-y-4">
                        {activities.length === 0 ? (
                            <p className="text-sm text-text-muted">Chưa có hoạt động mới.</p>
                        ) : activities.map((item, index) => (
                            <div key={`${item.time}-${index}`} className="flex items-start gap-3 rounded-xl border border-slate-200/70 bg-white px-3.5 py-3">
                                <div className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                                <div>
                                    <p className="text-sm text-slate-800"><span className="font-semibold">{item.user}</span> {item.content}</p>
                                    <p className="mt-1 text-xs text-text-muted">{item.time}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className={cardClass}>
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold text-slate-900">Nhân sự đang quá tải</h3>
                        <SectionChip tone="amber">Theo công việc xử lý</SectionChip>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {overloadList.length === 0 ? (
                            <p className="text-sm text-text-muted sm:col-span-2">Chưa có nhân sự quá tải.</p>
                        ) : overloadList.map((item) => (
                            <div key={item.user_id} className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                                <div className="font-semibold text-slate-900">{item.name}</div>
                                <div className="mt-1 text-xs text-slate-500">{item.role}</div>
                                <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                                    <span>Công việc đang xử lý</span>
                                    <span className="font-semibold text-amber-600">{item.active_tasks}</span>
                                </div>
                                <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
                                    <span>Công việc quá hạn</span>
                                    <span className="font-semibold text-rose-600">{item.overdue_tasks}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </PageContainer>
    );
}
