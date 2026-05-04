import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import FilterToolbar, {
    FILTER_GRID_SUBMIT_ROW,
    FILTER_GRID_WITH_SUBMIT,
    FILTER_SUBMIT_BUTTON_CLASS,
    FilterActionGroup,
    FilterField,
    filterControlClass,
} from '@/Components/FilterToolbar';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import AppIcon from '@/Components/AppIcon';
import ClientSelect from '@/Components/ClientSelect';
import PaginationControls from '@/Components/PaginationControls';
import TagMultiSelect from '@/Components/TagMultiSelect';
import FilterDateInput from '@/Components/FilterDateInput';
import ClientStaffTransferPendingBanner from '@/Components/ClientStaffTransferPendingBanner';
import { useToast } from '@/Contexts/ToastContext';
import { formatVietnamDate } from '@/lib/vietnamTime';
import { fetchStaffFilterOptions } from '@/lib/staffFilterOptions';

const badgeStyle = (hex) => ({
    borderColor: hex,
    color: hex,
    backgroundColor: `${hex}20`,
});

const parseProductCategories = (rawValue) => {
    if (!rawValue) return [];
    if (Array.isArray(rawValue)) {
        return rawValue.map((item) => String(item || '').trim()).filter(Boolean);
    }

    const text = String(rawValue || '').trim();
    if (!text) return [];

    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
            return parsed.map((item) => String(item || '').trim()).filter(Boolean);
        }
    } catch {
        // ignore parsing error and fallback to delimiter split
    }

    return text
        .split(/[,;\n|]/)
        .map((item) => item.trim())
        .filter(Boolean);
};

const DEFAULT_CLIENT_PAGE = 1;

const DEFAULT_CLIENT_FILTERS = Object.freeze({
    search: '',
    per_page: 10,
    lead_type_id: '',
    type: '',
    revenue_tier_id: '',
    assigned_department_id: '',
    assigned_staff_ids: [],
    created_from: '',
    created_to: '',
    sort_by: 'last_activity_at',
    sort_dir: 'desc',
});

function parseAssignedStaffIdsFromSearchParams(params) {
    const rawValues = [
        params.get('assigned_staff_ids'),
        params.get('assigned_staff_id'),
        ...params.getAll('assigned_staff_ids[]'),
    ];

    return Array.from(new Set(
        rawValues
            .flatMap((value) => String(value || '').split(/[\s,;|]+/))
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0)
    ));
}

function readInitialCrmListState() {
    const params = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    const page = Number(params.get('page') || DEFAULT_CLIENT_PAGE);
    const perPage = Number(params.get('per_page') || DEFAULT_CLIENT_FILTERS.per_page);
    const sortDir = String(params.get('sort_dir') || DEFAULT_CLIENT_FILTERS.sort_dir).trim().toLowerCase();

    return {
        page: Number.isInteger(page) && page > 0 ? page : DEFAULT_CLIENT_PAGE,
        filters: {
            ...DEFAULT_CLIENT_FILTERS,
            search: String(params.get('search') || '').trim(),
            per_page: Number.isInteger(perPage) && perPage > 0 ? perPage : DEFAULT_CLIENT_FILTERS.per_page,
            lead_type_id: String(params.get('lead_type_id') || '').trim(),
            type: String(params.get('type') || '').trim(),
            revenue_tier_id: String(params.get('revenue_tier_id') || '').trim(),
            assigned_department_id: String(params.get('assigned_department_id') || '').trim(),
            assigned_staff_ids: parseAssignedStaffIdsFromSearchParams(params),
            created_from: String(params.get('created_from') || '').trim(),
            created_to: String(params.get('created_to') || '').trim(),
            sort_by: String(params.get('sort_by') || DEFAULT_CLIENT_FILTERS.sort_by).trim() || DEFAULT_CLIENT_FILTERS.sort_by,
            sort_dir: sortDir === 'asc' ? 'asc' : DEFAULT_CLIENT_FILTERS.sort_dir,
        },
    };
}

function syncCrmListStateToUrl(filtersArg, page) {
    if (typeof window === 'undefined') {
        return;
    }

    const params = new URLSearchParams();
    const assignedStaffIds = Array.isArray(filtersArg.assigned_staff_ids)
        ? filtersArg.assigned_staff_ids
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0)
        : [];

    if (String(filtersArg.search || '').trim() !== '') params.set('search', String(filtersArg.search).trim());
    if (Number(filtersArg.per_page) !== DEFAULT_CLIENT_FILTERS.per_page) params.set('per_page', String(filtersArg.per_page));
    if (String(filtersArg.lead_type_id || '').trim() !== '') params.set('lead_type_id', String(filtersArg.lead_type_id).trim());
    if (String(filtersArg.type || '').trim() !== '') params.set('type', String(filtersArg.type).trim());
    if (String(filtersArg.revenue_tier_id || '').trim() !== '') params.set('revenue_tier_id', String(filtersArg.revenue_tier_id).trim());
    if (String(filtersArg.assigned_department_id || '').trim() !== '') params.set('assigned_department_id', String(filtersArg.assigned_department_id).trim());
    if (assignedStaffIds.length > 0) params.set('assigned_staff_ids', assignedStaffIds.join(','));
    if (String(filtersArg.created_from || '').trim() !== '') params.set('created_from', String(filtersArg.created_from).trim());
    if (String(filtersArg.created_to || '').trim() !== '') params.set('created_to', String(filtersArg.created_to).trim());
    if (String(filtersArg.sort_by || '').trim() !== '' && String(filtersArg.sort_by) !== DEFAULT_CLIENT_FILTERS.sort_by) {
        params.set('sort_by', String(filtersArg.sort_by).trim());
    }
    if (String(filtersArg.sort_dir || '').trim() === 'asc') params.set('sort_dir', 'asc');
    if (Number(page) > DEFAULT_CLIENT_PAGE) params.set('page', String(page));

    const query = params.toString();
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(window.history.state || {}, document.title, nextUrl);
}

/** Query GET: gửi assigned_staff_ids dạng "1,2" để Laravel nhận ổn định (tránh lỗi serialize mảng trên một số proxy/stack). */
function buildCrmClientsQueryParams(filtersArg, page) {
    const f = { ...filtersArg };
    if (Array.isArray(f.assigned_staff_ids) && f.assigned_staff_ids.length > 0) {
        f.assigned_staff_ids = f.assigned_staff_ids
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0)
            .join(',');
    } else {
        delete f.assigned_staff_ids;
    }
    return {
        ...f,
        page,
        sort_by: f.sort_by || 'last_activity_at',
        sort_dir: f.sort_dir || 'desc',
    };
}

/** Body POST /exports/clients — bộ lọc giống danh sách (xuất gồm CRM + kho số). */
function buildClientExportRequestBody(filtersArg) {
    const body = {};
    const search = String(filtersArg.search || '').trim();
    if (search) body.search = search;
    if (filtersArg.lead_type_id) {
        const id = Number(filtersArg.lead_type_id);
        if (Number.isInteger(id) && id > 0) body.lead_type_id = id;
    }
    if (filtersArg.type === 'potential' || filtersArg.type === 'active') {
        body.type = filtersArg.type;
    }
    if (filtersArg.revenue_tier_id) {
        const id = Number(filtersArg.revenue_tier_id);
        if (Number.isInteger(id) && id > 0) body.revenue_tier_id = id;
    }
    if (filtersArg.assigned_department_id) {
        const id = Number(filtersArg.assigned_department_id);
        if (Number.isInteger(id) && id > 0) body.assigned_department_id = id;
    }
    const staffIds = Array.isArray(filtersArg.assigned_staff_ids)
        ? filtersArg.assigned_staff_ids.map((id) => Number(id)).filter((x) => Number.isInteger(x) && x > 0)
        : [];
    if (staffIds.length > 0) body.assigned_staff_ids = staffIds;
    const cf = String(filtersArg.created_from || '').trim();
    const ct = String(filtersArg.created_to || '').trim();
    if (cf) body.created_from = cf;
    if (ct) body.created_to = ct;
    return body;
}

function LabeledField({ label, required = false, hint = '', className = '', children }) {
    return (
        <div className={className}>
            <label className="mb-3.5 block text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                {label}{required ? ' *' : ''}
            </label>
            {children}
            {hint ? <p className="mt-1.5 text-xs text-text-muted">{hint}</p> : null}
        </div>
    );
}

