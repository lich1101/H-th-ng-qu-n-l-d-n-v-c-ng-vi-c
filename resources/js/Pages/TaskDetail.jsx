import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Modal from '@/Components/Modal';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

const statusLabel = (value) => {
    switch (value) {
        case 'todo':
            return 'Cần làm';
        case 'doing':
            return 'Đang làm';
        case 'done':
            return 'Hoàn tất';
        case 'blocked':
            return 'Bị chặn';
        default:
            return value || '—';
    }
};

const reviewLabel = (value) => {
    switch (value) {
        case 'approved':
            return 'Đã duyệt';
        case 'rejected':
            return 'Từ chối';
        case 'pending':
        default:
            return 'Chờ duyệt';
    }
};

const formatDate = (raw) => {
    if (!raw) return '—';
    try {
        const d = new Date(raw);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } catch {
        return String(raw).slice(0, 10);
    }
};

const formatDateTime = (raw) => {
    if (!raw) return '—';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw);
    return d.toLocaleString('vi-VN');
};

export default function TaskDetail(props) {
    const toast = useToast();
    const taskId = props.taskId;
    const currentUserId = Number(props?.auth?.user?.id || 0);
    const currentUserRole = props?.auth?.user?.role || '';

    const [task, setTask] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    const [showUpdates, setShowUpdates] = useState(false);
    const [updatesLoading, setUpdatesLoading] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [updates, setUpdates] = useState([]);
    const [selectedUpdate, setSelectedUpdate] = useState(null);

    const [showReportForm, setShowReportForm] = useState(false);
    const [editingUpdate, setEditingUpdate] = useState(null);
    const [savingReport, setSavingReport] = useState(false);
    const [reportForm, setReportForm] = useState({
        status: '',
        progress_percent: '',
        note: '',
        attachment: null,
        review_note: '',
    });

    const isProjectOwner = Number(task?.project?.owner_id || 0) === currentUserId;
    const isDepartmentManager = Number(task?.department?.manager_id || 0) === currentUserId;
    const canApproveItemUpdates = currentUserRole === 'admin' || isProjectOwner || isDepartmentManager;

    const fetchData = async () => {
        setLoading(true);
        try {
            const [taskRes, itemRes] = await Promise.all([
                axios.get(`/api/v1/tasks/${taskId}`),
                axios.get(`/api/v1/tasks/${taskId}/items`, { params: { per_page: 200 } }),
            ]);
            setTask(taskRes.data || null);
            setItems(itemRes.data?.data || []);
            setMessage('');
        } catch (e) {
            setMessage(e?.response?.data?.message || 'Không tải được công việc.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskId]);

    const stats = task
        ? [
            { label: 'Tiến độ', value: `${task.progress_percent ?? 0}%` },
            { label: 'Đầu việc', value: String(items.length) },
            { label: 'Trạng thái', value: statusLabel(task.status) },
            { label: 'Deadline', value: task.deadline ? formatDate(task.deadline) : '—' },
        ]
        : [];

    const canSubmitReportForItem = (item) => {
        if (!item) return false;
        if (canApproveItemUpdates) return true;
        return Number(item.assignee_id || 0) === currentUserId;
    };

    const canEditPendingReport = (item, update) => {
        if (!item || !update || update.review_status !== 'pending') return false;
        if (canApproveItemUpdates) return true;
        return Number(item.assignee_id || 0) === currentUserId
            || Number(update.submitter?.id || update.submitted_by || 0) === currentUserId;
    };

    const openUpdatesModal = async (item) => {
        setSelectedItem(item);
        setShowUpdates(true);
        setSelectedUpdate(null);
        setUpdates([]);
        await fetchUpdates(item);
    };

    const fetchUpdates = async (item = selectedItem) => {
        if (!item) return;
        setUpdatesLoading(true);
        try {
            const res = await axios.get(`/api/v1/tasks/${taskId}/items/${item.id}/updates`, {
                params: { per_page: 50 },
            });
            const rows = res.data?.data || [];
            setUpdates(rows);
            setSelectedUpdate(rows[0] || null);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được danh sách phiếu duyệt.');
            setUpdates([]);
            setSelectedUpdate(null);
        } finally {
            setUpdatesLoading(false);
        }
    };

    const openReportForm = (item, update = null) => {
        setSelectedItem(item);
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
        if (!selectedItem) return;
        const formData = new FormData();
        if (reportForm.status) formData.append('status', reportForm.status);
        if (reportForm.progress_percent !== '') formData.append('progress_percent', reportForm.progress_percent);
        if (reportForm.note) formData.append('note', reportForm.note);
        if (reportForm.attachment) formData.append('attachment', reportForm.attachment);

        setSavingReport(true);
        try {
            if (editingUpdate) {
                formData.append('_method', 'PUT');
                await axios.post(
                    `/api/v1/tasks/${taskId}/items/${selectedItem.id}/updates/${editingUpdate.id}`,
                    formData,
                    { headers: { 'Content-Type': 'multipart/form-data' } },
                );
                toast.success('Đã cập nhật phiếu duyệt.');
            } else {
                await axios.post(
                    `/api/v1/tasks/${taskId}/items/${selectedItem.id}/updates`,
                    formData,
                    { headers: { 'Content-Type': 'multipart/form-data' } },
                );
                toast.success('Đã gửi phiếu duyệt tiến độ.');
            }
            setShowReportForm(false);
            setEditingUpdate(null);
            await fetchUpdates(selectedItem);
            await fetchData();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lưu phiếu duyệt thất bại.');
        } finally {
            setSavingReport(false);
        }
    };

    const approveUpdate = async () => {
        if (!selectedItem || !selectedUpdate) return;
        try {
            await axios.post(
                `/api/v1/tasks/${taskId}/items/${selectedItem.id}/updates/${selectedUpdate.id}/approve`,
                {
                    status: reportForm.status || selectedUpdate.status || undefined,
                    progress_percent: reportForm.progress_percent === ''
                        ? selectedUpdate.progress_percent
                        : Number(reportForm.progress_percent),
                    note: reportForm.note || selectedUpdate.note || undefined,
                },
            );
            toast.success('Đã duyệt phiếu duyệt đầu việc.');
            await fetchUpdates(selectedItem);
            await fetchData();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Duyệt phiếu thất bại.');
        }
    };

    const rejectUpdate = async () => {
        if (!selectedItem || !selectedUpdate) return;
        if (!reportForm.review_note.trim()) {
            toast.error('Vui lòng nhập lý do từ chối.');
            return;
        }
        try {
            await axios.post(
                `/api/v1/tasks/${taskId}/items/${selectedItem.id}/updates/${selectedUpdate.id}/reject`,
                { review_note: reportForm.review_note.trim() },
            );
            toast.success('Đã từ chối phiếu duyệt.');
            setReportForm((s) => ({ ...s, review_note: '' }));
            await fetchUpdates(selectedItem);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Từ chối phiếu thất bại.');
        }
    };

    const deleteUpdate = async (update) => {
        if (!selectedItem || !update) return;
        if (!window.confirm('Xóa phiếu duyệt này?')) return;
        try {
            await axios.delete(`/api/v1/tasks/${taskId}/items/${selectedItem.id}/updates/${update.id}`);
            toast.success('Đã xóa phiếu duyệt.');
            await fetchUpdates(selectedItem);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Xóa phiếu duyệt thất bại.');
        }
    };

    const groupedItems = useMemo(() => {
        const grouped = {};
        items.forEach((item) => {
            const assigneeName = item.assignee?.name || item.assignee?.email || 'Chưa phân công';
            const key = item.assignee?.id ? `user_${item.assignee.id}` : `label_${assigneeName}`;
            if (!grouped[key]) {
                grouped[key] = { assignee: assigneeName, items: [] };
            }
            grouped[key].items.push(item);
        });

        return Object.values(grouped);
    }, [items]);

    return (
        <PageContainer
            auth={props.auth}
            title="Chi tiết công việc"
            description="Theo dõi tiến độ công việc, đầu việc và toàn bộ phiếu duyệt đầu việc."
            stats={stats}
        >
            {loading && <p className="text-sm text-text-muted">Đang tải...</p>}
            {!loading && task && (
                <div className="space-y-6">
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">{task.title}</h3>
                                <p className="text-xs text-text-muted">Dự án: {task.project?.name || '—'}</p>
                            </div>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                                {statusLabel(task.status)}
                            </span>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-4 text-sm">
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Phụ trách</div>
                                <div className="mt-1 font-semibold text-slate-900">{task.assignee?.name || '—'}</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Quản lý dự án</div>
                                <div className="mt-1 font-semibold text-slate-900">{task.project?.owner?.name || '—'}</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Tiến độ</div>
                                <div className="mt-1 font-semibold text-slate-900">{task.progress_percent ?? 0}%</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                <div className="text-xs text-text-muted">Deadline</div>
                                <div className="mt-1 font-semibold text-slate-900">{task.deadline ? formatDate(task.deadline) : '—'}</div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                        <div className="mb-4 flex items-center justify-between">
                            <h4 className="font-semibold text-slate-900">Danh sách đầu việc</h4>
                            <button className="text-sm font-semibold text-primary" onClick={fetchData} type="button">
                                Tải lại
                            </button>
                        </div>
                        {message && <p className="mb-4 text-sm text-rose-500">{message}</p>}
                        {items.length === 0 && (
                            <p className="text-sm text-text-muted">Chưa có đầu việc nào.</p>
                        )}
                        <div className="space-y-5">
                            {groupedItems.map((group) => (
                                <div key={group.assignee} className="rounded-2xl border border-slate-200/80 p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-semibold text-slate-900">{group.assignee}</div>
                                            <div className="text-xs text-text-muted">{group.items.length} đầu việc</div>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        {group.items.map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => openUpdatesModal(item)}
                                                className="w-full rounded-2xl border border-slate-200/80 p-4 text-left transition hover:border-primary/30 hover:bg-primary/5"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <div className="font-semibold text-slate-900">{item.title}</div>
                                                        <div className="mt-1 text-xs text-text-muted">
                                                            Trạng thái: {statusLabel(item.status)} • Tiến độ: {item.progress_percent ?? 0}%
                                                        </div>
                                                    </div>
                                                    <div className="text-right text-xs text-text-muted">
                                                        <div>Bắt đầu: {item.start_date ? formatDate(item.start_date) : '—'}</div>
                                                        <div>Hạn: {item.deadline ? formatDate(item.deadline) : '—'}</div>
                                                    </div>
                                                </div>
                                                <div className="mt-3 text-xs font-semibold text-primary">
                                                    Bấm để xem danh sách phiếu duyệt đầu việc
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <Modal
                open={showUpdates}
                onClose={() => setShowUpdates(false)}
                title={`Phiếu duyệt đầu việc${selectedItem ? ` • ${selectedItem.title}` : ''}`}
                description="Bên trái là danh sách phiếu duyệt. Chọn từng phiếu để xem chi tiết, duyệt, từ chối hoặc chỉnh sửa."
                size="xl"
            >
                <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50 p-3">
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-slate-900">Danh sách phiếu</div>
                            {canSubmitReportForItem(selectedItem) && (
                                <button
                                    type="button"
                                    className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white"
                                    onClick={() => openReportForm(selectedItem)}
                                >
                                    Tạo phiếu
                                </button>
                            )}
                        </div>
                        {updatesLoading && <p className="text-sm text-text-muted">Đang tải phiếu duyệt...</p>}
                        {!updatesLoading && updates.length === 0 && (
                            <p className="text-sm text-text-muted">Chưa có phiếu duyệt nào cho đầu việc này.</p>
                        )}
                        {!updatesLoading && updates.map((update) => (
                            <button
                                key={update.id}
                                type="button"
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
                                className={`w-full rounded-2xl border p-3 text-left transition ${
                                    selectedUpdate?.id === update.id
                                        ? 'border-primary bg-primary/5'
                                        : 'border-slate-200/80 bg-white hover:border-primary/30'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-xs text-text-muted">
                                            Phiếu #{update.id} • {update.submitter?.name || 'Nhân sự'}
                                        </div>
                                        <div className="mt-1 font-semibold text-slate-900">
                                            {reviewLabel(update.review_status)}
                                        </div>
                                    </div>
                                    <div className="text-xs text-text-muted">
                                        {update.progress_percent ?? '—'}%
                                    </div>
                                </div>
                                <div className="mt-2 text-xs text-text-muted line-clamp-2">
                                    {update.note || 'Không có ghi chú'}
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5">
                        {!selectedUpdate && (
                            <div className="flex min-h-[240px] items-center justify-center text-sm text-text-muted">
                                Chọn một phiếu duyệt để xem chi tiết.
                            </div>
                        )}
                        {selectedUpdate && (
                            <div className="space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-xs uppercase tracking-[0.14em] text-text-subtle">
                                            Phiếu duyệt #{selectedUpdate.id}
                                        </div>
                                        <h4 className="mt-1 text-lg font-semibold text-slate-900">
                                            {reviewLabel(selectedUpdate.review_status)}
                                        </h4>
                                    </div>
                                    <div className="text-right text-xs text-text-muted">
                                        <div>Người gửi: {selectedUpdate.submitter?.name || '—'}</div>
                                        <div className="mt-1">Lúc gửi: {formatDateTime(selectedUpdate.created_at)}</div>
                                    </div>
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                        <div className="text-xs text-text-muted">Trạng thái báo cáo</div>
                                        <div className="mt-1 font-semibold text-slate-900">{statusLabel(selectedUpdate.status)}</div>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                        <div className="text-xs text-text-muted">Tiến độ đề xuất</div>
                                        <div className="mt-1 font-semibold text-slate-900">{selectedUpdate.progress_percent ?? '—'}%</div>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 px-4 py-3 md:col-span-2">
                                        <div className="text-xs text-text-muted">Ghi chú của nhân viên</div>
                                        <div className="mt-1 text-sm text-slate-900">{selectedUpdate.note || 'Không có ghi chú.'}</div>
                                    </div>
                                    {selectedUpdate.review_note && (
                                        <div className="rounded-2xl bg-amber-50 px-4 py-3 md:col-span-2">
                                            <div className="text-xs text-amber-700">Phản hồi của người duyệt</div>
                                            <div className="mt-1 text-sm text-amber-900">{selectedUpdate.review_note}</div>
                                        </div>
                                    )}
                                </div>

                                {selectedUpdate.attachment_path && (
                                    <a
                                        href={selectedUpdate.attachment_path}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-primary"
                                    >
                                        Xem file đính kèm
                                    </a>
                                )}

                                {canEditPendingReport(selectedItem, selectedUpdate) && (
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                                            onClick={() => openReportForm(selectedItem, selectedUpdate)}
                                        >
                                            Sửa phiếu
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-2xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600"
                                            onClick={() => deleteUpdate(selectedUpdate)}
                                        >
                                            Xóa phiếu
                                        </button>
                                    </div>
                                )}

                                {canApproveItemUpdates && selectedUpdate.review_status === 'pending' && (
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                                        <div className="text-sm font-semibold text-slate-900">Phản hồi phiếu duyệt</div>
                                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                                            <div>
                                                <label className="text-xs text-text-muted">Trạng thái sau duyệt</label>
                                                <select
                                                    className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                                    value={reportForm.status}
                                                    onChange={(e) => setReportForm((s) => ({ ...s, status: e.target.value }))}
                                                >
                                                    <option value="">-- Giữ nguyên theo phiếu --</option>
                                                    <option value="todo">Cần làm</option>
                                                    <option value="doing">Đang làm</option>
                                                    <option value="done">Hoàn tất</option>
                                                    <option value="blocked">Bị chặn</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs text-text-muted">Tiến độ sau duyệt (%)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                                    value={reportForm.progress_percent}
                                                    onChange={(e) => setReportForm((s) => ({ ...s, progress_percent: e.target.value }))}
                                                />
                                            </div>
                                        </div>
                                        <div className="mt-3">
                                            <label className="text-xs text-text-muted">Ghi chú sau khi duyệt</label>
                                            <textarea
                                                className="mt-2 min-h-[90px] w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                                value={reportForm.note}
                                                onChange={(e) => setReportForm((s) => ({ ...s, note: e.target.value }))}
                                                placeholder="Có thể chỉnh nội dung cuối cùng trước khi duyệt."
                                            />
                                        </div>
                                        <div className="mt-3">
                                            <label className="text-xs text-text-muted">Lý do từ chối</label>
                                            <textarea
                                                className="mt-2 min-h-[80px] w-full rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                                                value={reportForm.review_note}
                                                onChange={(e) => setReportForm((s) => ({ ...s, review_note: e.target.value }))}
                                                placeholder="Chỉ bắt buộc khi từ chối."
                                            />
                                        </div>
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white"
                                                onClick={approveUpdate}
                                            >
                                                Duyệt phiếu
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-2xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600"
                                                onClick={rejectUpdate}
                                            >
                                                Từ chối phiếu
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </Modal>

            <Modal
                open={showReportForm}
                onClose={() => setShowReportForm(false)}
                title={editingUpdate ? 'Sửa phiếu duyệt đầu việc' : 'Tạo phiếu duyệt đầu việc'}
                description={selectedItem ? `Đầu việc: ${selectedItem.title}` : 'Gửi báo cáo tiến độ cho đầu việc này.'}
                size="md"
            >
                <div className="space-y-4 text-sm">
                    <div>
                        <label className="text-xs text-text-muted">Trạng thái báo cáo</label>
                        <select
                            className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2"
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
                            type="number"
                            min="0"
                            max="100"
                            className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={reportForm.progress_percent}
                            onChange={(e) => setReportForm((s) => ({ ...s, progress_percent: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-text-muted">Ghi chú tiến độ</label>
                        <textarea
                            className="mt-2 min-h-[110px] w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={reportForm.note}
                            onChange={(e) => setReportForm((s) => ({ ...s, note: e.target.value }))}
                            placeholder="Mô tả phần việc đã hoàn thành, vướng mắc hoặc bằng chứng bàn giao."
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
                            className="flex-1 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                            onClick={submitReport}
                            disabled={savingReport}
                        >
                            {savingReport ? 'Đang lưu...' : editingUpdate ? 'Cập nhật phiếu' : 'Gửi phiếu'}
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
                            onClick={() => setShowReportForm(false)}
                        >
                            Hủy
                        </button>
                    </div>
                </div>
            </Modal>
        </PageContainer>
    );
}
