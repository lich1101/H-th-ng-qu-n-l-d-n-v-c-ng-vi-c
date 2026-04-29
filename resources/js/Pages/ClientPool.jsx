import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from '@inertiajs/inertia-react';
import Modal from '@/Components/Modal';
import PageContainer from '@/Components/PageContainer';
import PaginationControls from '@/Components/PaginationControls';
import { filterControlClass } from '@/Components/FilterToolbar';
import { useToast } from '@/Contexts/ToastContext';

const getErrorMessage = (error, fallback) => {
    const validationErrors = error?.response?.data?.errors;
    if (validationErrors && typeof validationErrors === 'object') {
        const first = Object.values(validationErrors)
            .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
            .map((message) => String(message || '').trim())
            .find(Boolean);
        if (first) {
            return first;
        }
    }

    const message = String(error?.response?.data?.message || '').trim();

    return message || fallback;
};

const EMPTY_POOL_FORM = Object.freeze({
    name: '',
    external_code: '',
    company: '',
    email: '',
    phone: '',
    notes: '',
});

export default function ClientPool(props) {
    const toast = useToast();
    const normalizedRole = String(props?.auth?.user?.role || '').toLowerCase();
    const canClaimRotationPool = ['quan_ly', 'nhan_vien'].includes(normalizedRole);
    const canManagePoolEntries = ['admin', 'administrator', 'quan_ly', 'nhan_vien'].includes(normalizedRole);
    const [clients, setClients] = useState([]);
    const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [claimingClientId, setClaimingClientId] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [poolForm, setPoolForm] = useState({ ...EMPTY_POOL_FORM });
    const [savingPoolClient, setSavingPoolClient] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [clientImportFile, setClientImportFile] = useState(null);
    const [importingClients, setImportingClients] = useState(false);
    const [clientImportJob, setClientImportJob] = useState(null);
    const [clientImportReport, setClientImportReport] = useState(null);

    const fetchPool = async (page = 1, searchValue = search) => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/crm/client-pool', {
                params: {
                    page,
                    per_page: 12,
                    search: String(searchValue || '').trim() || undefined,
                },
            });

            const resolvedPage = res.data.current_page || 1;
            setClients(Array.isArray(res.data.data) ? res.data.data : []);
            setMeta({
                current_page: resolvedPage,
                last_page: res.data.last_page || 1,
                total: res.data.total || 0,
            });
        } catch (error) {
            toast.error(getErrorMessage(error, 'Không tải được kho số.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPool(1, '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!showImportModal || !clientImportJob?.id) return undefined;

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
                        `Import kho số hoàn tất: ${report.created || 0} tạo mới, ${report.updated || 0} cập nhật, ${report.skipped || 0} bỏ qua.`
                    );
                    await fetchPool(1, search);
                } else if (nextJob?.status === 'failed') {
                    window.clearInterval(timer);
                    setImportingClients(false);
                    setClientImportReport(nextJob.report || {
                        created: 0,
                        updated: 0,
                        skipped: 0,
                        warnings: [],
                        errors: [{ row: '-', message: nextJob.error_message || 'Import kho số thất bại.' }],
                    });
                    toast.error(nextJob?.error_message || 'Import kho số thất bại.');
                }
            } catch (error) {
                setImportingClients(false);
                toast.error(getErrorMessage(error, 'Không kiểm tra được tiến trình import kho số.'));
            }
        };

        const timer = window.setInterval(poll, 1500);
        poll();

        return () => window.clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showImportModal, clientImportJob?.id]);

    const claimClient = async (client) => {
        if (!client?.id) return;
        if (!window.confirm(`Nhận khách hàng "${client.name || 'Khách hàng'}" từ kho số? Hệ thống sẽ reset lại mốc xoay và chỉ giữ bạn là người phụ trách/chăm sóc chính.`)) {
            return;
        }

        setClaimingClientId(Number(client.id));
        try {
            await axios.post(`/api/v1/crm/client-pool/${client.id}/claim`);
            toast.success('Đã nhận khách hàng từ kho số và reset lại mốc xoay.');
            await fetchPool(meta.current_page, search);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Không thể nhận khách từ kho số.'));
        } finally {
            setClaimingClientId(null);
        }
    };

    const submitPoolClient = async (e) => {
        e.preventDefault();
        if (!canManagePoolEntries) {
            toast.error('Không có quyền thêm khách hàng vào kho số.');
            return;
        }
        if (!String(poolForm.name || '').trim()) {
            toast.error('Vui lòng nhập tên khách hàng.');
            return;
        }

        setSavingPoolClient(true);
        try {
            await axios.post('/api/v1/crm/client-pool', {
                ...poolForm,
                name: String(poolForm.name || '').trim(),
                external_code: String(poolForm.external_code || '').trim() || null,
                company: String(poolForm.company || '').trim() || null,
                email: String(poolForm.email || '').trim() || null,
                phone: String(poolForm.phone || '').trim() || null,
                notes: String(poolForm.notes || '').trim() || null,
            });
            toast.success('Đã thêm khách hàng vào kho số.');
            setShowCreateModal(false);
            setPoolForm({ ...EMPTY_POOL_FORM });
            await fetchPool(1, search);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Không thể thêm khách hàng vào kho số.'));
        } finally {
            setSavingPoolClient(false);
        }
    };

    const submitPoolImport = async (e) => {
        e.preventDefault();
        if (!clientImportFile) {
            toast.error('Vui lòng chọn file Excel hoặc CSV.');
            return;
        }

        setImportingClients(true);
        try {
            const formData = new FormData();
            formData.append('file', clientImportFile);
            const res = await axios.post('/api/v1/imports/client-pool', formData);
            setClientImportJob(res.data?.job || null);
            setClientImportReport(null);
            toast.success('Đã đưa file import kho số vào hàng đợi xử lý.');
        } catch (error) {
            const fallbackMessage = getErrorMessage(error, 'Import kho số thất bại.');
            setImportingClients(false);
            setClientImportJob(null);
            setClientImportReport({
                created: 0,
                updated: 0,
                skipped: 0,
                warnings: [],
                errors: [{ row: '-', message: fallbackMessage }],
            });
            toast.error(fallbackMessage);
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Kho số"
            description="Khách hàng dư sau cron xoay sẽ nằm ở đây. Trang này chỉ hiện tên khách hàng và thao tác nhận khách. Khi nhân sự còn quota nhận kho số bấm nhận, hệ thống reset lại mốc xoay, dọn nhóm chăm sóc cũ và chuyển khách về CRM thường cho người vừa nhận."
            actions={(
                <div className="flex flex-wrap items-center gap-2">
                    {canManagePoolEntries ? (
                        <>
                            <button
                                type="button"
                                className="inline-flex items-center rounded-2xl border border-slate-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
                                onClick={() => {
                                    setPoolForm({ ...EMPTY_POOL_FORM });
                                    setShowCreateModal(true);
                                }}
                            >
                                Thêm khách vào kho số
                            </button>
                            <button
                                type="button"
                                className="inline-flex items-center rounded-2xl border border-slate-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
                                onClick={() => {
                                    setClientImportFile(null);
                                    setClientImportJob(null);
                                    setClientImportReport(null);
                                    setShowImportModal(true);
                                }}
                            >
                                Import kho số
                            </button>
                            <button
                                type="button"
                                className="inline-flex items-center rounded-2xl border border-slate-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
                                onClick={() => window.open('/api/v1/imports/client-pool/template', '_blank', 'noopener,noreferrer')}
                            >
                                Tải file mẫu XLSX
                            </button>
                        </>
                    ) : null}
                    <Link
                        href={route('crm.index')}
                        className="inline-flex items-center rounded-2xl border border-slate-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
                    >
                        Quay lại khách hàng
                    </Link>
                </div>
            )}
        >
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">Danh sách chờ nhận</div>
                        <p className="mt-1 text-sm text-slate-600">
                            Chỉ hiện tên khách hàng để tránh lộ dữ liệu trước khi nhận. Nhận xong thì hệ thống gán lại phụ trách trực tiếp, reset mốc xoay và khách quay lại CRM thường. Quota nhận kho số/ngày vẫn được áp dụng để tránh một nhân sự nhận quá nhiều.
                        </p>
                    </div>
                    <div className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                        {meta.total || 0} khách chờ nhận
                    </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                fetchPool(1, search);
                            }
                        }}
                        className={filterControlClass}
                        placeholder="Tìm nhanh tên khách trong kho số"
                    />
                    <button
                        type="button"
                        className="rounded-2xl border border-slate-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                        onClick={() => fetchPool(1, search)}
                        disabled={loading}
                    >
                        {loading ? 'Đang tải...' : 'Lọc kho số'}
                    </button>
                </div>

                <div className="mt-4 grid gap-2">
                    {clients.map((client) => (
                        <div
                            key={client.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3"
                        >
                            <div className="min-w-0 flex-1 text-sm font-semibold text-slate-900">
                                {client.name || 'Khách hàng'}
                            </div>
                            {canClaimRotationPool ? (
                                <button
                                    type="button"
                                    className="rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
                                    onClick={() => claimClient(client)}
                                    disabled={claimingClientId === Number(client.id)}
                                >
                                    {claimingClientId === Number(client.id) ? 'Đang nhận...' : 'Nhận khách hàng'}
                                </button>
                            ) : (
                                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                                    Chỉ xem
                                </span>
                            )}
                        </div>
                    ))}
                    {clients.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                            Kho số hiện chưa có khách hàng chờ nhận.
                        </div>
                    ) : null}
                </div>

                <div className="mt-4">
                    <PaginationControls
                        page={meta.current_page}
                        lastPage={meta.last_page}
                        total={meta.total}
                        perPage={12}
                        label="khách kho số"
                        onPageChange={(page) => fetchPool(page, search)}
                    />
                </div>
            </div>

            <Modal
                open={showCreateModal}
                onClose={() => {
                    if (savingPoolClient) return;
                    setShowCreateModal(false);
                }}
                title="Thêm khách hàng vào kho số"
                description="Khách được tạo tại đây sẽ vào thẳng kho số, chưa có người phụ trách trực tiếp và chưa hiện trong CRM thường cho đến khi có người nhận."
                size="md"
            >
                <form className="space-y-3 text-sm" onSubmit={submitPoolClient}>
                    <div>
                        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">Tên khách hàng *</label>
                        <input
                            className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            value={poolForm.name}
                            onChange={(e) => setPoolForm((s) => ({ ...s, name: e.target.value }))}
                            placeholder="Ví dụ: Công ty ABC"
                        />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">Mã khách hàng</label>
                            <input
                                className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={poolForm.external_code}
                                onChange={(e) => setPoolForm((s) => ({ ...s, external_code: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">Công ty</label>
                            <input
                                className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={poolForm.company}
                                onChange={(e) => setPoolForm((s) => ({ ...s, company: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">Email</label>
                            <input
                                type="email"
                                className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={poolForm.email}
                                onChange={(e) => setPoolForm((s) => ({ ...s, email: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">Số điện thoại</label>
                            <input
                                className="mt-2 w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                                value={poolForm.phone}
                                onChange={(e) => setPoolForm((s) => ({ ...s, phone: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">Ghi chú</label>
                        <textarea
                            className="mt-2 min-h-[88px] w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                            rows={4}
                            value={poolForm.notes}
                            onChange={(e) => setPoolForm((s) => ({ ...s, notes: e.target.value }))}
                            placeholder="Thông tin sơ bộ để người nhận khách có bối cảnh ban đầu."
                        />
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                        Khi được nhận từ kho số, hệ thống sẽ reset lại mốc xoay và chỉ giữ người vừa nhận là phụ trách/chăm sóc chính.
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => setShowCreateModal(false)}
                            disabled={savingPoolClient}
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={savingPoolClient}
                            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                        >
                            {savingPoolClient ? 'Đang lưu...' : 'Thêm vào kho số'}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal
                open={showImportModal}
                onClose={() => {
                    if (importingClients) return;
                    setShowImportModal(false);
                    setClientImportFile(null);
                    setClientImportJob(null);
                    setClientImportReport(null);
                }}
                title="Import khách hàng vào kho số"
                description="File import tại đây sẽ đẩy khách vào thẳng kho số. Nếu một dòng trùng với khách đang nằm trong CRM thường, hệ thống sẽ bỏ qua để tránh cướp khách khỏi người đang phụ trách."
                size="md"
            >
                <form className="space-y-3 text-sm" onSubmit={submitPoolImport}>
                    <div className="rounded-2xl border border-dashed border-slate-200/80 p-4 text-center">
                        <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                            onClick={() => window.open('/api/v1/imports/client-pool/template', '_blank', 'noopener,noreferrer')}
                        >
                            Tải file mẫu XLSX
                        </button>
                        <input
                            id="import-pool-client-file"
                            type="file"
                            accept=".xls,.xlsx,.csv"
                            onChange={(e) => {
                                setClientImportFile(e.target.files?.[0] || null);
                                setClientImportReport(null);
                            }}
                            className="hidden"
                        />
                        <label
                            htmlFor="import-pool-client-file"
                            className="mt-3 inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                            Chọn file
                        </label>
                        <p className="mt-2 text-xs text-text-muted">
                            {clientImportFile ? clientImportFile.name : 'Chưa chọn file'}
                        </p>
                    </div>

                    {clientImportReport ? (
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3 space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-subtle">Kết quả import</div>
                            <div className="text-sm text-slate-700">
                                {clientImportReport.created || 0} tạo mới • {clientImportReport.updated || 0} cập nhật • {clientImportReport.skipped || 0} bỏ qua
                            </div>
                            {Array.isArray(clientImportReport.errors) && clientImportReport.errors.length > 0 ? (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                                    Dòng {clientImportReport.errors[0].row || '-'}: {clientImportReport.errors[0].message || 'Có lỗi import.'}
                                </div>
                            ) : null}
                            {Array.isArray(clientImportReport.warnings) && clientImportReport.warnings.length > 0 ? (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                    Dòng {clientImportReport.warnings[0].row || '-'}: {clientImportReport.warnings[0].message || 'Có cảnh báo import.'}
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => setShowImportModal(false)}
                            disabled={importingClients}
                        >
                            Đóng
                        </button>
                        <button
                            type="submit"
                            disabled={importingClients}
                            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                        >
                            {importingClients ? 'Đang import...' : 'Chạy import'}
                        </button>
                    </div>
                </form>
            </Modal>
        </PageContainer>
    );
}
