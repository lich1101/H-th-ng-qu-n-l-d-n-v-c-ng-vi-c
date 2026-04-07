import React, { useEffect, useState } from 'react';
import axios from 'axios';
import DonutChart from '@/Components/DonutChart';
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
import { useToast } from '@/Contexts/ToastContext';

const formatCurrency = (value) => {
    const num = Number(value || 0);
    return `${num.toLocaleString('vi-VN')} VNĐ`;
};

const formatCompactCurrency = (value) => {
    const num = Number(value || 0);
    if (num >= 1000000000) return `${(num / 1000000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
    if (num >= 1000000) return `${(num / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu`;
    return `${num.toLocaleString('vi-VN')} đ`;
};

const formatPercent = (value) => {
    const num = Number(value || 0);
    return `${num.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
};

const formatDate = (value) => {
    if (!value) return '—';
    const [year, month, day] = String(value).split('-');
    if (!year || !month || !day) return value;
    return `${day}-${month}-${year}`;
};

const formatDateInput = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getCurrentMonthRange = () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
        from: formatDateInput(from),
        to: formatDateInput(to),
    };
};

const initials = (name) => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'NV';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
};

function SummaryTile({ label, value, note }) {
    return (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
            <p className="text-xs uppercase tracking-[0.16em] text-text-subtle">{label}</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
            {note ? <p className="mt-1 text-xs text-text-muted">{note}</p> : null}
        </div>
    );
}

