import React from 'react';
import PageContainer from '@/Components/PageContainer';

export default function RolesPermissions(props) {
    return (
        <PageContainer
            auth={props.auth}
            title="Phân quyền người dùng"
            description="Quản trị vai trò hệ thống và quyền thao tác theo từng phòng ban."
            stats={[
                { label: 'Tổng người dùng', value: '56' },
                { label: 'Admin', value: '3' },
                { label: 'Kinh doanh', value: '14' },
                { label: 'Sản xuất', value: '39' },
            ]}
        >
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 font-semibold">Ma trận quyền chính</div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="text-left px-4 py-3">Vai trò</th>
                                <th className="text-left px-4 py-3">Tạo dự án</th>
                                <th className="text-left px-4 py-3">Sửa task SX</th>
                                <th className="text-left px-4 py-3">Duyệt bàn giao</th>
                                <th className="text-left px-4 py-3">Xem báo cáo tổng</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                ['Admin', 'Có', 'Có', 'Có', 'Có'],
                                ['Trưởng phòng sản xuất', 'Có', 'Có', 'Có', 'Có'],
                                ['Nhân sự sản xuất', 'Không', 'Có (task được giao)', 'Không', 'Không'],
                                ['Nhân sự kinh doanh', 'Có', 'Không', 'Xem', 'Một phần'],
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
