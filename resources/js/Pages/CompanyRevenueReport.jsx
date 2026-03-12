import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

export default function CompanyRevenueReport(props) {
    const toast = useToast();
    const [report, setReport] = useState({
        total_revenue: 0,
        contracts_total: 0,
        monthly: [],
        top_customers: [],
    });
    const [loading, setLoading] = useState(true);

    const fetchReport = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/reports/company');
            setReport(res.data || { total_revenue: 0, contracts_total: 0, monthly: [], top_customers: [] });
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được báo cáo doanh thu công ty.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stats = useMemo(() => {
        const total = Number(report.total_revenue || 0);
        const contracts = Number(report.contracts_total || 0);
        const months = report.monthly || [];
        return [
            { label: 'Tổng doanh thu', value: total.toLocaleString('vi-VN') + ' VNĐ' },
            { label: 'Hợp đồng', value: contracts.toString() },
            { label: 'Tháng có dữ liệu', value: String(months.length) },
            { label: 'Cập nhật', value: loading ? '...' : 'OK' },
        ];
    }, [report, loading]);

    const maxMonthly = useMemo(() => {
        const months = report.monthly || [];
        return months.reduce((max, item) => (item.revenue > max ? item.revenue : max), 0) || 1;
    }, [report]);

    return (
        <PageContainer
            auth={props.auth}
            title="Báo cáo doanh thu công ty"
            description="Tổng hợp doanh thu theo tháng, top khách hàng và tổng số hợp đồng."
            stats={stats}
        >
            <div className="grid gap-6 lg:grid-cols-2">
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold">Doanh thu theo tháng</h3>
                        <button
                            type="button"
                            onClick={fetchReport}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                        >
                            Làm mới
                        </button>
                    </div>
                    <div className="space-y-3">
                        {(report.monthly || []).map((row) => {
                            const ratio = maxMonthly > 0 ? Math.round((row.revenue / maxMonthly) * 100) : 0;
                            return (
                                <div key={row.month} className="flex items-center gap-3">
                                    <div className="w-16 text-xs text-text-muted">{row.month}</div>
                                    <div className="flex-1">
                                        <div className="h-2 rounded-full bg-slate-100">
                                            <div className="h-2 rounded-full bg-primary" style={{ width: `${ratio}%` }}></div>
                                        </div>
                                    </div>
                                    <div className="w-28 text-right text-xs font-semibold text-slate-700">
                                        {Number(row.revenue || 0).toLocaleString('vi-VN')}
                                    </div>
                                </div>
                            );
                        })}
                        {(report.monthly || []).length === 0 && (
                            <div className="text-sm text-text-muted">Chưa có dữ liệu tháng.</div>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                    <h3 className="font-semibold mb-4">Top khách hàng</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-wider text-text-subtle border-b border-slate-200">
                                    <th className="py-2">Khách hàng</th>
                                    <th className="py-2">Doanh thu</th>
                                    <th className="py-2">Hợp đồng</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(report.top_customers || []).map((row) => (
                                    <tr key={row.client_id} className="border-b border-slate-100">
                                        <td className="py-2">
                                            <div className="font-medium text-slate-900">{row.name}</div>
                                            <div className="text-xs text-text-muted">{row.company || '—'}</div>
                                        </td>
                                        <td className="py-2 text-slate-700">
                                            {Number(row.revenue || 0).toLocaleString('vi-VN')} VNĐ
                                        </td>
                                        <td className="py-2 text-slate-700">{row.contracts}</td>
                                    </tr>
                                ))}
                                {(report.top_customers || []).length === 0 && (
                                    <tr>
                                        <td className="py-6 text-center text-sm text-text-muted" colSpan={3}>
                                            Chưa có dữ liệu khách hàng.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
