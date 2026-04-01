import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import FilterToolbar, { FilterActionGroup, FilterField, filterControlClass } from '@/Components/FilterToolbar';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import PaginationControls from '@/Components/PaginationControls';
import { useToast } from '@/Contexts/ToastContext';
import { formatVietnamDateTime } from '@/lib/vietnamTime';

const HANDOVER_STYLES = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
};

const handoverLabel = (value) => {
    if (!value) return 'Chưa gửi duyệt';
    if (value === 'pending') return 'Chờ duyệt';
    if (value === 'approved') return 'Đã duyệt';
    if (value === 'rejected') return 'Từ chối';
    return value;
};

const formatDateTime = (value) => {
    return formatVietnamDateTime(value, value ? String(value) : '—');
};

export default function HandoverCenter(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    const [loading, setLoading] = useState(false);
    const [projects, setProjects] = useState([]);
    const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [filters, setFilters] = useState({
        search: '',
        owner_only: userRole === 'nhan_vien' ? '1' : '',
        page: 1,
        per_page: 20,
    });
    const [reviewingProject, setReviewingProject] = useState(null);
    const [decision, setDecision] = useState('approved');
    const [reason, setReason] = useState('');
    const [savingReview, setSavingReview] = useState(false);

    const handleSearch = (val) => {
        const next = { ...filters, search: val, page: 1 };
        setFilters(next);
        fetchQueue(1, next);
    };

    const fetchQueue = async (pageOrFilters = filters.page, maybeFilters = filters) => {
        const nextFilters = typeof pageOrFilters === 'object' && pageOrFilters !== null
            ? pageOrFilters
            : maybeFilters;
        const nextPage = typeof pageOrFilters === 'object' && pageOrFilters !== null
            ? Number(pageOrFilters.page || 1)
            : Number(pageOrFilters || 1);

        setLoading(true);
        try {
            const response = await axios.get('/api/v1/project-handovers', {
                params: {
                    per_page: nextFilters.per_page,
                    page: nextPage,
                    search: nextFilters.search,
                },
            });
            setProjects(response.data?.data || []);
            setMeta({
                current_page: response.data?.current_page || 1,
                last_page: response.data?.last_page || 1,
                total: response.data?.total || 0,
            });
            setFilters(prev => ({ ...prev, page: response.data?.current_page || nextPage }));
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Không tải được hàng đợi bàn giao dự án.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQueue();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filteredProjects = useMemo(() => {
        return projects.filter((project) => {
            const ownerOnly = filters.owner_only === '1';
            if (ownerOnly && Number(project?.owner_id || 0) !== Number(props?.auth?.user?.id || 0)) {
                return false;
            }
            return true;
        });
    }, [filters.owner_only, projects, props?.auth?.user?.id]);

    const stats = useMemo(() => {
        const total = meta.total || projects.length;
        const canReview = projects.filter((project) => project?.permissions?.can_review_handover).length;
        const ownerQueue = projects.filter((project) => Number(project?.owner_id || 0) === Number(props?.auth?.user?.id || 0)).length;
        return [
            { label: 'Phiếu chờ duyệt', value: String(total) },
            { label: 'Bạn có thể duyệt', value: String(canReview) },
            { label: 'Dự án bạn phụ trách', value: String(ownerQueue) },
        ];
    }, [projects, props?.auth?.user?.id, meta.total]);

    const openReviewModal = (project, nextDecision) => {
        setReviewingProject(project);
        setDecision(nextDecision);
        setReason('');
    };

    const closeReviewModal = () => {
        setReviewingProject(null);
        setDecision('approved');
        setReason('');
    };

    const submitReview = async () => {
        if (!reviewingProject) return;
        if (decision === 'rejected' && !reason.trim()) {
            toast.error('Vui lòng nhập lý do từ chối bàn giao.');
            return;
        }
        setSavingReview(true);
        try {
            await axios.post(`/api/v1/projects/${reviewingProject.id}/handover-review`, {
                decision,
                reason: reason.trim() || null,
            });
            toast.success(decision === 'approved' ? 'Đã duyệt bàn giao dự án.' : 'Đã từ chối bàn giao dự án.');
            closeReviewModal();
            await fetchQueue();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Phản hồi bàn giao thất bại.');
        } finally {
            setSavingReview(false);
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Bàn giao dự án"
            description="Danh sách dự án đang gửi duyệt bàn giao. Admin và người phụ trách hợp đồng của dự án có quyền duyệt hoặc từ chối."
            stats={stats}
        >
            <div className="space-y-4">
                <FilterToolbar enableSearch
                    title="Hàng đợi duyệt bàn giao"
                    description="Tìm nhanh theo mã dự án, hợp đồng, khách hàng hoặc người gửi."
                    searchValue={filters.search}
                    onSearch={handleSearch}
                    actions={(
                        <FilterActionGroup>
                            {userRole === 'nhan_vien' && (
                                <button
                                    type="button"
                                    className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                                        filters.owner_only === '1'
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-slate-200/80 text-slate-600'
                                    }`}
                                    onClick={() => setFilters((prev) => ({
                                        ...prev,
                                        owner_only: prev.owner_only === '1' ? '' : '1',
                                    }))}
                                >
                                    Chỉ dự án tôi phụ trách
                                </button>
                            )}
                        </FilterActionGroup>
                    )}
                />

                <div className="space-y-3">
                    {loading && (
                        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-8 text-center text-sm text-text-muted shadow-card">
                            Đang tải hàng đợi bàn giao...
                        </div>
                    )}

                    {!loading && filteredProjects.length === 0 && (
                        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-8 text-center text-sm text-text-muted shadow-card">
                            Hiện chưa có dự án nào đang chờ duyệt bàn giao.
                        </div>
                    )}

                    {!loading && filteredProjects.map((project) => {
                        const progress = Number(project?.progress_percent || 0);
                        return (
                            <div key={project.id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="space-y-3">
                                        <div>
                                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-subtle">
                                                Dự án • {project.code || `#${project.id}`}
                                            </div>
                                            <h3 className="mt-1 text-lg font-semibold text-slate-900">{project.name}</h3>
                                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-muted">
                                                <span>Phụ trách dự án: {project.owner?.name || '—'}</span>
                                                <span>Người lên hợp đồng: {project.contract?.collector?.name || '—'}</span>
                                                <span>Hợp đồng: {project.contract?.code || '—'}</span>
                                            </div>
                                        </div>

                                        <div className="grid gap-3 md:grid-cols-3">
                                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                                <div className="text-xs text-text-muted">Tiến độ hiện tại</div>
                                                <div className="mt-1 font-semibold text-slate-900">{progress}%</div>
                                            </div>
                                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                                <div className="text-xs text-text-muted">Người gửi phiếu</div>
                                                <div className="mt-1 font-semibold text-slate-900">{project.handoverRequester?.name || project.owner?.name || '—'}</div>
                                            </div>
                                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                                <div className="text-xs text-text-muted">Thời gian gửi</div>
                                                <div className="mt-1 font-semibold text-slate-900">{formatDateTime(project.handover_requested_at)}</div>
                                            </div>
                                        </div>

                                        {project.handover_review_note && (
                                            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Ghi chú phản hồi gần nhất</div>
                                                <div className="mt-1">{project.handover_review_note}</div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex w-full max-w-[280px] flex-col gap-3 lg:items-end">
                                        <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${
                                            HANDOVER_STYLES[project.handover_status] || 'bg-slate-100 text-slate-700 border-slate-200'
                                        }`}>
                                            {handoverLabel(project.handover_status)}
                                        </span>
                                        <div className="flex w-full flex-col gap-2">
                                            <a
                                                href={`/du-an/${project.id}`}
                                                className="rounded-2xl border border-slate-200/80 px-4 py-2 text-center text-sm font-semibold text-slate-700"
                                            >
                                                Xem dự án
                                            </a>
                                            <a
                                                href={`/cong-viec?project_id=${project.id}`}
                                                className="rounded-2xl border border-slate-200/80 px-4 py-2 text-center text-sm font-semibold text-slate-700"
                                            >
                                                Xem công việc
                                            </a>
                                            {project?.permissions?.can_review_handover && (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white"
                                                        onClick={() => openReviewModal(project, 'approved')}
                                                    >
                                                        Duyệt bàn giao
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="rounded-2xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600"
                                                        onClick={() => openReviewModal(project, 'rejected')}
                                                    >
                                                        Từ chối duyệt
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <PaginationControls
                    page={meta.current_page}
                    lastPage={meta.last_page}
                    total={meta.total}
                    perPage={filters.per_page}
                    loading={loading}
                    onPageChange={(p) => fetchQueue(p, filters)}
                    onPerPageChange={(pp) => {
                        const next = { ...filters, per_page: pp, page: 1 };
                        setFilters(next);
                        fetchQueue(1, next);
                    }}
                    label="phiếu bàn giao"
                />
            </div>

            <Modal
                open={!!reviewingProject}
                onClose={closeReviewModal}
                title={`${decision === 'approved' ? 'Duyệt' : 'Từ chối'} bàn giao dự án`}
                description={reviewingProject ? `Dự án: ${reviewingProject.name}` : ''}
                size="md"
            >
                <div className="space-y-4 text-sm">
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                        <div className="text-xs text-text-muted">Người gửi phiếu</div>
                        <div className="mt-1 font-semibold text-slate-900">
                            {reviewingProject?.handoverRequester?.name || reviewingProject?.owner?.name || '—'}
                        </div>
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
                            {decision === 'approved' ? 'Ghi chú duyệt (tuỳ chọn)' : 'Lý do từ chối'}
                        </label>
                        <textarea
                            className="min-h-[120px] w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder={
                                decision === 'approved'
                                    ? 'Ví dụ: Đã kiểm tra đủ hạng mục, cho phép bàn giao.'
                                    : 'Nhập rõ lý do để phụ trách dự án biết cần bổ sung gì.'
                            }
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className={`flex-1 rounded-2xl px-4 py-2.5 font-semibold ${
                                decision === 'approved'
                                    ? 'bg-primary text-white'
                                    : 'border border-rose-200 text-rose-600'
                            }`}
                            onClick={submitReview}
                            disabled={savingReview}
                        >
                            {savingReview ? 'Đang xử lý...' : (decision === 'approved' ? 'Xác nhận duyệt' : 'Xác nhận từ chối')}
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-2xl border border-slate-200 px-4 py-2.5 font-semibold text-slate-700"
                            onClick={closeReviewModal}
                            disabled={savingReview}
                        >
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>
        </PageContainer>
    );
}
