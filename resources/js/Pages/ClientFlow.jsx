import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import AppIcon from '@/Components/AppIcon';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import ClientStaffTransferPendingBanner from '@/Components/ClientStaffTransferPendingBanner';
import TagMultiSelect from '@/Components/TagMultiSelect';
import { filterControlClass } from '@/Components/FilterToolbar';
import { useToast } from '@/Contexts/ToastContext';
import { formatClientOptionLabel } from '@/utils/clientOptionLabel';
import { formatVietnamDate, formatVietnamDateTime, toDateInputValue } from '@/lib/vietnamTime';

const STATUS_LABELS = {
    open: 'Đang mở',
    won: 'Thành công',
    lost: 'Thất bại',
    pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Từ chối',
    moi_tao: 'Mới tạo',
    dang_trien_khai: 'Đang triển khai',
    cho_duyet: 'Chờ duyệt',
    hoan_thanh: 'Hoàn thành',
    tam_dung: 'Tạm dừng',
    todo: 'Cần làm',
    doing: 'Đang làm',
    done: 'Hoàn tất',
    blocked: 'Bị chặn',
};

const SERVICE_LABELS = {
    backlinks: 'Backlinks',
    viet_content: 'Content',
    audit_content: 'Audit Content',
    cham_soc_website_tong_the: 'Website Care',
    khac: 'Khác',
};

const doneStatusSet = new Set(['won', 'success', 'thanh_cong', 'hoan_thanh', 'done', 'completed']);
const doneContractStatusSet = new Set(['success', 'active', 'approved', 'hoan_thanh']);

const statusLabel = (value) => STATUS_LABELS[String(value || '').toLowerCase()] || value || '—';
const opportunityStatusLabel = (row) => row?.status_label || row?.computed_status_label || row?.status || row?.computed_status || '—';
const opportunityStatusCode = (row) => String(row?.status || row?.computed_status || '').toLowerCase();
const opportunityStatusHex = (row) => {
    const explicitHex = String(row?.status_color_hex || '').trim();
    if (explicitHex) return explicitHex;
    const fallback = {
        open: '#0ea5e9',
        won: '#22C55E',
        success: '#22C55E',
        lost: '#EF4444',
    };
    return fallback[opportunityStatusCode(row)] || '#64748B';
};

const formatDate = (raw) => formatVietnamDate(raw);
const formatDateTime = (raw) => formatVietnamDateTime(raw);

const formatCurrency = (value) => Number(value || 0).toLocaleString('vi-VN');
const commentTimestamp = (comment) => {
    const parsed = Date.parse(String(comment?.created_at || ''));
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeCommentsHistoryRows = (rawRows) => (
    (Array.isArray(rawRows) ? rawRows : [])
        .filter((row) => row && String(row.detail || '').trim() !== '')
        .map((row) => ({
            id: String(row.id || ''),
            title: String(row.title || 'Bình luận').trim() || 'Bình luận',
            detail: String(row.detail || '').trim(),
            created_at: row.created_at || null,
            user: row.user || null,
            can_delete: Boolean(row.can_delete),
        }))
        .sort((a, b) => {
            const byTime = commentTimestamp(a) - commentTimestamp(b);
            if (byTime !== 0) return byTime;
            return String(a.id).localeCompare(String(b.id));
        })
);

const buildCommentsSignature = (rows) => rows
    .map((row) => `${row.id}:${row.created_at || ''}`)
    .join('|');

const userInitials = (user) => {
    const source = String(user?.name || user?.email || 'NS').trim();
    if (!source) return 'NS';
    return source
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase())
        .join('')
        .slice(0, 2);
};

const numberOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const normalizeCareStaffIds = (rawValue) => (
    Array.isArray(rawValue)
        ? rawValue
            .map((item) => Number(item?.id ?? item))
            .filter((id) => Number.isInteger(id) && id > 0)
        : []
);

const serviceLabel = (project) => {
    if (!project) return '—';
    if (project.service_type === 'khac') return project.service_type_other || 'Khác';
    return SERVICE_LABELS[project.service_type] || project.service_type || '—';
};

