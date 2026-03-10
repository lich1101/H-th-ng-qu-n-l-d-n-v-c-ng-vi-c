import React from 'react';
import PageContainer from '@/Components/PageContainer';

export default function ServiceWorkflows(props) {
    return (
        <PageContainer
            auth={props.auth}
            title="Quy trình theo dịch vụ"
            description="Chuẩn hóa checklist nghiệp vụ cho Backlinks, Content, Audit và Chăm sóc website."
            stats={[
                { label: 'Template quy trình', value: '24' },
                { label: 'Backlinks', value: '6 checklist' },
                { label: 'Content', value: '8 checklist' },
                { label: 'Audit/Website care', value: '10 checklist' },
            ]}
        >
            <div className="grid gap-4 md:grid-cols-2">
                {[
                    ['Backlinks', 'Domain list • Anchor text • Trạng thái live/pending'],
                    ['Viết content', 'Keyword chính/phụ • Outline duyệt • Check trùng lặp'],
                    ['Audit content', 'URL • SEO issue • Đề xuất xử lý • Độ ưu tiên'],
                    ['Chăm sóc website', 'Lịch check định kỳ • Theo dõi index • Báo cáo tháng'],
                ].map(([name, desc]) => (
                    <div key={name} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                        <h3 className="font-semibold text-slate-900">{name}</h3>
                        <p className="text-sm text-slate-600 mt-2">{desc}</p>
                    </div>
                ))}
            </div>
        </PageContainer>
    );
}
