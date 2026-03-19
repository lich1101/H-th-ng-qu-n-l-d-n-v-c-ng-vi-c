import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AppIcon from '@/Components/AppIcon';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import { useToast } from '@/Contexts/ToastContext';

function FormField({ label, required = false, children, className = '' }) {
    return (
        <div className={className}>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                {label}{required ? ' *' : ''}
            </label>
            {children}
        </div>
    );
}

export default function ServiceWorkflows(props) {
    const toast = useToast();
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
    const [editingId, setEditingId] = useState(null);
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
        setProjectId('');
        setEditingId(null);
    }, [activeType]);

    const saveItem = async (e) => {
        e.preventDefault();
        const parsed = buildPayload(activeType, form);
        const payload = {
            project_id: Number(projectId),
            ...parsed,
        };

        if (editingId) {
            await axios.put(`/api/v1/services/${activeType}/items/${editingId}`, payload);
            toast.success('Đã cập nhật bản ghi quy trình dịch vụ.');
        } else {
            await axios.post(`/api/v1/services/${activeType}/items`, payload);
            toast.success('Đã thêm bản ghi quy trình dịch vụ.');
        }

        resetFormState();
        fetchItems(activeType);
    };

    const resetFormState = () => {
        setForm({});
        setProjectId('');
        setEditingId(null);
        setShowForm(false);
    };

    const openCreateForm = () => {
        setForm({});
        setProjectId('');
        setEditingId(null);
        setShowForm(true);
    };

    const openEditForm = (item) => {
        setProjectId(String(item.project_id || ''));
        setEditingId(item.id);
        setForm({ ...item });
        setShowForm(true);
    };

    const deleteItem = async (item) => {
        if (!window.confirm(`Xóa bản ghi #${item.id} khỏi quy trình ${tabs.find((tab) => tab.key === activeType)?.label}?`)) {
            return;
        }

        await axios.delete(`/api/v1/services/${activeType}/items/${item.id}`);
        toast.success('Đã xóa bản ghi quy trình dịch vụ.');
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
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="text-xs text-text-muted">ID #{item.id}</p>
                        <h4 className="font-semibold text-slate-900">{formatValue(title)}</h4>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                            {formatValue(status)}
                        </span>
                        <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-primary/40 hover:text-primary"
                            onClick={() => openEditForm(item)}
                            title="Sửa bản ghi"
                        >
                            <AppIcon name="pencil" className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-500 transition hover:border-rose-300 hover:bg-rose-50"
                            onClick={() => deleteItem(item)}
                            title="Xóa bản ghi"
                        >
                            <AppIcon name="trash" className="h-4 w-4" />
                        </button>
                    </div>
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
                    <FormField label="Target URL" required>
                        <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="URL cần đẩy link" value={form.target_url || ''} onChange={(e) => setForm((p) => ({ ...p, target_url: e.target.value }))} required />
                    </FormField>
                    <FormField label="Domain" required>
                        <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Domain đặt backlink" value={form.domain || ''} onChange={(e) => setForm((p) => ({ ...p, domain: e.target.value }))} required />
                    </FormField>
                    <FormField label="Anchor text" required>
                        <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Anchor dùng để đi link" value={form.anchor_text || ''} onChange={(e) => setForm((p) => ({ ...p, anchor_text: e.target.value }))} required />
                    </FormField>
                    <FormField label="Ngày báo cáo">
                        <input type="date" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" value={form.report_date || ''} onChange={(e) => setForm((p) => ({ ...p, report_date: e.target.value }))} />
                    </FormField>
                    <FormField label="Ghi chú">
                        <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Thông tin thêm về vị trí link hoặc yêu cầu" value={form.note || ''} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} />
                    </FormField>
                    <FormField label="Trạng thái">
                        <select className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" value={form.status || 'pending'} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                            <option value="pending">Đang chờ</option>
                            <option value="live">Đã lên</option>
                        </select>
                    </FormField>
                </>
            );
        }
        if (resolved === 'content') {
            return (
                <>
                    <FormField label="Từ khóa chính" required>
                        <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Từ khóa chính của bài viết" value={form.main_keyword || ''} onChange={(e) => setForm((p) => ({ ...p, main_keyword: e.target.value }))} required />
                    </FormField>
                    <FormField label="Từ khóa phụ">
                        <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Danh sách từ khóa phụ" value={form.secondary_keywords || ''} onChange={(e) => setForm((p) => ({ ...p, secondary_keywords: e.target.value }))} />
                    </FormField>
                    <FormField label="Trạng thái outline">
                        <select className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" value={form.outline_status || 'pending'} onChange={(e) => setForm((p) => ({ ...p, outline_status: e.target.value }))}>
                            <option value="pending">Outline pending</option>
                            <option value="approved">Outline approved</option>
                            <option value="rejected">Outline rejected</option>
                        </select>
                    </FormField>
                    <FormField label="Số từ yêu cầu">
                        <input type="number" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Mốc cần đạt" value={form.required_words || ''} onChange={(e) => setForm((p) => ({ ...p, required_words: e.target.value }))} />
                    </FormField>
                    <FormField label="Số từ thực tế">
                        <input type="number" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Kết quả đã viết" value={form.actual_words || ''} onChange={(e) => setForm((p) => ({ ...p, actual_words: e.target.value }))} />
                    </FormField>
                    <FormField label="Điểm SEO">
                        <input type="number" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Điểm đánh giá SEO" value={form.seo_score || ''} onChange={(e) => setForm((p) => ({ ...p, seo_score: e.target.value }))} />
                    </FormField>
                    <FormField label="Tỷ lệ trùng (%)">
                        <input type="number" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Phần trăm duplicate" value={form.duplicate_percent || ''} onChange={(e) => setForm((p) => ({ ...p, duplicate_percent: e.target.value }))} />
                    </FormField>
                    <FormField label="Trạng thái duyệt">
                        <select className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" value={form.approval_status || 'pending'} onChange={(e) => setForm((p) => ({ ...p, approval_status: e.target.value }))}>
                            <option value="pending">Đang chờ</option>
                            <option value="approved">Đã duyệt</option>
                            <option value="rejected">Từ chối</option>
                        </select>
                    </FormField>
                </>
            );
        }
        if (resolved === 'audit') {
            return (
                <>
                    <FormField label="Audit URL" required>
                        <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="URL cần audit" value={form.url || ''} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} required />
                    </FormField>
                    <FormField label="Loại lỗi">
                        <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Ví dụ: index, technical, content" value={form.issue_type || ''} onChange={(e) => setForm((p) => ({ ...p, issue_type: e.target.value }))} />
                    </FormField>
                    <FormField label="Mức độ ưu tiên">
                        <select className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" value={form.priority || 'medium'} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}>
                            <option value="low">Thấp</option>
                            <option value="medium">Trung bình</option>
                            <option value="high">Cao</option>
                        </select>
                    </FormField>
                    <FormField label="Trạng thái xử lý">
                        <select className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" value={form.status || 'open'} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                            <option value="open">Đang mở</option>
                            <option value="done">Hoàn tất</option>
                        </select>
                    </FormField>
                    <FormField label="Mô tả lỗi" className="sm:col-span-2 xl:col-span-2">
                        <textarea className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" rows={2} placeholder="Mô tả cụ thể vấn đề phát hiện" value={form.issue_description || ''} onChange={(e) => setForm((p) => ({ ...p, issue_description: e.target.value }))} />
                    </FormField>
                    <FormField label="Đề xuất xử lý" className="sm:col-span-2 xl:col-span-2">
                        <textarea className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" rows={2} placeholder="Gợi ý hướng xử lý hoặc cải thiện" value={form.suggestion || ''} onChange={(e) => setForm((p) => ({ ...p, suggestion: e.target.value }))} />
                    </FormField>
                </>
            );
        }
        return (
            <>
                <FormField label="Ngày kiểm tra">
                    <input type="date" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" value={form.check_date || ''} onChange={(e) => setForm((p) => ({ ...p, check_date: e.target.value }))} />
                </FormField>
                <FormField label="Vấn đề kỹ thuật">
                    <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Lỗi kỹ thuật cần theo dõi" value={form.technical_issue || ''} onChange={(e) => setForm((p) => ({ ...p, technical_issue: e.target.value }))} />
                </FormField>
                <FormField label="Trạng thái index">
                    <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Ví dụ: Đã index, Chưa index" value={form.index_status || ''} onChange={(e) => setForm((p) => ({ ...p, index_status: e.target.value }))} />
                </FormField>
                <FormField label="Traffic">
                    <input type="number" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Lượng truy cập ghi nhận" value={form.traffic || ''} onChange={(e) => setForm((p) => ({ ...p, traffic: e.target.value }))} />
                </FormField>
                <FormField label="Biến động thứ hạng">
                    <input type="number" className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Chênh lệch ranking so với kỳ trước" value={form.ranking_delta || ''} onChange={(e) => setForm((p) => ({ ...p, ranking_delta: e.target.value }))} />
                </FormField>
                <FormField label="Báo cáo tháng">
                    <input className="rounded-xl border border-slate-200/80 text-sm px-3 py-2" placeholder="Tóm tắt kết quả tháng" value={form.monthly_report || ''} onChange={(e) => setForm((p) => ({ ...p, monthly_report: e.target.value }))} />
                </FormField>
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
                    onClick={openCreateForm}
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
                onClose={resetFormState}
                title={`${editingId ? 'Cập nhật' : 'Thêm'} bản ghi ${tabs.find((t) => t.key === activeType)?.label}`}
                description={editingId ? 'Chỉnh sửa thông tin bản ghi quy trình dịch vụ.' : 'Nhập thông tin chi tiết theo form nghiệp vụ.'}
                size="xl"
            >
                <form onSubmit={saveItem} className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <FormField label="Mã dự án" required>
                            <input
                                type="number"
                                min="1"
                                value={projectId}
                                onChange={(e) => setProjectId(e.target.value)}
                                className="rounded-xl border border-slate-200/80 text-sm px-3 py-2"
                                placeholder="Nhập ID dự án cần gắn bản ghi"
                                required
                            />
                        </FormField>
                        {renderTypeFields()}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
                            onClick={resetFormState}
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white"
                        >
                            {editingId ? 'Cập nhật bản ghi' : 'Tạo bản ghi'}
                        </button>
                    </div>
                </form>
            </Modal>
        </PageContainer>
    );
}
