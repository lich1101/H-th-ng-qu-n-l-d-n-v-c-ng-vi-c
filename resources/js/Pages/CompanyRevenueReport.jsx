import React, { useEffect, useState } from 'react';
import axios from 'axios';
import DonutChart from '@/Components/DonutChart';
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
    const maxSigned = Math.max(...data.map((item) => Number(item.signed_revenue || 0)), 1);
    const maxSettled = Math.max(...data.map((item) => Number(item.settled_revenue || 0)), 1);
    const maxCollected = Math.max(...data.map((item) => Number(item.collected_revenue || 0)), 1);

    return (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-base font-semibold text-slate-900">Doanh thu theo nhân viên</h3>
                    <p className="mt-1 text-xs text-text-muted">Nhân viên thu theo hợp đồng trong khoảng thời gian đang lọc.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {data.length} nhân sự
                </span>
            </div>

            <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.14em] text-text-subtle">
                            <th className="py-2.5 pr-3">Nhân viên</th>
                            <th className="py-2.5 px-3">Doanh số ký</th>
                            <th className="py-2.5 px-3">Doanh số quyết toán</th>
                            <th className="py-2.5 px-3">Thực thu</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((item) => (
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
                                    <div className="relative overflow-hidden rounded-xl bg-sky-50 px-3 py-2">
                                        <div
                                            className="absolute inset-y-0 left-0 rounded-xl bg-sky-400/70"
                                            style={{ width: `${(Number(item.signed_revenue || 0) / maxSigned) * 100}%` }}
                                        />
                                        <span className="relative font-semibold text-slate-900">{formatCompactCurrency(item.signed_revenue)}</span>
                                    </div>
                                </td>
                                <td className="px-3 py-3">
                                    <div className="relative overflow-hidden rounded-xl bg-amber-50 px-3 py-2">
                                        <div
                                            className="absolute inset-y-0 left-0 rounded-xl bg-amber-400/75"
                                            style={{ width: `${(Number(item.settled_revenue || 0) / maxSettled) * 100}%` }}
                                        />
                                        <span className="relative font-semibold text-slate-900">{formatCompactCurrency(item.settled_revenue)}</span>
                                    </div>
                                </td>
                                <td className="px-3 py-3">
                                    <div className="relative overflow-hidden rounded-xl bg-emerald-50 px-3 py-2">
                                        <div
                                            className="absolute inset-y-0 left-0 rounded-xl bg-emerald-400/75"
                                            style={{ width: `${(Number(item.collected_revenue || 0) / maxCollected) * 100}%` }}
                                        />
                                        <span className="relative font-semibold text-slate-900">{formatCompactCurrency(item.collected_revenue)}</span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {data.length === 0 && (
                            <tr>
                                <td colSpan={4} className="py-6 text-center text-sm text-text-muted">
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
    const [filters, setFilters] = useState({
        from: '',
        to: '',
        target_revenue: '',
    });
    const [draftFilters, setDraftFilters] = useState({
        from: '',
        to: '',
        target_revenue: '',
    });
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
            note: `Khoảng lọc: ${periodLabel}`,
        },
        {
            label: 'Tiền thu trong kỳ',
            value: formatCurrency(periodTotals.paid),
            note: `Công nợ còn lại ${formatCompactCurrency(periodTotals.debt)}`,
        },
        {
            label: 'Lợi nhuận tạm tính',
            value: formatCurrency(periodTotals.net_revenue),
            note: `Chi phí ${formatCompactCurrency(periodTotals.costs)}`,
        },
        {
            label: 'Hợp đồng trong kỳ',
            value: String(periodTotals.contracts_total || 0),
            note: 'Đã duyệt trong giai đoạn đang xem',
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
            <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <h3 className="text-base font-semibold text-slate-900">Bộ lọc thời gian</h3>
                        <p className="mt-1 text-sm text-text-muted">
                            Khi vừa vào trang, hệ thống tự lấy toàn bộ dữ liệu từ đầu đến cuối để bạn không bị lệch kỳ.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-text-subtle">Từ ngày</label>
                            <input
                                type="date"
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                value={draftFilters.from}
                                onChange={(e) => setDraftFilters((prev) => ({ ...prev, from: e.target.value }))}
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-text-subtle">Đến ngày</label>
                            <input
                                type="date"
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                value={draftFilters.to}
                                onChange={(e) => setDraftFilters((prev) => ({ ...prev, to: e.target.value }))}
                            />
                        </div>
                        <div className="flex min-w-[220px] flex-col gap-1">
                            <label className="text-xs font-semibold text-text-subtle">Chỉ tiêu doanh thu (VNĐ)</label>
                            <input
                                type="number"
                                min="0"
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                value={draftFilters.target_revenue}
                                onChange={(e) => setDraftFilters((prev) => ({ ...prev, target_revenue: e.target.value }))}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={applyFilters}
                            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-card"
                        >
                            Áp dụng
                        </button>
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                        >
                            Toàn thời gian
                        </button>
                        <button
                            type="button"
                            onClick={fetchReport}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                        >
                            Làm mới
                        </button>
                    </div>
                </div>
            </div>

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

            <div className="mb-6 grid gap-5 xl:grid-cols-[0.9fr,1.3fr]">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-base font-semibold text-slate-900">Doanh thu theo sản phẩm</h3>
                            <p className="mt-1 text-xs text-text-muted">Biểu đồ tròn được tính theo doanh thu hợp đồng trong đúng khoảng thời gian đang lọc.</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            {periodLabel}
                        </span>
                    </div>
                    <div className="mt-4">
                        <DonutChart data={productBreakdown} size={220} thickness={26} centerLabel="Sản phẩm" />
                    </div>
                </div>

                <RevenueStaffBreakdown data={staffBreakdown} />
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-card overflow-hidden">
                <div className="flex flex-col gap-2 border-b border-slate-200/80 px-5 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h3 className="text-base font-semibold text-slate-900">Báo cáo doanh thu công ty theo ngày</h3>
                        <p className="mt-1 text-sm text-text-muted">Bảng chi tiết vẫn giữ đủ cấu trúc cột để đối chiếu phát sinh, thu hồi công nợ và tiến độ theo từng ngày.</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {periodLabel}
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-[1900px] text-sm">
                        <thead>
                            <tr className="bg-slate-100 text-xs uppercase tracking-wider text-text-subtle">
                                <th rowSpan={3} className="px-3 py-3 text-left border-b border-slate-200">
                                    Ngày
                                </th>
                                <th colSpan={15} className="px-3 py-3 text-center border-b border-slate-200">
                                    Thông số kết quả hoạt động
                                </th>
                                <th colSpan={5} className="px-3 py-3 text-center border-b border-slate-200">
                                    Thông số hiệu quả hoạt động
                                </th>
                            </tr>
                            <tr className="bg-slate-50 text-xs text-text-subtle border-b border-slate-200">
                                <th colSpan={2} className="px-3 py-2 text-center">Doanh thu</th>
                                <th colSpan={2} className="px-3 py-2 text-center">Số tiền đã thu được</th>
                                <th colSpan={3} className="px-3 py-2 text-center">Công nợ phát sinh &amp; tình trạng thu hồi</th>
                                <th colSpan={2} className="px-3 py-2 text-center">Công nợ tồn tháng trước &amp; tình trạng thu hồi</th>
                                <th rowSpan={2} className="px-3 py-2 text-center border-l border-slate-200">Tích lũy tiền về trong kỳ</th>
                                <th rowSpan={2} className="px-3 py-2 text-center">Tổng số tiền thu được theo ngày</th>
                                <th colSpan={4} className="px-3 py-2 text-center border-l border-slate-200">Hệ thống đại lý</th>
                                <th colSpan={5} className="px-3 py-2 text-center border-l border-slate-200">Hệ thống doanh thu &amp; công nợ</th>
                            </tr>
                            <tr className="bg-slate-50 text-xs text-text-subtle border-b border-slate-200">
                                <th className="px-3 py-2 text-center">Tích lũy</th>
                                <th className="px-3 py-2 text-center">Phát sinh</th>
                                <th className="px-3 py-2 text-center">Tích lũy</th>
                                <th className="px-3 py-2 text-center">Phát sinh</th>
                                <th className="px-3 py-2 text-center">Tích lũy</th>
                                <th className="px-3 py-2 text-center">Phát sinh</th>
                                <th className="px-3 py-2 text-center">Đã thu</th>
                                <th className="px-3 py-2 text-center">Nợ tồn</th>
                                <th className="px-3 py-2 text-center">Đã thu hồi</th>
                                <th className="px-3 py-2 text-center border-l border-slate-200">Tích lũy từ đầu</th>
                                <th className="px-3 py-2 text-center">Tích lũy trong tháng</th>
                                <th className="px-3 py-2 text-center">Phát sinh</th>
                                <th className="px-3 py-2 text-center">Bỏ</th>
                                <th className="px-3 py-2 text-center border-l border-slate-200">Doanh thu chỉ tiêu</th>
                                <th className="px-3 py-2 text-center">Tỉ lệ đạt</th>
                                <th className="px-3 py-2 text-center">% Tiền về / DT</th>
                                <th className="px-3 py-2 text-center">% Công nợ</th>
                                <th className="px-3 py-2 text-center">Nợ tồn tháng trước</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td colSpan={21} className="px-4 py-6 text-center text-sm text-text-muted">
                                        Đang tải dữ liệu...
                                    </td>
                                </tr>
                            )}
                            {!loading &&
                                rows.map((row) => (
                                    <tr key={row.date} className="border-b border-slate-100">
                                        <td className="px-3 py-2 text-sm text-slate-700 whitespace-nowrap">{formatDate(row.date)}</td>
                                        <td className="px-3 py-2 text-right">{Number(row.revenue_cumulative || 0).toLocaleString('vi-VN')}</td>
                                        <td className="px-3 py-2 text-right">{Number(row.revenue_daily || 0).toLocaleString('vi-VN')}</td>
                                        <td className="px-3 py-2 text-right">{Number(row.collected_cumulative || 0).toLocaleString('vi-VN')}</td>
                                        <td className="px-3 py-2 text-right">{Number(row.collected_daily || 0).toLocaleString('vi-VN')}</td>
                                        <td className="px-3 py-2 text-right">{Number(row.debt_cumulative || 0).toLocaleString('vi-VN')}</td>
                                        <td className="px-3 py-2 text-right">{Number(row.debt_daily || 0).toLocaleString('vi-VN')}</td>
                                        <td className="px-3 py-2 text-right">{Number(row.debt_collected || 0).toLocaleString('vi-VN')}</td>
                                        <td className="px-3 py-2 text-right">{Number(row.prev_month_debt_open || 0).toLocaleString('vi-VN')}</td>
                                        <td className="px-3 py-2 text-right">{Number(row.prev_month_debt_collected || 0).toLocaleString('vi-VN')}</td>
                                        <td className="px-3 py-2 text-right border-l border-slate-100">{Number(row.cash_cumulative_period || 0).toLocaleString('vi-VN')}</td>
                                        <td className="px-3 py-2 text-right">{Number(row.cash_daily_total || 0).toLocaleString('vi-VN')}</td>
                                        <td className="px-3 py-2 text-right border-l border-slate-100">{row.agents_total}</td>
                                        <td className="px-3 py-2 text-right">{row.agents_month_cumulative}</td>
                                        <td className="px-3 py-2 text-right">{row.agents_daily_new}</td>
                                        <td className="px-3 py-2 text-right">{row.agents_dropped}</td>
                                        <td className="px-3 py-2 text-right border-l border-slate-100">
                                            {row.target_revenue ? Number(row.target_revenue).toLocaleString('vi-VN') : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right">{formatPercent(row.target_rate)}</td>
                                        <td className="px-3 py-2 text-right">{formatPercent(row.cash_rate)}</td>
                                        <td className="px-3 py-2 text-right">{formatPercent(row.debt_rate)}</td>
                                        <td className="px-3 py-2 text-right">{Number(row.prev_month_debt_remaining || 0).toLocaleString('vi-VN')}</td>
                                    </tr>
                                ))}
                            {!loading && rows.length === 0 && (
                                <tr>
                                    <td colSpan={21} className="px-4 py-6 text-center text-sm text-text-muted">
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
