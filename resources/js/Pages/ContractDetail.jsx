import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import Modal from '@/Components/Modal';
import AppIcon from '@/Components/AppIcon';
import { useToast } from '@/Contexts/ToastContext';
import { Link } from '@inertiajs/inertia-react';

// Common badges and formatters (copied from Contracts.jsx / ProjectsKanban)
const STATUS_OPTIONS = [
    { value: 'draft', label: 'Bản nháp' },
    { value: 'active', label: 'Đang hiệu lực' },
    { value: 'signed', label: 'Đã ký' },
    { value: 'expired', label: 'Hết hạn' },
    { value: 'cancelled', label: 'Đã hủy' },
];

const DEFAULT_STATUSES = [
    { value: 'moi_tao', label: 'Mới tạo' },
    { value: 'dang_trien_khai', label: 'Đang triển khai' },
    { value: 'cho_duyet', label: 'Chờ duyệt' },
    { value: 'hoan_thanh', label: 'Hoàn thành' },
    { value: 'tam_dung', label: 'Tạm dừng' },
];

const DEFAULT_SERVICES = [
    { value: 'backlinks', label: 'Backlinks' },
    { value: 'viet_content', label: 'Content' },
    { value: 'audit_content', label: 'Audit Content' },
    { value: 'cham_soc_website_tong_the', label: 'Website Care' },
    { value: 'noi_bo', label: 'Dự án Nội bộ' },
    { value: 'khac', label: 'Khác' },
];

const parseNumberInput = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = Number(String(value).replace(/,/g, ''));
    return Number.isNaN(parsed) ? 0 : parsed;
};

const formatCurrency = (amount) => {
    return parseNumberInput(amount).toLocaleString('en-US');
};

const formatDateDisplay = (dateString) => {
    if (!dateString) return '—';
    try {
        const d = new Date(dateString);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } catch {
        return '—';
    }
};

const resolveContractValue = (contract) => {
    if ((contract?.items || []).length > 0) return contract.items_total_value || 0;
    return contract?.value || 0;
};

const calculateItemTotal = (item) => {
    return parseNumberInput(item.unit_price) * parseNumberInput(item.quantity);
};

const statusBadgeClass = (status) => {
    if (status === 'draft') return 'bg-slate-100 text-slate-700 border border-slate-200';
    if (status === 'active') return 'bg-sky-50 text-sky-700 border border-sky-200';
    if (status === 'signed') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    if (status === 'expired') return 'bg-amber-50 text-amber-700 border border-amber-200';
    if (status === 'cancelled') return 'bg-rose-50 text-rose-700 border border-rose-200';
    return 'bg-slate-100 text-slate-700 border border-slate-200';
};

const approvalBadgeClass = (status) => {
    if (status === 'approved') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    if (status === 'rejected') return 'bg-rose-50 text-rose-700 border border-rose-200';
    return 'bg-amber-50 text-amber-700 border border-amber-200';
};

const approvalLabel = (status) => {
    if (status === 'approved') return 'Đã duyệt';
    if (status === 'rejected') return 'Từ chối';
    return 'Chờ duyệt';
};

const handoverReceiveBadgeClass = (status) => {
    if (status === 'da_nhan_ban_giao') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    return 'bg-amber-50 text-amber-700 border border-amber-200';
};

const handoverReceiveLabel = (status) => {
    if (status === 'da_nhan_ban_giao') return 'Đã nhận bàn giao';
    return 'Chưa nhận bàn giao';
};

const toDateInputValue = (raw) => {
    if (!raw) return '';
    const text = String(raw);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const isoDate = text.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return '';
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};

const readBoolean = (raw) => {
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return raw !== 0;
    if (typeof raw === 'string') {
        const normalized = raw.trim().toLowerCase();
        if (['1', 'true', 'yes'].includes(normalized)) return true;
        if (['0', 'false', 'no'].includes(normalized)) return false;
    }
    return null;
};