function TabButton({ active, icon, label, onClick, count = null }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-primary/30 hover:text-primary'
            }`}
        >
            <AppIcon name={icon} className="h-4 w-4" />
            <span>{label}</span>
            {count !== null && (
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs text-slate-700">{count}</span>
            )}
        </button>
    );
}

function EmptyTable({ colSpan, message }) {
    return (
        <tr>
            <td colSpan={colSpan} className="py-6 text-center text-sm text-slate-500">
                {message}
            </td>
        </tr>
    );
}

function Field({ label, required = false, children, hint = '' }) {
    return (
        <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">
                {label}{required ? ' *' : ''}
            </label>
            {children}
            {hint ? <p className="mt-1.5 text-xs text-text-muted">{hint}</p> : null}
        </div>
    );
}

export default function ClientFlow({ auth, clientId }) {
    const toast = useToast();
    const myUserId = Number(auth?.user?.id || 0);
    const userRole = String(auth?.user?.role || '').toLowerCase();
    /** Đổi phụ trách trực tiếp trên form sửa — chỉ admin & quản lý; nhân viên dùng phiếu chuyển phụ trách. */
    const canAssignClientOwner = ['admin', 'administrator', 'quan_ly'].includes(userRole);
    const [flow, setFlow] = useState(null);
    const canCreateOpportunity = Boolean(flow?.permissions?.can_manage_client);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('tong_quan');
    const [showEditModal, setShowEditModal] = useState(false);
    const [savingClient, setSavingClient] = useState(false);
    const [loadingLookups, setLoadingLookups] = useState(false);
    const [leadTypes, setLeadTypes] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [staffUsers, setStaffUsers] = useState([]);
    const [clientForm, setClientForm] = useState({
        name: '',
        company: '',
        email: '',
        phone: '',
        notes: '',
        lead_type_id: '',
        lead_source: '',
        lead_channel: '',
        lead_message: '',
        assigned_department_id: '',
        assigned_staff_id: '',
        sales_owner_id: '',
        care_staff_ids: [],
    });
    const [careNoteForm, setCareNoteForm] = useState({ title: '', detail: '' });
    const [commentsHistory, setCommentsHistory] = useState([]);
    const [commentFlashIds, setCommentFlashIds] = useState([]);
    const [sendingCommentFx, setSendingCommentFx] = useState(false);
    const [submittingCareNote, setSubmittingCareNote] = useState(false);
    const [deletingCommentId, setDeletingCommentId] = useState('');
    const [opportunityProducts, setOpportunityProducts] = useState([]);
    const [opportunityStatuses, setOpportunityStatuses] = useState([]);
    const [showOpportunityModal, setShowOpportunityModal] = useState(false);
    const [editingOpportunityId, setEditingOpportunityId] = useState(null);
    const [savingOpportunity, setSavingOpportunity] = useState(false);
    const [deletingOpportunityId, setDeletingOpportunityId] = useState(null);
    const [opportunityForm, setOpportunityForm] = useState({
        title: '',
        opportunity_type: '',
        status: '',
        source: '',
        amount: '',
        success_probability: '',
        expected_close_date: '',
        product_id: '',
        assigned_to: '',
        watcher_ids: [],
        notes: '',
    });
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [transferEligible, setTransferEligible] = useState([]);
    const [transferForm, setTransferForm] = useState({ to_staff_id: '', note: '' });
    const [transferSubmitting, setTransferSubmitting] = useState(false);
    const [transferActionLoading, setTransferActionLoading] = useState(false);
    const commentsScrollRef = useRef(null);
    const commentsInitializedRef = useRef(false);
    const previousCommentsCountRef = useRef(0);
    const commentsSignatureRef = useRef('');
    const pollingCommentsRef = useRef(false);
    const commentsShouldStickToBottomRef = useRef(true);

    const scrollCommentsToBottom = (behavior = 'auto') => {
        const el = commentsScrollRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior });
    };

    const isCommentsNearBottom = () => {
        const el = commentsScrollRef.current;
        if (!el) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    };

    const flashComments = (ids) => {
        const normalized = (Array.isArray(ids) ? ids : [])
            .map((id) => String(id || '').trim())
            .filter(Boolean);
        if (normalized.length === 0) return;
        setCommentFlashIds((prev) => Array.from(new Set([...prev, ...normalized])));
        window.setTimeout(() => {
            setCommentFlashIds((prev) => prev.filter((id) => !normalized.includes(id)));
        }, 900);
    };

    const fetchTransferEligible = async () => {
        try {
            const res = await axios.get(`/api/v1/crm/clients/${clientId}/staff-transfer/eligible-users`);
            setTransferEligible(Array.isArray(res.data?.users) ? res.data.users : []);
        } catch {
            setTransferEligible([]);
        }
    };

    const openTransferModal = async () => {
        setShowTransferModal(true);
        setTransferForm({ to_staff_id: '', note: '' });
        await fetchTransferEligible();
    };

    const submitTransferRequest = async (event) => {
        event.preventDefault();
        if (!transferForm.to_staff_id) {
            toast.error('Chọn nhân sự nhận phụ trách.');
            return;
        }
        setTransferSubmitting(true);
        try {
            await axios.post(`/api/v1/crm/clients/${clientId}/staff-transfer-requests`, {
                to_staff_id: Number(transferForm.to_staff_id),
                note: (transferForm.note || '').trim() || null,
            });
            toast.success('Đã gửi phiếu chuyển phụ trách.');
            setShowTransferModal(false);
            await fetchFlow();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không gửi được phiếu.');
        } finally {
            setTransferSubmitting(false);
        }
    };

    const actOnPendingTransfer = async (action) => {
        const pt = flow?.pending_staff_transfer;
        if (!pt?.id || pt.status !== 'pending') return;
        let rejectionNote = null;
        if (action === 'reject') {
            rejectionNote = window.prompt('Lý do từ chối (tuỳ chọn):') || null;
        }
        if (action === 'cancel' && !window.confirm('Hủy phiếu chuyển phụ trách này?')) return;
        setTransferActionLoading(true);
        try {
            if (action === 'accept') await axios.post(`/api/v1/crm/staff-transfer-requests/${pt.id}/accept`);
            if (action === 'reject') await axios.post(`/api/v1/crm/staff-transfer-requests/${pt.id}/reject`, { rejection_note: rejectionNote });
            if (action === 'cancel') await axios.post(`/api/v1/crm/staff-transfer-requests/${pt.id}/cancel`);
            toast.success('Đã cập nhật phiếu chuyển phụ trách.');
            await fetchFlow();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không thực hiện được.');
        } finally {
            setTransferActionLoading(false);
        }
    };

    const fetchFlow = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/v1/crm/clients/${clientId}/flow`);
            const payload = res.data || null;
            setFlow(payload);
            const nextComments = normalizeCommentsHistoryRows(payload?.comments_history || []);
            commentsSignatureRef.current = buildCommentsSignature(nextComments);
            setCommentsHistory(nextComments);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được thông tin khách hàng.');
        } finally {
            setLoading(false);
        }
    };

    const fetchCommentsOnly = async ({ silent = true } = {}) => {
        if (!clientId || pollingCommentsRef.current) return;
        pollingCommentsRef.current = true;
        try {
            const res = await axios.get(`/api/v1/crm/clients/${clientId}/comments`, {
                params: { _t: Date.now() },
            });
            const nextComments = normalizeCommentsHistoryRows(res.data?.comments_history || []);
            const nextSignature = buildCommentsSignature(nextComments);
            if (nextSignature !== commentsSignatureRef.current) {
                commentsSignatureRef.current = nextSignature;
                setCommentsHistory(nextComments);
            }
        } catch (e) {
            if (!silent) {
                toast.error(e?.response?.data?.message || 'Không tải được bình luận.');
            }
        } finally {
            pollingCommentsRef.current = false;
        }
    };

    useEffect(() => {
        fetchFlow();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientId]);

    useEffect(() => {
        commentsInitializedRef.current = false;
        previousCommentsCountRef.current = 0;
        setCommentFlashIds([]);
    }, [clientId]);

    useEffect(() => {
        if (!commentsInitializedRef.current) {
            commentsInitializedRef.current = true;
            previousCommentsCountRef.current = commentsHistory.length;
            window.requestAnimationFrame(() => scrollCommentsToBottom('auto'));
            return;
        }

        const prevCount = previousCommentsCountRef.current;
        if (commentsHistory.length > prevCount) {
            const appendedRows = commentsHistory.slice(prevCount);
            flashComments(appendedRows.map((row) => row.id));
            if (commentsShouldStickToBottomRef.current) {
                window.requestAnimationFrame(() => scrollCommentsToBottom('smooth'));
            }
        }
        previousCommentsCountRef.current = commentsHistory.length;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [commentsHistory]);

    useEffect(() => {
        if (!clientId) return undefined;
        let stopped = false;
        let timerId = null;

        const tick = async () => {
            if (stopped) return;
            if (document.visibilityState !== 'visible') {
                timerId = window.setTimeout(tick, 1000);
                return;
            }
            await fetchCommentsOnly({ silent: true });
            if (!stopped) {
                timerId = window.setTimeout(tick, 1000);
            }
        };

        timerId = window.setTimeout(tick, 1000);
        return () => {
            stopped = true;
            if (timerId) {
                window.clearTimeout(timerId);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientId]);

    const hydrateClientForm = (client) => {
        if (!client) return;
        const primaryOwnerId = client.assigned_staff_id || client.sales_owner_id || '';
        setClientForm({
            name: client.name || '',
            company: client.company || '',
            email: client.email || '',
            phone: client.phone || '',
            notes: client.notes || '',
            lead_type_id: client.lead_type_id ? String(client.lead_type_id) : '',
            lead_source: client.lead_source || '',
            lead_channel: client.lead_channel || '',
            lead_message: client.lead_message || '',
            assigned_department_id: client.assigned_department_id ? String(client.assigned_department_id) : '',
            assigned_staff_id: primaryOwnerId ? String(primaryOwnerId) : '',
            sales_owner_id: primaryOwnerId ? String(primaryOwnerId) : '',
            care_staff_ids: normalizeCareStaffIds(client.care_staff_users || []),
        });
    };

    const fetchLookups = async () => {
        setLoadingLookups(true);
        try {
            const [leadRes, deptRes, userRes, productRes, statusRes] = await Promise.all([
                axios.get('/api/v1/lead-types').catch(() => ({ data: [] })),
                axios.get('/api/v1/departments').catch(() => ({ data: [] })),
                axios.get('/api/v1/users/lookup', { params: { purpose: 'operational_assignee' } }).catch(() => ({ data: { data: [] } })),
                axios.get('/api/v1/products', { params: { per_page: 300, page: 1 } }).catch(() => ({ data: { data: [] } })),
                axios.get('/api/v1/opportunity-statuses').catch(() => ({ data: [] })),
            ]);
            const nextLeadTypes = Array.isArray(leadRes.data) ? leadRes.data : [];
            const nextDepartments = Array.isArray(deptRes.data) ? deptRes.data : [];
            const nextUsers = Array.isArray(userRes.data?.data) ? userRes.data.data : [];
            const nextProducts = Array.isArray(productRes.data?.data) ? productRes.data.data : [];
            const nextStatuses = Array.isArray(statusRes.data) ? statusRes.data : [];

            setLeadTypes(nextLeadTypes);
            setDepartments(nextDepartments);
            setStaffUsers(nextUsers);
            setOpportunityProducts(nextProducts);
            setOpportunityStatuses(nextStatuses);
            return {
                users: nextUsers,
            };
        } finally {
            setLoadingLookups(false);
        }
    };

    const openEditModal = async () => {
        const cid = flow?.client?.id;
        if (!cid) return;
        hydrateClientForm(flow?.client);
        setShowEditModal(true);
        if (leadTypes.length === 0 && departments.length === 0 && staffUsers.length === 0) {
            await fetchLookups();
        }
        try {
            const res = await axios.get(`/api/v1/crm/clients/${cid}`);
            if (res.data?.id) {
                hydrateClientForm(res.data);
            }
        } catch {
            // giữ dữ liệu từ flow
        }
    };

    const submitClientUpdate = async (event) => {
        event.preventDefault();
        if (!flow?.client?.id) return;
        if (!(clientForm.name || '').trim()) {
            toast.error('Vui lòng nhập tên khách hàng.');
            return;
        }
        setSavingClient(true);
        try {
            const resolvedAssignedStaffId = clientForm.assigned_staff_id
                ? Number(clientForm.assigned_staff_id)
                : null;
            if (canAssignClientOwner && !resolvedAssignedStaffId) {
                toast.error('Vui lòng chọn nhân sự phụ trách trực tiếp.');
                return;
            }
            const payload = {
                name: (clientForm.name || '').trim(),
                company: (clientForm.company || '').trim() || null,
                email: (clientForm.email || '').trim() || null,
                phone: (clientForm.phone || '').trim() || null,
                notes: (clientForm.notes || '').trim() || null,
                lead_type_id: clientForm.lead_type_id ? Number(clientForm.lead_type_id) : null,
                lead_source: (clientForm.lead_source || '').trim() || null,
                lead_channel: (clientForm.lead_channel || '').trim() || null,
                lead_message: (clientForm.lead_message || '').trim() || null,
            };
            if (canAssignClientOwner) {
                Object.assign(payload, {
                    assigned_department_id: clientForm.assigned_department_id ? Number(clientForm.assigned_department_id) : null,
                    assigned_staff_id: resolvedAssignedStaffId,
                    sales_owner_id: resolvedAssignedStaffId,
                    care_staff_ids: normalizeCareStaffIds(clientForm.care_staff_ids),
                });
            }
            await axios.put(`/api/v1/crm/clients/${flow.client.id}`, payload);
            toast.success('Đã cập nhật khách hàng.');
            setShowEditModal(false);
            await fetchFlow();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không thể cập nhật khách hàng.');
        } finally {
            setSavingClient(false);
        }
    };

    const navigateTo = (url) => {
        if (!url) return;
        window.location.href = url;
    };

    const submitComment = async (event) => {
        event.preventDefault();
        if (!flow?.client?.id) return;

        const title = (careNoteForm.title || '').trim();
        const detail = (careNoteForm.detail || '').trim();
        if (!title || !detail) {
            toast.error('Vui lòng nhập tiêu đề và nội dung bình luận.');
            return;
        }

        const draft = { title, detail };
        setSubmittingCareNote(true);
        setSendingCommentFx(true);
        setCareNoteForm({ title: '', detail: '' });
        window.setTimeout(() => setSendingCommentFx(false), 320);
        try {
            const res = await axios.post(`/api/v1/crm/clients/${flow.client.id}/comments`, {
                title,
                detail,
            });
            const comment = res?.data?.comment;
            if (comment) {
                setCommentsHistory((prev) => {
                    const merged = normalizeCommentsHistoryRows([...prev, comment]);
                    commentsSignatureRef.current = buildCommentsSignature(merged);
                    return merged;
                });
            } else {
                await fetchCommentsOnly({ silent: false });
            }
            toast.success('Đã thêm bình luận.');
        } catch (e) {
            setCareNoteForm(draft);
            toast.error(e?.response?.data?.message || 'Không thể thêm bình luận.');
        } finally {
            setSubmittingCareNote(false);
        }
    };

    const watcherOptions = useMemo(() => (
        staffUsers.map((user) => ({
            id: Number(user?.id || 0),
            label: user?.name || `Nhân sự #${user?.id}`,
            meta: [user?.role, user?.email].filter(Boolean).join(' • '),
        })).filter((user) => user.id > 0)
    ), [staffUsers]);

    const editModalAssignedStaffOptions = useMemo(() => {
        const deptId = Number(clientForm.assigned_department_id || 0);
        if (deptId <= 0) {
            return staffUsers;
        }
        return staffUsers.filter((u) => Number(u.department_id || 0) === deptId);
    }, [staffUsers, clientForm.assigned_department_id]);

    const closeOpportunityModal = () => {
        setShowOpportunityModal(false);
        setEditingOpportunityId(null);
    };

    const openCreateOpportunityModal = async () => {
        if (loadingLookups) return;
        if (!staffUsers.length || !opportunityStatuses.length) {
            await fetchLookups();
        }

        const currentUserId = Number(auth?.user?.id || 0);
        const defaultStatusCode = String((opportunityStatuses[0]?.code || '')).trim();
        setEditingOpportunityId(null);
        setOpportunityForm({
            title: '',
            opportunity_type: '',
            status: defaultStatusCode,
            source: '',
            amount: '',
            success_probability: '',
            expected_close_date: '',
            product_id: '',
            assigned_to: currentUserId > 0 ? String(currentUserId) : '',
            watcher_ids: [],
            notes: '',
        });
        setShowOpportunityModal(true);
    };

    const mapRowToOpportunityForm = (row) => ({
        title: row.title || '',
        opportunity_type: row.opportunity_type || '',
        status: row.status ? String(row.status) : '',
        source: row.source || '',
        amount: row.amount !== null && row.amount !== undefined ? String(row.amount) : '',
        success_probability: row.success_probability != null && row.success_probability !== ''
            ? String(row.success_probability)
            : '',
        expected_close_date: toDateInputValue(row.expected_close_date),
        product_id: (row.product_id ?? row.product?.id) ? String(row.product_id ?? row.product?.id) : '',
        assigned_to: row.assigned_to ? String(row.assigned_to) : '',
        watcher_ids: Array.isArray(row.watcher_ids)
            ? row.watcher_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
            : [],
        notes: row.notes || '',
    });

    const openEditOpportunityModal = async (row) => {
        if (!row?.id || loadingLookups || !canCreateOpportunity || row?.can_edit === false) return;
        if (!staffUsers.length || !opportunityStatuses.length) {
            await fetchLookups();
        }
        setEditingOpportunityId(row.id);
        setOpportunityForm(mapRowToOpportunityForm(row));
        setShowOpportunityModal(true);
        try {
            const res = await axios.get(`/api/v1/opportunities/${row.id}`);
            if (res.data?.id) {
                setOpportunityForm(mapRowToOpportunityForm(res.data));
            }
        } catch {
            // giữ dữ liệu từ tab
        }
    };

    const deleteOpportunity = async (row) => {
        if (!row?.id || !canCreateOpportunity || row?.can_delete === false) return;
        if (!window.confirm(`Xóa cơ hội "${row.title || `#${row.id}`}"? Hành động không hoàn tác.`)) return;
        setDeletingOpportunityId(row.id);
        try {
            await axios.delete(`/api/v1/opportunities/${row.id}`);
            toast.success('Đã xóa cơ hội.');
            await fetchFlow();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không thể xóa cơ hội.');
        } finally {
            setDeletingOpportunityId(null);
        }
    };

    const submitOpportunity = async (event) => {
        event.preventDefault();
        if (!flow?.client?.id) return;
        if (!String(opportunityForm.title || '').trim()) {
            toast.error('Vui lòng nhập tên cơ hội.');
            return;
        }
        const amountParsed = numberOrNull(opportunityForm.amount);
        if (amountParsed === null || amountParsed < 0) {
            toast.error('Vui lòng nhập doanh số dự kiến (số ≥ 0).');
            return;
        }
        const probParsed = numberOrNull(opportunityForm.success_probability);
        if (probParsed === null || !Number.isInteger(probParsed) || probParsed < 0 || probParsed > 100) {
            toast.error('Vui lòng chọn tỷ lệ thành công (0–100%).');
            return;
        }

        const payload = {
            title: String(opportunityForm.title || '').trim(),
            opportunity_type: String(opportunityForm.opportunity_type || '').trim() || null,
            client_id: Number(flow.client.id),
            status: String(opportunityForm.status || '').trim() || null,
            source: String(opportunityForm.source || '').trim() || null,
            amount: amountParsed,
            success_probability: probParsed,
            product_id: opportunityForm.product_id ? Number(opportunityForm.product_id) : null,
            assigned_to: opportunityForm.assigned_to ? Number(opportunityForm.assigned_to) : null,
            watcher_ids: (opportunityForm.watcher_ids || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0),
            expected_close_date: opportunityForm.expected_close_date || null,
            notes: String(opportunityForm.notes || '').trim() || null,
        };

        setSavingOpportunity(true);
        try {
            if (editingOpportunityId) {
                await axios.put(`/api/v1/opportunities/${editingOpportunityId}`, payload);
                toast.success('Đã cập nhật cơ hội.');
            } else {
                await axios.post('/api/v1/opportunities', payload);
                toast.success('Đã thêm cơ hội mới.');
            }
            closeOpportunityModal();
            await fetchFlow();
            setActiveTab('co_hoi');
        } catch (e) {
            const message = e?.response?.data?.message || 'Không thể tạo cơ hội.';
            const validation = e?.response?.data?.errors
                ? Object.values(e.response.data.errors).flat().join(' ')
                : '';
            toast.error(message === 'The given data was invalid.' && validation ? validation : message);
        } finally {
            setSavingOpportunity(false);
        }
    };

    const deleteComment = async (commentId) => {
        if (!flow?.client?.id || !commentId) return;
        if (!window.confirm('Xóa bình luận này?')) return;

        setDeletingCommentId(String(commentId));
        try {
            await axios.delete(`/api/v1/crm/clients/${flow.client.id}/comments/${commentId}`);
            setCommentsHistory((prev) => {
                const nextRows = prev.filter((comment) => String(comment.id) !== String(commentId));
                commentsSignatureRef.current = buildCommentsSignature(nextRows);
                return nextRows;
            });
            toast.success('Đã xóa bình luận.');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không thể xóa bình luận.');
        } finally {
            setDeletingCommentId('');
        }
    };

    const opportunities = flow?.opportunities || [];
    const contracts = flow?.contracts || [];
    const projects = flow?.projects || [];
    const tasks = flow?.tasks || [];
    const items = flow?.items || [];
    const rotation = flow?.client_rotation || null;
    const rotationHistory = Array.isArray(flow?.rotation_history) ? flow.rotation_history : [];

    const projectById = useMemo(() => {
        const map = new Map();
        projects.forEach((project) => map.set(Number(project.id), project));
        return map;
    }, [projects]);

    const taskById = useMemo(() => {
        const map = new Map();
        tasks.forEach((task) => map.set(Number(task.id), task));
        return map;
    }, [tasks]);

    const summary = useMemo(() => {
        const completedOpportunities = opportunities.filter((row) => (
            doneStatusSet.has(opportunityStatusCode(row))
        )).length;
        const completedContracts = contracts.filter((row) => {
            const status = String(row.status || '').toLowerCase();
            const approval = String(row.approval_status || '').toLowerCase();
            return doneContractStatusSet.has(status) || doneContractStatusSet.has(approval);
        }).length;
        const completedProjects = projects.filter((row) => doneStatusSet.has(String(row.status || '').toLowerCase())).length;
        const completedTasks = tasks.filter((row) => doneStatusSet.has(String(row.status || '').toLowerCase())).length;
        const completedItems = items.filter((row) => doneStatusSet.has(String(row.status || '').toLowerCase())).length;

        const totalRecords = opportunities.length + contracts.length + projects.length + tasks.length + items.length;
        const completedRecords = completedOpportunities + completedContracts + completedProjects + completedTasks + completedItems;
        const progressPercent = totalRecords > 0 ? Math.round((completedRecords / totalRecords) * 100) : 0;

        return {
            totalRecords,
            completedRecords,
            progressPercent,
            opportunities: { total: opportunities.length, done: completedOpportunities },
            contracts: { total: contracts.length, done: completedContracts },
            projects: { total: projects.length, done: completedProjects },
            tasks: { total: tasks.length, done: completedTasks },
            items: { total: items.length, done: completedItems },
        };
    }, [opportunities, contracts, projects, tasks, items]);

    const stats = useMemo(() => {
        return [
            { label: 'Tiến độ tổng', value: `${summary.progressPercent}%` },
            { label: 'Cơ hội', value: `${summary.opportunities.done}/${summary.opportunities.total}` },
            { label: 'Hợp đồng', value: `${summary.contracts.done}/${summary.contracts.total}` },
            { label: 'Đầu việc', value: `${summary.items.done}/${summary.items.total}` },
        ];
    }, [summary]);

    const pt = flow?.pending_staff_transfer;
    const transferPending = pt && pt.status === 'pending';

    const tabs = [
        { key: 'tong_quan', label: 'Tổng quan', icon: 'chart', count: null },
        { key: 'co_hoi', label: 'Cơ hội', icon: 'trend', count: opportunities.length },
        { key: 'hop_dong', label: 'Hợp đồng', icon: 'file', count: contracts.length },
        { key: 'du_an', label: 'Dự án', icon: 'folder', count: projects.length },
        { key: 'cong_viec', label: 'Công việc', icon: 'tasks', count: tasks.length },
        { key: 'dau_viec', label: 'Đầu việc', icon: 'check', count: items.length },
    ];

    return (
        <PageContainer
            auth={auth}
            title="Luồng khách hàng"
            description="Trang chi tiết khách: tab nghiệp vụ, thống kê, chuyển phụ trách (phiếu bàn giao), ghi chú và trao đổi nội bộ."
            stats={stats}
        >
            <div className="space-y-5">
                {transferPending ? (
                    <ClientStaffTransferPendingBanner
                        transfer={pt}
                        myUserId={myUserId}
                        normalizedRole={userRole}
                        loading={transferActionLoading}
                        density="emphasized"
                        onAction={actOnPendingTransfer}
                    />
                ) : null}

                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-xs uppercase tracking-[0.14em] text-text-subtle">Khách hàng</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                <h3 className="text-xl font-semibold text-slate-900">{flow?.client?.name || '—'}</h3>
                                {flow?.client?.is_in_rotation_pool && (
                                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                                        Đang ở kho số
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 text-sm text-slate-500">{flow?.client?.company || 'Chưa có công ty'} • {flow?.client?.phone || 'Chưa có số điện thoại'}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {flow?.crm_access_mode === 'full' && !transferPending && flow?.permissions?.can_manage_client && (
                                <button
                                    type="button"
                                    onClick={openTransferModal}
                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                                >
                                    <AppIcon name="handover" className="h-4 w-4" />
                                    Chuyển phụ trách
                                </button>
                            )}
                            {flow?.permissions?.can_manage_client && flow?.crm_access_mode === 'full' && (
                            <button
                                type="button"
                                onClick={openEditModal}
                                className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
                            >
                                <AppIcon name="edit" className="h-4 w-4" />
                                Sửa khách hàng
                            </button>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {[
                            { label: 'Cơ hội', value: `${summary.opportunities.done}/${summary.opportunities.total}` },
                            { label: 'Hợp đồng', value: `${summary.contracts.done}/${summary.contracts.total}` },
                            { label: 'Dự án', value: `${summary.projects.done}/${summary.projects.total}` },
                            { label: 'Công việc', value: `${summary.tasks.done}/${summary.tasks.total}` },
                            { label: 'Đầu việc', value: `${summary.items.done}/${summary.items.total}` },
                        ].map((card) => (
                            <div key={card.label} className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                <div className="text-xs uppercase tracking-[0.14em] text-slate-400">{card.label}</div>
                                <div className="mt-1 text-lg font-semibold text-slate-900">{card.value}</div>
                            </div>
                        ))}
                    </div>

                    {flow?.client?.is_in_rotation_pool && (
                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                            <p className="font-semibold">Khách hàng đang mở nhận trong kho số</p>
                            <p className="mt-1 text-xs leading-5">
                                Khách này vẫn giữ người phụ trách hiện tại trong CRM cho đến khi có nhân sự khác nhận từ kho số.
                                {flow?.client?.rotation_pool_entered_at ? ` Đưa vào kho số lúc ${formatDateTime(flow.client.rotation_pool_entered_at)}.` : ''}
                            </p>
                        </div>
                    )}

                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        <p className="font-semibold">Công thức tiến độ tổng: {summary.progressPercent}%</p>
                        <p className="mt-1 text-xs leading-5">
                            Tiến độ tổng = (Cơ hội thành công + Hợp đồng đã nhận bàn giao/active + Dự án hoàn thành + Công việc hoàn tất + Đầu việc hoàn tất)
                            / Tổng số bản ghi của 5 nhóm x 100.
                        </p>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                    <div className="flex flex-wrap gap-2">
                        {tabs.map((tab) => (
                            <TabButton
                                key={tab.key}
                                active={activeTab === tab.key}
                                icon={tab.icon}
                                label={tab.label}
                                count={tab.count}
                                onClick={() => setActiveTab(tab.key)}
                            />
                        ))}
                    </div>

                    {loading && (
                        <div className="mt-4 rounded-2xl border border-dashed border-slate-200/80 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                            Đang tải dữ liệu khách hàng...
                        </div>
                    )}

                    {!loading && activeTab === 'tong_quan' && (
                        <div className="mt-5 space-y-4">
                            <div className="grid gap-4 lg:grid-cols-2">
                                <div className="rounded-2xl border border-slate-200/80 p-4">
                                    <h4 className="text-sm font-semibold text-slate-900">Thông tin chung</h4>
                                    <div className="mt-3 space-y-2 text-sm">
                                        <div className="flex justify-between gap-2"><span className="text-slate-500">Email</span><span className="font-medium text-slate-800">{flow?.client?.email || '—'}</span></div>
                                        <div className="flex justify-between gap-2"><span className="text-slate-500">Nguồn</span><span className="font-medium text-slate-800">{flow?.client?.lead_source || '—'} {flow?.client?.lead_channel ? `• ${flow.client.lead_channel}` : ''}</span></div>
                                        <div className="flex justify-between gap-2"><span className="text-slate-500">Doanh thu</span><span className="font-medium text-slate-800">{formatCurrency(flow?.client?.total_revenue)} VNĐ</span></div>
                                        <div className="flex justify-between gap-2"><span className="text-slate-500">Phụ trách chính</span><span className="font-medium text-slate-800">{flow?.client?.assigned_staff?.name || flow?.client?.sales_owner?.name || '—'}</span></div>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200/80 p-4">
                                    <h4 className="text-sm font-semibold text-slate-900">Nhân sự chăm sóc</h4>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {(flow?.client?.care_staff_users || []).length > 0 ? flow.client.care_staff_users.map((staff) => (
                                            <span key={staff.id} className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                                                {staff.name}
                                            </span>
                                        )) : (
                                            <span className="text-sm text-slate-500">Chưa có nhân sự chăm sóc.</span>
                                        )}
                                    </div>
                                    <p className="mt-4 text-xs leading-5 text-slate-500">Khi thêm bình luận, hệ thống tự lưu người gửi và thời gian để tiện theo dõi lịch sử trao đổi.</p>
                                </div>
                            </div>

                            {rotation && (
                                <div className="rounded-2xl border border-slate-200/80 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <h4 className="text-sm font-semibold text-slate-900">Theo dõi xoay khách hàng</h4>
                                            <p className="mt-1 text-xs leading-5 text-slate-500">
                                                {rotation.trigger_label || rotation.protecting_label || 'Hệ thống lấy mốc bảo vệ xa nhất giữa hợp đồng, cơ hội, bình luận và mốc reset / tạo khách để tính ngày xoay.'}
                                            </p>
                                        </div>
                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                            rotation.eligible_for_auto_rotation
                                                ? 'bg-rose-100 text-rose-700'
                                                : rotation.warning_due
                                                    ? 'bg-amber-100 text-amber-700'
                                                    : rotation.in_scope
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : 'bg-slate-100 text-slate-700'
                                        }`}>
                                            {rotation.status_label || 'Chưa có trạng thái'}
                                        </span>
                                    </div>

                                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                            <div className="text-xs uppercase tracking-[0.12em] text-slate-400">Bình luận / ghi chú</div>
                                            <div className="mt-1 text-lg font-semibold text-slate-900">
                                                {rotation.comment_has_activity ? `${rotation.days_since_comment ?? 0} ngày` : 'Chưa có'}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-500">Mốc xoay: {rotation.thresholds?.comment_stale_days ?? '—'} ngày</div>
                                            <div className="mt-1 text-xs text-slate-400">
                                                {rotation.comment_has_activity
                                                    ? `Tính từ: ${formatDateTime(rotation.effective_comment_at)}`
                                                    : `Fallback theo mốc reset: ${rotation.rotation_anchor_at ? formatDateTime(rotation.rotation_anchor_at) : '—'}`}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                            <div className="text-xs uppercase tracking-[0.12em] text-slate-400">Cơ hội mới</div>
                                            <div className="mt-1 text-lg font-semibold text-slate-900">
                                                {rotation.opportunity_has_activity ? `${rotation.days_since_opportunity ?? 0} ngày` : 'Chưa có'}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-500">Mốc xoay: {rotation.thresholds?.opportunity_stale_days ?? '—'} ngày</div>
                                            <div className="mt-1 text-xs text-slate-400">
                                                Tính từ: {rotation.opportunity_has_activity && rotation.effective_opportunity_at ? formatDateTime(rotation.effective_opportunity_at) : 'Chưa có cơ hội để gia hạn'}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                            <div className="text-xs uppercase tracking-[0.12em] text-slate-400">Hợp đồng mới</div>
                                            <div className="mt-1 text-lg font-semibold text-slate-900">
                                                {rotation.contract_has_activity ? `${rotation.days_since_contract ?? 0} ngày` : 'Chưa có'}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-500">Mốc xoay: {rotation.thresholds?.contract_stale_days ?? '—'} ngày</div>
                                            <div className="mt-1 text-xs text-slate-400">
                                                Tính từ: {rotation.contract_has_activity && rotation.effective_contract_at ? formatDateTime(rotation.effective_contract_at) : 'Chưa có hợp đồng để gia hạn'}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                                            <div className="text-xs uppercase tracking-[0.12em] text-slate-400">Còn tới khi vào diện xoay</div>
                                            <div className="mt-1 text-lg font-semibold text-slate-900">
                                                {rotation.eligible_for_auto_rotation ? 'Đến hạn' : `${rotation.days_until_rotation ?? 0} ngày`}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-500">
                                                {rotation.active_rule_label
                                                    ? `Mốc đang giữ: ${rotation.active_rule_label} • còn ${rotation.active_stage_remaining_days ?? 0} ngày`
                                                    : 'Chưa có mốc bảo vệ'}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-400">
                                                {rotation.projected_rotation_at ? `Ngày xoay dự kiến: ${formatDateTime(rotation.projected_rotation_at)}` : (rotation.rotation_anchor_at ? `Mốc reset: ${formatDateTime(rotation.rotation_anchor_at)}` : 'Chưa có mốc reset')}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
                                        Quota cron chỉ tính lượt auto-rotation: tối đa {rotation.thresholds?.daily_receive_limit ?? '—'} khách/người/ngày.
                                        Quota kho số chỉ tính lượt nhân sự tự bấm nhận: tối đa {rotation.thresholds?.pool_claim_daily_limit ?? '—'} khách/người/ngày.
                                    </div>

                                    {flow?.permissions?.can_view_rotation_history && (
                                        <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <h5 className="text-sm font-semibold text-slate-900">Lịch sử đã từng phụ trách</h5>
                                                <span className="text-xs text-slate-500">{rotationHistory.length} bản ghi</span>
                                            </div>
                                            <div className="mt-3 space-y-2">
                                                {rotationHistory.length === 0 ? (
                                                    <div className="text-sm text-slate-500">Khách hàng này chưa có lịch sử điều chuyển.</div>
                                                ) : rotationHistory.slice(0, 8).map((row) => (
                                                    <div key={row.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                                        <div className="text-sm font-semibold text-slate-900">{row.action_label || 'Điều chuyển'}</div>
                                                        <div className="mt-1 text-xs text-slate-600">
                                                            {row.from_staff?.name || 'Chưa rõ'} → {row.to_staff?.name || 'Chưa rõ'} • {formatDateTime(row.transferred_at)}
                                                        </div>
                                                        {row.note ? <div className="mt-1 text-xs text-slate-500">{row.note}</div> : null}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {!loading && activeTab === 'co_hoi' && (
                        <div className="mt-5 space-y-3">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                {canCreateOpportunity ? (
                                    <button
                                        type="button"
                                        className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white"
                                        onClick={openCreateOpportunityModal}
                                    >
                                        + Thêm cơ hội
                                    </button>
                                ) : null}
                            </div>
                            <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                                        <th className="py-2">Tên cơ hội</th>
                                        <th className="py-2">Trạng thái</th>
                                        <th className="py-2">Doanh số</th>
                                        <th className="py-2">Phụ trách</th>
                                        <th className="py-2">Người tạo cơ hội</th>
                                        <th className="py-2">Dự kiến chốt</th>
                                        <th className="py-2">Ghi chú</th>
                                        <th className="py-2 w-[1%] whitespace-nowrap text-right">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {opportunities.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/80"
                                            onClick={(e) => {
                                                if (e.target.closest('[data-opp-action]')) return;
                                                navigateTo(route('opportunities.detail', row.id));
                                            }}
                                        >
                                            <td className="py-2.5 font-medium text-slate-900">{row.title || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">
                                                <span
                                                    className="inline-flex rounded-full border px-2 py-1 font-semibold"
                                                    style={{
                                                        borderColor: opportunityStatusHex(row),
                                                        color: opportunityStatusHex(row),
                                                        backgroundColor: `${opportunityStatusHex(row)}20`,
                                                    }}
                                                >
                                                    {opportunityStatusLabel(row)}
                                                </span>
                                            </td>
                                            <td className="py-2.5 text-xs text-slate-600">{formatCurrency(row.amount)} VNĐ</td>
                                            <td className="py-2.5 text-xs text-slate-600">{row.assignee?.name || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{row.creator?.name || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{formatDate(row.expected_close_date)}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{row.notes || '—'}</td>
                                            <td className="py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex flex-wrap items-center justify-end gap-1.5" data-opp-action>
                                                    {canCreateOpportunity && row?.can_edit !== false ? (
                                                        <button
                                                            type="button"
                                                            data-opp-action
                                                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-primary/40 hover:text-primary"
                                                            onClick={() => openEditOpportunityModal(row)}
                                                        >
                                                            Sửa
                                                        </button>
                                                    ) : null}
                                                    {canCreateOpportunity && row?.can_delete !== false ? (
                                                        <button
                                                            type="button"
                                                            data-opp-action
                                                            className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                                            disabled={deletingOpportunityId === row.id}
                                                            onClick={() => deleteOpportunity(row)}
                                                        >
                                                            {deletingOpportunityId === row.id ? '…' : 'Xóa'}
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {opportunities.length === 0 && <EmptyTable colSpan={8} message="Khách hàng chưa có cơ hội nào." />}
                                </tbody>
                            </table>
                            </div>
                        </div>
                    )}

                    {!loading && activeTab === 'hop_dong' && (
                        <div className="mt-5 overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                                        <th className="py-2">Mã hợp đồng</th>
                                        <th className="py-2">Tên hợp đồng</th>
                                        <th className="py-2">Trạng thái</th>
                                        <th className="py-2">Bàn giao</th>
                                        <th className="py-2">Giá trị</th>
                                        <th className="py-2">Ngày ký</th>
                                        <th className="py-2">Hiệu lực đến</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {contracts.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/80"
                                            onClick={() => navigateTo(`/hop-dong/${row.id}`)}
                                        >
                                            <td className="py-2.5 text-xs text-slate-600">{row.code || `HD-${row.id}`}</td>
                                            <td className="py-2.5 font-medium text-slate-900">{row.title || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{statusLabel(row.status)}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{statusLabel(row.approval_status)}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{formatCurrency(row.value)} VNĐ</td>
                                            <td className="py-2.5 text-xs text-slate-600">{formatDate(row.signed_at)}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{formatDate(row.end_date)}</td>
                                        </tr>
                                    ))}
                                    {contracts.length === 0 && <EmptyTable colSpan={7} message="Khách hàng chưa có hợp đồng nào." />}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {!loading && activeTab === 'du_an' && (
                        <div className="mt-5 overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                                        <th className="py-2">Tên dự án</th>
                                        <th className="py-2">Dịch vụ</th>
                                        <th className="py-2">Trạng thái</th>
                                        <th className="py-2">Tiến độ</th>
                                        <th className="py-2">Hạn</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {projects.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/80"
                                            onClick={() => navigateTo(`/du-an/${row.id}`)}
                                        >
                                            <td className="py-2.5 font-medium text-slate-900">{row.name || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{serviceLabel(row)}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{statusLabel(row.status)}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{Number(row.progress_percent ?? 0)}%</td>
                                            <td className="py-2.5 text-xs text-slate-600">{formatDate(row.deadline)}</td>
                                        </tr>
                                    ))}
                                    {projects.length === 0 && <EmptyTable colSpan={5} message="Khách hàng chưa có dự án nào." />}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {!loading && activeTab === 'cong_viec' && (
                        <div className="mt-5 overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                                        <th className="py-2">Công việc</th>
                                        <th className="py-2">Dự án</th>
                                        <th className="py-2">Phụ trách</th>
                                        <th className="py-2">Trạng thái</th>
                                        <th className="py-2">Tiến độ</th>
                                        <th className="py-2">Tỷ trọng</th>
                                        <th className="py-2">Deadline</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tasks.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/80"
                                            onClick={() => navigateTo(`/cong-viec/${row.id}`)}
                                        >
                                            <td className="py-2.5 font-medium text-slate-900">{row.title || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{projectById.get(Number(row.project_id))?.name || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{row.assignee?.name || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{statusLabel(row.status)}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{Number(row.progress_percent ?? 0)}%</td>
                                            <td className="py-2.5 text-xs text-slate-600">{Number(row.weight_percent ?? 0)}%</td>
                                            <td className="py-2.5 text-xs text-slate-600">{formatDate(row.deadline)}</td>
                                        </tr>
                                    ))}
                                    {tasks.length === 0 && <EmptyTable colSpan={7} message="Khách hàng chưa có công việc nào." />}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {!loading && activeTab === 'dau_viec' && (
                        <div className="mt-5 overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                                        <th className="py-2">Đầu việc</th>
                                        <th className="py-2">Công việc</th>
                                        <th className="py-2">Phụ trách</th>
                                        <th className="py-2">Trạng thái</th>
                                        <th className="py-2">Tiến độ</th>
                                        <th className="py-2">Tỷ trọng</th>
                                        <th className="py-2">Deadline</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/80"
                                            onClick={() => navigateTo(`/dau-viec/${row.id}`)}
                                        >
                                            <td className="py-2.5 font-medium text-slate-900">{row.title || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{taskById.get(Number(row.task_id))?.title || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{row.assignee?.name || '—'}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{statusLabel(row.status)}</td>
                                            <td className="py-2.5 text-xs text-slate-600">{Number(row.progress_percent ?? 0)}%</td>
                                            <td className="py-2.5 text-xs text-slate-600">{Number(row.weight_percent ?? 0)}%</td>
                                            <td className="py-2.5 text-xs text-slate-600">{formatDate(row.deadline)}</td>
                                        </tr>
                                    ))}
                                    {items.length === 0 && <EmptyTable colSpan={7} message="Khách hàng chưa có đầu việc nào." />}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h4 className="text-base font-semibold text-slate-900">Bình luận nội bộ</h4>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                                Lịch sử trao đổi nội bộ theo thứ tự mới nhất để đội ngũ nắm bối cảnh nhanh và cập nhật rõ ràng.
                            </p>
                        </div>
                        <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                            {commentsHistory.length} bình luận
                        </span>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-2 sm:p-3">
                        <div
                            ref={commentsScrollRef}
                            className="max-h-[380px] overflow-y-auto pr-1"
                            onScroll={() => {
                                commentsShouldStickToBottomRef.current = isCommentsNearBottom();
                            }}
                        >
                            <div className="space-y-2">
                                {commentsHistory.map((note) => (
                                    <article
                                        key={note.id}
                                        className={`rounded-xl border bg-white p-3.5 shadow-sm transition-all duration-300 hover:shadow ${
                                            commentFlashIds.includes(String(note.id))
                                                ? 'border-primary/40 ring-2 ring-primary/20'
                                                : 'border-slate-200/80'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex min-w-0 items-start gap-3">
                                                <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-bold text-primary">
                                                    {userInitials(note.user)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="line-clamp-1 text-sm font-semibold text-slate-900">{note.title || 'Trao đổi nội bộ'}</p>
                                                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                                                        {note.user?.name || 'Nhân sự'}
                                                        {note.user?.email ? ` • ${note.user.email}` : ''}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2">
                                                <div className="whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-500">
                                                    {formatDateTime(note.created_at)}
                                                </div>
                                                {note?.can_delete && (
                                                    <button
                                                        type="button"
                                                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                                        onClick={() => deleteComment(note.id)}
                                                        disabled={deletingCommentId === String(note.id)}
                                                    >
                                                        <AppIcon name="trash" className="h-3.5 w-3.5" />
                                                        {deletingCommentId === String(note.id) ? 'Đang xóa...' : 'Xóa'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <p className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-sm leading-6 text-slate-700">
                                            {note.detail}
                                        </p>
                                    </article>
                                ))}
                                {commentsHistory.length === 0 && (
                                    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
                                        <div className="mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">i</div>
                                        <p className="text-sm font-semibold text-slate-700">Chưa có bình luận nào</p>
                                        <p className="mt-1 text-xs text-slate-500">Thêm bình luận đầu tiên để lưu lịch sử phối hợp nội bộ.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-4">
                        {flow?.permissions?.can_add_comment ? (
                            <form className="space-y-4" onSubmit={submitComment}>
                                <div>
                                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                                        Tiêu đề bình luận
                                    </label>
                                    <input
                                        className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        placeholder="Ví dụ: Cập nhật sau buổi gọi sáng nay"
                                        value={careNoteForm.title}
                                        onChange={(e) => setCareNoteForm((prev) => ({ ...prev, title: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                                        Nội dung
                                    </label>
                                    <textarea
                                        className="min-h-[132px] w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm leading-6 shadow-sm focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        placeholder="Nhập nội dung bình luận...\nVí dụ: Kết quả buổi trao đổi, vấn đề cần follow-up, người chịu trách nhiệm."
                                        value={careNoteForm.detail}
                                        onChange={(e) => setCareNoteForm((prev) => ({ ...prev, detail: e.target.value }))}
                                    />
                                    <div className="mt-1.5 flex items-center justify-between text-xs text-slate-400">
                                        <span>Nên ghi ngắn gọn, rõ hành động để người sau dễ theo dõi.</span>
                                        <span>{(careNoteForm.detail || '').length} ký tự</span>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                    <button
                                        type="button"
                                        className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                                        onClick={() => setCareNoteForm({ title: '', detail: '' })}
                                        disabled={submittingCareNote}
                                    >
                                        Xóa nội dung
                                    </button>
                                    <button
                                        type="submit"
                                        className={`inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${
                                            sendingCommentFx ? 'scale-[1.02] shadow-md' : ''
                                        } hover:bg-primary/90`}
                                        disabled={submittingCareNote}
                                    >
                                        {submittingCareNote ? 'Đang gửi...' : 'Gửi bình luận'}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                Bạn chỉ có quyền xem lịch sử bình luận của khách hàng này.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Modal
                open={showTransferModal}
                onClose={() => setShowTransferModal(false)}
                title="Chuyển phụ trách khách hàng"
                description="Chọn nhân sự cùng phòng ban (không gồm admin / kế toán). Người nhận phải xác nhận trước khi trở thành phụ trách chính thức."
                size="md"
            >
                <form className="mt-2 space-y-4 text-sm" onSubmit={submitTransferRequest}>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Nhân sự nhận *</label>
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={transferForm.to_staff_id}
                            onChange={(e) => setTransferForm((s) => ({ ...s, to_staff_id: e.target.value }))}
                            required
                        >
                            <option value="">Chọn nhân sự</option>
                            {transferEligible.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.name} ({u.role})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Ghi chú</label>
                        <textarea
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            rows={3}
                            value={transferForm.note}
                            onChange={(e) => setTransferForm((s) => ({ ...s, note: e.target.value }))}
                            placeholder="Lý do chuyển giao (tuỳ chọn)"
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setShowTransferModal(false)}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Đóng
                        </button>
                        <button
                            type="submit"
                            disabled={transferSubmitting}
                            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                        >
                            {transferSubmitting ? 'Đang gửi...' : 'Gửi phiếu'}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                open={showEditModal}
                onClose={() => setShowEditModal(false)}
                title="Sửa khách hàng"
                description="Cập nhật thông tin khách hàng từ trang chi tiết."
                size="lg"
            >
                <form className="mt-2 space-y-4 text-sm" onSubmit={submitClientUpdate}>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Tên khách hàng *</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={clientForm.name}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, name: e.target.value }))}
                                placeholder="VD: Nguyễn Văn A"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Công ty</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={clientForm.company}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, company: e.target.value }))}
                                placeholder="Tên công ty"
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Email</label>
                            <input
                                type="email"
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={clientForm.email}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, email: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Số điện thoại</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={clientForm.phone}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, phone: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className={`grid gap-4 ${canAssignClientOwner ? 'md:grid-cols-2' : ''}`}>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Loại lead</label>
                            <select
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={clientForm.lead_type_id}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, lead_type_id: e.target.value }))}
                            >
                                <option value="">Chưa chọn</option>
                                {leadTypes.map((lead) => (
                                    <option key={lead.id} value={lead.id}>
                                        {lead.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {canAssignClientOwner ? (
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Phòng ban phụ trách</label>
                                <select
                                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                    value={clientForm.assigned_department_id}
                                    onChange={(e) => {
                                        const nextDept = e.target.value;
                                        setClientForm((prev) => {
                                            const deptNum = Number(nextDept || 0);
                                            let nextStaff = prev.assigned_staff_id;
                                            if (deptNum > 0 && nextStaff) {
                                                const selectedUser = editModalAssignedStaffOptions.find((user) => String(user.id) === String(nextStaff));
                                                if (!selectedUser || Number(selectedUser.department_id || 0) !== deptNum) {
                                                    nextStaff = '';
                                                }
                                            }

                                            return {
                                                ...prev,
                                                assigned_department_id: nextDept,
                                                assigned_staff_id: nextStaff,
                                                sales_owner_id: nextStaff,
                                            };
                                        });
                                    }}
                                >
                                    <option value="">Chưa chọn</option>
                                    {departments.map((department) => (
                                        <option key={department.id} value={department.id}>
                                            {department.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : null}
                    </div>

                    {canAssignClientOwner ? (
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Nhân sự phụ trách</label>
                                <select
                                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                    value={clientForm.assigned_staff_id}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        const selectedUser = editModalAssignedStaffOptions.find((user) => String(user.id) === String(val));
                                        const deptFromUser = selectedUser?.department_id != null && String(selectedUser.department_id) !== ''
                                            ? String(selectedUser.department_id)
                                            : null;
                                        setClientForm((prev) => ({
                                            ...prev,
                                            assigned_staff_id: val,
                                            sales_owner_id: val,
                                            assigned_department_id: deptFromUser ?? prev.assigned_department_id,
                                        }));
                                    }}
                                >
                                    <option value="">Chưa chọn</option>
                                    {editModalAssignedStaffOptions.map((user) => (
                                        <option key={user.id} value={user.id}>
                                            {user.name} ({user.role})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Sales owner</label>
                                <input
                                    type="text"
                                    className="w-full rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-slate-600"
                                    value={
                                        clientForm.assigned_staff_id
                                            ? (editModalAssignedStaffOptions.find((user) => String(user.id) === String(clientForm.assigned_staff_id))?.name || 'Đang đồng bộ theo nhân sự phụ trách')
                                            : 'Chưa có nhân sự phụ trách'
                                    }
                                    readOnly
                                />
                                <p className="mt-1 text-xs text-text-muted">
                                    Sales owner được đồng bộ tự động theo nhân sự phụ trách trực tiếp.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-amber-100 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                            <p className="font-semibold text-amber-950">Phân công &amp; nhóm chăm sóc</p>
                            <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
                                Nhân viên không đổi phụ trách trực tiếp trên form này. Vui lòng dùng chức năng
                                {' '}
                                <span className="font-semibold">Chuyển phụ trách khách hàng</span>
                                {' '}
                                (phiếu chuyển trong cùng phòng ban) ở tab tổng quan.
                            </p>
                            <dl className="mt-3 space-y-1.5 text-xs text-amber-950/95">
                                <div className="flex justify-between gap-2">
                                    <dt className="text-amber-800/90">Phòng ban phụ trách</dt>
                                    <dd className="max-w-[60%] text-right font-medium">{flow?.client?.assigned_department?.name || '—'}</dd>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <dt className="text-amber-800/90">Nhân sự phụ trách</dt>
                                    <dd className="max-w-[60%] text-right font-medium">{flow?.client?.assigned_staff?.name || flow?.client?.sales_owner?.name || '—'}</dd>
                                </div>
                                <div className="flex flex-col gap-1 border-t border-amber-200/80 pt-2">
                                    <dt className="text-amber-800/90">Nhân sự chăm sóc</dt>
                                    <dd className="text-right font-medium leading-snug">
                                        {Array.isArray(flow?.client?.care_staff_users) && flow.client.care_staff_users.length
                                            ? flow.client.care_staff_users.map((u) => u?.name).filter(Boolean).join(', ')
                                            : '—'}
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Nguồn lead</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={clientForm.lead_source}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, lead_source: e.target.value }))}
                                placeholder="VD: facebook"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Kênh lead</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={clientForm.lead_channel}
                                onChange={(e) => setClientForm((prev) => ({ ...prev, lead_channel: e.target.value }))}
                                placeholder="VD: page_message"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Tóm tắt nhu cầu / tin nhắn lead</label>
                        <textarea
                            className="min-h-[72px] w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={clientForm.lead_message}
                            onChange={(e) => setClientForm((prev) => ({ ...prev, lead_message: e.target.value }))}
                            placeholder="Nội dung lead, nhu cầu khách…"
                        />
                    </div>

                    {canAssignClientOwner ? (
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Nhân sự chăm sóc</label>
                            <TagMultiSelect
                                options={staffUsers.map((user) => ({
                                    id: user.id,
                                    label: user.name || `Nhân sự #${user.id}`,
                                    meta: [user.role, user.email].filter(Boolean).join(' • '),
                                }))}
                                selectedIds={clientForm.care_staff_ids}
                                onChange={(selectedIds) => setClientForm((prev) => ({ ...prev, care_staff_ids: selectedIds }))}
                                addPlaceholder="Tìm và thêm nhân sự chăm sóc"
                                emptyLabel="Chưa gán nhân sự chăm sóc."
                            />
                        </div>
                    ) : null}

                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Ghi chú</label>
                        <textarea
                            className="min-h-[90px] w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={clientForm.notes}
                            onChange={(e) => setClientForm((prev) => ({ ...prev, notes: e.target.value }))}
                        />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setShowEditModal(false)}
                            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={savingClient || loadingLookups}
                            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                        >
                            {savingClient ? 'Đang lưu...' : 'Lưu khách hàng'}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                open={showOpportunityModal}
                onClose={closeOpportunityModal}
                title={editingOpportunityId ? `Sửa cơ hội #${editingOpportunityId}` : 'Thêm cơ hội mới'}
                description={
                    editingOpportunityId
                        ? 'Cập nhật cơ hội cho khách hàng này. Khách hàng không đổi trên màn hình này.'
                        : 'Tạo cơ hội trực tiếp trong trang chi tiết khách hàng. Khách hàng cố định theo trang đang xem.'
                }
                size="md"
            >
                <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={submitOpportunity}>
                    <Field label="Tên cơ hội" required>
                        <input
                            className={filterControlClass}
                            value={opportunityForm.title}
                            onChange={(event) => setOpportunityForm((prev) => ({ ...prev, title: event.target.value }))}
                            placeholder="Nhập tên cơ hội"
                        />
                    </Field>
                    <Field label="Nguồn cơ hội">
                        <input
                            className={filterControlClass}
                            value={opportunityForm.source}
                            onChange={(event) => setOpportunityForm((prev) => ({ ...prev, source: event.target.value }))}
                            placeholder="Ví dụ: Facebook, Form, Telesale"
                        />
                    </Field>
                    <Field label="Loại cơ hội">
                        <input
                            className={filterControlClass}
                            value={opportunityForm.opportunity_type}
                            onChange={(event) => setOpportunityForm((prev) => ({ ...prev, opportunity_type: event.target.value }))}
                            placeholder="Ví dụ: Dịch vụ SEO, Backlink"
                        />
                    </Field>
                    <Field label="Trạng thái cơ hội">
                        <select
                            className={filterControlClass}
                            value={opportunityForm.status}
                            onChange={(event) => setOpportunityForm((prev) => ({ ...prev, status: event.target.value }))}
                        >
                            <option value="">Chọn trạng thái</option>
                            {opportunityStatuses.map((status) => (
                                <option key={status.code} value={status.code}>
                                    {status.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Doanh số dự kiến (VNĐ)" required>
                        <input
                            type="number"
                            min="0"
                            className={filterControlClass}
                            value={opportunityForm.amount}
                            onChange={(event) => setOpportunityForm((prev) => ({ ...prev, amount: event.target.value }))}
                            placeholder="0"
                            required
                        />
                    </Field>
                    <Field
                        label="Khách hàng"
                        hint="Cố định theo khách hàng đang xem — không chỉnh sửa tại đây."
                    >
                        <input
                            className={`${filterControlClass} cursor-not-allowed bg-slate-100 text-slate-800 ring-1 ring-inset ring-slate-200`}
                            value={formatClientOptionLabel(flow?.client) || flow?.client?.name || ''}
                            readOnly
                            tabIndex={-1}
                            autoComplete="off"
                            aria-readonly="true"
                        />
                    </Field>
                    <Field label="Tỷ lệ thành công (%)" required>
                        <select
                            className={filterControlClass}
                            value={opportunityForm.success_probability}
                            onChange={(event) => setOpportunityForm((prev) => ({ ...prev, success_probability: event.target.value }))}
                            required
                        >
                            <option value="">Chọn tỷ lệ</option>
                            {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((value) => (
                                <option key={value} value={value}>{value}%</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Ngày kết thúc dự kiến">
                        <input
                            type="date"
                            className={filterControlClass}
                            value={opportunityForm.expected_close_date}
                            onChange={(event) => setOpportunityForm((prev) => ({ ...prev, expected_close_date: event.target.value }))}
                        />
                    </Field>
                    <Field label="Sản phẩm">
                        <select
                            className={filterControlClass}
                            value={opportunityForm.product_id}
                            onChange={(event) => setOpportunityForm((prev) => ({ ...prev, product_id: event.target.value }))}
                        >
                            <option value="">Chọn sản phẩm</option>
                            {opportunityProducts.map((product) => (
                                <option key={product.id} value={product.id}>
                                    {product.name} {product.code ? `• ${product.code}` : ''}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Người quản lý/phụ trách" hint="Mặc định gán tài khoản đang tạo cơ hội.">
                        <select
                            className={filterControlClass}
                            value={opportunityForm.assigned_to}
                            onChange={(event) => setOpportunityForm((prev) => ({ ...prev, assigned_to: event.target.value }))}
                        >
                            <option value="">Chọn nhân sự</option>
                            {staffUsers.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.name} • {user.role}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <div className="xl:col-span-2">
                        <Field label="Người theo dõi">
                            <TagMultiSelect
                                options={watcherOptions}
                                selectedIds={opportunityForm.watcher_ids}
                                onChange={(next) => setOpportunityForm((prev) => ({ ...prev, watcher_ids: next }))}
                                addPlaceholder="Tìm và thêm người theo dõi"
                                emptyLabel="Chưa chọn người theo dõi."
                            />
                        </Field>
                    </div>
                    <div className="xl:col-span-2">
                        <Field label="Ghi chú">
                            <textarea
                                className={`${filterControlClass} min-h-[108px] resize-y`}
                                value={opportunityForm.notes}
                                onChange={(event) => setOpportunityForm((prev) => ({ ...prev, notes: event.target.value }))}
                                placeholder="Nhập ghi chú cơ hội"
                            />
                        </Field>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 xl:col-span-2">
                        <button
                            type="submit"
                            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                            disabled={savingOpportunity}
                        >
                            {savingOpportunity ? 'Đang lưu...' : (editingOpportunityId ? 'Cập nhật cơ hội' : 'Lưu cơ hội')}
                        </button>
                        <button
                            type="button"
                            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
                            onClick={closeOpportunityModal}
                        >
                            Đóng
                        </button>
                    </div>
                </form>
            </Modal>
        </PageContainer>
    );
}