function buildEmptyCompanyProfile() {
    return {
        id: `legal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        company_name: '',
        address: '',
        tax_code: '',
        representative: '',
        position: '',
        is_default: false,
    };
}

function normalizeCompanyProfiles(profiles) {
    return Array.isArray(profiles)
        ? profiles.map((profile, index) => ({
            id: profile?.id || `legal-${Date.now()}-${index}`,
            company_name: profile?.company_name || '',
            address: profile?.address || '',
            tax_code: profile?.tax_code || '',
            representative: profile?.representative || '',
            position: profile?.position || '',
            is_default: !!profile?.is_default,
        }))
        : [];
}

export default function CRM(props) {
    const toast = useToast();
    const userRole = props?.auth?.user?.role || '';
    /** Tránh lệch chữ hoa/thường khiến nhân viên vô tình thấy khối phân công giống quản lý. */
    const normalizedRole = String(userRole || '').toLowerCase();
    const userId = props?.auth?.user?.id;
    const userName = props?.auth?.user?.name || 'Nhân sự';
    const userDepartmentId = props?.auth?.user?.department_id || null;
    const isManager = normalizedRole === 'quan_ly';
    const isAdminRole = ['admin', 'administrator'].includes(normalizedRole);
    const canExportClients = isAdminRole;
    const canManageClientCompanyProfiles = isAdminRole;
    const canFilterByStaff = ['admin', 'administrator', 'quan_ly', 'nhan_vien', 'ke_toan'].includes(normalizedRole);
    const canManageClients = ['admin', 'administrator', 'quan_ly', 'nhan_vien'].includes(normalizedRole);
    const canDeleteClients = ['admin', 'administrator'].includes(normalizedRole);
    const canAssignClientOwner = ['admin', 'administrator', 'quan_ly'].includes(normalizedRole);
    const canBulkClientActions = canManageClients || canDeleteClients;
    const canViewRotationPool = ['admin', 'administrator', 'quan_ly', 'nhan_vien'].includes(normalizedRole);
    /** POST /crm/clients/{id}/staff-transfer-requests — khớp middleware API */
    const canUseStaffTransferApi = ['admin', 'administrator', 'quan_ly', 'nhan_vien'].includes(normalizedRole);
    const initialClientListState = useMemo(() => readInitialCrmListState(), []);

    const [clients, setClients] = useState([]);
    const [leadTypes, setLeadTypes] = useState([]);
    const [revenueTiers, setRevenueTiers] = useState([]);
    const [staffUsers, setStaffUsers] = useState([]);
    const [crmStaffFilterUsers, setCrmStaffFilterUsers] = useState([]);
    const [crmStaffFilterReady, setCrmStaffFilterReady] = useState(false);
    const [departments, setDepartments] = useState([]);
    const [clientMeta, setClientMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [clientPage, setClientPage] = useState(initialClientListState.page);
    const [selectedClientIds, setSelectedClientIds] = useState([]);
    const [bulkLoading, setBulkLoading] = useState(false);
    const clientTableRef = useRef(null);
    const [bulkForm, setBulkForm] = useState({
        lead_type_id: '',
        assigned_staff_id: '',
    });
    const [clientFilters, setClientFilters] = useState(initialClientListState.filters);
    const [editingClientId, setEditingClientId] = useState(null);
    const [showClientForm, setShowClientForm] = useState(false);
    const [submittingClient, setSubmittingClient] = useState(false);
    const [showClientImport, setShowClientImport] = useState(false);
    const [clientImportFile, setClientImportFile] = useState(null);
    const [importingClients, setImportingClients] = useState(false);
    const [clientImportReport, setClientImportReport] = useState(null);
    const [clientImportJob, setClientImportJob] = useState(null);
    const [clientExportJob, setClientExportJob] = useState(null);
    const [exportingClients, setExportingClients] = useState(false);
    const [assigneeReadonlyLabel, setAssigneeReadonlyLabel] = useState('');
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [transferTargetClient, setTransferTargetClient] = useState(null);
    const [transferEligible, setTransferEligible] = useState([]);
    const [transferForm, setTransferForm] = useState({ to_staff_id: '', note: '' });
    const [transferSubmitting, setTransferSubmitting] = useState(false);
    const [pendingTransferActionLoading, setPendingTransferActionLoading] = useState(false);
    const [editingPendingTransfer, setEditingPendingTransfer] = useState(null);
    const [clientForm, setClientForm] = useState({
        name: '',
        company: '',
        company_profiles: [],
        email: '',
        phone: '',
        notes: '',
        sales_owner_id: '',
        assigned_department_id: '',
        assigned_staff_id: '',
        care_staff_ids: [],
        lead_type_id: '',
        lead_source: '',
        lead_channel: '',
        lead_message: '',
    });

    const extractValidationMessages = (error) => {
        const errors = error?.response?.data?.errors;
        if (!errors || typeof errors !== 'object') return [];

        return Object.values(errors)
            .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
            .map((message) => String(message || '').trim())
            .filter(Boolean);
    };

    const getErrorMessage = (error, fallback) => {
        const validationMessages = extractValidationMessages(error);
        if (validationMessages.length > 0) {
            return validationMessages[0];
        }

        const message = error?.response?.data?.message;
        if (message && message !== 'The given data was invalid.') {
            return message;
        }

        return fallback;
    };

    const normalizeCareStaffIds = (rawValue) => (
        Array.isArray(rawValue)
            ? rawValue
                .map((item) => Number(item?.id ?? item))
                .filter((id) => Number.isInteger(id) && id > 0)
            : []
    );

    const addClientCompanyProfile = () => {
        setClientForm((s) => {
            const nextProfiles = normalizeCompanyProfiles(s.company_profiles);
            nextProfiles.push({
                ...buildEmptyCompanyProfile(),
                is_default: nextProfiles.length === 0,
            });

            return {
                ...s,
                company_profiles: nextProfiles,
            };
        });
    };

    const updateClientCompanyProfile = (profileId, key, value) => {
        setClientForm((s) => ({
            ...s,
            company_profiles: normalizeCompanyProfiles(s.company_profiles).map((profile) => (
                profile.id === profileId
                    ? { ...profile, [key]: value }
                    : profile
            )),
        }));
    };

    const removeClientCompanyProfile = (profileId) => {
        setClientForm((s) => {
            const nextProfiles = normalizeCompanyProfiles(s.company_profiles).filter((profile) => profile.id !== profileId);
            if (nextProfiles.length > 0 && !nextProfiles.some((profile) => profile.is_default)) {
                nextProfiles[0] = { ...nextProfiles[0], is_default: true };
            }

            return {
                ...s,
                company_profiles: nextProfiles,
            };
        });
    };

    const setDefaultClientCompanyProfile = (profileId) => {
        setClientForm((s) => ({
            ...s,
            company_profiles: normalizeCompanyProfiles(s.company_profiles).map((profile) => ({
                ...profile,
                is_default: profile.id === profileId,
            })),
        }));
    };

    const canShowTransferOnClientRow = (client) => {
        if (!canUseStaffTransferApi || !client?.id) return false;
        if (typeof client?.can_transfer === 'boolean') return client.can_transfer;
        if (['admin', 'administrator'].includes(normalizedRole)) return true;
        if (normalizedRole === 'quan_ly') return true;
        if (normalizedRole === 'nhan_vien') {
            const uid = Number(userId || 0);
            const assignedStaffId = Number(client.assigned_staff_id || 0);
            const salesOwnerId = Number(client.sales_owner_id || 0);
            return (
                assignedStaffId === uid
                || (assignedStaffId <= 0 && salesOwnerId === uid)
            );
        }
        return false;
    };

    const canManageClientRow = (client) => {
        if (typeof client?.can_manage === 'boolean') {
            return client.can_manage;
        }
        if (['admin', 'administrator', 'quan_ly'].includes(normalizedRole)) {
            return true;
        }
        if (normalizedRole !== 'nhan_vien') {
            return false;
        }
        const uid = Number(userId || 0);
        const assignedStaffId = Number(client?.assigned_staff_id || 0);
        const salesOwnerId = Number(client?.sales_owner_id || 0);
        return assignedStaffId === uid || (assignedStaffId <= 0 && salesOwnerId === uid);
    };

    const canDeleteClientRow = (client) => {
        if (typeof client?.can_delete === 'boolean') {
            return client.can_delete;
        }

        return canDeleteClients && canManageClientRow(client);
    };

    const openCrmTransferModal = async (client, event) => {
        if (event) event.stopPropagation();
        if (!client?.id) return;
        setTransferTargetClient(client);
        setShowTransferModal(true);
        setTransferForm({ to_staff_id: '', note: '' });
        try {
            const res = await axios.get(`/api/v1/crm/clients/${client.id}/staff-transfer/eligible-users`);
            setTransferEligible(Array.isArray(res.data?.users) ? res.data.users : []);
        } catch {
            setTransferEligible([]);
        }
    };

    const closeCrmTransferModal = () => {
        setShowTransferModal(false);
        setTransferTargetClient(null);
        setTransferEligible([]);
        setTransferSubmitting(false);
    };

    const submitCrmTransfer = async (event) => {
        event.preventDefault();
        if (!transferTargetClient?.id) return;
        if (!transferForm.to_staff_id) {
            toast.error('Chọn nhân sự nhận phụ trách.');
            return;
        }
        setTransferSubmitting(true);
        try {
            await axios.post(`/api/v1/crm/clients/${transferTargetClient.id}/staff-transfer-requests`, {
                to_staff_id: Number(transferForm.to_staff_id),
                note: (transferForm.note || '').trim() || null,
            });
            toast.success('Đã gửi phiếu chuyển phụ trách.');
            closeCrmTransferModal();
            await fetchClients(clientPage, clientFilters);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Không gửi được phiếu.'));
        } finally {
            setTransferSubmitting(false);
        }
    };

    const actOnPendingTransferRequest = async (transferId, action) => {
        if (!transferId) return;
        let rejectionNote = null;
        if (action === 'reject') {
            rejectionNote = window.prompt('Lý do từ chối (tuỳ chọn):') || null;
        }
        if (action === 'cancel' && !window.confirm('Hủy phiếu chuyển phụ trách này?')) {
            return;
        }
        setPendingTransferActionLoading(true);
        try {
            if (action === 'accept') {
                await axios.post(`/api/v1/crm/staff-transfer-requests/${transferId}/accept`);
            } else if (action === 'reject') {
                await axios.post(`/api/v1/crm/staff-transfer-requests/${transferId}/reject`, { rejection_note: rejectionNote });
            } else if (action === 'cancel') {
                await axios.post(`/api/v1/crm/staff-transfer-requests/${transferId}/cancel`);
            }
            toast.success('Đã cập nhật phiếu chuyển phụ trách.');
            await fetchClients(clientPage, clientFilters);
            if (editingClientId) {
                try {
                    const res = await axios.get(`/api/v1/crm/clients/${editingClientId}`);
                    if (res.data?.id) {
                        applyClientRowToForm(res.data);
                        setEditingPendingTransfer(res.data.pending_staff_transfer || null);
                        setAssigneeReadonlyLabel(
                            res.data?.assigned_staff?.name || res.data?.sales_owner?.name || '—',
                        );
                    }
                } catch {
                    setEditingPendingTransfer(null);
                }
            }
        } catch (error) {
            toast.error(getErrorMessage(error, 'Không thực hiện được.'));
        } finally {
            setPendingTransferActionLoading(false);
        }
    };

    const fetchLookups = async () => {
        try {
            const [leadRes, tierRes] = await Promise.all([
                axios.get('/api/v1/lead-types'),
                axios.get('/api/v1/revenue-tiers'),
            ]);
            setLeadTypes(leadRes.data || []);
            setRevenueTiers(tierRes.data || []);
        } catch {
            // ignore
        }
    };

    const fetchStaffUsers = async () => {
        if (!canFilterByStaff) return;
        try {
            const res = await axios.get('/api/v1/users/lookup', {
                params: { purpose: 'operational_assignee' },
            });
            setStaffUsers(res.data?.data || []);
        } catch {
            setStaffUsers([]);
        }
    };

    const fetchCrmStaffFilterOptions = useCallback(async () => {
        if (!canFilterByStaff) return;
        setCrmStaffFilterReady(false);
        try {
            const rows = await fetchStaffFilterOptions('crm_clients');
            setCrmStaffFilterUsers(rows);
        } catch {
            setCrmStaffFilterUsers([]);
        } finally {
            setCrmStaffFilterReady(true);
        }
    }, [canFilterByStaff]);

    const fetchDepartments = async () => {
        try {
            const res = await axios.get('/api/v1/departments');
            setDepartments(res.data || []);
        } catch {
            setDepartments([]);
        }
    };

    const fetchClients = async (page = 1, filtersArg = clientFilters) => {
        try {
            const clientsRes = await axios.get('/api/v1/crm/clients', {
                params: buildCrmClientsQueryParams(filtersArg, page),
            });
            const resolvedPage = clientsRes.data.current_page || 1;
            const rows = clientsRes.data.data || [];
            setClients(rows);
            setClientMeta({
                current_page: resolvedPage,
                last_page: clientsRes.data.last_page || 1,
                total: clientsRes.data.total || 0,
            });
            setClientPage(resolvedPage);
            setSelectedClientIds((prev) => {
                const actionable = new Set(
                    rows
                        .filter((row) => row?.can_manage === true || row?.can_delete === true)
                        .map((row) => Number(row.id))
                );
                return prev.filter((id) => actionable.has(Number(id)));
            });
        } catch (error) {
            toast.error(getErrorMessage(error, 'Không tải được danh sách khách hàng.'));
        }
    };

    const handleClientSearch = (val) => {
        const next = { ...clientFilters, search: val };
        setClientFilters(next);
    };

    const applyClientFilters = () => {
        fetchClients(1, clientFilters);
    };

    const submitClientImport = async (e) => {
        e.preventDefault();
        if (!clientImportFile) {
            toast.error('Vui lòng chọn file Excel.');
            return;
        }
        setImportingClients(true);
        try {
            const formData = new FormData();
            formData.append('file', clientImportFile);
            const res = await axios.post('/api/v1/imports/clients', formData);
            setClientImportJob(res.data?.job || null);
            setClientImportReport(null);
            toast.success('Đã đưa file import khách hàng vào hàng đợi xử lý.');
        } catch (error) {
            const validationMessages = extractValidationMessages(error);
            const fallbackMessage = getErrorMessage(error, 'Import thất bại.');
            setClientImportJob(null);
            setImportingClients(false);
            setClientImportReport({
                created: 0,
                updated: 0,
                skipped: 0,
                warnings: [],
                errors: validationMessages.length > 0
                    ? validationMessages.map((message) => ({ row: '-', message }))
                    : [{ row: '-', message: fallbackMessage }],
            });
            toast.error(fallbackMessage);
        }
    };

    const startClientExport = useCallback(async () => {
        if (!canExportClients) return;
        setExportingClients(true);
        setClientExportJob(null);
        try {
            const res = await axios.post('/api/v1/exports/clients', buildClientExportRequestBody(clientFilters));
            const job = res.data?.job || null;
            if (!job?.id) {
                throw new Error('Không nhận được job xuất.');
            }
            setClientExportJob(job);
            toast.success('Đã đưa xuất danh sách vào hàng đợi (toàn bộ CRM + kho số, áp dụng bộ lọc hiện tại).');
        } catch (error) {
            setExportingClients(false);
            toast.error(getErrorMessage(error, 'Không tạo được job xuất khách hàng.'));
        }
    }, [canExportClients, clientFilters, toast]);

    useEffect(() => {
        const jobId = clientExportJob?.id;
        if (!jobId) return undefined;

        const poll = async () => {
            try {
                const res = await axios.get(`/api/v1/imports/jobs/${jobId}`);
                const nextJob = res.data || null;
                setClientExportJob(nextJob);

                if (nextJob?.status === 'completed') {
                    window.clearInterval(timer);
                    setExportingClients(false);
                    try {
                        const downloadRes = await axios.get(`/api/v1/exports/clients/jobs/${jobId}/download`, {
                            responseType: 'blob',
                        });
                        let filename = nextJob.original_name || 'khach-hang-export.xlsx';
                        const disposition = downloadRes.headers['content-disposition'];
                        if (disposition && disposition.includes('filename=')) {
                            const match = /filename\*?=(?:UTF-8'')?([^;\n]+)/i.exec(disposition);
                            if (match && match[1]) {
                                filename = decodeURIComponent(match[1].replace(/['"]/g, '').trim());
                            }
                        }
                        const blob = new Blob([downloadRes.data], {
                            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        window.URL.revokeObjectURL(url);
                        toast.success(
                            `Đã xuất ${nextJob.successful_rows ?? nextJob.processed_rows ?? 0} dòng.`,
                        );
                    } catch (dlErr) {
                        toast.error(getErrorMessage(dlErr, 'Không tải được file xuất.'));
                    }
                    setClientExportJob(null);
                } else if (nextJob?.status === 'failed') {
                    window.clearInterval(timer);
                    setExportingClients(false);
                    toast.error(nextJob?.error_message || 'Xuất thất bại.');
                    setClientExportJob(null);
                }
            } catch (error) {
                window.clearInterval(timer);
                setExportingClients(false);
                toast.error(getErrorMessage(error, 'Không kiểm tra được tiến trình xuất.'));
                setClientExportJob(null);
            }
        };

        const timer = window.setInterval(poll, 1500);
        poll();

        return () => window.clearInterval(timer);
    }, [clientExportJob?.id, toast]);

    useEffect(() => {
        if (!showClientImport || !clientImportJob?.id) return undefined;

        const poll = async () => {
            try {
                const res = await axios.get(`/api/v1/imports/jobs/${clientImportJob.id}`);
                const nextJob = res.data || null;
                setClientImportJob(nextJob);

                if (nextJob?.status === 'completed') {
                    window.clearInterval(timer);
                    const report = nextJob.report || {};
                    setImportingClients(false);
                    setClientImportReport(report);
                    toast.success(
                        `Import hoàn tất: ${report.created || 0} tạo mới, ${report.updated || 0} cập nhật, ${report.skipped || 0} bỏ qua.`
                    );
                    await fetchClients(1, clientFilters);
                    await fetchCrmStaffFilterOptions();
                } else if (nextJob?.status === 'failed') {
                    window.clearInterval(timer);
                    setImportingClients(false);
                    setClientImportReport(nextJob.report || {
                        created: 0,
                        updated: 0,
                        skipped: 0,
                        warnings: [],
                        errors: [{ row: '-', message: nextJob.error_message || 'Import thất bại.' }],
                    });
                    toast.error(nextJob?.error_message || 'Import thất bại.');
                }
            } catch (error) {
                setImportingClients(false);
                toast.error(getErrorMessage(error, 'Không kiểm tra được tiến trình import khách hàng.'));
            }
        };

        const timer = window.setInterval(poll, 1500);
        poll();

        return () => window.clearInterval(timer);
        // clientFilters: dùng giá trị lúc import hoàn tất (không reset interval khi đổi lọc).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showClientImport, clientImportJob?.id, fetchCrmStaffFilterOptions]);

    useEffect(() => {
        fetchLookups();
        fetchStaffUsers();
        fetchCrmStaffFilterOptions();
        fetchDepartments();
        fetchClients(clientPage, clientFilters);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        syncCrmListStateToUrl(clientFilters, clientPage);
    }, [clientFilters, clientPage]);

    /** Làm mới danh sách nhân sự trong bộ lọc khi quay lại tab / trang (dữ liệu khách có thể đã đổi). */
    useEffect(() => {
        if (!canFilterByStaff) return undefined;
        const refetchWhenVisible = () => {
            if (document.visibilityState === 'visible') {
                fetchCrmStaffFilterOptions();
            }
        };
        document.addEventListener('visibilitychange', refetchWhenVisible);
        window.addEventListener('pageshow', refetchWhenVisible);
        return () => {
            document.removeEventListener('visibilitychange', refetchWhenVisible);
            window.removeEventListener('pageshow', refetchWhenVisible);
        };
    }, [canFilterByStaff, fetchCrmStaffFilterOptions]);

    useEffect(() => {
        if (leadTypes.length && !clientForm.lead_type_id) {
            setClientForm((prev) => ({ ...prev, lead_type_id: leadTypes[0]?.id || '' }));
        }
    }, [leadTypes]);

    useEffect(() => {
        const table = clientTableRef.current;
        if (!table) return undefined;

        const handleRemoteSort = (event) => {
            const sortBy = String(event?.detail?.sortBy || '').trim();
            const sortDir = String(event?.detail?.sortDir || '').toLowerCase() === 'asc' ? 'asc' : 'desc';
            if (!sortBy) return;

            const nextFilters = {
                ...clientFilters,
                sort_by: sortBy,
                sort_dir: sortDir,
            };
            setClientFilters(nextFilters);
            fetchClients(1, nextFilters);
        };

        table.addEventListener('table:remote-sort', handleRemoteSort);
        return () => {
            table.removeEventListener('table:remote-sort', handleRemoteSort);
        };
    }, [clientFilters]);

    const submitClient = async (e) => {
        e.preventDefault();
        if (submittingClient) {
            return;
        }
        if (!canManageClients) {
            toast.error('Bạn không có quyền quản lý khách hàng.');
            return;
        }
        setSubmittingClient(true);
        try {
            const includeAssignment =
                !editingClientId || canAssignClientOwner;
            const resolvedAssignedStaff = clientForm.assigned_staff_id
                ? Number(clientForm.assigned_staff_id)
                : null;
            if (includeAssignment && canAssignClientOwner && !resolvedAssignedStaff) {
                toast.error('Vui lòng chọn nhân sự phụ trách trực tiếp.');
                return;
            }
            const payload = {
                name: clientForm.name,
                company: clientForm.company || null,
                email: clientForm.email || null,
                phone: clientForm.phone || null,
                notes: clientForm.notes || null,
                lead_type_id: clientForm.lead_type_id ? Number(clientForm.lead_type_id) : null,
                lead_source: clientForm.lead_source || null,
                lead_channel: clientForm.lead_channel || null,
                lead_message: clientForm.lead_message || null,
            };
            if (canManageClientCompanyProfiles) {
                payload.company_profiles = normalizeCompanyProfiles(clientForm.company_profiles);
            }
            if (includeAssignment) {
                Object.assign(payload, {
                    sales_owner_id: resolvedAssignedStaff,
                    assigned_department_id: clientForm.assigned_department_id
                        ? Number(clientForm.assigned_department_id)
                        : null,
                    assigned_staff_id: resolvedAssignedStaff,
                    care_staff_ids: normalizeCareStaffIds(clientForm.care_staff_ids),
                });
            }
            if (editingClientId) {
                await axios.put(`/api/v1/crm/clients/${editingClientId}`, payload);
            } else {
                await axios.post('/api/v1/crm/clients', payload);
            }
            closeClientForm();
            await fetchClients(clientPage);
            toast.success(editingClientId ? 'Cập nhật khách hàng thành công.' : 'Tạo khách hàng thành công.');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Lưu khách hàng thất bại.'));
        } finally {
            setSubmittingClient(false);
        }
    };

    const applyClientRowToForm = (client) => {
        const primaryOwnerId = client.assigned_staff_id || client.sales_owner_id || '';
        setClientForm({
            name: client.name || '',
            company: client.company || '',
            company_profiles: normalizeCompanyProfiles(client.company_profiles),
            email: client.email || '',
            phone: client.phone || '',
            notes: client.notes || '',
            sales_owner_id: primaryOwnerId ? String(primaryOwnerId) : '',
            assigned_department_id: client.assigned_department_id ? String(client.assigned_department_id) : '',
            assigned_staff_id: primaryOwnerId ? String(primaryOwnerId) : '',
            care_staff_ids: normalizeCareStaffIds(client.care_staff_users || []),
            lead_type_id: client.lead_type_id ? String(client.lead_type_id) : '',
            lead_source: client.lead_source || '',
            lead_channel: client.lead_channel || '',
            lead_message: client.lead_message || '',
        });
    };

    const editClient = async (client) => {
        if (!client?.id) return;
        setEditingClientId(client.id);
        applyClientRowToForm(client);
        setAssigneeReadonlyLabel(
            client.assigned_staff?.name || client.sales_owner?.name || '—',
        );
        setEditingPendingTransfer(client.pending_staff_transfer || null);
        setShowClientForm(true);
        try {
            const res = await axios.get(`/api/v1/crm/clients/${client.id}`);
            if (res.data?.id) {
                applyClientRowToForm(res.data);
                setAssigneeReadonlyLabel(
                    res.data?.assigned_staff?.name || res.data?.sales_owner?.name || '—',
                );
                setEditingPendingTransfer(res.data.pending_staff_transfer || null);
            }
        } catch {
            // giữ dữ liệu từ dòng bảng
        }
    };

    const openClientCreate = () => {
        setEditingClientId(null);
        setAssigneeReadonlyLabel('');
        setEditingPendingTransfer(null);
        setClientForm({
            name: '',
            company: '',
            company_profiles: [],
            email: '',
            phone: '',
            notes: '',
            sales_owner_id: '',
            assigned_department_id: '',
            assigned_staff_id: '',
            care_staff_ids: [],
            lead_type_id: leadTypes[0]?.id || '',
            lead_source: '',
            lead_channel: '',
            lead_message: '',
        });
        setShowClientForm(true);
    };

    const closeClientForm = () => {
        setShowClientForm(false);
        setEditingClientId(null);
        setAssigneeReadonlyLabel('');
        setEditingPendingTransfer(null);
        setSubmittingClient(false);
    };

    const deleteClient = async (id) => {
        if (!canDeleteClients) return toast.error('Bạn không có quyền xóa khách hàng.');
        try {
            await axios.delete(`/api/v1/crm/clients/${id}`);
            if (editingClientId === id) {
                closeClientForm();
            }
            await fetchClients(clientPage);
            toast.success('Xóa khách hàng thành công.');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Xóa khách hàng thất bại.'));
        }
    };

    const buildClientPayload = (client, overrides = {}) => {
        const assignedStaffId = Object.prototype.hasOwnProperty.call(overrides, 'assigned_staff_id')
            ? (overrides.assigned_staff_id ? Number(overrides.assigned_staff_id) : null)
            : (client.assigned_staff_id
                ? Number(client.assigned_staff_id)
                : (client.sales_owner_id ? Number(client.sales_owner_id) : null));
        return {
            name: client.name || '',
            company: client.company || null,
            email: client.email || null,
            phone: client.phone || null,
            notes: client.notes || null,
            sales_owner_id: assignedStaffId,
            assigned_department_id: client.assigned_department_id ? Number(client.assigned_department_id) : null,
            assigned_staff_id: assignedStaffId,
            care_staff_ids: normalizeCareStaffIds(client.care_staff_users || []),
            lead_type_id: client.lead_type_id ? Number(client.lead_type_id) : null,
            lead_source: client.lead_source || null,
            lead_channel: client.lead_channel || null,
            lead_message: client.lead_message || null,
            ...overrides,
        };
    };

    const selectedClientSet = useMemo(
        () => new Set(selectedClientIds.map((id) => Number(id))),
        [selectedClientIds]
    );

    const visibleClientIds = useMemo(
        () => clients.map((client) => Number(client.id)).filter((id) => id > 0),
        [clients]
    );

    const selectableVisibleClientIds = useMemo(
        () => clients
            .filter((client) => canManageClientRow(client) || canDeleteClientRow(client))
            .map((client) => Number(client.id))
            .filter((id) => id > 0),
        [clients, normalizedRole, userId, canDeleteClients]
    );

    const selectedClients = useMemo(
        () => clients.filter((client) => (
            selectedClientSet.has(Number(client.id))
            && (canManageClientRow(client) || canDeleteClientRow(client))
        )),
        [clients, selectedClientSet, normalizedRole, userId, canDeleteClients]
    );

    const allVisibleSelected = selectableVisibleClientIds.length > 0
        && selectableVisibleClientIds.every((id) => selectedClientSet.has(id));

    const toggleClientSelect = (id) => {
        const numericId = Number(id);
        if (!selectableVisibleClientIds.includes(numericId)) {
            return;
        }
        setSelectedClientIds((prev) => (
            prev.includes(numericId)
                ? prev.filter((item) => Number(item) !== numericId)
                : [...prev, numericId]
        ));
    };

    const toggleSelectAllVisibleClients = () => {
        if (allVisibleSelected) {
            setSelectedClientIds((prev) => (
                prev.filter((id) => !selectableVisibleClientIds.includes(Number(id)))
            ));
            return;
        }

        setSelectedClientIds((prev) => {
            const merged = new Set(prev.map((id) => Number(id)));
            selectableVisibleClientIds.forEach((id) => merged.add(Number(id)));
            return Array.from(merged);
        });
    };

    const runBulkClientUpdate = async (overrides, successLabel) => {
        if (!selectedClients.length) {
            toast.error('Vui lòng chọn ít nhất 1 khách hàng.');
            return;
        }
        setBulkLoading(true);
        try {
            const results = await Promise.allSettled(
                selectedClients.map((client) => axios.put(
                    `/api/v1/crm/clients/${client.id}`,
                    buildClientPayload(client, overrides)
                ))
            );
            const success = results.filter((result) => result.status === 'fulfilled').length;
            const failed = results.length - success;

            if (success > 0) {
                await fetchClients(clientPage);
                toast.success(`${success} khách hàng đã được ${successLabel}.`);
            }
            if (failed > 0) {
                toast.error(`${failed} khách hàng xử lý thất bại. Kiểm tra quyền hoặc dữ liệu.`);
            }

            setSelectedClientIds([]);
        } finally {
            setBulkLoading(false);
        }
    };

    const bulkApplyLeadType = async () => {
        if (!bulkForm.lead_type_id) {
            toast.error('Chọn trạng thái lead để áp dụng.');
            return;
        }
        await runBulkClientUpdate(
            { lead_type_id: Number(bulkForm.lead_type_id) },
            'cập nhật trạng thái lead'
        );
    };

    const bulkAssignStaff = async () => {
        if (!bulkForm.assigned_staff_id) {
            toast.error('Chọn nhân sự phụ trách để áp dụng.');
            return;
        }
        const user = staffUsers.find((item) => Number(item.id) === Number(bulkForm.assigned_staff_id));
        const deptId = user?.department_id ? Number(user.department_id) : null;
        await runBulkClientUpdate(
            {
                assigned_staff_id: Number(bulkForm.assigned_staff_id),
                assigned_department_id: deptId,
            },
            'gán phụ trách'
        );
    };

    const bulkDeleteClients = async () => {
        if (!canDeleteClients) {
            toast.error('Bạn không có quyền xóa khách hàng.');
            return;
        }
        if (!selectedClients.length) {
            toast.error('Vui lòng chọn ít nhất 1 khách hàng.');
            return;
        }
        if (!window.confirm(`Xóa ${selectedClients.length} khách hàng đã chọn?`)) {
            return;
        }

        setBulkLoading(true);
        try {
            const results = await Promise.allSettled(
                selectedClients.map((client) => axios.delete(`/api/v1/crm/clients/${client.id}`))
            );
            const success = results.filter((result) => result.status === 'fulfilled').length;
            const failed = results.length - success;

            if (success > 0) {
                await fetchClients(clientPage);
                toast.success(`Đã xóa ${success} khách hàng.`);
            }
            if (failed > 0) {
                toast.error(`${failed} khách hàng xóa thất bại.`);
            }

            setSelectedClientIds([]);
        } finally {
            setBulkLoading(false);
        }
    };

    const clientStats = useMemo(() => {
        const total = clientMeta.total || clients.length;
        const leadCount = clients.filter((c) => c.lead_type_id).length;
        const purchased = clients.filter((c) => c.has_purchased).length;
        return [
            { label: 'Khách hàng', value: String(total) },
            { label: 'Tiềm năng', value: String(leadCount) },
            { label: 'Đã mua', value: String(purchased) },
            { label: 'Doanh thu', value: clients.reduce((acc, c) => acc + Number(c.total_revenue || 0), 0).toLocaleString('vi-VN') + ' VNĐ' },
        ];
    }, [clients, clientMeta]);

    /** Phòng ban hiển thị trên form phân công: admin = tất cả; quản lý = phòng có manager_id trùng user. */
    const visibleDepartmentOptions = useMemo(() => {
        if (isAdminRole) {
            return departments;
        }
        if (isManager) {
            return departments.filter((dept) => Number(dept.manager_id || 0) === Number(userId || 0));
        }
        return [];
    }, [departments, isAdminRole, isManager, userId]);

    const showClientDepartmentPicker = isAdminRole || isManager;

    const clientFormVisibleDepartmentIdSet = useMemo(() => (
        new Set(visibleDepartmentOptions.map((d) => Number(d.id || 0)).filter((id) => id > 0))
    ), [visibleDepartmentOptions]);

    /**
     * Nhân sự có thể giao (tạo/sửa khách): trong phạm vi phòng ban hiển thị; admin khi chưa chọn phòng vẫn chỉ thấy người đã gắn phòng (không list cả tập user không thuộc phòng).
     */
    const clientFormAssignableStaffPool = useMemo(() => {
        if (normalizedRole === 'nhan_vien' && userId) {
            return staffUsers.filter((u) => Number(u.id) === Number(userId));
        }
        if (isAdminRole) {
            return staffUsers.filter((u) => {
                const did = Number(u.department_id || 0);
                return did > 0 && clientFormVisibleDepartmentIdSet.has(did);
            });
        }
        if (isManager) {
            return staffUsers.filter((u) => {
                const did = Number(u.department_id || 0);
                const uid = Number(u.id || 0);
                return (did > 0 && clientFormVisibleDepartmentIdSet.has(did)) || uid === Number(userId || 0);
            });
        }
        return staffUsers;
    }, [
        staffUsers,
        normalizedRole,
        userId,
        isAdminRole,
        isManager,
        clientFormVisibleDepartmentIdSet,
    ]);

    const careStaffOptions = useMemo(() => {
        const pool = (isAdminRole
            ? staffUsers
            : staffUsers.filter((u) => {
                const did = Number(u.department_id || 0);
                return (did > 0 && clientFormVisibleDepartmentIdSet.has(did)) || Number(u.id) === Number(userId || 0);
            }));
        return pool.map((user) => ({
            id: Number(user.id || 0),
            label: user.name || 'Nhân sự',
            meta: user.department_id
                ? (visibleDepartmentOptions.find((dept) => Number(dept.id) === Number(user.department_id))?.name || user.role || '')
                : (user.role || ''),
        })).filter((user) => user.id > 0);
    }, [staffUsers, visibleDepartmentOptions, isAdminRole, clientFormVisibleDepartmentIdSet, userId]);

    const clientResponsibleStaffOptions = useMemo(() => {
        const departmentId = Number(clientFilters.assigned_department_id || 0);
        const fallbackSelf = normalizedRole === 'nhan_vien' && userId
            ? [{
                id: Number(userId),
                name: userName,
                department_id: userDepartmentId,
            }]
            : [];
        let scopedUsers;
        if (crmStaffFilterReady) {
            scopedUsers = crmStaffFilterUsers.length > 0 ? crmStaffFilterUsers : fallbackSelf;
        } else {
            scopedUsers = staffUsers.length > 0 ? staffUsers : fallbackSelf;
        }

        return scopedUsers
            .filter((user) => {
                if (!departmentId) return true;
                return Number(user.department_id || 0) === departmentId;
            })
            .map((user) => ({
                id: Number(user.id || 0),
                name: user.name || 'Nhân sự',
                departmentName: user.department_id
                    ? (visibleDepartmentOptions.find((dept) => Number(dept.id) === Number(user.department_id))?.name || '')
                    : '',
            }))
            .filter((user) => user.id > 0);
    }, [
        clientFilters.assigned_department_id,
        crmStaffFilterUsers,
        crmStaffFilterReady,
        staffUsers,
        visibleDepartmentOptions,
        normalizedRole,
        userId,
        userName,
        userDepartmentId,
    ]);

    const clientResponsibleStaffTagOptions = useMemo(() => (
        clientResponsibleStaffOptions.map((user) => ({
            id: Number(user.id || 0),
            label: user.name || 'Nhân sự',
            meta: user.departmentName || '',
        }))
    ), [clientResponsibleStaffOptions]);

    /** Phụ trách: theo phòng đã chọn; chọn nhân trước sẽ gắn phòng qua onChange. */
    const clientFormAssignedStaffOptions = useMemo(() => {
        if (normalizedRole === 'nhan_vien' && userId) {
            return staffUsers.filter((u) => Number(u.id) === Number(userId));
        }
        const deptId = Number(clientForm.assigned_department_id || 0);
        if (deptId > 0) {
            return clientFormAssignableStaffPool.filter((u) => Number(u.department_id || 0) === deptId);
        }
        return clientFormAssignableStaffPool;
    }, [staffUsers, clientForm.assigned_department_id, normalizedRole, userId, clientFormAssignableStaffPool]);

    return (
        <PageContainer
            auth={props.auth}
            title="Quản lý khách hàng"
            description="Quản lý khách hàng, trạng thái tiềm năng và phân quyền chăm sóc."
            stats={clientStats}
            actions={canViewRotationPool ? (
                <a
                    href={route('crm.pool.index')}
                    className="inline-flex items-center rounded-2xl border border-slate-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
                >
                    Mở kho số
                </a>
            ) : null}
        >
            <>
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5">
                        {(canManageClients || canExportClients) && (
                            <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
                                {canManageClients ? (
                                    <>
                                        <button
                                            type="button"
                                            className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm"
                                            onClick={openClientCreate}
                                        >
                                            Thêm mới
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                                            onClick={() => {
                                                setClientImportReport(null);
                                                setClientImportFile(null);
                                                setShowClientImport(true);
                                            }}
                                        >
                                            Import Excel
                                        </button>
                                    </>
                                ) : null}
                                {canExportClients ? (
                                    <button
                                        type="button"
                                        className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                                        onClick={startClientExport}
                                        disabled={exportingClients || !!clientExportJob}
                                    >
                                        {exportingClients || clientExportJob ? 'Đang xuất…' : 'Xuất Excel (XLSX)'}
                                    </button>
                                ) : null}
                            </div>
                        )}
                        {clientExportJob ? (
                            <div className="mb-4 rounded-2xl border border-slate-200/80 bg-slate-50 p-4 space-y-2">
                                <div className="flex items-center justify-between gap-3 text-xs">
                                    <div className="font-semibold uppercase tracking-[0.14em] text-text-subtle">
                                        Tiến trình xuất khách hàng
                                    </div>
                                    <div className="font-semibold text-slate-700">
                                        {clientExportJob.processed_rows || 0}/{clientExportJob.total_rows || 0} dòng
                                    </div>
                                </div>
                                <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                                    <div
                                        className={`h-full rounded-full transition-all ${clientExportJob.status === 'failed' ? 'bg-rose-500' : 'bg-primary'}`}
                                        style={{ width: `${clientExportJob.progress_percent || 0}%` }}
                                    />
                                </div>
                                <p className="text-xs text-text-muted">
                                    Gồm toàn bộ khách CRM và kho số (áp dụng bộ lọc hiện tại). Chỉ admin mới dùng được chức năng này.
                                </p>
                            </div>
                        ) : null}
                        <FilterToolbar enableSearch
                            className="mb-4 border-0 p-0 shadow-none"
                            title="Danh sách khách hàng"
                            description="Lọc theo tên, loại lead và nhóm khách. Chuyển phụ trách: dùng biểu tượng bàn giao trên dòng hoặc mở trang luồng khách (click tên khách)."
                            searchValue={clientFilters.search}
                            onSearch={handleClientSearch}
                            onSubmitFilters={applyClientFilters}
                        >
                            <div className={FILTER_GRID_WITH_SUBMIT}>
                                <FilterField label="Trạng thái lead">
                                    <select
                                        className={filterControlClass}
                                        value={clientFilters.lead_type_id}
                                        onChange={(e) => setClientFilters((s) => ({ ...s, lead_type_id: e.target.value }))}
                                    >
                                        <option value="">Tất cả trạng thái</option>
                                        {leadTypes.map((type) => (
                                            <option key={type.id} value={type.id}>
                                                {type.name}
                                            </option>
                                        ))}
                                    </select>
                                </FilterField>
                                <FilterField label="Nhóm khách">
                                    <select
                                        className={filterControlClass}
                                        value={clientFilters.type}
                                        onChange={(e) => setClientFilters((s) => ({ ...s, type: e.target.value }))}
                                    >
                                        <option value="">Tất cả nhóm</option>
                                        <option value="potential">Tiềm năng</option>
                                        <option value="active">Đã mua</option>
                                    </select>
                                </FilterField>
                                <FilterField label="Hạng khách hàng">
                                    <select
                                        className={filterControlClass}
                                        value={clientFilters.revenue_tier_id}
                                        onChange={(e) => setClientFilters((s) => ({ ...s, revenue_tier_id: e.target.value }))}
                                    >
                                        <option value="">Tất cả hạng</option>
                                        {revenueTiers.map((tier) => (
                                            <option key={tier.id} value={tier.id}>
                                                {tier.label}
                                            </option>
                                        ))}
                                    </select>
                                </FilterField>
                                {isAdminRole && (
                                    <FilterField label="Phòng ban phụ trách">
                                        <select
                                            className={filterControlClass}
                                            value={clientFilters.assigned_department_id}
                                        onChange={(e) => setClientFilters((s) => ({
                                            ...s,
                                            assigned_department_id: e.target.value,
                                            assigned_staff_ids: [],
                                        }))}
                                    >
                                            <option value="">Tất cả phòng ban</option>
                                            {visibleDepartmentOptions.map((dept) => (
                                                <option key={dept.id} value={dept.id}>
                                                    {dept.name}
                                                </option>
                                            ))}
                                        </select>
                                    </FilterField>
                                )}
                                {canFilterByStaff && (
                                    <FilterField label="Nhân sự phụ trách">
                                        <TagMultiSelect
                                            options={clientResponsibleStaffTagOptions}
                                            selectedIds={clientFilters.assigned_staff_ids}
                                            onChange={(selectedIds) => setClientFilters((s) => ({ ...s, assigned_staff_ids: selectedIds }))}
                                            addPlaceholder="Tìm và thêm nhân sự phụ trách"
                                            emptyLabel="Để trống để xem tất cả nhân sự trong phạm vi."
                                        />
                                    </FilterField>
                                )}
                                <FilterField label="Ngày tạo từ">
                                    <FilterDateInput
                                        className={filterControlClass}
                                        value={clientFilters.created_from}
                                        onChange={(e) => setClientFilters((s) => ({ ...s, created_from: e.target.value }))}
                                    />
                                </FilterField>
                                <FilterField label="Ngày tạo đến">
                                    <FilterDateInput
                                        className={filterControlClass}
                                        value={clientFilters.created_to}
                                        onChange={(e) => setClientFilters((s) => ({ ...s, created_to: e.target.value }))}
                                    />
                                </FilterField>
                                <FilterActionGroup className={FILTER_GRID_SUBMIT_ROW}>
                                    <button type="submit" className={FILTER_SUBMIT_BUTTON_CLASS}>
                                        Lọc
                                    </button>
                                </FilterActionGroup>
                            </div>
                        </FilterToolbar>
                        <div className="mb-4 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                            {isAdminRole
                                ? 'Bạn đang ở chế độ xem toàn bộ khách hàng. Có thể phân công khách cho mọi phòng ban và nhân sự.'
                                : isManager
                                    ? 'Bạn chỉ nhìn thấy khách hàng của nhân sự trong phòng ban mình quản lý, và có thể giao lại trong phạm vi phòng ban đó.'
                                    : 'Bạn nhìn thấy khách hàng do mình phụ trách trực tiếp hoặc đang tham gia chăm sóc. Chỉ khách do mình phụ trách trực tiếp mới được sửa/chuyển phụ trách.'}
                        </div>
                        {canBulkClientActions && selectedClients.length > 0 && (
                            <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                    <span className="font-semibold text-slate-900">
                                        Đã chọn {selectedClients.length} khách hàng
                                    </span>
                                    <button
                                        type="button"
                                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                                        onClick={() => setSelectedClientIds([])}
                                        disabled={bulkLoading}
                                    >
                                        Bỏ chọn
                                    </button>
                                </div>
                                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
                                    {canManageClients && (
                                        <select
                                            className={filterControlClass}
                                            value={bulkForm.lead_type_id}
                                            onChange={(e) => setBulkForm((s) => ({ ...s, lead_type_id: e.target.value }))}
                                            disabled={bulkLoading}
                                        >
                                            <option value="">Áp dụng trạng thái lead...</option>
                                            {leadTypes.map((type) => (
                                                <option key={type.id} value={type.id}>
                                                    {type.name}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    {canManageClients && (
                                        <button
                                            type="button"
                                            className="rounded-2xl border border-slate-200/80 bg-white px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
                                            onClick={bulkApplyLeadType}
                                            disabled={bulkLoading}
                                        >
                                            Cập nhật lead
                                        </button>
                                    )}
                                    {canAssignClientOwner && (
                                        <select
                                            className={filterControlClass}
                                            value={bulkForm.assigned_staff_id}
                                            onChange={(e) => setBulkForm((s) => ({ ...s, assigned_staff_id: e.target.value }))}
                                            disabled={bulkLoading}
                                        >
                                            <option value="">Gán nhân sự phụ trách...</option>
                                            {staffUsers.map((user) => (
                                                <option key={user.id} value={user.id}>
                                                    {user.name}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    {canAssignClientOwner && (
                                        <button
                                            type="button"
                                            className="rounded-2xl border border-slate-200/80 bg-white px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
                                            onClick={bulkAssignStaff}
                                            disabled={bulkLoading}
                                        >
                                            Gán phụ trách
                                        </button>
                                    )}
                                    {canDeleteClients && (
                                        <button
                                            type="button"
                                            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 disabled:opacity-60"
                                            onClick={bulkDeleteClients}
                                            disabled={bulkLoading}
                                        >
                                            {bulkLoading ? 'Đang xử lý...' : 'Xóa đã chọn'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                        <div className="overflow-x-auto">
                            <table
                                ref={clientTableRef}
                                data-sort-scope="remote"
                                data-sort-by={clientFilters.sort_by || 'last_activity_at'}
                                data-sort-dir={clientFilters.sort_dir || 'desc'}
                                className="table-spacious min-w-full text-sm"
                            >
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-wider text-text-subtle border-b border-slate-200">
                                        {canBulkClientActions && selectableVisibleClientIds.length > 0 && (
                                            <th className="py-2 pr-2 w-10" data-az-ignore>
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-slate-300 text-primary focus:ring-primary/20"
                                                    checked={allVisibleSelected}
                                                    onChange={toggleSelectAllVisibleClients}
                                                    aria-label="Chọn tất cả khách hàng trang hiện tại"
                                                />
                                            </th>
                                        )}
                                        <th className="py-2" data-sort-key="name">Khách hàng</th>
                                        <th className="py-2" data-sort-key="phone">SĐT</th>
                                        <th className="py-2" data-sort-key="lead_type">Trạng thái</th>
                                        <th className="py-2" data-sort-key="revenue_tier">Hạng</th>
                                        <th className="py-2" data-sort-key="department">Phòng ban</th>
                                        <th className="py-2" data-sort-key="assigned_staff">Phụ trách</th>
                                        <th className="py-2" data-sort-key="care_staff">Chăm sóc</th>
                                        <th className="py-2" data-sort-key="created_at">Ngày tạo</th>
                                        <th className="py-2" data-sort-key="product_categories">Danh mục sản phẩm</th>
                                        <th className="py-2" data-sort-key="notes">Ghi chú</th>
                                        <th className="py-2" data-sort-key="total_revenue">Doanh số lũy kế</th>
                                        <th className="py-2" data-sort-key="total_debt_amount">Công nợ</th>
                                        <th className="py-2" data-sort-key="opportunities_count">Số cơ hội</th>
                                        <th className="py-2" data-sort-key="contracts_count">Số hợp đồng</th>
                                        <th className="py-2" data-sort-key="lead_source">Nguồn</th>
                                        <th className="py-2" data-az-ignore></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {clients.map((client) => (
                                        <Fragment key={client.id}>
                                        <tr
                                            className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${selectedClientSet.has(Number(client.id)) ? 'bg-primary/5' : ''}`}
                                            onClick={() => {
                                                window.location.href = route('crm.flow', client.id);
                                            }}
                                        >
                                            {canBulkClientActions && (canManageClientRow(client) || canDeleteClientRow(client)) && (
                                                <td className="py-2 pr-2 align-top">
                                                    <input
                                                        type="checkbox"
                                                        className="mt-1 rounded border-slate-300 text-primary focus:ring-primary/20"
                                                        checked={selectedClientSet.has(Number(client.id))}
                                                        onChange={() => toggleClientSelect(client.id)}
                                                        onClick={(event) => event.stopPropagation()}
                                                        aria-label={`Chọn khách hàng ${client.name}`}
                                                    />
                                                </td>
                                            )}
                                            <td className="py-2">
                                                <button
                                                    type="button"
                                                    className="text-left"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        window.location.href = route('crm.flow', client.id);
                                                    }}
                                                    title="Mở luồng khách hàng"
                                                >
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <div className="font-medium text-primary hover:underline">{client.name}</div>
                                                        {client.is_in_rotation_pool && (
                                                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                                                                Đang ở kho số
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-text-muted">{client.company || '—'}</div>
                                                </button>
                                            </td>
                                            <td className="py-2 text-xs text-text-muted">{client.phone || '—'}</td>
                                            <td className="py-2">
                                                {client.lead_type ? (
                                                    <span
                                                        className="rounded-full border px-2 py-1 text-xs font-semibold"
                                                        style={badgeStyle(client.lead_type.color_hex || '#94A3B8')}
                                                    >
                                                        {client.lead_type.name}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-text-muted">—</span>
                                                )}
                                            </td>
                                            <td className="py-2">
                                                {client.revenue_tier ? (
                                                    <span
                                                        className="rounded-full border px-2 py-1 text-xs font-semibold"
                                                        style={badgeStyle(client.revenue_tier.color_hex || '#94A3B8')}
                                                    >
                                                        {client.revenue_tier.label}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-text-muted">—</span>
                                                )}
                                            </td>
                                            <td className="py-2 text-xs text-text-muted">
                                                {client.assigned_department?.name || '—'}
                                            </td>
                                            <td className="py-2 text-xs text-text-muted">
                                                {client.assigned_staff?.name || client.sales_owner?.name || '—'}
                                            </td>
                                            <td className="py-2 text-xs text-text-muted">
                                                {Array.isArray(client.care_staff_users) && client.care_staff_users.length > 0
                                                    ? client.care_staff_users.map((item) => item?.name).filter(Boolean).slice(0, 2).join(', ')
                                                        + (client.care_staff_users.length > 2 ? ` +${client.care_staff_users.length - 2}` : '')
                                                    : '—'}
                                            </td>
                                            <td className="py-2 text-xs text-text-muted">
                                                {formatVietnamDate(client.created_at)}
                                            </td>
                                            <td className="allow-wrap py-2 text-xs text-text-muted">
                                                {(() => {
                                                    const categories = parseProductCategories(client.product_categories);
                                                    if (categories.length === 0) return '—';
                                                    return categories.slice(0, 2).join(', ') + (categories.length > 2 ? ` +${categories.length - 2}` : '');
                                                })()}
                                            </td>
                                            <td className="allow-wrap py-2 text-xs text-text-muted">
                                                {client.notes ? client.notes : '—'}
                                            </td>
                                            <td className="py-2 text-slate-700">
                                                {Number(client.total_revenue || 0).toLocaleString('vi-VN')}
                                            </td>
                                            <td className="py-2 text-slate-700">
                                                {Number(client.total_debt_amount || 0).toLocaleString('vi-VN')}
                                            </td>
                                            <td className="py-2 text-xs font-semibold text-slate-700">
                                                {Number(client.opportunities_count || 0)}
                                            </td>
                                            <td className="py-2 text-xs font-semibold text-slate-700">
                                                {Number(client.contracts_count || 0)}
                                            </td>
                                            <td className="py-2 text-xs text-text-muted">
                                                <div>
                                                    {client.lead_source || '—'} {client.lead_channel ? `• ${client.lead_channel}` : ''}
                                                </div>
                                                {client.facebook_page?.name && (
                                                    <div className="text-[11px] text-text-subtle">Page: {client.facebook_page.name}</div>
                                                )}
                                            </td>
                                            <td className="py-2 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {canShowTransferOnClientRow(client) && (
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                                                            onClick={(event) => openCrmTransferModal(client, event)}
                                                            title="Chuyển phụ trách (phiếu chuyển giao)"
                                                        >
                                                            <AppIcon name="handover" className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                    {canManageClientRow(client) && (
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                editClient(client);
                                                            }}
                                                            title="Sửa khách hàng"
                                                        >
                                                            <AppIcon name="pencil" className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                    {canDeleteClientRow(client) && (
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 text-rose-600 hover:bg-rose-50"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                deleteClient(client.id);
                                                            }}
                                                            title="Xóa khách hàng"
                                                        >
                                                            <AppIcon name="trash" className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        {client.pending_staff_transfer?.status === 'pending' ? (
                                            <tr className="border-b border-amber-100 bg-amber-50/50">
                                                <td
                                                    colSpan={canBulkClientActions ? 17 : 16}
                                                    className="px-3 py-2"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <ClientStaffTransferPendingBanner
                                                        transfer={client.pending_staff_transfer}
                                                        myUserId={Number(userId || 0)}
                                                        normalizedRole={normalizedRole}
                                                        loading={pendingTransferActionLoading}
                                                        density="compact"
                                                        onAction={(action) => actOnPendingTransferRequest(client.pending_staff_transfer?.id, action)}
                                                    />
                                                </td>
                                            </tr>
                                        ) : null}
                                        </Fragment>
                                    ))}
                                    {clients.length === 0 && (
                                        <tr>
                                            <td className="py-6 text-center text-sm text-text-muted" colSpan={canBulkClientActions ? 17 : 16}>
                                                Chưa có khách hàng nào.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <PaginationControls
                            page={clientMeta.current_page}
                            lastPage={clientMeta.last_page}
                            total={clientMeta.total}
                            perPage={clientFilters.per_page}
                            label="khách hàng"
                            onPageChange={(page) => fetchClients(page, clientFilters)}
                            onPerPageChange={(perPage) => {
                                const next = { ...clientFilters, per_page: perPage };
                                setClientFilters(next);
                                fetchClients(1, next);
                            }}
                        />
                    </div>

                    <Modal
                        open={showClientForm}
                        onClose={closeClientForm}
                        title={editingClientId ? `Sửa khách hàng #${editingClientId}` : 'Tạo khách hàng'}
                        description="Cập nhật thông tin khách hàng và trạng thái khách hàng tiềm năng."
                        size="lg"
                    >
                        <form className="space-y-3 text-sm" onSubmit={submitClient}>
                            {editingClientId && editingPendingTransfer?.status === 'pending' ? (
                                <ClientStaffTransferPendingBanner
                                    transfer={editingPendingTransfer}
                                    myUserId={Number(userId || 0)}
                                    normalizedRole={normalizedRole}
                                    loading={pendingTransferActionLoading}
                                    density="emphasized"
                                    onAction={(action) => actOnPendingTransferRequest(editingPendingTransfer.id, action)}
                                />
                            ) : null}
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                                <div className="mb-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-subtle">
                                        Thông tin khách hàng
                                    </p>
                                    <p className="mt-1 text-xs text-text-muted">
                                        Điền thông tin cơ bản để CRM dễ lọc, tìm kiếm và lên hợp đồng.
                                    </p>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <LabeledField label="Tên khách hàng" required className="md:col-span-2">
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                            placeholder="Ví dụ: Nguyễn Văn A"
                                            value={clientForm.name}
                                            onChange={(e) => setClientForm((s) => ({ ...s, name: e.target.value }))}
                                        />
                                    </LabeledField>
                                    <LabeledField label="Công ty">
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                            placeholder="Ví dụ: Công ty ABC"
                                            value={clientForm.company}
                                            onChange={(e) => setClientForm((s) => ({ ...s, company: e.target.value }))}
                                        />
                                    </LabeledField>
                                    {canManageClientCompanyProfiles && (
                                        <div className="md:col-span-2 rounded-2xl border border-dashed border-slate-300 bg-white/80 p-4">
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-900">Công ty pháp lý của khách hàng</p>
                                                    <p className="mt-1 text-xs text-text-muted">
                                                        Administrator có thể khai báo nhiều công ty để người dùng chọn đúng Bên A khi xuất hợp đồng Word.
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/15"
                                                    onClick={addClientCompanyProfile}
                                                >
                                                    + Thêm công ty
                                                </button>
                                            </div>
                                            <div className="mt-4 space-y-3">
                                                {normalizeCompanyProfiles(clientForm.company_profiles).length === 0 && (
                                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-text-muted">
                                                        Chưa có công ty pháp lý nào. Khi chưa khai báo, xuất hợp đồng sẽ không thể điền đủ thông tin Bên A.
                                                    </div>
                                                )}
                                                {normalizeCompanyProfiles(clientForm.company_profiles).map((profile, index) => (
                                                    <div key={profile.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                            <div className="text-sm font-semibold text-slate-900">Công ty bên A #{index + 1}</div>
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                                                                    <input
                                                                        type="radio"
                                                                        name="default-client-company-profile"
                                                                        checked={!!profile.is_default}
                                                                        onChange={() => setDefaultClientCompanyProfile(profile.id)}
                                                                    />
                                                                    Mặc định
                                                                </label>
                                                                <button
                                                                    type="button"
                                                                    className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                                                    onClick={() => removeClientCompanyProfile(profile.id)}
                                                                >
                                                                    Xóa
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                                                            <LabeledField label="Tên công ty" required>
                                                                <input
                                                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                                                    placeholder="Ví dụ: Công ty TNHH ABC"
                                                                    value={profile.company_name}
                                                                    onChange={(e) => updateClientCompanyProfile(profile.id, 'company_name', e.target.value)}
                                                                />
                                                            </LabeledField>
                                                            <LabeledField label="Mã số thuế">
                                                                <input
                                                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                                                    placeholder="Ví dụ: 0101234567"
                                                                    value={profile.tax_code}
                                                                    onChange={(e) => updateClientCompanyProfile(profile.id, 'tax_code', e.target.value)}
                                                                />
                                                            </LabeledField>
                                                            <LabeledField label="Người đại diện">
                                                                <input
                                                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                                                    placeholder="Ví dụ: Ông Nguyễn Văn A"
                                                                    value={profile.representative}
                                                                    onChange={(e) => updateClientCompanyProfile(profile.id, 'representative', e.target.value)}
                                                                />
                                                            </LabeledField>
                                                            <LabeledField label="Chức vụ">
                                                                <input
                                                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                                                    placeholder="Ví dụ: Giám đốc"
                                                                    value={profile.position}
                                                                    onChange={(e) => updateClientCompanyProfile(profile.id, 'position', e.target.value)}
                                                                />
                                                            </LabeledField>
                                                            <LabeledField label="Địa chỉ công ty" className="md:col-span-2">
                                                                <textarea
                                                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                                                    rows={3}
                                                                    placeholder="Nhập địa chỉ pháp lý của công ty"
                                                                    value={profile.address}
                                                                    onChange={(e) => updateClientCompanyProfile(profile.id, 'address', e.target.value)}
                                                                />
                                                            </LabeledField>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <LabeledField label="Trạng thái lead">
                                        <select
                                            className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                            value={clientForm.lead_type_id}
                                            onChange={(e) => setClientForm((s) => ({ ...s, lead_type_id: e.target.value }))}
                                        >
                                            {leadTypes.map((type) => (
                                                <option key={type.id} value={type.id}>
                                                    {type.name}
                                                </option>
                                            ))}
                                        </select>
                                    </LabeledField>
                                    <LabeledField label="Email">
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                            placeholder="contact@company.com"
                                            value={clientForm.email}
                                            onChange={(e) => setClientForm((s) => ({ ...s, email: e.target.value }))}
                                        />
                                    </LabeledField>
                                    <LabeledField label="Số điện thoại">
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                            placeholder="09xxxxxxxx"
                                            value={clientForm.phone}
                                            onChange={(e) => setClientForm((s) => ({ ...s, phone: e.target.value }))}
                                        />
                                    </LabeledField>
                                </div>
                            </div>
                            {canAssignClientOwner && (
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4 space-y-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-subtle">
                                            Phân công khách hàng
                                        </p>
                                        <p className="mt-1 text-xs text-text-muted">
                                            {isAdminRole
                                                ? 'Chọn phòng ban trước hoặc chọn nhân sự trước — hệ thống sẽ gắn phòng ban theo nhân sự. Nếu chỉ chọn phòng mà chưa chọn người, khách vẫn nằm trong phòng đó.'
                                                : 'Chọn phòng ban bạn quản lý hoặc chọn nhân sự trước để tự gắn phòng. Chỉ giao được trong phạm vi phòng của bạn.'}
                                        </p>
                                    </div>
                                    <div className={`grid gap-2 ${showClientDepartmentPicker ? 'md:grid-cols-2' : ''}`}>
                                        {showClientDepartmentPicker && (
                                            <LabeledField
                                                label="Phòng ban phụ trách"
                                                hint="Sau khi chọn phòng, danh sách nhân sự phụ trách chỉ còn nhân viên thuộc phòng đó."
                                            >
                                                <select
                                                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                                    value={clientForm.assigned_department_id}
                                                    onChange={(e) => {
                                                        const nextDept = e.target.value;
                                                        setClientForm((s) => {
                                                            const deptNum = Number(nextDept || 0);
                                                            let nextStaff = s.assigned_staff_id;
                                                            if (deptNum > 0 && nextStaff) {
                                                                const u = staffUsers.find((user) => String(user.id) === String(nextStaff));
                                                                if (!u || Number(u.department_id || 0) !== deptNum) {
                                                                    nextStaff = '';
                                                                }
                                                            }
                                                            return {
                                                                ...s,
                                                                assigned_department_id: nextDept,
                                                                assigned_staff_id: nextStaff,
                                                                sales_owner_id: nextStaff,
                                                            };
                                                        });
                                                    }}
                                                >
                                                    <option value="">Chọn phòng ban phụ trách</option>
                                                    {visibleDepartmentOptions.map((dept) => (
                                                        <option key={dept.id} value={dept.id}>
                                                            {dept.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </LabeledField>
                                        )}
                                        <LabeledField
                                            label="Nhân sự phụ trách"
                                            required={!isAdminRole}
                                            hint={
                                                Number(clientForm.assigned_department_id || 0) > 0
                                                    ? 'Chỉ hiển thị nhân viên thuộc phòng ban đã chọn.'
                                                    : 'Chọn nhân sự trước để tự gắn phòng ban. Người này sẽ nhận push khi có khách mới từ form, page hoặc CRM.'
                                            }
                                        >
                                            <select
                                                className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                                value={clientForm.assigned_staff_id}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    const selectedUser = staffUsers.find((user) => String(user.id) === String(val));
                                                    const deptFromUser = selectedUser?.department_id != null && String(selectedUser.department_id) !== ''
                                                        ? String(selectedUser.department_id)
                                                        : null;
                                                    setClientForm((s) => ({
                                                        ...s,
                                                        assigned_staff_id: val,
                                                        sales_owner_id: val,
                                                        assigned_department_id: deptFromUser ?? s.assigned_department_id,
                                                    }));
                                                }}
                                            >
                                                <option value="">
                                                    {isAdminRole ? 'Chọn nhân sự phụ trách (tuỳ chọn)' : 'Chọn nhân sự phụ trách'}
                                                </option>
                                                {clientFormAssignedStaffOptions.map((user) => (
                                                    <option key={user.id} value={user.id}>
                                                        {user.name}
                                                        {user.department_id
                                                            ? ` • ${visibleDepartmentOptions.find((dept) => Number(dept.id) === Number(user.department_id))?.name || user.role}`
                                                            : ` • ${user.role}`}
                                                    </option>
                                                ))}
                                            </select>
                                        </LabeledField>
                                        <LabeledField
                                            label="Danh sách nhân viên chăm sóc"
                                            hint="Nhóm này chỉ có quyền xem thông tin khách hàng, hợp đồng, dự án, công việc và thêm ghi chú chăm sóc."
                                            className={showClientDepartmentPicker ? 'md:col-span-2' : ''}
                                        >
                                            <TagMultiSelect
                                                options={careStaffOptions}
                                                selectedIds={clientForm.care_staff_ids}
                                                addPlaceholder="Thêm nhân viên chăm sóc"
                                                emptyLabel="Chưa thêm nhân viên chăm sóc nào."
                                                onChange={(selectedIds) => {
                                                    setClientForm((s) => ({ ...s, care_staff_ids: selectedIds }));
                                                }}
                                            />
                                        </LabeledField>
                                    </div>
                                </div>
                            )}
                            {!canAssignClientOwner && !editingClientId && (
                                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                                    Khách hàng mới sẽ tự gắn cho bạn phụ trách. Khi có lead mới hệ thống cũng sẽ dùng người phụ trách này để gửi thông báo.
                                </div>
                            )}
                            {!canAssignClientOwner && editingClientId && (
                                <div className="rounded-2xl border border-amber-100 bg-amber-50/95 px-4 py-3 text-xs text-amber-950">
                                    <p className="font-semibold text-amber-950">Phân công phụ trách (chỉ đọc)</p>
                                    <p className="mt-1 text-amber-900/95">
                                        Người phụ trách hiện tại:
                                        {' '}
                                        <span className="font-semibold">{assigneeReadonlyLabel || '—'}</span>
                                    </p>
                                    <p className="mt-2 leading-relaxed text-amber-900/90">
                                        Nhân viên không đổi phụ trách trực tiếp trong form này. Dùng
                                        {' '}
                                        <span className="font-semibold">«Chuyển phụ trách»</span>
                                        {' '}
                                        trên dòng khách, hoặc mở
                                        {' '}
                                        <button
                                            type="button"
                                            className="font-semibold text-primary underline decoration-primary/40 underline-offset-2 hover:text-primary/90"
                                            onClick={() => {
                                                window.location.href = route('crm.client.show', editingClientId);
                                            }}
                                        >
                                            chi tiết khách hàng
                                        </button>
                                        {' '}
                                        (xác nhận phiếu, chuyển giao) —
                                        {' '}
                                        <button
                                            type="button"
                                            className="font-semibold text-slate-700 underline decoration-slate-400 underline-offset-2 hover:text-slate-900"
                                            onClick={() => {
                                                window.location.href = route('crm.flow', editingClientId);
                                            }}
                                        >
                                            luồng đầy đủ
                                        </button>
                                        {' '}
                                        (cơ hội, hợp đồng, dự án…).
                                    </p>
                                </div>
                            )}
                            <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                                <div className="mb-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-subtle">
                                        Nguồn & nội dung lead
                                    </p>
                                    <p className="mt-1 text-xs text-text-muted">
                                        Ghi rõ nguồn khách, kênh tiếp cận và nội dung trao đổi để đội sales bám theo dễ hơn.
                                    </p>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <LabeledField label="Nguồn khách hàng">
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                            placeholder="Ví dụ: Website, fanpage, referral"
                                            value={clientForm.lead_source}
                                            onChange={(e) => setClientForm((s) => ({ ...s, lead_source: e.target.value }))}
                                        />
                                    </LabeledField>
                                    <LabeledField label="Kênh tiếp cận">
                                        <input
                                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                            placeholder="Ví dụ: Form, inbox, gọi điện"
                                            value={clientForm.lead_channel}
                                            onChange={(e) => setClientForm((s) => ({ ...s, lead_channel: e.target.value }))}
                                        />
                                    </LabeledField>
                                    <LabeledField label="Nội dung khách để lại" className="md:col-span-2">
                                        <textarea
                                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                            rows={3}
                                            placeholder="Ví dụ: Khách cần báo giá gói dịch vụ SEO tổng thể"
                                            value={clientForm.lead_message}
                                            onChange={(e) => setClientForm((s) => ({ ...s, lead_message: e.target.value }))}
                                        />
                                    </LabeledField>
                                    <LabeledField label="Ghi chú nội bộ" className="md:col-span-2">
                                        <textarea
                                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                            rows={3}
                                            placeholder="Ghi chú riêng cho đội phụ trách"
                                            value={clientForm.notes}
                                            onChange={(e) => setClientForm((s) => ({ ...s, notes: e.target.value }))}
                                        />
                                    </LabeledField>
                                </div>
                            </div>
                            {!canManageClients && (
                                <p className="text-xs text-text-muted">
                                    Chỉ Admin/Quản lý/Nhân sự được quản lý khách hàng.
                                </p>
                            )}
                            <div className="flex items-center gap-3">
                                <button
                                    type="submit"
                                    className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold"
                                    disabled={submittingClient}
                                >
                                    {submittingClient
                                        ? (editingClientId ? 'Đang cập nhật...' : 'Đang tạo...')
                                        : (editingClientId ? 'Cập nhật khách hàng' : 'Tạo khách hàng')}
                                </button>
                                <button
                                    type="button"
                                    className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold"
                                    onClick={closeClientForm}
                                    disabled={submittingClient}
                                >
                                    Hủy
                                </button>
                            </div>
                        </form>
                    </Modal>

                    <Modal
                        open={showTransferModal}
                        onClose={closeCrmTransferModal}
                        title="Chuyển phụ trách khách hàng"
                        description={
                            transferTargetClient?.name
                                ? `Phiếu chuyển giao trong cùng phòng ban — khách «${transferTargetClient.name}».`
                                : 'Gửi phiếu chuyển giao phụ trách trong cùng phòng ban.'
                        }
                        size="md"
                    >
                        <form className="mt-2 space-y-4 text-sm" onSubmit={submitCrmTransfer}>
                            <div>
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
                                    Nhân sự nhận phụ trách
                                </label>
                                <select
                                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                    value={transferForm.to_staff_id}
                                    onChange={(e) => setTransferForm((s) => ({ ...s, to_staff_id: e.target.value }))}
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
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
                                    Ghi chú
                                </label>
                                <textarea
                                    className="min-h-[72px] w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                    rows={3}
                                    value={transferForm.note}
                                    onChange={(e) => setTransferForm((s) => ({ ...s, note: e.target.value }))}
                                    placeholder="Lý do chuyển giao (tuỳ chọn)"
                                />
                            </div>
                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                    onClick={closeCrmTransferModal}
                                    disabled={transferSubmitting}
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
                </>

            <Modal
                open={showClientImport}
                onClose={() => {
                    setShowClientImport(false);
                    setClientImportFile(null);
                    setClientImportReport(null);
                    setClientImportJob(null);
                }}
                title="Import khách hàng"
                description="Tải file Excel (.xls/.xlsx/.xlsm), OpenDocument (.ods), CSV hoặc TSV để nhập khách hàng."
                size="md"
            >
                <form className="space-y-3 text-sm" onSubmit={submitClientImport}>
                    <LabeledField
                        label="File khách hàng"
                        required
                        hint="Hỗ trợ Excel (.xls, .xlsx, .xlsm), OpenDocument (.ods), CSV, TSV. Hệ thống sẽ tự nối theo mã khách, email, số điện thoại hoặc tên để tránh trùng dữ liệu."
                    >
                        <div className="rounded-2xl border border-dashed border-slate-200/80 p-4 text-center">
                            <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                                onClick={() => window.open('/api/v1/imports/clients/template', '_blank', 'noopener,noreferrer')}
                            >
                                Tải file mẫu
                            </button>
                            <input
                                id="import-client-file"
                                type="file"
                                accept=".xls,.xlsx,.xlsm,.ods,.csv,.tsv"
                                onChange={(e) => {
                                    setClientImportFile(e.target.files?.[0] || null);
                                    setClientImportReport(null);
                                }}
                                className="hidden"
                            />
                            <label
                                htmlFor="import-client-file"
                                className="mt-3 inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                                Chọn file
                            </label>
                            <p className="text-xs text-text-muted mt-2">
                                {clientImportFile ? clientImportFile.name : 'Chưa chọn file'}
                            </p>
                        </div>
                    </LabeledField>
                    {clientImportReport && (
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3 space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                                Kết quả import
                            </div>
                            <p className="text-xs text-slate-700">
                                Tạo mới: {clientImportReport.created || 0} • Cập nhật: {clientImportReport.updated || 0} • Bỏ qua: {clientImportReport.skipped || 0}
                            </p>

                            {Array.isArray(clientImportReport.errors) && clientImportReport.errors.length > 0 && (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5">
                                    <div className="text-xs font-semibold text-rose-700">Dòng lỗi không import được</div>
                                    <div className="mt-1 max-h-32 space-y-1 overflow-y-auto text-xs text-rose-700">
                                        {clientImportReport.errors.map((item, idx) => (
                                            <div key={`err-${idx}`}>
                                                Dòng {item.row ?? '-'}: {item.message || 'Lỗi không xác định'}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {Array.isArray(clientImportReport.warnings) && clientImportReport.warnings.length > 0 && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                                    <div className="text-xs font-semibold text-amber-700">Cảnh báo dữ liệu (đã import nhưng có trường để trống)</div>
                                    <div className="mt-1 max-h-28 space-y-1 overflow-y-auto text-xs text-amber-700">
                                        {clientImportReport.warnings.map((item, idx) => (
                                            <div key={`warn-${idx}`}>
                                                Dòng {item.row ?? '-'}: {item.message || 'Cảnh báo dữ liệu'}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {clientImportJob && (
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-3 text-xs">
                                <div className="font-semibold uppercase tracking-[0.14em] text-text-subtle">Tiến trình import</div>
                                <div className="font-semibold text-slate-700">
                                    {clientImportJob.processed_rows || 0}/{clientImportJob.total_rows || 0} dòng
                                </div>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                                <div
                                    className={`h-full rounded-full transition-all ${clientImportJob.status === 'failed' ? 'bg-rose-500' : 'bg-primary'}`}
                                    style={{ width: `${clientImportJob.progress_percent || 0}%` }}
                                />
                            </div>
                            <div className="flex items-center justify-between text-xs text-text-muted">
                                <span>
                                    Trạng thái: {clientImportJob.status === 'queued' ? 'Đang chờ' : clientImportJob.status === 'processing' ? 'Đang xử lý' : clientImportJob.status === 'completed' ? 'Hoàn tất' : 'Thất bại'}
                                </span>
                                <span>{clientImportJob.progress_percent || 0}%</span>
                            </div>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <button
                            type="submit"
                            className="flex-1 rounded-2xl px-3 py-2.5 bg-primary text-white text-sm font-semibold"
                            disabled={importingClients}
                        >
                            {importingClients ? 'Đang import...' : 'Import'}
                        </button>
                        <button
                            type="button"
                            className="flex-1 rounded-2xl px-3 py-2.5 border border-slate-200 text-sm font-semibold"
                            onClick={() => {
                                setShowClientImport(false);
                                setClientImportFile(null);
                                setClientImportReport(null);
                                setClientImportJob(null);
                            }}
                        >
                            Hủy
                        </button>
                    </div>
                </form>
            </Modal>
        </PageContainer>
    );
}
