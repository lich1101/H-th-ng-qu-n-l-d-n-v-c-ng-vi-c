import React, { useEffect, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';

export default function ServiceWorkflows(props) {
    const tabs = [
        { key: 'backlinks', label: 'Backlinks' },
        { key: 'viet_content', label: 'Viết content' },
        { key: 'audit_content', label: 'Audit content' },
        { key: 'cham_soc_website_tong_the', label: 'Chăm sóc website' },
    ];

    const [activeType, setActiveType] = useState('backlinks');
    const [items, setItems] = useState([]);
    const [projectId, setProjectId] = useState('');
    const [form, setForm] = useState({});

    const normalizeType = (type) => {
        if (type === 'viet_content') return 'content';
        if (type === 'audit_content') return 'audit';
        if (type === 'cham_soc_website_tong_the') return 'website-care';
        return type;
    };

    const fetchItems = async (type) => {
        const response = await axios.get(`/api/v1/services/${type}/items`, { params: { per_page: 10 } });
        setItems(response.data.data || []);
    };

    useEffect(() => {
        fetchItems(activeType);
        setForm({});
    }, [activeType]);

    const createItem = async (e) => {
        e.preventDefault();
        const parsed = buildPayload(activeType, form);
        await axios.post(`/api/v1/services/${activeType}/items`, {
            project_id: Number(projectId),
            ...parsed,
        });
        setForm({});
        fetchItems(activeType);
    };

    const buildPayload = (type, raw) => {
        const resolved = normalizeType(type);
        if (resolved === 'backlinks') {
            return {
                target_url: raw.target_url || '',
                domain: raw.domain || '',
                anchor_text: raw.anchor_text || '',
                status: raw.status || 'pending',
                report_date: raw.report_date || null,
                note: raw.note || null,
            };
        }
        if (resolved === 'content') {
            return {
                main_keyword: raw.main_keyword || '',
                secondary_keywords: raw.secondary_keywords || '',
                outline_status: raw.outline_status || 'pending',
                required_words: raw.required_words ? Number(raw.required_words) : null,
                actual_words: raw.actual_words ? Number(raw.actual_words) : null,
                seo_score: raw.seo_score ? Number(raw.seo_score) : null,
                duplicate_percent: raw.duplicate_percent ? Number(raw.duplicate_percent) : null,
                approval_status: raw.approval_status || 'pending',
            };
        }
        if (resolved === 'audit') {
            return {
                url: raw.url || '',
                issue_type: raw.issue_type || '',
                issue_description: raw.issue_description || '',
                suggestion: raw.suggestion || '',
                priority: raw.priority || 'medium',
                status: raw.status || 'open',
            };
        }
        return {
            check_date: raw.check_date || null,
            technical_issue: raw.technical_issue || '',
            index_status: raw.index_status || '',
            traffic: raw.traffic ? Number(raw.traffic) : null,
            ranking_delta: raw.ranking_delta ? Number(raw.ranking_delta) : null,
            monthly_report: raw.monthly_report || '',
        };
    };

    const renderTypeFields = () => {
        const resolved = normalizeType(activeType);
        if (resolved === 'backlinks') {
            return (
                <>
                    <input className="rounded-lg border-slate-300 text-sm" placeholder="Target URL" value={form.target_url || ''} onChange={(e) => setForm((p) => ({ ...p, target_url: e.target.value }))} required />
                    <input className="rounded-lg border-slate-300 text-sm" placeholder="Domain" value={form.domain || ''} onChange={(e) => setForm((p) => ({ ...p, domain: e.target.value }))} required />
                    <input className="rounded-lg border-slate-300 text-sm" placeholder="Anchor text" value={form.anchor_text || ''} onChange={(e) => setForm((p) => ({ ...p, anchor_text: e.target.value }))} required />
                    <select className="rounded-lg border-slate-300 text-sm" value={form.status || 'pending'} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                        <option value="pending">pending</option>
                        <option value="live">live</option>
                    </select>
                </>
            );
        }
        if (resolved === 'content') {
            return (
                <>
                    <input className="rounded-lg border-slate-300 text-sm" placeholder="Keyword chính" value={form.main_keyword || ''} onChange={(e) => setForm((p) => ({ ...p, main_keyword: e.target.value }))} required />
                    <input className="rounded-lg border-slate-300 text-sm" placeholder="Keyword phụ" value={form.secondary_keywords || ''} onChange={(e) => setForm((p) => ({ ...p, secondary_keywords: e.target.value }))} />
                    <select className="rounded-lg border-slate-300 text-sm" value={form.outline_status || 'pending'} onChange={(e) => setForm((p) => ({ ...p, outline_status: e.target.value }))}>
                        <option value="pending">outline pending</option>
                        <option value="approved">outline approved</option>
                        <option value="rejected">outline rejected</option>
                    </select>
                    <input type="number" className="rounded-lg border-slate-300 text-sm" placeholder="Số từ yêu cầu" value={form.required_words || ''} onChange={(e) => setForm((p) => ({ ...p, required_words: e.target.value }))} />
                    <input type="number" className="rounded-lg border-slate-300 text-sm" placeholder="Số từ thực tế" value={form.actual_words || ''} onChange={(e) => setForm((p) => ({ ...p, actual_words: e.target.value }))} />
                    <input type="number" className="rounded-lg border-slate-300 text-sm" placeholder="SEO score" value={form.seo_score || ''} onChange={(e) => setForm((p) => ({ ...p, seo_score: e.target.value }))} />
                    <input type="number" className="rounded-lg border-slate-300 text-sm" placeholder="Duplicate %" value={form.duplicate_percent || ''} onChange={(e) => setForm((p) => ({ ...p, duplicate_percent: e.target.value }))} />
                    <select className="rounded-lg border-slate-300 text-sm" value={form.approval_status || 'pending'} onChange={(e) => setForm((p) => ({ ...p, approval_status: e.target.value }))}>
                        <option value="pending">pending</option>
                        <option value="approved">approved</option>
                        <option value="rejected">rejected</option>
                    </select>
                </>
            );
        }
        if (resolved === 'audit') {
            return (
                <>
                    <input className="rounded-lg border-slate-300 text-sm" placeholder="URL audit" value={form.url || ''} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} required />
                    <input className="rounded-lg border-slate-300 text-sm" placeholder="Loại lỗi SEO" value={form.issue_type || ''} onChange={(e) => setForm((p) => ({ ...p, issue_type: e.target.value }))} />
                    <select className="rounded-lg border-slate-300 text-sm" value={form.priority || 'medium'} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}>
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                    </select>
                    <select className="rounded-lg border-slate-300 text-sm" value={form.status || 'open'} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                        <option value="open">open</option>
                        <option value="done">done</option>
                    </select>
                </>
            );
        }
        return (
            <>
                <input type="date" className="rounded-lg border-slate-300 text-sm" value={form.check_date || ''} onChange={(e) => setForm((p) => ({ ...p, check_date: e.target.value }))} />
                <input className="rounded-lg border-slate-300 text-sm" placeholder="Lỗi kỹ thuật" value={form.technical_issue || ''} onChange={(e) => setForm((p) => ({ ...p, technical_issue: e.target.value }))} />
                <input className="rounded-lg border-slate-300 text-sm" placeholder="Trạng thái index" value={form.index_status || ''} onChange={(e) => setForm((p) => ({ ...p, index_status: e.target.value }))} />
                <input type="number" className="rounded-lg border-slate-300 text-sm" placeholder="Traffic" value={form.traffic || ''} onChange={(e) => setForm((p) => ({ ...p, traffic: e.target.value }))} />
            </>
        );
    };

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
            <div className="mb-4 flex flex-wrap gap-2">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveType(tab.key)}
                        className={`px-3 py-2 rounded-lg text-sm ${
                            activeType === tab.key
                                ? 'bg-sky-600 text-white'
                                : 'bg-white border border-slate-300 text-slate-700'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <form onSubmit={createItem} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card mb-4">
                <h3 className="font-semibold mb-2">Thêm bản ghi {tabs.find((t) => t.key === activeType)?.label}</h3>
                <p className="text-xs text-slate-500 mb-2">Nhập thông tin chi tiết theo form nghiệp vụ.</p>
                <div className="grid gap-3 md:grid-cols-4">
                    <input
                        type="number"
                        min="1"
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                        className="rounded-lg border-slate-300 text-sm"
                        placeholder="Project ID"
                        required
                    />
                    {renderTypeFields()}
                </div>
                <button type="submit" className="mt-3 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm">
                    Tạo bản ghi
                </button>
            </form>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card">
                <h3 className="font-semibold mb-3">Danh sách bản ghi {tabs.find((t) => t.key === activeType)?.label}</h3>
                <div className="space-y-2 text-sm">
                    {items.map((item) => (
                        <pre key={item.id} className="rounded-lg border border-slate-200/80 bg-slate-50 p-3 overflow-x-auto">
                            {JSON.stringify(item, null, 2)}
                        </pre>
                    ))}
                    {items.length === 0 && <p className="text-slate-500">Chưa có dữ liệu.</p>}
                </div>
            </div>
        </PageContainer>
    );
}
