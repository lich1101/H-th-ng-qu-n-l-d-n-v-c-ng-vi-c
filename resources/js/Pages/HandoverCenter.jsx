import React from 'react';
import PageContainer from '@/Components/PageContainer';

export default function HandoverCenter(props) {
    return (
        <PageContainer
            auth={props.auth}
            title="Trung tâm bàn giao"
            description="Quản lý tài liệu, video, version upload và trạng thái bàn giao theo task."
            stats={[
                { label: 'File bàn giao tháng này', value: '96' },
                { label: 'Video nội bộ', value: '31' },
                { label: 'Chờ duyệt', value: '12' },
                { label: 'Đã duyệt', value: '84' },
            ]}
        >
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <h3 className="font-semibold mb-3">Lịch sử upload theo version</h3>
                <div className="space-y-2 text-sm">
                    {[
                        'Task #203 - Video bàn giao SEO tổng thể - v3',
                        'Task #221 - Tài liệu audit technical - v2',
                        'Task #225 - Google Drive checklist backlinks - v1',
                    ].map((item) => (
                        <div key={item} className="rounded-lg border border-slate-200 p-3 flex justify-between">
                            <span>{item}</span>
                            <span className="text-slate-500">10 phút trước</span>
                        </div>
                    ))}
                </div>
            </div>
        </PageContainer>
    );
}
