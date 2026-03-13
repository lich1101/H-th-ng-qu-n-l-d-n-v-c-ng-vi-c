import React, { useEffect, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';

export default function ServiceWorkflows(props) {
    const tabs = [
        { key: 'backlinks', label: 'Backlinks' },
        { key: 'viet_content', label: 'Content' },
        { key: 'audit_content', label: 'Audit Content' },
        { key: 'cham_soc_website_tong_the', label: 'Website Care' },
    ];

    const [activeType, setActiveType] = useState('backlinks');
    const [items, setItems] = useState([]);
    const [projectId, setProjectId] = useState('');
    const [form, setForm] = useState({});
    const [showForm, setShowForm] = useState(false);

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
        setShowForm(false);
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

    const formatValue = (value) => {
        if (value === null || value === undefined || value === '') return '—';
        const raw = String(value);
        const statusMap = {
            pending: 'Đang chờ',
            live: 'Đã lên',
            approved: 'Đã duyệt',
            rejected: 'Từ chối',
            open: 'Đang mở',
            done: 'Hoàn tất',
        };
        return statusMap[raw] || raw;
    };

    const renderItemCard = (item) => {
        const resolved = normalizeType(activeType);
        let title = '';
        let status = '';
        let meta = [];

        if (resolved === 'backlinks') {
            title = item.domain || item.target_url || 'Backlinks';
            status = item.status || 'pending';
            meta = [
                { label: 'Target URL', value: item.target_url },
                { label: 'Domain', value: item.domain },
                { label: 'Anchor text', value: item.anchor_text },
                { label: 'Report date', value: item.report_date },
                { label: 'Notes', value: item.note },
            ];
        } else if (resolved === 'content') {
            title = item.main_keyword || 'Content';
            status = item.approval_status || 'pending';
            meta = [
                { label: 'Main keyword', value: item.main_keyword },
                { label: 'Secondary keywords', value: item.secondary_keywords },
                { label: 'Outline', value: item.outline_status },
                { label: 'Required words', value: item.required_words },
                { label: 'Actual words', value: item.actual_words },
                { label: 'SEO score', value: item.seo_score },
                { label: 'Duplicate %', value: item.duplicate_percent },
                { label: 'Approval', value: item.approval_status },
            ];
        } else if (resolved === 'audit') {
            title = item.url || 'Audit';
            status = item.status || 'open';
            meta = [
                { label: 'URL', value: item.url },
                { label: 'Issue type', value: item.issue_type },
                { label: 'Priority', value: item.priority },
                { label: 'Issue description', value: item.issue_description },
                { label: 'Suggestion', value: item.suggestion },
            ];
        } else {
            title = item.technical_issue || item.check_date || 'Website Care';
            status = item.index_status || 'pending';
            meta = [
                { label: 'Check date', value: item.check_date },
                { label: 'Technical issue', value: item.technical_issue },
                { label: 'Index status', value: item.index_status },
                { label: 'Traffic', value: item.traffic },
                { label: 'Ranking delta', value: item.ranking_delta },
                { label: 'Monthly report', value: item.monthly_report },
            ];
        }

        return (
            <div key={item.id} className="rounded-2xl border border-slate-200/80 p-4 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <p className="text-xs text-text-muted">ID #{item.id}</p>
                        <h4 className="font-semibold text-slate-900">{formatValue(title)}</h4>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                        {formatValue(status)}
                    </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {meta.map((m) => (
                        <div key={m.label} className="rounded-xl bg-slate-50 border border-slate-200/60 p-3">
                            <p className="text-[11px] text-text-muted">{m.label}</p>
                            <p className="text-sm font-semibold text-slate-900">{formatValue(m.value)}</p>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderTypeFields = () => {
        const resolved = normalizeType(activeType);
        if (resolved === 'backlinks') {
            return (
                <>
                    <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Target URL" value={form.target_url || ''} onChange={(e) => setForm((p) => ({ ...p, target_url: e.target.value }))} required />
                    <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Domain" value={form.domain || ''} onChange={(e) => setForm((p) => ({ ...p, domain: e.target.value }))} required />
                    <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Anchor text" value={form.anchor_text || ''} onChange={(e) => setForm((p) => ({ ...p, anchor_text: e.target.value }))} required />
                    <input type="date" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" value={form.report_date || ''} onChange={(e) => setForm((p) => ({ ...p, report_date: e.target.value }))} />
                    <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Notes" value={form.note || ''} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} />
                    <select className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" value={form.status || 'pending'} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                        <option value="pending">Đang chờ</option>
                        <option value="live">Đã lên</option>
                    </select>
                </>
            );
        }
        if (resolved === 'content') {
            return (
                <>
                    <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Main keyword" value={form.main_keyword || ''} onChange={(e) => setForm((p) => ({ ...p, main_keyword: e.target.value }))} required />
                    <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Secondary keywords" value={form.secondary_keywords || ''} onChange={(e) => setForm((p) => ({ ...p, secondary_keywords: e.target.value }))} />
                    <select className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" value={form.outline_status || 'pending'} onChange={(e) => setForm((p) => ({ ...p, outline_status: e.target.value }))}>
                        <option value="pending">Outline pending</option>
                        <option value="approved">Outline approved</option>
                        <option value="rejected">Outline rejected</option>
                    </select>
                    <input type="number" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Required words" value={form.required_words || ''} onChange={(e) => setForm((p) => ({ ...p, required_words: e.target.value }))} />
                    <input type="number" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Actual words" value={form.actual_words || ''} onChange={(e) => setForm((p) => ({ ...p, actual_words: e.target.value }))} />
                    <input type="number" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="SEO score" value={form.seo_score || ''} onChange={(e) => setForm((p) => ({ ...p, seo_score: e.target.value }))} />
                    <input type="number" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Duplicate (%)" value={form.duplicate_percent || ''} onChange={(e) => setForm((p) => ({ ...p, duplicate_percent: e.target.value }))} />
                    <select className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" value={form.approval_status || 'pending'} onChange={(e) => setForm((p) => ({ ...p, approval_status: e.target.value }))}>
                        <option value="pending">Đang chờ</option>
                        <option value="approved">Đã duyệt</option>
                        <option value="rejected">Từ chối</option>
                    </select>
                </>
            );
        }
        if (resolved === 'audit') {
            return (
                <>
                    <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Audit URL" value={form.url || ''} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} required />
                    <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Issue type" value={form.issue_type || ''} onChange={(e) => setForm((p) => ({ ...p, issue_type: e.target.value }))} />
                    <select className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" value={form.priority || 'medium'} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}>
                        <option value="low">Thấp</option>
                        <option value="medium">Trung bình</option>
                        <option value="high">Cao</option>
                    </select>
                    <select className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" value={form.status || 'open'} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                        <option value="open">Đang mở</option>
                        <option value="done">Hoàn tất</option>
                    </select>
                    <textarea className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" rows={2} placeholder="Issue description" value={form.issue_description || ''} onChange={(e) => setForm((p) => ({ ...p, issue_description: e.target.value }))} />
                    <textarea className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" rows={2} placeholder="Suggestion" value={form.suggestion || ''} onChange={(e) => setForm((p) => ({ ...p, suggestion: e.target.value }))} />
                </>
            );
        }
        return (
            <>
                <input type="date" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" value={form.check_date || ''} onChange={(e) => setForm((p) => ({ ...p, check_date: e.target.value }))} />
                <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Technical issue" value={form.technical_issue || ''} onChange={(e) => setForm((p) => ({ ...p, technical_issue: e.target.value }))} />
                <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Index status" value={form.index_status || ''} onChange={(e) => setForm((p) => ({ ...p, index_status: e.target.value }))} />
                <input type="number" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Traffic" value={form.traffic || ''} onChange={(e) => setForm((p) => ({ ...p, traffic: e.target.value }))} />
                <input type="number" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Ranking delta" value={form.ranking_delta || ''} onChange={(e) => setForm((p) => ({ ...p, ranking_delta: e.target.value }))} />
                <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Monthly report" value={form.monthly_report || ''} onChange={(e) => setForm((p) => ({ ...p, monthly_report: e.target.value }))} />
            </>
        );
    };

        return (
            <PageContainer
                auth={props.auth}
                title="Quy trình theo dịch vụ"
                description="Chuẩn hóa checklist nghiệp vụ cho Backlinks, Content, Audit Content và Website Care."
            stats={[
                { label: 'Mẫu quy trình', value: '24' },
                { label: 'Backlinks', value: '6 checklist' },
                { label: 'Content', value: '8 checklist' },
                { label: 'Audit Content/Website Care', value: '10 checklist' },
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

            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                    <h3 className="text-lg font-semibold text-slate-900">Danh sách quy trình</h3>
                    <p className="text-sm text-text-muted">
                        Lọc theo loại dịch vụ và thêm bản ghi mới khi cần.
                    </p>
                </div>
                <button
                    type="button"
                    className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white"
                    onClick={() => setShowForm(true)}
                >
                    Thêm bản ghi
                </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-card">
                <h3 className="font-semibold mb-3">Danh sách bản ghi {tabs.find((t) => t.key === activeType)?.label}</h3>
                <div className="grid gap-4 lg:grid-cols-2">
                    {items.map((item) => renderItemCard(item))}
                    {items.length === 0 && <p className="text-slate-500">Chưa có dữ liệu.</p>}
                </div>
            </div>

            <Modal
                open={showForm}
                onClose={() => setShowForm(false)}
                title={`Thêm bản ghi ${tabs.find((t) => t.key === activeType)?.label}`}
                description="Nhập thông tin chi tiết theo form nghiệp vụ."
                size="xl"
            >
                <form onSubmit={createItem} className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <input
                            type="number"
                            min="1"
                            value={projectId}
                            onChange={(e) => setProjectId(e.target.value)}
                            className="rounded-xl border border-slate-200/80 text-sm px-3 py-2"
                        placeholder="Mã dự án"
                            required
                        />
                        {renderTypeFields()}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
                            onClick={() => setShowForm(false)}
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white"
                        >
                            Tạo bản ghi
                        </button>
                    </div>
                </form>
            </Modal>
        </PageContainer>
    );
}
