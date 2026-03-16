import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

const toDateInput = (date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatCurrency = (value) => {
    const num = Number(value || 0);
    return num.toLocaleString('vi-VN');
};

const formatPercent = (value) => {
    const num = Number(value || 0);
    return `${num.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
};

const formatDate = (value) => {
    if (!value) return '—';
    const [year, month, day] = value.split('-');
    return `${day}-${month}-${year}`;
};

export default function CompanyRevenueReport(props) {
    const toast = useToast();
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const [filters, setFilters] = useState({
        from: toDateInput(firstDay),
        to: toDateInput(today),
        target_revenue: '',
    });
    const [draftFilters, setDraftFilters] = useState(filters);
    const [report, setReport] = useState({});
    const [loading, setLoading] = useState(true);

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
            setReport(res.data || {});
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

    const stats = useMemo(() => {
        const rows = report.daily_rows || [];
        const lastRow = rows.length ? rows[rows.length - 1] : null;
        const total = Number(lastRow?.revenue_cumulative ?? report.total_revenue ?? 0);
        const paid = Number(lastRow?.collected_cumulative ?? report.total_paid ?? 0);
        const debt = Number(lastRow?.debt_cumulative ?? report.total_debt ?? 0);
        const costs = Number(report.total_costs ?? 0);
        const contracts = Number(report.contracts_total ?? 0);
        return [
            { label: 'Tổng doanh thu', value: `${formatCurrency(total)} VNĐ` },
            { label: 'Nợ đã thu hồi', value: `${formatCurrency(paid)} VNĐ` },
            { label: 'Công nợ (Nợ tồn)', value: `${formatCurrency(debt)} VNĐ` },
            { label: 'Chi phí', value: `${formatCurrency(costs)} VNĐ` },
            { label: 'Hợp đồng', value: contracts.toString() },
        ];
    }, [report]);

    const rows = report.daily_rows || [];

    const applyFilters = () => {
        setFilters(draftFilters);
    };

    const resetFilters = () => {
        const next = {
            from: toDateInput(firstDay),
            to: toDateInput(today),
            target_revenue: '',
        };
        setDraftFilters(next);
        setFilters(next);
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Báo cáo doanh thu công ty"
            description="Báo cáo theo ngày với cấu trúc cột chi tiết và bộ lọc thời gian."
            stats={stats}
        >
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 mb-6">
                <div className="flex flex-wrap gap-4 items-end">
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
                    <div className="flex flex-col gap-1">
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
                        Tháng này
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

            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
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
                                        <td className="px-3 py-2 text-sm text-slate-700 whitespace-nowrap">
                                            {formatDate(row.date)}
                                        </td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(row.revenue_cumulative)}</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(row.revenue_daily)}</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(row.collected_cumulative)}</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(row.collected_daily)}</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(row.debt_cumulative)}</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(row.debt_daily)}</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(row.debt_collected)}</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(row.prev_month_debt_open)}</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(row.prev_month_debt_collected)}</td>
                                        <td className="px-3 py-2 text-right border-l border-slate-100">
                                            {formatCurrency(row.cash_cumulative_period)}
                                        </td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(row.cash_daily_total)}</td>
                                        <td className="px-3 py-2 text-right border-l border-slate-100">{row.agents_total}</td>
                                        <td className="px-3 py-2 text-right">{row.agents_month_cumulative}</td>
                                        <td className="px-3 py-2 text-right">{row.agents_daily_new}</td>
                                        <td className="px-3 py-2 text-right">{row.agents_dropped}</td>
                                        <td className="px-3 py-2 text-right border-l border-slate-100">
                                            {row.target_revenue ? formatCurrency(row.target_revenue) : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right">{formatPercent(row.target_rate)}</td>
                                        <td className="px-3 py-2 text-right">{formatPercent(row.cash_rate)}</td>
                                        <td className="px-3 py-2 text-right">{formatPercent(row.debt_rate)}</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(row.prev_month_debt_remaining)}</td>
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
