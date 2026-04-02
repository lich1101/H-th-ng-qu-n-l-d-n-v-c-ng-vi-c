import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Modal from '@/Components/Modal';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';
import { formatVietnamDate, formatVietnamDateTime } from '@/lib/vietnamTime';

const LABELS = { todo: 'Cần làm', doing: 'Đang làm', done: 'Hoàn tất', blocked: 'Bị chặn' };
const STATUS_STYLES = {
    todo: 'bg-slate-100 text-slate-700 border-slate-200',
    doing: 'bg-blue-50 text-blue-700 border-blue-200',
    done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blocked: 'bg-rose-50 text-rose-700 border-rose-200',
};
const REVIEW_LABELS = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' };
const REVIEW_STYLES = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
};

const formatDate = (raw) => formatVietnamDate(raw, raw ? String(raw).slice(0, 10) : '—');
const formatDateTime = (raw) => formatVietnamDateTime(raw, raw ? String(raw) : '—');

export default function TaskItemDetail(props) {
    const toast = useToast();
    const itemId = props.taskItemId;
    const currentUserId = Number(props?.auth?.user?.id || 0);
    const currentUserRole = props?.auth?.user?.role || '';

    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [updates, setUpdates] = useState([]);
    const [updatesLoading, setUpdatesLoading] = useState(false);
    const [selectedUpdate, setSelectedUpdate] = useState(null);

    const [showReportForm, setShowReportForm] = useState(false);
    const [editingUpdate, setEditingUpdate] = useState(null);
    const [savingReport, setSavingReport] = useState(false);
    const [reportForm, setReportForm] = useState({
        status: '', progress_percent: '', note: '', attachment: null, review_note: '',
    });

    // Edit form state
    const [showEditForm, setShowEditForm] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [editUsers, setEditUsers] = useState([]);
    const [editForm, setEditForm] = useState({});

    const taskId = item?.task_id;
    const task = item?.task;
    const projectOwnerId = Number(task?.project?.owner_id || 0);

    const isTaskAssignee = Number(task?.assignee_id || 0) === currentUserId;
    const isProjectOwner = projectOwnerId > 0 && projectOwnerId === currentUserId;
    const canApprove = currentUserRole === 'admin' || isProjectOwner;
    const canEdit = currentUserRole === 'admin' || isProjectOwner || isTaskAssignee;

    const canSubmitReport = currentUserRole === 'admin'
        || isTaskAssignee
        || Number(item?.assignee_id || 0) === currentUserId;
    const canEditPendingUpdate = (update) => {
        if (!update || update.review_status !== 'pending') return false;
        if (canApprove) return true;
        return Number(item?.assignee_id || 0) === currentUserId
            || Number(update?.submitter?.id || update?.submitted_by || 0) === currentUserId;
    };

    const fetchItem = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/v1/task-items/${itemId}`);
            setItem(res.data || null);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được đầu việc.');
        } finally {
            setLoading(false);
        }
    };

    const fetchUpdates = async () => {
        if (!taskId) return;
        setUpdatesLoading(true);
        try {
            const res = await axios.get(`/api/v1/tasks/${taskId}/items/${itemId}/updates`, {
                params: { per_page: 50 },
            });
            setUpdates(res.data?.data || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được phiếu duyệt.');
        } finally {
            setUpdatesLoading(false);
        }
    };

    const fetchEditUsers = async () => {
        try {
            const res = await axios.get('/api/v1/users/lookup');
            setEditUsers(res.data?.data || []);
        } catch { /* ignore */ }
    };

    useEffect(() => { fetchItem(); fetchEditUsers(); }, [itemId]);
    useEffect(() => { if (taskId) fetchUpdates(); }, [taskId, itemId]);

    useEffect(() => {
        if (showEditForm && item) {
            setEditForm({
                title: item.title || '',
                description: item.description || '',
                status: item.status || 'todo',
                priority: item.priority || 'medium',
                progress_percent: item.progress_percent ?? '',
                weight_percent: item.weight_percent ?? '',
                start_date: item.start_date ? String(item.start_date).slice(0, 10) : '',
                deadline: item.deadline ? String(item.deadline).slice(0, 10) : '',
                assignee_id: item.assignee_id || '',
            });
        }
    }, [showEditForm, item]);

    const saveEdit = async () => {
        if (!editForm.title?.trim()) { toast.error('Tiêu đề là bắt buộc.'); return; }
        setSavingEdit(true);
        try {
            await axios.put(`/api/v1/tasks/${taskId}/items/${itemId}`, {
                ...editForm,
                progress_percent: editForm.progress_percent === '' ? null : Number(editForm.progress_percent),
                weight_percent: editForm.weight_percent === '' ? null : Number(editForm.weight_percent),
                assignee_id: editForm.assignee_id ? Number(editForm.assignee_id) : null,
                start_date: editForm.start_date || null,
                deadline: editForm.deadline || null,
            });
            toast.success('Đã cập nhật đầu việc.');
            setShowEditForm(false);
            await fetchItem();
        } catch (e) { toast.error(e?.response?.data?.message || 'Lưu thất bại.'); }
        finally { setSavingEdit(false); }
    };

    const openReportForm = (update = null) => {
        setEditingUpdate(update);
        setReportForm({
            status: update?.status || '',
            progress_percent: update?.progress_percent ?? '',
            note: update?.note || '',
            attachment: null,
            review_note: '',
        });
        setShowReportForm(true);
    };

    const submitReport = async () => {
        if (!taskId) return;
        const fd = new FormData();
        if (reportForm.status) fd.append('status', reportForm.status);
        if (reportForm.progress_percent !== '') fd.append('progress_percent', reportForm.progress_percent);
        if (reportForm.note) fd.append('note', reportForm.note);
        if (reportForm.attachment) fd.append('attachment', reportForm.attachment);

        setSavingReport(true);
        try {
            if (editingUpdate) {
                fd.append('_method', 'PUT');
                await axios.post(`/api/v1/tasks/${taskId}/items/${itemId}/updates/${editingUpdate.id}`, fd, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                toast.success('Đã cập nhật phiếu duyệt.');
            } else {
                await axios.post(`/api/v1/tasks/${taskId}/items/${itemId}/updates`, fd, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                toast.success('Đã gửi phiếu duyệt.');
            }
            setShowReportForm(false);
            setEditingUpdate(null);
            await fetchUpdates();
            await fetchItem();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu phiếu thất bại.');
        } finally {
            setSavingReport(false);
        }
    };

    const approveUpdate = async (update) => {
        try {
            await axios.post(`/api/v1/tasks/${taskId}/items/${itemId}/updates/${update.id}/approve`, {
                status: reportForm.status || update.status || undefined,
                progress_percent: reportForm.progress_percent === '' ? update.progress_percent : Number(reportForm.progress_percent),
                note: reportForm.note || update.note || undefined,
            });
            toast.success('Đã duyệt phiếu.');
            await fetchUpdates();
            await fetchItem();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Duyệt phiếu thất bại.');
        }
    };

    const rejectUpdate = async (update) => {
        if (!reportForm.review_note.trim()) {
            toast.error('Vui lòng nhập lý do từ chối.');
            return;
        }
        try {
            await axios.post(`/api/v1/tasks/${taskId}/items/${itemId}/updates/${update.id}/reject`, {
                review_note: reportForm.review_note.trim(),
            });
            toast.success('Đã từ chối phiếu.');
            setReportForm((s) => ({ ...s, review_note: '' }));
            await fetchUpdates();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Từ chối phiếu thất bại.');
        }
    };

    const deleteUpdate = async (update) => {
        if (!window.confirm('Xóa phiếu duyệt này?')) return;
        try {
            await axios.delete(`/api/v1/tasks/${taskId}/items/${itemId}/updates/${update.id}`);
            toast.success('Đã xóa phiếu.');
            await fetchUpdates();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa phiếu thất bại.');
        }
    };

    const stats = item ? [
        { label: 'Tiến độ', value: `${item.progress_percent ?? 0}%` },
        { label: 'Tỷ trọng', value: `${Number(item.weight_percent ?? 0)}%` },
        { label: 'Trạng thái', value: LABELS[item.status] || item.status },
        { label: 'Phiếu duyệt', value: String(updates.length) },
    ] : [];

    return (
        <PageContainer
            auth={props.auth}
            title="Chi tiết đầu việc"
            description="Xem thông tin đầu việc, phiếu duyệt và thực hiện các hành động."
            stats={stats}
        >
            {loading && <p className="text-sm text-text-muted">Đang tải...</p>}
            {!loading && item && (
                <div className="space-y-6">
                    {/* Breadcrumb */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                        <a href="/du-an" className="hover:text-primary">Dự án</a>
                        <span>›</span>
                        {task?.project ? (
                            <a href={`/du-an/${task.project.id}`} className="hover:text-primary">{task.project.name || task.project.code}</a>
                        ) : <span>—</span>}
                        <span>›</span>
                        {task ? (
                            <a href={`/cong-viec/${task.id}`} className="hover:text-primary">{task.title}</a>
                        ) : <span>—</span>}
                        <span>›</span>
                        <span className="font-semibold text-slate-700">{item.title}</span>
                    </div>

                    {/* Item info */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
                                {item.description && (
                                    <p className="mt-1 text-sm text-text-muted">{item.description}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[item.status] || STATUS_STYLES.todo}`}>
                                    {LABELS[item.status] || item.status}
                                </span>
                                {canEdit && (
                                    <button
                                        type="button"
                                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-primary"
                                        onClick={() => setShowEditForm(true)}
                                    >
                                        Sửa đầu việc
                                    </button>
                                )}
                                {currentUserRole === 'admin' && (
                                    <button
                                        type="button"
                                        className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                        onClick={async () => {
                                            if (!window.confirm('Xóa đầu việc này?')) return;
                                            try {
                                                await axios.delete(`/api/v1/tasks/${taskId}/items/${itemId}`);
                                                toast.success('Đã xóa đầu việc.');
                                                window.location.href = `/cong-viec/${taskId}`;
                                            } catch (e) {
                                                toast.error(e?.response?.data?.message || 'Xóa thất bại.');
                                            }
                                        }}
                                    >
                                        Xóa
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6 text-sm">
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Nhân sự phụ trách</div>
                                <div className="mt-1 font-semibold text-slate-900">{item.assignee?.name || '—'}</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Tiến độ</div>
                                <div className="mt-1 flex items-center gap-2">
                                    <div className="h-2 flex-1 rounded-full bg-slate-200">
                                        <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, item.progress_percent || 0)}%` }} />
                                    </div>
                                    <span className="font-semibold text-slate-900">{item.progress_percent ?? 0}%</span>
                                </div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Tỷ trọng</div>
                                <div className="mt-1 font-semibold text-slate-900">{Number(item.weight_percent ?? 0)}%</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Bắt đầu</div>
                                <div className="mt-1 font-semibold text-slate-900">{formatDate(item.start_date)}</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Deadline</div>
                                <div className="mt-1 font-semibold text-slate-900">{formatDate(item.deadline)}</div>
                            </div>
                        </div>

                        {/* Velocity / Speed insights */}
                        {(() => {
                            const start = item.start_date ? new Date(item.start_date).getTime() : null;
                            const end = item.deadline ? new Date(item.deadline).getTime() : null;
                            const now = Date.now();
                            if (!start || !end || end <= start) return null;
                            const totalDuration = end - start;
                            const elapsed = now - start;
                            const timePercent = Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100)));
                            const progress = Number(item.progress_percent || 0);
                            const ratio = timePercent > 0 ? Math.round((progress / timePercent) * 100) : 100;
                            const isLate = progress < timePercent;
                            const dueIn = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
                            return (
                                <div className="mt-4 rounded-2xl border border-slate-200/80 bg-gradient-to-r from-slate-50 to-white p-4">
                                    <div className="text-xs uppercase tracking-[0.14em] text-text-subtle mb-3">Phân tích tốc độ hoàn thành</div>
                                    <div className="grid gap-3 md:grid-cols-4 text-sm">
                                        <div className="text-center">
                                            <div className="text-xs text-text-muted">Thời gian đã trôi</div>
                                            <div className="mt-1 text-lg font-bold text-slate-900">{timePercent}%</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-xs text-text-muted">Tiến độ thực tế</div>
                                            <div className="mt-1 text-lg font-bold text-slate-900">{progress}%</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-xs text-text-muted">Tốc độ hoàn thành</div>
                                            <div className={`mt-1 text-lg font-bold ${ratio >= 100 ? 'text-emerald-600' : ratio >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                                                {ratio}%
                                            </div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-xs text-text-muted">Còn lại</div>
                                            <div className={`mt-1 text-lg font-bold ${dueIn <= 0 ? 'text-rose-600' : dueIn <= 3 ? 'text-amber-600' : 'text-slate-900'}`}>
                                                {dueIn > 0 ? `${dueIn} ngày` : dueIn === 0 ? 'Hôm nay' : `Quá ${Math.abs(dueIn)} ngày`}
                                            </div>
                                        </div>
                                    </div>
                                    {/* Visual bar */}
                                    <div className="mt-3 relative">
                                        <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
                                            <div className="h-3 rounded-full bg-primary/60 transition-all" style={{ width: `${progress}%` }} />
                                        </div>
                                        <div className="absolute top-0 h-3 w-0.5 bg-rose-500 rounded" style={{ left: `${Math.min(99, timePercent)}%` }} title={`Thời gian: ${timePercent}%`} />
                                    </div>
                                    <div className="mt-1 flex justify-between text-[10px] text-text-muted">
                                        <span>Tiến độ: {progress}%</span>
                                        <span className={isLate ? 'text-rose-500 font-semibold' : 'text-emerald-500'}>
                                            {isLate ? `Chậm ${timePercent - progress}%` : `Nhanh hơn ${progress - timePercent}%`}
                                        </span>
                                        <span>Thời gian: {timePercent}%</span>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Công việc liên quan */}
                        {task && (
                            <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50 p-4 text-sm">
                                <div className="text-xs uppercase tracking-[0.14em] text-text-subtle">Công việc liên quan</div>
                                <a href={`/cong-viec/${task.id}`} className="mt-1 block font-semibold text-primary hover:underline">
                                    {task.title}
                                </a>
                                <div className="mt-1 text-xs text-text-muted">
                                    Dự án: {task.project?.name || '—'} • Trạng thái: {LABELS[task.status] || task.status || '—'} • Tiến độ: {task.progress_percent ?? 0}%
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Actions bar */}
                    <div className="flex flex-wrap items-center gap-2">
                        {canSubmitReport && (
                            <button
                                type="button"
                                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                                onClick={() => openReportForm(null)}
                            >
                                Tạo phiếu duyệt
                            </button>
                        )}
                        {canApprove && (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                                Bạn là người duyệt phiếu tiến độ của đầu việc này
                            </span>
                        )}
                    </div>

                    {/* Updates list */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                        <h4 className="mb-4 font-semibold text-slate-900">Lịch sử phiếu duyệt ({updates.length})</h4>
                        {updatesLoading && <p className="text-sm text-text-muted">Đang tải phiếu duyệt...</p>}
                        {!updatesLoading && updates.length === 0 && (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-text-muted">
                                Chưa có phiếu duyệt nào.
                            </div>
                        )}
                        <div className="space-y-4">
                            {updates.map((update) => (
                                <div
                                    key={update.id}
                                    className={`rounded-2xl border p-4 transition ${selectedUpdate?.id === update.id ? 'border-primary bg-primary/5' : 'border-slate-200/80 hover:border-primary/30'}`}
                                    onClick={() => {
                                        setSelectedUpdate(update);
                                        setReportForm((s) => ({
                                            ...s,
                                            status: update.status || '',
                                            progress_percent: update.progress_percent ?? '',
                                            note: update.note || '',
                                            review_note: '',
                                        }));
                                    }}
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${REVIEW_STYLES[update.review_status] || REVIEW_STYLES.pending}`}>
                                                {REVIEW_LABELS[update.review_status] || 'Chờ duyệt'}
                                            </span>
                                            <span className="text-sm font-semibold text-slate-900">Phiếu #{update.id}</span>
                                            <span className="text-xs text-text-muted">{update.submitter?.name || 'Nhân sự'}</span>
                                        </div>
                                        <div className="text-xs text-text-muted">{formatDateTime(update.created_at)}</div>
                                    </div>
                                    <div className="mt-2 grid gap-2 md:grid-cols-3 text-sm">
                                        <div><span className="text-text-muted">Trạng thái:</span> {LABELS[update.status] || update.status || '—'}</div>
                                        <div><span className="text-text-muted">Tiến độ:</span> {update.progress_percent ?? '—'}%</div>
                                        <div><span className="text-text-muted">Ghi chú:</span> {update.note || '—'}</div>
                                    </div>
                                    {update.attachment_path && (
                                        <a href={update.attachment_path} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-primary" onClick={(e) => e.stopPropagation()}>
                                            📎 File đính kèm
                                        </a>
                                    )}
                                    {update.review_note && (
                                        <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                            <span className="font-semibold">Phản hồi:</span> {update.review_note}
                                        </div>
                                    )}

                                    {/* Action buttons for selected update */}
                                    {selectedUpdate?.id === update.id && (
                                        <div className="mt-3 space-y-3 border-t border-slate-200/60 pt-3">
                                            {canEditPendingUpdate(update) && (
                                                <div className="flex flex-wrap gap-2">
                                                    <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700" onClick={() => openReportForm(update)}>
                                                        Sửa phiếu
                                                    </button>
                                                    <button type="button" className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600" onClick={() => deleteUpdate(update)}>
                                                        Xóa phiếu
                                                    </button>
                                                </div>
                                            )}
                                            {canApprove && update.review_status === 'pending' && (
                                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                                                    <div className="text-sm font-semibold text-slate-900">Phản hồi phiếu duyệt</div>
                                                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                                                        <div>
                                                            <label className="text-xs text-text-muted">Trạng thái sau duyệt</label>
                                                            <select
                                                                className="mt-1 w-full rounded-xl border border-slate-200/80 px-3 py-2 text-sm"
                                                                value={reportForm.status}
                                                                onChange={(e) => setReportForm((s) => ({ ...s, status: e.target.value }))}
                                                            >
                                                                <option value="">-- Giữ nguyên --</option>
                                                                <option value="todo">Cần làm</option>
                                                                <option value="doing">Đang làm</option>
                                                                <option value="done">Hoàn tất</option>
                                                                <option value="blocked">Bị chặn</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="text-xs text-text-muted">Tiến độ sau duyệt (%)</label>
                                                            <input
                                                                type="number" min="0" max="100"
                                                                className="mt-1 w-full rounded-xl border border-slate-200/80 px-3 py-2 text-sm"
                                                                value={reportForm.progress_percent}
                                                                onChange={(e) => setReportForm((s) => ({ ...s, progress_percent: e.target.value }))}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="mt-3">
                                                        <label className="text-xs text-text-muted">Lý do từ chối</label>
                                                        <textarea
                                                            className="mt-1 min-h-[70px] w-full rounded-xl border border-slate-200/80 px-3 py-2 text-sm"
                                                            value={reportForm.review_note}
                                                            onChange={(e) => setReportForm((s) => ({ ...s, review_note: e.target.value }))}
                                                            placeholder="Chỉ bắt buộc khi từ chối."
                                                        />
                                                    </div>
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        <button type="button" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white" onClick={() => approveUpdate(update)}>
                                                            Duyệt phiếu
                                                        </button>
                                                        <button type="button" className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600" onClick={() => rejectUpdate(update)}>
                                                            Từ chối phiếu
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Report Form Modal */}
            <Modal
                open={showReportForm}
                onClose={() => setShowReportForm(false)}
                title={editingUpdate ? 'Sửa phiếu duyệt' : 'Tạo phiếu duyệt'}
                description={item ? `Đầu việc: ${item.title}` : ''}
                size="md"
            >
                <div className="space-y-4 text-sm">
                    <div>
                        <label className="text-xs text-text-muted">Trạng thái báo cáo</label>
                        <select
                            className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2"
                            value={reportForm.status}
                            onChange={(e) => setReportForm((s) => ({ ...s, status: e.target.value }))}
                        >
                            <option value="">-- Chọn trạng thái --</option>
                            <option value="todo">Cần làm</option>
                            <option value="doing">Đang làm</option>
                            <option value="done">Hoàn tất</option>
                            <option value="blocked">Bị chặn</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-text-muted">Tiến độ đề xuất (%)</label>
                        <input
                            type="number" min="0" max="100"
                            className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2"
                            value={reportForm.progress_percent}
                            onChange={(e) => setReportForm((s) => ({ ...s, progress_percent: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-text-muted">Ghi chú tiến độ</label>
                        <textarea
                            className="mt-2 min-h-[100px] w-full rounded-xl border border-slate-200/80 px-3 py-2"
                            value={reportForm.note}
                            onChange={(e) => setReportForm((s) => ({ ...s, note: e.target.value }))}
                            placeholder="Mô tả tiến độ, vướng mắc hoặc bằng chứng bàn giao."
                        />
                    </div>
                    <div>
                        <label className="text-xs text-text-muted">File đính kèm</label>
                        <input
                            type="file"
                            className="mt-2 block w-full text-sm"
                            onChange={(e) => setReportForm((s) => ({ ...s, attachment: e.target.files?.[0] || null }))}
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                            onClick={submitReport}
                            disabled={savingReport}
                        >
                            {savingReport ? 'Đang lưu...' : editingUpdate ? 'Cập nhật phiếu' : 'Gửi phiếu'}
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
                            onClick={() => setShowReportForm(false)}
                        >
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Edit Item Modal */}
            <Modal
                open={showEditForm}
                onClose={() => setShowEditForm(false)}
                title="Sửa đầu việc"
                description={item ? `Đầu việc: ${item.title}` : ''}
                size="lg"
            >
                <div className="space-y-4 text-sm">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                            <label className="text-xs text-text-muted">Tiêu đề *</label>
                            <input className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={editForm.title || ''} onChange={(e) => setEditForm((s) => ({ ...s, title: e.target.value }))} />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-xs text-text-muted">Mô tả</label>
                            <textarea className="mt-2 min-h-[80px] w-full rounded-xl border border-slate-200/80 px-3 py-2" value={editForm.description || ''} onChange={(e) => setEditForm((s) => ({ ...s, description: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Trạng thái</label>
                            <select className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={editForm.status || ''} onChange={(e) => setEditForm((s) => ({ ...s, status: e.target.value }))}>
                                {Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Nhân sự phụ trách</label>
                            <select className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={editForm.assignee_id || ''} onChange={(e) => setEditForm((s) => ({ ...s, assignee_id: e.target.value }))}>
                                <option value="">-- Chọn --</option>
                                {editUsers.filter((u) => !['admin', 'administrator', 'ke_toan'].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Tỷ trọng (%)</label>
                            <input type="number" min="1" max="100" className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={editForm.weight_percent ?? ''} onChange={(e) => setEditForm((s) => ({ ...s, weight_percent: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Tiến độ (%)</label>
                            <input type="number" min="0" max="100" className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={editForm.progress_percent ?? ''} onChange={(e) => setEditForm((s) => ({ ...s, progress_percent: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Ngày bắt đầu</label>
                            <input type="date" className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={editForm.start_date || ''} onChange={(e) => setEditForm((s) => ({ ...s, start_date: e.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-text-muted">Deadline</label>
                            <input type="date" className="mt-2 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={editForm.deadline || ''} onChange={(e) => setEditForm((s) => ({ ...s, deadline: e.target.value }))} />
                        </div>
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                        <button type="button" className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white" onClick={saveEdit} disabled={savingEdit}>
                            {savingEdit ? 'Đang lưu...' : 'Cập nhật'}
                        </button>
                        <button type="button" className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700" onClick={() => setShowEditForm(false)}>Hủy</button>
                    </div>
                </div>
            </Modal>
        </PageContainer>
    );
}
