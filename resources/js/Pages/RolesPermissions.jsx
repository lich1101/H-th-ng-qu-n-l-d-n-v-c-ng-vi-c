import React from 'react';
import PageContainer from '@/Components/PageContainer';

export default function RolesPermissions(props) {
    return (
        <PageContainer
            auth={props.auth}
            title="Phân quyền người dùng"
            description="Quản trị vai trò hệ thống và quyền thao tác theo từng phòng ban."
            stats={[
                { label: 'Tổng người dùng', value: '—' },
                { label: 'Quản trị', value: '—' },
                { label: 'Quản lý', value: '—' },
                { label: 'Nhân sự', value: '—' },
                { label: 'Kế toán', value: '—' },
            ]}
        >
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200/80 font-semibold">Ma trận quyền chính</div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="text-left px-4 py-3">Vai trò</th>
                                <th className="text-left px-4 py-3">Khách hàng &amp; Hợp đồng</th>
                                <th className="text-left px-4 py-3">Giao việc</th>
                                <th className="text-left px-4 py-3">Bàn giao</th>
                                <th className="text-left px-4 py-3">Báo cáo doanh thu</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                ['Quản trị', 'Toàn quyền', 'Toàn quyền', 'Duyệt', 'Toàn công ty'],
                                ['Quản lý phòng ban', 'Theo phòng ban', 'Giao & theo dõi', 'Duyệt', 'Không'],
                                ['Nhân sự', 'Xem theo phân công', 'Thực hiện', 'Tải lên', 'Không'],
                                ['Kế toán', 'Tạo & duyệt hợp đồng', 'Không', 'Theo dõi', 'Không'],
                            ].map((row) => (
                                <tr key={row[0]} className="border-t border-slate-100">
                                    {row.map((cell) => (
                                        <td key={cell} className="px-4 py-3">{cell}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </PageContainer>
    );
}