function RevenueStaffBreakdown({ data = [] }) {
    const [hoveredSegment, setHoveredSegment] = useState(null);
    const series = [
        { key: 'revenue', label: 'Doanh thu', color: 'bg-sky-500' },
        { key: 'cashflow', label: 'Dòng tiền', color: 'bg-emerald-500' },
        { key: 'debt', label: 'Công nợ', color: 'bg-amber-400' },
        { key: 'costs', label: 'Chi phí', color: 'bg-rose-400' },
    ];

    return (
        <div className="flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-base font-semibold text-slate-900">Doanh thu theo nhân viên</h3>
                    <p className="mt-1 text-xs text-text-muted">Biểu đồ cột ngang lấy theo nhân viên thu hợp đồng, gồm doanh thu, dòng tiền, công nợ và chi phí.</p>
                </div>
                <div className="flex max-w-[360px] flex-wrap items-center justify-end gap-2">
                    {series.map((item) => (
                        <span key={item.key} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                            <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
                            {item.label}
                        </span>
                    ))}
                </div>
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200/70">
                <table className="min-w-[920px] text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-text-subtle">
                            <th className="py-2.5 pr-3">Nhân viên</th>
                            <th className="py-2.5 px-3">Biểu đồ</th>
                            <th className="py-2.5 px-3">Doanh thu</th>
                            <th className="py-2.5 px-3">Dòng tiền</th>
                            <th className="py-2.5 px-3">Công nợ</th>
                            <th className="py-2.5 px-3">Chi phí</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((item) => {
                            const rowSeries = series.map((seriesItem) => ({
                                ...seriesItem,
                                value: Number(item[seriesItem.key] || 0),
                            }));
                            const total = rowSeries.reduce((sum, seriesItem) => sum + seriesItem.value, 0);

                            return (
                            <tr key={`${item.staff_id || 'unassigned'}-${item.staff_name}`} className="border-b border-slate-100 last:border-b-0">
                                <td className="py-3 pr-3">
                                    <div className="flex items-center gap-3">
                                        {item.avatar_url ? (
                                            <img
                                                src={item.avatar_url}
                                                alt={item.staff_name}
                                                className="h-10 w-10 rounded-xl object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-xs font-semibold text-sky-700">
                                                {initials(item.staff_name)}
                                            </div>
                                        )}
                                        <div>
                                            <p className="font-semibold text-slate-900">{item.staff_name}</p>
                                            <p className="text-xs text-text-muted">{item.contracts_count || 0} hợp đồng</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-3 py-3">
                                    <div className="min-w-[260px]">
                                        <div className="relative">
                                            {hoveredSegment?.staffKey === `${item.staff_id || 'unassigned'}-${item.staff_name}` ? (
                                                <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-xl bg-slate-900/95 px-3 py-2 text-center text-[11px] text-white shadow-xl">
                                                    <div className="font-semibold">{hoveredSegment.staffName}</div>
                                                    <div>
                                                        {hoveredSegment.label}: {formatCurrency(hoveredSegment.value)}
                                                    </div>
                                                </div>
                                            ) : null}
                                            <div className="flex h-11 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-100">
                                                {total > 0 ? rowSeries.map((seriesItem) => (
                                                    <div
                                                        key={seriesItem.key}
                                                        className={`${seriesItem.color} h-full transition-all`}
                                                        style={{ width: `${(seriesItem.value / total) * 100}%` }}
                                                        onMouseEnter={() => setHoveredSegment({
                                                            staffKey: `${item.staff_id || 'unassigned'}-${item.staff_name}`,
                                                            staffName: item.staff_name,
                                                            label: seriesItem.label,
                                                            value: seriesItem.value,
                                                        })}
                                                        onMouseLeave={() => setHoveredSegment((current) => (
                                                            current?.staffKey === `${item.staff_id || 'unassigned'}-${item.staff_name}` && current?.label === seriesItem.label
                                                                ? null
                                                                : current
                                                        ))}
                                                    />
                                                )) : (
                                                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-text-muted">
                                                        Chưa có doanh thu
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-2 text-[11px] text-text-muted">
                                            Tổng nhóm màu: {formatCompactCurrency(total)}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-3 py-3 font-semibold text-slate-900">{formatCompactCurrency(item.revenue || 0)}</td>
                                <td className="px-3 py-3 font-semibold text-slate-900">{formatCompactCurrency(item.cashflow || 0)}</td>
                                <td className="px-3 py-3 font-semibold text-slate-900">{formatCompactCurrency(item.debt || 0)}</td>
                                <td className="px-3 py-3 font-semibold text-slate-900">{formatCompactCurrency(item.costs || 0)}</td>
                            </tr>
                            );
                        })}
                        {data.length === 0 && (
                            <tr>
                                <td colSpan={6} className="py-6 text-center text-sm text-text-muted">
                                    Chưa có dữ liệu nhân viên trong khoảng thời gian này.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function CompanyRevenueReport(props) {
    const toast = useToast();
    const [filters, setFilters] = useState(() => ({
        ...getCurrentMonthRange(),
        target_revenue: '',
    }));
    const [draftFilters, setDraftFilters] = useState(() => ({
        ...getCurrentMonthRange(),
        target_revenue: '',
    }));
    const [report, setReport] = useState({});
    const [loading, setLoading] = useState(true);
    const [availableRange, setAvailableRange] = useState({ from: '', to: '' });

    const fetchReport = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/reports/company', {
                params: {
                    from: filters.from || undefined,
                    to: filters.to || undefined,
                    target_revenue: filters.target_revenue || undefined,
                },
            });
            const payload = res.data || {};
            const nextAvailableRange = {
                from: payload?.period?.available_from || '',
                to: payload?.period?.available_to || '',
            };
            setReport(payload);
            setAvailableRange(nextAvailableRange);
            setDraftFilters((prev) => ({
                ...prev,
                from: prev.from || nextAvailableRange.from,
                to: prev.to || nextAvailableRange.to,
            }));
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được báo cáo doanh thu công ty.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.from, filters.to, filters.target_revenue]);

    const periodTotals = report.period_totals || {};
    const rows = report.daily_rows || [];
    const productBreakdown = (report.product_breakdown || []).map((item) => ({
        label: item.label,
        value: Number(item.value || 0),
    }));
    const staffBreakdown = report.staff_breakdown || [];
    const periodLabel = availableRange.from && availableRange.to
        ? `${formatDate(filters.from || availableRange.from)} đến ${formatDate(filters.to || availableRange.to)}`
        : 'Toàn thời gian';

    const summaryTiles = [
        {
            label: 'Doanh thu trong kỳ',
            value: formatCurrency(periodTotals.revenue),
            note: periodTotals.target_revenue
                ? `Đạt ${formatPercent(periodTotals.target_rate)} chỉ tiêu`
                : `Khoảng lọc: ${periodLabel}`,
        },
        {
            label: 'Dòng tiền trong kỳ',
            value: formatCurrency(periodTotals.cashflow),
            note: 'Tổng thanh toán của các hợp đồng trong giai đoạn đang lọc',
        },
        {
            label: 'Công nợ còn lại',
            value: formatCurrency(periodTotals.debt),
            note: 'Tổng nợ chưa thanh toán của các hợp đồng đang xem',
        },
        {
            label: 'Chi phí phát sinh',
            value: formatCurrency(periodTotals.costs),
            note: `${periodTotals.contracts_total || 0} hợp đồng đã duyệt trong khoảng lọc`,
        },
    ];

    const applyFilters = () => {
        setFilters({
            from: draftFilters.from || '',
            to: draftFilters.to || '',
            target_revenue: draftFilters.target_revenue || '',
        });
    };

    const resetFilters = () => {
        const next = {
            from: availableRange.from || '',
            to: availableRange.to || '',
            target_revenue: '',
        };
        setDraftFilters(next);
        setFilters(next);
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Báo cáo doanh thu công ty"
            description="Xem toàn bộ doanh thu công ty theo thời gian, sản phẩm và nhân viên thu hợp đồng."
            stats={[]}
        >
            <FilterToolbar enableSearch
                title="Bộ lọc thời gian"
                description="Khi vừa vào trang, hệ thống mặc định lọc đúng tháng hiện tại. Bấm “Toàn thời gian” nếu bạn muốn xem toàn bộ dữ liệu."
                onSubmitFilters={applyFilters}
            >
                <div className={FILTER_GRID_RESPONSIVE}>
                    <FilterField label="Từ ngày">
                        <input
                            type="date"
                            className={filterControlClass}
                            value={draftFilters.from}
                            onChange={(e) => setDraftFilters((prev) => ({ ...prev, from: e.target.value }))}
                        />
                    </FilterField>
                    <FilterField label="Đến ngày">
                        <input
                            type="date"
                            className={filterControlClass}
                            value={draftFilters.to}
                            onChange={(e) => setDraftFilters((prev) => ({ ...prev, to: e.target.value }))}
                        />
                    </FilterField>
                    <FilterField label="Chỉ tiêu doanh thu (VNĐ)">
                        <input
                            type="number"
                            min="0"
                            className={filterControlClass}
                            value={draftFilters.target_revenue}
                            onChange={(e) => setDraftFilters((prev) => ({ ...prev, target_revenue: e.target.value }))}
                        />
                    </FilterField>
                    <FilterActionGroup className={FILTER_GRID_SUBMIT_ROW}>
                        <button type="submit" className={FILTER_SUBMIT_PRIMARY_BUTTON_CLASS}>
                            Áp dụng
                        </button>
                        <button type="button" onClick={resetFilters} className={FILTER_SUBMIT_BUTTON_CLASS}>
                            Toàn thời gian
                        </button>
                    </FilterActionGroup>
                </div>
            </FilterToolbar>

            <div className="mb-6 grid gap-4 lg:grid-cols-4">
                {summaryTiles.map((tile) => (
                    <SummaryTile
                        key={tile.label}
                        label={tile.label}
                        value={tile.value}
                        note={tile.note}
                    />
                ))}
            </div>

            <div className="mb-6 grid gap-5 xl:grid-cols-[minmax(380px,0.9fr)_minmax(520px,1.1fr)]">
                <div className="flex h-full min-h-[640px] flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-base font-semibold text-slate-900">Doanh thu theo sản phẩm</h3>
                            <p className="mt-1 text-xs text-text-muted">Biểu đồ tròn được tính theo doanh thu hợp đồng trong đúng khoảng thời gian đang lọc.</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            {periodLabel}
                        </span>
                    </div>
                    <div className="mt-4 flex flex-1 items-center justify-center">
                        <div className="w-full max-w-[560px]">
                            <DonutChart data={productBreakdown} size={300} thickness={30} centerLabel="Sản phẩm" layout="vertical" />
                        </div>
                    </div>
                </div>

                <div className="h-[640px] overflow-hidden">
                    <RevenueStaffBreakdown data={staffBreakdown} />
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-card overflow-hidden">
                <div className="flex flex-col gap-2 border-b border-slate-200/80 px-5 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h3 className="text-base font-semibold text-slate-900">Báo cáo doanh thu công ty theo ngày</h3>
                        <p className="mt-1 text-sm text-text-muted">Mỗi ngày được tính theo các hợp đồng đã duyệt trong ngày đó: doanh thu, dòng tiền, công nợ và chi phí phát sinh.</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {periodLabel}
                    </span>
                </div>

                <div className="w-full overflow-x-auto">
                    <table className="w-full min-w-[1280px] text-sm">
                        <thead>
                            <tr className="bg-slate-100 text-xs uppercase tracking-wider text-text-subtle">
                                <th className="px-3 py-3 text-left border-b border-slate-200">Ngày</th>
                                <th className="px-3 py-3 text-right border-b border-slate-200">Doanh thu</th>
                                <th className="px-3 py-3 text-right border-b border-slate-200">Dòng tiền</th>
                                <th className="px-3 py-3 text-right border-b border-slate-200">Công nợ</th>
                                <th className="px-3 py-3 text-right border-b border-slate-200">Chi phí</th>
                                <th className="px-3 py-3 text-right border-b border-slate-200">Doanh thu tích lũy</th>
                                <th className="px-3 py-3 text-right border-b border-slate-200">Dòng tiền tích lũy</th>
                                <th className="px-3 py-3 text-right border-b border-slate-200">Công nợ tích lũy</th>
                                <th className="px-3 py-3 text-right border-b border-slate-200">Chi phí tích lũy</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td colSpan={9} className="px-4 py-6 text-center text-sm text-text-muted">
                                        Đang tải dữ liệu...
                                    </td>
                                </tr>
                            )}
                            {!loading &&
                                rows.map((row) => (
                                    <tr key={row.date} className="border-b border-slate-100">
                                        <td className="px-3 py-2 text-sm text-slate-700 whitespace-nowrap">{formatDate(row.date)}</td>
                                        <td className="px-3 py-2 text-right">{Number(row.revenue_daily || 0).toLocaleString('vi-VN')}</td>
                                        <td className="px-3 py-2 text-right">{Number(row.cashflow_daily || 0).toLocaleString('vi-VN')}</td>
                                        <td className="px-3 py-2 text-right">{Number(row.debt_daily || 0).toLocaleString('vi-VN')}</td>
                                        <td className="px-3 py-2 text-right">{Number(row.costs_daily || 0).toLocaleString('vi-VN')}</td>
                                        <td className="px-3 py-2 text-right">{Number(row.revenue_cumulative || 0).toLocaleString('vi-VN')}</td>
                                        <td className="px-3 py-2 text-right">{Number(row.cashflow_cumulative || 0).toLocaleString('vi-VN')}</td>
                                        <td className="px-3 py-2 text-right">{Number(row.debt_cumulative || 0).toLocaleString('vi-VN')}</td>
                                        <td className="px-3 py-2 text-right">{Number(row.costs_cumulative || 0).toLocaleString('vi-VN')}</td>
                                    </tr>
                                ))}
                            {!loading && rows.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="px-4 py-6 text-center text-sm text-text-muted">
                                        Chưa có dữ liệu báo cáo.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </PageContainer>
    );
}
