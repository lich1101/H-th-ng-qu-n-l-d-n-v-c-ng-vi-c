import React, { useEffect, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';

export default function ServiceWorkflows(props) {
    const tabs = [
        { key: 'backlinks', label: 'Liên kết trỏ về' },
        { key: 'viet_content', label: 'Viết nội dung' },
        { key: 'audit_content', label: 'Rà soát nội dung' },
        { key: 'cham_soc_website_tong_the', label: 'Chăm sóc trang web' },
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
            title = item.domain || item.target_url || 'Liên kết trỏ về';
            status = item.status || 'pending';
            meta = [
                { label: 'URL đích', value: item.target_url },
                { label: 'Tên miền', value: item.domain },
                { label: 'Văn bản neo', value: item.anchor_text },
                { label: 'Ngày báo cáo', value: item.report_date },
                { label: 'Ghi chú', value: item.note },
            ];
        } else if (resolved === 'content') {
            title = item.main_keyword || 'Nội dung';
            status = item.approval_status || 'pending';
            meta = [
                { label: 'Từ khóa chính', value: item.main_keyword },
                { label: 'Từ khóa phụ', value: item.secondary_keywords },
                { label: 'Dàn ý', value: item.outline_status },
                { label: 'Số từ yêu cầu', value: item.required_words },
                { label: 'Số từ thực tế', value: item.actual_words },
                { label: 'Điểm SEO', value: item.seo_score },
                { label: 'Tỷ lệ trùng lặp', value: item.duplicate_percent },
                { label: 'Duyệt', value: item.approval_status },
            ];
        } else if (resolved === 'audit') {
            title = item.url || 'Rà soát';
            status = item.status || 'open';
            meta = [
                { label: 'URL', value: item.url },
                { label: 'Loại lỗi', value: item.issue_type },
                { label: 'Mức ưu tiên', value: item.priority },
                { label: 'Mô tả lỗi', value: item.issue_description },
                { label: 'Đề xuất', value: item.suggestion },
            ];
        } else {
            title = item.technical_issue || item.check_date || 'Chăm sóc trang web';
            status = item.index_status || 'pending';
            meta = [
                { label: 'Ngày kiểm tra', value: item.check_date },
                { label: 'Lỗi kỹ thuật', value: item.technical_issue },
                { label: 'Lập chỉ mục', value: item.index_status },
                { label: 'Lưu lượng', value: item.traffic },
                { label: 'Biến động thứ hạng', value: item.ranking_delta },
                { label: 'Báo cáo tháng', value: item.monthly_report },
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
                    <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="URL đích" value={form.target_url || ''} onChange={(e) => setForm((p) => ({ ...p, target_url: e.target.value }))} required />
                    <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Tên miền" value={form.domain || ''} onChange={(e) => setForm((p) => ({ ...p, domain: e.target.value }))} required />
                    <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Văn bản neo" value={form.anchor_text || ''} onChange={(e) => setForm((p) => ({ ...p, anchor_text: e.target.value }))} required />
                    <input type="date" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" value={form.report_date || ''} onChange={(e) => setForm((p) => ({ ...p, report_date: e.target.value }))} />
                    <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Ghi chú" value={form.note || ''} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} />
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
                    <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Từ khóa chính" value={form.main_keyword || ''} onChange={(e) => setForm((p) => ({ ...p, main_keyword: e.target.value }))} required />
                    <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Từ khóa phụ" value={form.secondary_keywords || ''} onChange={(e) => setForm((p) => ({ ...p, secondary_keywords: e.target.value }))} />
                    <select className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" value={form.outline_status || 'pending'} onChange={(e) => setForm((p) => ({ ...p, outline_status: e.target.value }))}>
                        <option value="pending">Dàn ý chờ duyệt</option>
                        <option value="approved">Dàn ý đã duyệt</option>
                        <option value="rejected">Dàn ý từ chối</option>
                    </select>
                    <input type="number" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Số từ yêu cầu" value={form.required_words || ''} onChange={(e) => setForm((p) => ({ ...p, required_words: e.target.value }))} />
                    <input type="number" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Số từ thực tế" value={form.actual_words || ''} onChange={(e) => setForm((p) => ({ ...p, actual_words: e.target.value }))} />
                    <input type="number" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Điểm SEO" value={form.seo_score || ''} onChange={(e) => setForm((p) => ({ ...p, seo_score: e.target.value }))} />
                    <input type="number" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Tỷ lệ trùng lặp (%)" value={form.duplicate_percent || ''} onChange={(e) => setForm((p) => ({ ...p, duplicate_percent: e.target.value }))} />
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
                    <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="URL cần rà soát" value={form.url || ''} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} required />
                    <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Loại lỗi SEO" value={form.issue_type || ''} onChange={(e) => setForm((p) => ({ ...p, issue_type: e.target.value }))} />
                    <select className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" value={form.priority || 'medium'} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}>
                        <option value="low">Thấp</option>
                        <option value="medium">Trung bình</option>
                        <option value="high">Cao</option>
                    </select>
                    <select className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" value={form.status || 'open'} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                        <option value="open">Đang mở</option>
                        <option value="done">Hoàn tất</option>
                    </select>
                    <textarea className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" rows={2} placeholder="Mô tả lỗi" value={form.issue_description || ''} onChange={(e) => setForm((p) => ({ ...p, issue_description: e.target.value }))} />
                    <textarea className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" rows={2} placeholder="Đề xuất chỉnh sửa" value={form.suggestion || ''} onChange={(e) => setForm((p) => ({ ...p, suggestion: e.target.value }))} />
                </>
            );
        }
        return (
            <>
                <input type="date" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" value={form.check_date || ''} onChange={(e) => setForm((p) => ({ ...p, check_date: e.target.value }))} />
                <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Lỗi kỹ thuật" value={form.technical_issue || ''} onChange={(e) => setForm((p) => ({ ...p, technical_issue: e.target.value }))} />
                <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Trạng thái lập chỉ mục" value={form.index_status || ''} onChange={(e) => setForm((p) => ({ ...p, index_status: e.target.value }))} />
                <input type="number" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Lưu lượng" value={form.traffic || ''} onChange={(e) => setForm((p) => ({ ...p, traffic: e.target.value }))} />
                <input type="number" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Biến động thứ hạng" value={form.ranking_delta || ''} onChange={(e) => setForm((p) => ({ ...p, ranking_delta: e.target.value }))} />
                <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Báo cáo tháng" value={form.monthly_report || ''} onChange={(e) => setForm((p) => ({ ...p, monthly_report: e.target.value }))} />
            </>
        );
    };

        return (
            <PageContainer
                auth={props.auth}
                title="Quy trình theo dịch vụ"
                description="Chuẩn hóa checklist nghiệp vụ cho Liên kết trỏ về, Nội dung, Rà soát nội dung và Chăm sóc trang web."
            stats={[
                { label: 'Mẫu quy trình', value: '24' },
                { label: 'Liên kết trỏ về', value: '6 checklist' },
                { label: 'Nội dung', value: '8 checklist' },
                { label: 'Rà soát/Chăm sóc trang web', value: '10 checklist' },
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