function AutoCodeBadge({ code, className = '' }) {
    if (!code) return <span className={`text-text-muted ${className}`}>Chưa có</span>;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ${className}`}>
            <AppIcon name="hash" className="h-3 w-3 text-slate-400" />
            {code}
        </span>
    );
}

function DetailMetric({ label, value, tone = 'slate' }) {
    const tones = {
        slate: 'bg-white border-slate-200/80',
        sky: 'bg-gradient-to-br from-sky-50 to-white border-sky-100',
        emerald: 'bg-gradient-to-br from-emerald-50 to-white border-emerald-100',
        amber: 'bg-gradient-to-br from-amber-50 to-white border-amber-100',
        rose: 'bg-gradient-to-br from-rose-50 to-white border-rose-100',
    };
    const textTones = {
        slate: 'text-slate-900',
        sky: 'text-sky-900',
        emerald: 'text-emerald-900',
        amber: 'text-amber-900',
        rose: 'text-rose-900',
    };
    return (
        <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}>
            <div className="text-xs uppercase tracking-[0.12em] text-text-subtle">{label}</div>
            <div className={`mt-1 text-lg font-bold ${textTones[tone]}`}>{value}</div>
        </div>
    );
}

export default function ContractDetail(props) {
    const { contractId, auth } = props;
    const toast = useToast();

    const userRole = auth?.user?.role || '';
    const currentUserId = auth?.user?.id;

    const [loading, setLoading] = useState(true);
    const [contract, setContract] = useState(null);
    const [careNoteForm, setCareNoteForm] = useState({ title: '', detail: '' });
    const [savingCareNote, setSavingCareNote] = useState(false);

    // Project creation state
    const [projectOwners, setProjectOwners] = useState([]);
    const [meta, setMeta] = useState({});
    const [showProjectForm, setShowProjectForm] = useState(false);
    const [showEditContractModal, setShowEditContractModal] = useState(false);
    const [savingContract, setSavingContract] = useState(false);
    const [clientsLookup, setClientsLookup] = useState([]);
    const [collectorsLookup, setCollectorsLookup] = useState([]);
    const [editForm, setEditForm] = useState({
        title: '',
        client_id: '',
        status: 'draft',
        collector_user_id: '',
        value: '',
        payment_times: '1',
        signed_at: '',
        start_date: '',
        end_date: '',
        notes: '',
    });
    const [projectForm, setProjectForm] = useState({
        name: '',
        service_type: DEFAULT_SERVICES[0].value,
        service_type_other: '',
        start_date: '',
        deadline: '',
        status: DEFAULT_STATUSES[0].value,
        customer_requirement: '',
        owner_id: '',
        repo_url: '',
        website_url: '',
    });

    const statusOptions = useMemo(() => {
        const values = meta.project_statuses || [];
        if (!values.length) return DEFAULT_STATUSES;
        return values.map((value) => ({ value, label: value })); // simplified since we don't have LABELS map here
    }, [meta]);

    const serviceOptions = useMemo(() => {
        const values = meta.service_types || [];
        if (!values.length) return DEFAULT_SERVICES;
        return values.map((value) => ({ value, label: value }));
    }, [meta]);

    const ownerOptions = useMemo(
        () => projectOwners.filter((owner) => !['admin', 'administrator', 'ke_toan'].includes(String(owner?.role || '').toLowerCase())),
        [projectOwners]
    );
    const collectorOptions = useMemo(
        () => collectorsLookup.filter((owner) => !['admin', 'administrator', 'ke_toan'].includes(String(owner?.role || '').toLowerCase())),
        [collectorsLookup]
    );

    const hydrateEditForm = (data) => {
        if (!data) return;
        setEditForm({
            title: data.title || '',
            client_id: data.client_id ? String(data.client_id) : '',
            status: data.status || 'draft',
            collector_user_id: data.collector_user_id ? String(data.collector_user_id) : '',
            value: String(parseNumberInput(data.value || resolveContractValue(data) || 0)),
            payment_times: String(data.payment_times || 1),
            signed_at: toDateInputValue(data.signed_at),
            start_date: toDateInputValue(data.start_date),
            end_date: toDateInputValue(data.end_date),
            notes: data.notes || '',
        });
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/v1/contracts/${contractId}`);
            setContract(res.data);

            // Set default project name based on contract
            if (res.data) {
                setProjectForm(s => ({ ...s, name: res.data.title || '' }));
            }
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được chi tiết hợp đồng.');
        } finally {
            setLoading(false);
        }
    };

    const fetchMetaAndOwners = async () => {
        try {
            const [metaRes, ownersRes, clientRes] = await Promise.all([
                axios.get('/api/v1/meta').catch(() => ({ data: {} })),
                axios.get('/api/v1/users/lookup', { params: { purpose: 'project_owner' } }).catch(() => ({ data: { data: [] } })),
                axios.get('/api/v1/crm/clients', { params: { per_page: 200, page: 1, sort_by: 'last_activity_at', sort_dir: 'desc' } }).catch(() => ({ data: { data: [] } })),
            ]);
            setMeta(metaRes.data || {});
            setProjectOwners(ownersRes.data?.data || []);
            setCollectorsLookup(ownersRes.data?.data || []);
            setClientsLookup(clientRes.data?.data || []);
        } catch {
            // ignore
        }
    };

    useEffect(() => {
        loadData();
        fetchMetaAndOwners();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contractId]);

    const submitCareNote = async () => {
        if (!careNoteForm.title?.trim() || !careNoteForm.detail?.trim()) {
            toast.error('Vui lòng nhập cả tiêu đề và nội dung chăm sóc.');
            return;
        }
        setSavingCareNote(true);
        try {
            await axios.post(`/api/v1/contracts/${contractId}/care-notes`, careNoteForm);
            toast.success('Đã cập nhật nhật ký chăm sóc.');
            setCareNoteForm({ title: '', detail: '' });
            await loadData();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lỗi cập nhật nhật ký.');
        } finally {
            setSavingCareNote(false);
        }
    };

    const saveProject = async () => {
        if (!projectForm.name?.trim()) {
            toast.error('Vui lòng nhập Tên dự án.');
            return;
        }
        try {
            const payload = {
                ...projectForm,
                contract_id: contract.id,
                client_id: contract.client_id,
                service_type_other: projectForm.service_type === 'khac' ? projectForm.service_type_other : null,
                owner_id: projectForm.owner_id ? Number(projectForm.owner_id) : null,
                budget: resolveContractValue(contract),
            };

            const res = await axios.post('/api/v1/projects/from-contract', payload).catch(async (e) => {
               // if fallback fails, we create manually via /projects
               return await axios.post('/api/v1/projects', payload);
            });

            toast.success('Đã tạo dự án thành công.');
            setShowProjectForm(false);
            window.location.href = `/du-an/${res.data?.id || res.data?.data?.id}`;
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Lỗi tạo dự án.');
        }
    };

    const openEditContractModal = () => {
        hydrateEditForm(contract);
        setShowEditContractModal(true);
    };

    const submitContractUpdate = async (event) => {
        event.preventDefault();
        if (!contract?.id) return;
        if (!(editForm.title || '').trim()) {
            toast.error('Vui lòng nhập tên hợp đồng.');
            return;
        }
        if (!editForm.client_id) {
            toast.error('Vui lòng chọn khách hàng.');
            return;
        }
        if (!editForm.status) {
            toast.error('Vui lòng chọn trạng thái hợp đồng.');
            return;
        }

        setSavingContract(true);
        try {
            const payload = {
                title: (editForm.title || '').trim(),
                client_id: Number(editForm.client_id),
                status: editForm.status,
                collector_user_id: editForm.collector_user_id ? Number(editForm.collector_user_id) : null,
                value: parseNumberInput(editForm.value),
                payment_times: Math.max(1, Number(editForm.payment_times || 1)),
                signed_at: editForm.signed_at || null,
                start_date: editForm.start_date || null,
                end_date: editForm.end_date || null,
                notes: (editForm.notes || '').trim() || null,
            };
            await axios.put(`/api/v1/contracts/${contract.id}`, payload);
            toast.success('Đã cập nhật hợp đồng.');
            setShowEditContractModal(false);
            await loadData();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không thể cập nhật hợp đồng.');
        } finally {
            setSavingContract(false);
        }
    };

    if (loading) {
        return (
            <PageContainer auth={props.auth} title="Chi tiết Hợp đồng" description="">
                <div className="py-8 text-center text-sm text-text-muted">Đang tải chi tiết hợp đồng...</div>
            </PageContainer>
        );
    }

    if (!contract) {
        return (
            <PageContainer auth={props.auth} title="Lỗi" description="">
                <div className="py-8 text-center text-sm text-text-muted">Không tìm thấy hợp đồng hoặc bạn không có quyền truy cập.</div>
                <div className="text-center">
                    <Link href="/hop-dong" className="text-primary hover:underline">Về danh sách</Link>
                </div>
            </PageContainer>
        );
    }

    const canCreateProject = userRole === 'admin'
        || Number(contract.collector_user_id || 0) === currentUserId
        || Number(contract.created_by || 0) === currentUserId;
    const canManageContract = readBoolean(contract?.can_manage) === true;

    return (
        <PageContainer
            auth={props.auth}
            title={contract.title || `Hợp đồng #${contract.id}`}
            description="Xem toàn diện và cập nhật nhật ký chăm sóc Hợp đồng."
            breadcrumbs={[
                { label: 'Hợp đồng', url: '/hop-dong' },
                { label: contract.code || `CTR-${contract.id}` },
            ]}
        >


            <div className="space-y-4 text-sm mt-4">
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <div className="text-xs uppercase tracking-[0.16em] text-text-subtle">Hợp đồng</div>
                            <h3 className="mt-1 text-2xl font-bold text-slate-900">{contract.title}</h3>
                            <p className="mt-1 text-sm text-text-muted">
                                Khách hàng: <span className="font-semibold text-slate-700">{contract.client?.name || '—'}</span>
                                {' • '}
                                Nhân viên thu: <span className="font-semibold text-slate-700">{contract.collector?.name || '—'}</span>
                            </p>
                        </div>
                        <div className="flex flex-col items-end gap-3">
                            <div className="flex flex-wrap gap-2">
                                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${statusBadgeClass(contract.status)}`}>
                                    {STATUS_OPTIONS.find((item) => item.value === contract.status)?.label || contract.status}
                                </span>
                                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${approvalBadgeClass(contract.approval_status)}`}>
                                    {approvalLabel(contract.approval_status)}
                                </span>
                                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${handoverReceiveBadgeClass(contract.handover_receive_status)}`}>
                                    {handoverReceiveLabel(contract.handover_receive_status)}
                                </span>
                            </div>
                            {canManageContract && (
                                <button
                                    onClick={openEditContractModal}
                                    className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/15"
                                >
                                    Sửa hợp đồng
                                </button>
                            )}
                            {canCreateProject && contract.approval_status === 'approved' && !contract.project_id && (
                                <button
                                    onClick={() => setShowProjectForm(true)}
                                    className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary/90"
                                >
                                    + Tạo Dự Án Triển Khai
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <DetailMetric label="Giá trị hợp đồng" value={`${formatCurrency(resolveContractValue(contract))} VNĐ`} tone="sky" />
                    <DetailMetric label="Đã thu" value={`${formatCurrency(contract.payments_total || 0)} VNĐ`} tone="emerald" />
                    <DetailMetric label="Còn phải thu" value={`${formatCurrency(contract.debt_outstanding || 0)} VNĐ`} tone="amber" />
                    <DetailMetric label="Chi phí đã tính" value={`${formatCurrency(contract.costs_total || 0)} VNĐ`} />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                        <h4 className="text-sm font-semibold text-slate-900">Chi tiết thực thi</h4>
                        <div className="mt-4 space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                <span className="text-text-muted">Mã hợp đồng</span>
                                <AutoCodeBadge code={contract.code || `CTR-${contract.id}`} />
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                <span className="text-text-muted">Dự án liên kết</span>
                                {contract.project?.id ? (
                                    <Link href={`/du-an/${contract.project.id}`} className="font-semibold text-primary hover:underline">
                                        {contract.project.name || `Dự án #${contract.project.id}`}
                                    </Link>
                                ) : (
                                    <span className="text-text-muted text-xs">Chưa tạo dự án</span>
                                )}
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                <span className="text-text-muted">Ngày ký</span>
                                <span className="font-semibold text-slate-900">{formatDateDisplay(contract.signed_at)}</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                <span className="text-text-muted">Ngày bắt đầu</span>
                                <span className="font-semibold text-slate-900">{formatDateDisplay(contract.start_date)}</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                <span className="text-text-muted">Ngày kết thúc</span>
                                <span className="font-semibold text-slate-900">{formatDateDisplay(contract.end_date)}</span>
                            </div>
                            <div className="flex items-center justify-between pb-2">
                                <span className="text-text-muted">Nhận bàn giao dự án</span>
                                <span className="font-semibold text-slate-900">{handoverReceiveLabel(contract.handover_receive_status)}</span>
                            </div>
                            <div className="pt-2 rounded-xl bg-slate-50 p-3 mt-2">
                                <div className="text-text-muted mb-2 text-xs font-medium">Nhóm chăm sóc hợp đồng:</div>
                                <div className="flex flex-wrap gap-2">
                                    {(contract.care_staff_users || []).map((staff) => (
                                        <span key={staff.id} className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
                                            {staff.name}
                                        </span>
                                    ))}
                                    {(contract.care_staff_users || []).length === 0 && (
                                        <span className="text-xs text-text-muted">Chưa gắn nhân viên chăm sóc riêng cho hợp đồng này.</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                        <h4 className="text-sm font-semibold text-slate-900">Dữ liệu phê duyệt</h4>
                        <div className="mt-4 space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                <span className="text-text-muted">Người tạo</span>
                                <span className="font-semibold text-slate-900">{contract.creator?.name || '—'}</span>
                            </div>
                            <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                <span className="text-text-muted">Người duyệt</span>
                                <span className="font-semibold text-slate-900">{contract.approver?.name || '—'}</span>
                            </div>
                            <div className="flex items-center justify-between pb-2">
                                <span className="text-text-muted">Ngày duyệt</span>
                                <span className="font-semibold text-slate-900">{formatDateDisplay(contract.approved_at)}</span>
                            </div>
                            <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 mt-2">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                                    Ghi chú hợp đồng
                                </div>
                                <div className="mt-1 text-slate-700 text-xs">
                                    {contract.notes || 'Chưa có ghi chú hợp đồng.'}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                                    Ghi chú duyệt
                                </div>
                                <div className="mt-1 text-slate-700 text-xs">
                                    {contract.approval_note || 'Chưa có ghi chú duyệt.'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between mb-4">
                        <div>
                            <h4 className="text-sm font-semibold text-slate-900">Sản phẩm trong hợp đồng</h4>
                        </div>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                        <table className="min-w-full text-xs">
                            <thead className="bg-slate-50">
                                <tr className="border-b border-slate-200 text-left uppercase tracking-[0.12em] text-slate-500 font-semibold">
                                    <th className="px-4 py-3">Sản phẩm</th>
                                    <th className="px-4 py-3">Đơn vị</th>
                                    <th className="px-4 py-3">Đơn giá</th>
                                    <th className="px-4 py-3">Số lượng</th>
                                    <th className="px-4 py-3">Thành tiền</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {(contract.items || []).map((item) => (
                                    <tr key={item.id || `${item.product_name}-${item.quantity}`}>
                                        <td className="px-4 py-3 font-medium text-slate-900">{item.product_name || '—'}</td>
                                        <td className="px-4 py-3">{item.unit || '—'}</td>
                                        <td className="px-4 py-3">{formatCurrency(item.unit_price || 0)}</td>
                                        <td className="px-4 py-3">{item.quantity || 0}</td>
                                        <td className="px-4 py-3 font-semibold text-slate-700">{formatCurrency(item.total_price || calculateItemTotal(item))} VNĐ</td>
                                    </tr>
                                ))}
                                {(contract.items || []).length === 0 && (
                                    <tr>
                                        <td className="px-4 py-6 text-center text-text-muted" colSpan={5}>Chưa có sản phẩm nào.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                        <h4 className="text-sm font-semibold text-slate-900 mb-4">Lịch sử thu tiền</h4>
                        <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                            <table className="min-w-full text-xs">
                                <thead className="bg-slate-50">
                                    <tr className="border-b border-slate-200 text-left uppercase tracking-[0.12em] text-slate-500 font-semibold">
                                        <th className="px-4 py-3">Ngày thu</th>
                                        <th className="px-4 py-3">Số tiền</th>
                                        <th className="px-4 py-3">Phương thức</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(contract.payments || []).map((payment) => (
                                        <tr key={payment.id}>
                                            <td className="px-4 py-3">{formatDateDisplay(payment.paid_at)}</td>
                                            <td className="px-4 py-3 font-semibold text-emerald-700">{formatCurrency(payment.amount || 0)}</td>
                                            <td className="px-4 py-3">{payment.method || '—'}</td>
                                        </tr>
                                    ))}
                                    {(contract.payments || []).length === 0 && (
                                        <tr>
                                            <td className="px-4 py-4 text-center text-text-muted" colSpan={3}>Chưa có đợt thu nào.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                        <h4 className="text-sm font-semibold text-slate-900 mb-4">Chi phí hợp đồng</h4>
                        <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                            <table className="min-w-full text-xs">
                                <thead className="bg-slate-50">
                                    <tr className="border-b border-slate-200 text-left uppercase tracking-[0.12em] text-slate-500 font-semibold">
                                        <th className="px-4 py-3">Ngày chi</th>
                                        <th className="px-4 py-3">Loại chi phí</th>
                                        <th className="px-4 py-3">Số tiền</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(contract.costs || []).map((cost) => (
                                        <tr key={cost.id}>
                                            <td className="px-4 py-3">{formatDateDisplay(cost.cost_date)}</td>
                                            <td className="px-4 py-3">{cost.cost_type || '—'}</td>
                                            <td className="px-4 py-3 font-semibold text-rose-600">{formatCurrency(cost.amount || 0)}</td>
                                        </tr>
                                    ))}
                                    {(contract.costs || []).length === 0 && (
                                        <tr>
                                            <td className="px-4 py-4 text-center text-text-muted" colSpan={3}>Chưa ghi nhận chi phí nào.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between mb-4">
                        <div>
                            <h4 className="text-sm font-semibold text-slate-900">Nhật ký chăm sóc</h4>
                            <p className="text-xs text-text-muted mt-1">Ghi chú lại quá trình tư vấn, xử lý tình huống với khách hàng.</p>
                        </div>
                    </div>

                    {readBoolean(contract.can_add_care_note) && (
                        <div className="rounded-xl border border-cyan-200/80 bg-cyan-50/30 p-4 mb-5">
                            <div className="grid gap-3 md:grid-cols-2">
                                <input
                                    className="w-full rounded-xl border border-cyan-200 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 bg-white px-3 py-2 outline-none transition"
                                    placeholder="Hoạt động chăm sóc (VD: Họp định kỳ tháng 10)"
                                    value={careNoteForm.title}
                                    onChange={(e) => setCareNoteForm((current) => ({ ...current, title: e.target.value }))}
                                />
                                <div className="flex items-center justify-end">
                                    <button
                                        type="button"
                                        className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-60"
                                        onClick={submitCareNote}
                                        disabled={savingCareNote}
                                    >
                                        {savingCareNote ? 'Đang lưu...' : 'Ghi nhận nhật ký'}
                                    </button>
                                </div>
                                <textarea
                                    className="md:col-span-2 w-full rounded-xl border border-cyan-200 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 bg-white px-3 py-2 outline-none transition"
                                    rows={3}
                                    placeholder="Nội dung chi tiết buổi họp, các phản hồi của khách, hoặc đề xuất của team nội bộ..."
                                    value={careNoteForm.detail}
                                    onChange={(e) => setCareNoteForm((current) => ({ ...current, detail: e.target.value }))}
                                />
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        {(contract.care_notes || []).map((note) => (
                            <div key={note.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                                    <div className="font-semibold text-slate-900">{note.title}</div>
                                    <div className="text-[11px] font-medium text-slate-500 bg-white border border-slate-200 rounded-md px-2 py-0.5 shadow-sm">
                                        {note.user?.name || 'Vô danh'} • {formatDateDisplay(note.created_at)}
                                    </div>
                                </div>
                                <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">{note.detail}</div>
                            </div>
                        ))}
                        {(contract.care_notes || []).length === 0 && (
                            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                                Chưa có nhật ký chăm sóc nào được ghi nhận.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Project Creation Form Modal */}
            <Modal
                open={showProjectForm}
                onClose={() => setShowProjectForm(false)}
                title="Khởi tạo Dự án từ Hợp đồng"
                description="Hệ thống sẽ đồng bộ thông tin khách hàng và ngân sách từ Hợp đồng vào dự án này."
                size="lg"
            >
                <div className="space-y-4 text-sm mt-2">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                        Hợp đồng đang liên kết: <strong>{contract.code} {contract.title ? `- ${contract.title}` : ''}</strong>.
                        Ngân sách dự tính sẽ áp dụng: <strong>{formatCurrency(resolveContractValue(contract))} VNĐ</strong>.
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Tên dự án</label>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                            placeholder="Tên dự án hiển thị với đội triển khai"
                            value={projectForm.name}
                            onChange={(e) => setProjectForm((s) => ({ ...s, name: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Loại dịch vụ</label>
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={projectForm.service_type}
                            onChange={(e) => setProjectForm((s) => ({ ...s, service_type: e.target.value }))}
                        >
                            {serviceOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>
                    {projectForm.service_type === 'khac' && (
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Dịch vụ khác</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                placeholder="Tên dịch vụ thật sự (R&D, Booking...)"
                                value={projectForm.service_type_other}
                                onChange={(e) => setProjectForm((s) => ({ ...s, service_type_other: e.target.value }))}
                            />
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Trạng thái</label>
                            <select
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={projectForm.status}
                                onChange={(e) => setProjectForm((s) => ({ ...s, status: e.target.value }))}
                            >
                                {statusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Phụ trách triển khai</label>
                            <select
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={projectForm.owner_id}
                                onChange={(e) => setProjectForm((s) => ({ ...s, owner_id: e.target.value }))}
                            >
                                <option value="">(Chưa có / Chọn sau)</option>
                                {ownerOptions.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.name} ({u.role})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Ngày bắt đầu</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                type="date"
                                value={projectForm.start_date}
                                onChange={(e) => setProjectForm((s) => ({ ...s, start_date: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Hạn chót</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                type="date"
                                value={projectForm.deadline}
                                onChange={(e) => setProjectForm((s) => ({ ...s, deadline: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Tài nguyên, repo dự án</label>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="URL link dự án (tuỳ chọn)"
                            value={projectForm.repo_url}
                            onChange={(e) => setProjectForm((s) => ({ ...s, repo_url: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Website liên quan (GSC)</label>
                        <input
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            placeholder="VD: https://congty.vn"
                            value={projectForm.website_url}
                            onChange={(e) => setProjectForm((s) => ({ ...s, website_url: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Yêu cầu từ khách / Phạm vi</label>
                        <textarea
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            rows={3}
                            placeholder="Mô tả cụ thể KPIs, yêu cầu tính năng..."
                            value={projectForm.customer_requirement}
                            onChange={(e) => setProjectForm((s) => ({ ...s, customer_requirement: e.target.value }))}
                        />
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                        <button
                            className="flex-1 rounded-2xl bg-primary px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-primary/90"
                            onClick={saveProject}
                            type="button"
                        >
                            Tạo Dự Án
                        </button>
                        <button
                            className="flex-1 rounded-2xl border border-slate-200 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => setShowProjectForm(false)}
                            type="button"
                        >
                            Hủy bỏ
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={showEditContractModal}
                onClose={() => setShowEditContractModal(false)}
                title={`Sửa hợp đồng #${contract.id}`}
                description="Cập nhật thông tin chính của hợp đồng."
                size="lg"
            >
                <form className="mt-2 space-y-4 text-sm" onSubmit={submitContractUpdate}>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Tên hợp đồng *</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={editForm.title}
                                onChange={(e) => setEditForm((s) => ({ ...s, title: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Khách hàng *</label>
                            <select
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={editForm.client_id}
                                onChange={(e) => setEditForm((s) => ({ ...s, client_id: e.target.value }))}
                            >
                                <option value="">Chọn khách hàng</option>
                                {clientsLookup.map((client) => (
                                    <option key={client.id} value={client.id}>
                                        {client.name} {client.phone ? `• ${client.phone}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Trạng thái *</label>
                            <select
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={editForm.status}
                                onChange={(e) => setEditForm((s) => ({ ...s, status: e.target.value }))}
                            >
                                {STATUS_OPTIONS.map((status) => (
                                    <option key={status.value} value={status.value}>
                                        {status.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Giá trị hợp đồng</label>
                            <input
                                type="number"
                                min="0"
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={editForm.value}
                                onChange={(e) => setEditForm((s) => ({ ...s, value: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Số lần thanh toán</label>
                            <input
                                type="number"
                                min="1"
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={editForm.payment_times}
                                onChange={(e) => setEditForm((s) => ({ ...s, payment_times: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Nhân viên thu hợp đồng</label>
                        <select
                            className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={editForm.collector_user_id}
                            onChange={(e) => setEditForm((s) => ({ ...s, collector_user_id: e.target.value }))}
                        >
                            <option value="">Chưa chọn</option>
                            {collectorOptions.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.name} ({user.role})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Ngày ký</label>
                            <input
                                type="date"
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={editForm.signed_at}
                                onChange={(e) => setEditForm((s) => ({ ...s, signed_at: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Ngày bắt đầu</label>
                            <input
                                type="date"
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={editForm.start_date}
                                onChange={(e) => setEditForm((s) => ({ ...s, start_date: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Ngày kết thúc</label>
                            <input
                                type="date"
                                className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={editForm.end_date}
                                onChange={(e) => setEditForm((s) => ({ ...s, end_date: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">Ghi chú</label>
                        <textarea
                            className="min-h-[90px] w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={editForm.notes}
                            onChange={(e) => setEditForm((s) => ({ ...s, notes: e.target.value }))}
                        />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setShowEditContractModal(false)}
                            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={savingContract}
                            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                        >
                            {savingContract ? 'Đang lưu...' : 'Lưu hợp đồng'}
                        </button>
                    </div>
                </form>
            </Modal>
        </PageContainer>
    );
}
