import React from 'react';
import PageContainer from '@/Components/PageContainer';

export default function CRM(props) {
    return (
        <PageContainer
            auth={props.auth}
            title="CRM mini"
            description="Quản lý thông tin khách hàng, lịch sử dự án, thanh toán và sales phụ trách."
            stats={[
                { label: 'Khách hàng đang hoạt động', value: '29' },
                { label: 'Dự án đang chạy', value: '42' },
                { label: 'Hóa đơn chờ thu', value: '11' },
                { label: 'Giá trị pipeline', value: '1.8 tỷ' },
            ]}
        >
            <div className="grid gap-4 lg:grid-cols-2">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="font-semibold mb-3">Khách hàng nổi bật</h3>
                    <ul className="space-y-2 text-sm">
                        <li className="rounded-lg border border-slate-200 p-3">Acme Co. • 4 dự án • Sales: Phương</li>
                        <li className="rounded-lg border border-slate-200 p-3">Edu Plus • 2 dự án • Sales: Linh</li>
                        <li className="rounded-lg border border-slate-200 p-3">Nova Retail • 3 dự án • Sales: Khánh</li>
                    </ul>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="font-semibold mb-3">Thanh toán cần theo dõi</h3>
                    <ul className="space-y-2 text-sm">
                        <li className="rounded-lg border border-rose-200 bg-rose-50 p-3">Acme Co. - 120,000,000đ - quá hạn 4 ngày</li>
                        <li className="rounded-lg border border-amber-200 bg-amber-50 p-3">Edu Plus - 45,000,000đ - đến hạn 2 ngày</li>
                        <li className="rounded-lg border border-slate-200 p-3">Nova Retail - 80,000,000đ - đến hạn 10 ngày</li>
                    </ul>
                </div>
            </div>
        </PageContainer>
    );
}
