import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

export default function RevenueReport(props) {
    const toast = useToast();
    const [report, setReport] = useState({ total_revenue: 0, departments: [] });
    const [loading, setLoading] = useState(true);

    const fetchReport = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/reports/revenue');
            setReport(res.data || { total_revenue: 0, departments: [] });
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được báo cáo doanh thu.');
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
        const paid = Number(report.total_paid || 0);
        const debt = Number(report.total_debt || 0);
        const costs = Number(report.total_costs || 0);
        const departments = report.departments || [];
        const contracts = Number(report.contracts_total || 0);
        return [
            { label: 'Tổng doanh thu', value: total.toLocaleString('vi-VN') + ' VNĐ' },
            { label: 'Nợ đã thu hồi', value: paid.toLocaleString('vi-VN') + ' VNĐ' },
            { label: 'Công nợ (Nợ tồn)', value: debt.toLocaleString('vi-VN') + ' VNĐ' },
            { label: 'Chi phí', value: costs.toLocaleString('vi-VN') + ' VNĐ' },
            { label: 'Hợp đồng', value: contracts.toString() },
        ];
    }, [report, loading]);

    return (
        <PageContainer
            auth={props.auth}
            title="Báo cáo doanh thu"
            description="Tổng hợp doanh thu theo phòng ban và hợp đồng đã duyệt."
            stats={stats}
        >
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Doanh thu theo phòng ban</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase tracking-wider text-text-subtle border-b border-slate-200">
                                <th className="py-2">Phòng ban</th>
                                <th className="py-2">Quản lý</th>
                                <th className="py-2">Doanh thu</th>
                                <th className="py-2">Tỷ trọng</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(report.departments || []).map((row) => {
                                const ratio =
                                    report.total_revenue > 0 ? Math.round((row.revenue / report.total_revenue) * 100) : 0;
                                return (
                                    <tr key={row.department_id} className="border-b border-slate-100">
                                        <td className="py-2 font-medium text-slate-900">{row.department_name}</td>
                                        <td className="py-2 text-text-muted">{row.manager || '—'}</td>
                                        <td className="py-2 text-slate-700">
                                            {Number(row.revenue || 0).toLocaleString('vi-VN')} VNĐ
                                        </td>
                                        <td className="py-2">
                                            <div className="flex items-center gap-2">
                                                <div className="h-2 w-24 rounded-full bg-slate-100">
                                                    <div className="h-2 rounded-full bg-primary" style={{ width: `${ratio}%` }}></div>
                                                </div>
                                                <span className="text-xs text-text-muted">{ratio}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {(report.departments || []).length === 0 && (
                                <tr>
                                    <td className="py-6 text-center text-sm text-text-muted" colSpan={4}>
                                        Chưa có dữ liệu doanh thu.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 mt-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Doanh thu theo nhân sự</h3>
                    <span className="text-xs text-text-muted">
                        {report.staffs ? `${report.staffs.length} nhân sự` : '—'}
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase tracking-wider text-text-subtle border-b border-slate-200">
                                <th className="py-2">Nhân sự</th>
                                <th className="py-2">Doanh thu</th>
                                <th className="py-2">Hợp đồng</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(report.staffs || []).map((row) => (
                                <tr key={row.staff_id} className="border-b border-slate-100">
                                    <td className="py-2 font-medium text-slate-900">{row.staff_name}</td>
                                    <td className="py-2 text-slate-700">
                                        {Number(row.revenue || 0).toLocaleString('vi-VN')} VNĐ
                                    </td>
                                    <td className="py-2 text-slate-700">{row.contracts}</td>
                                </tr>
                            ))}
                            {(report.staffs || []).length === 0 && (
                                <tr>
                                    <td className="py-6 text-center text-sm text-text-muted" colSpan={3}>
                                        Chưa có dữ liệu doanh thu nhân sự.
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
