import React from 'react';
import { useEffect, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

export default function CRM(props) {
    const initialQuery = (() => {
        if (typeof window === 'undefined') {
            return {
                c_search: '',
                c_per_page: 10,
                c_page: 1,
                p_status: '',
                p_per_page: 10,
                p_page: 1,
            };
        }
        const params = new URLSearchParams(window.location.search);
        const cPerPage = Number(params.get('c_per_page') || 10);
        const cPage = Number(params.get('c_page') || 1);
        const pPerPage = Number(params.get('p_per_page') || 10);
        const pPage = Number(params.get('p_page') || 1);
        return {
            c_search: params.get('c_search') || '',
            c_per_page: Number.isNaN(cPerPage) ? 10 : cPerPage,
            c_page: Number.isNaN(cPage) ? 1 : cPage,
            p_status: params.get('p_status') || '',
            p_per_page: Number.isNaN(pPerPage) ? 10 : pPerPage,
            p_page: Number.isNaN(pPage) ? 1 : pPage,
        };
    })();

    const [clients, setClients] = useState([]);
    const [payments, setPayments] = useState([]);
    const [clientMeta, setClientMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [paymentMeta, setPaymentMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
    const [clientPage, setClientPage] = useState(initialQuery.c_page);
    const [paymentPage, setPaymentPage] = useState(initialQuery.p_page);
    const [clientFilters, setClientFilters] = useState({ search: initialQuery.c_search, per_page: initialQuery.c_per_page });
    const [paymentFilters, setPaymentFilters] = useState({ status: initialQuery.p_status, per_page: initialQuery.p_per_page });
    const [editingClientId, setEditingClientId] = useState(null);
    const [editingPaymentId, setEditingPaymentId] = useState(null);
    const [clientForm, setClientForm] = useState({
        name: '',
        company: '',
        email: '',
        phone: '',
        notes: '',
    });
    const [paymentForm, setPaymentForm] = useState({
        client_id: '',
        amount: '',
        status: 'pending',
        due_date: '',
        invoice_no: '',
        note: '',
    });
    const toast = useToast();

    const getErrorMessage = (error, fallback) => {
        return error?.response?.data?.message || fallback;
    };

    const syncUrl = ({
        nextClientFilters = clientFilters,
        nextClientPage = clientPage,
        nextPaymentFilters = paymentFilters,
        nextPaymentPage = paymentPage,
    } = {}) => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams();
        if (nextClientFilters.search) params.set('c_search', nextClientFilters.search);
        if (Number(nextClientFilters.per_page) !== 10) params.set('c_per_page', String(nextClientFilters.per_page));
        if (nextClientPage > 1) params.set('c_page', String(nextClientPage));
        if (nextPaymentFilters.status) params.set('p_status', nextPaymentFilters.status);
        if (Number(nextPaymentFilters.per_page) !== 10) params.set('p_per_page', String(nextPaymentFilters.per_page));
        if (nextPaymentPage > 1) params.set('p_page', String(nextPaymentPage));
        const queryString = params.toString();
        const newUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}`;
        window.history.replaceState({}, '', newUrl);
    };

    const fetchClients = async (page = 1, filtersArg = clientFilters) => {
        try {
            const clientsRes = await axios.get('/api/v1/crm/clients', {
                params: {
                    ...filtersArg,
                    page,
                },
            });
            const resolvedPage = clientsRes.data.current_page || 1;
            setClients(clientsRes.data.data || []);
            setClientMeta({
                current_page: resolvedPage,
                last_page: clientsRes.data.last_page || 1,
                total: clientsRes.data.total || 0,
            });
            setClientPage(resolvedPage);
            syncUrl({ nextClientFilters: filtersArg, nextClientPage: resolvedPage });
        } catch (error) {
            toast.error(getErrorMessage(error, 'Không tải được danh sách khách hàng.'));
        }
    };

    const fetchPayments = async (page = 1, filtersArg = paymentFilters) => {
        try {
            const paymentsRes = await axios.get('/api/v1/crm/payments', {
                params: {
                    ...filtersArg,
                    page,
                },
            });
            const resolvedPage = paymentsRes.data.current_page || 1;
            setPayments(paymentsRes.data.data || []);
            setPaymentMeta({
                current_page: resolvedPage,
                last_page: paymentsRes.data.last_page || 1,
                total: paymentsRes.data.total || 0,
            });
            setPaymentPage(resolvedPage);
            syncUrl({ nextPaymentFilters: filtersArg, nextPaymentPage: resolvedPage });
        } catch (error) {
            toast.error(getErrorMessage(error, 'Không tải được danh sách thanh toán.'));
        }
    };

    useEffect(() => {
        const initialClientFilters = {
            search: initialQuery.c_search,
            per_page: initialQuery.c_per_page,
        };
        const initialPaymentFilters = {
            status: initialQuery.p_status,
            per_page: initialQuery.p_per_page,
        };
        fetchClients(initialQuery.c_page, initialClientFilters);
        fetchPayments(initialQuery.p_page, initialPaymentFilters);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const submitClient = async (e) => {
        e.preventDefault();
        try {
            if (editingClientId) {
                await axios.put(`/api/v1/crm/clients/${editingClientId}`, clientForm);
            } else {
                await axios.post('/api/v1/crm/clients', clientForm);
            }
            setEditingClientId(null);
            setClientForm({ name: '', company: '', email: '', phone: '', notes: '' });
            await fetchClients(clientPage);
            toast.success(editingClientId ? 'Cập nhật khách hàng thành công.' : 'Tạo khách hàng thành công.');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Lưu khách hàng thất bại.'));
        }
    };

    const editClient = (client) => {
        setEditingClientId(client.id);
        setClientForm({
            name: client.name || '',
            company: client.company || '',
            email: client.email || '',
            phone: client.phone || '',
            notes: client.notes || '',
        });
    };

    const deleteClient = async (id) => {
        try {
            await axios.delete(`/api/v1/crm/clients/${id}`);
            if (editingClientId === id) {
                setEditingClientId(null);
                setClientForm({ name: '', company: '', email: '', phone: '', notes: '' });
            }
            await fetchClients(clientPage);
            toast.success('Xóa khách hàng thành công.');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Xóa khách hàng thất bại.'));
        }
    };

    const submitPayment = async (e) => {
        e.preventDefault();
        const payload = {
            ...paymentForm,
            client_id: Number(paymentForm.client_id),
            amount: Number(paymentForm.amount || 0),
            due_date: paymentForm.due_date || null,
        };
        try {
            if (editingPaymentId) {
                await axios.put(`/api/v1/crm/payments/${editingPaymentId}`, payload);
            } else {
                await axios.post('/api/v1/crm/payments', payload);
            }
            setEditingPaymentId(null);
            setPaymentForm({
                client_id: '',
                amount: '',
                status: 'pending',
                due_date: '',
                invoice_no: '',
                note: '',
            });
            await fetchPayments(paymentPage);
            toast.success(editingPaymentId ? 'Cập nhật thanh toán thành công.' : 'Tạo thanh toán thành công.');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Lưu thanh toán thất bại.'));
        }
    };

    const editPayment = (payment) => {
        setEditingPaymentId(payment.id);
        setPaymentForm({
            client_id: String(payment.client_id || ''),
            amount: String(payment.amount || ''),
            status: payment.status || 'pending',
            due_date: payment.due_date ? payment.due_date.slice(0, 10) : '',
            invoice_no: payment.invoice_no || '',
            note: payment.note || '',
        });
    };

    const deletePayment = async (id) => {
        try {
            await axios.delete(`/api/v1/crm/payments/${id}`);
            if (editingPaymentId === id) {
                setEditingPaymentId(null);
                setPaymentForm({
                    client_id: '',
                    amount: '',
                    status: 'pending',
                    due_date: '',
                    invoice_no: '',
                    note: '',
                });
            }
            await fetchPayments(paymentPage);
            toast.success('Xóa thanh toán thành công.');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Xóa thanh toán thất bại.'));
        }
    };

    const applyClientFilter = async (e) => {
        e.preventDefault();
        await fetchClients(1, clientFilters);
    };

    const applyPaymentFilter = async (e) => {
        e.preventDefault();
        await fetchPayments(1, paymentFilters);
    };

    const prevClientPage = () => {
        if (clientMeta.current_page > 1) {
            fetchClients(clientMeta.current_page - 1);
        }
    };

    const nextClientPage = () => {
        if (clientMeta.current_page < clientMeta.last_page) {
            fetchClients(clientMeta.current_page + 1);
        }
    };

    const prevPaymentPage = () => {
        if (paymentMeta.current_page > 1) {
            fetchPayments(paymentMeta.current_page - 1);
        }
    };

    const nextPaymentPage = () => {
        if (paymentMeta.current_page < paymentMeta.last_page) {
            fetchPayments(paymentMeta.current_page + 1);
        }
    };

    return (
        <PageContainer
            auth={props.auth}
            title="CRM mini"
            description="Quản lý thông tin khách hàng, lịch sử dự án, thanh toán và sales phụ trách."
            stats={[
                { label: 'Tổng khách hàng', value: clientMeta.total },
                { label: 'Phiếu thanh toán', value: paymentMeta.total },
                { label: 'Sửa khách hàng', value: editingClientId ? 'Có' : 'Không' },
                { label: 'Sửa thanh toán', value: editingPaymentId ? 'Có' : 'Không' },
            ]}
        >
            <div className="grid gap-4 lg:grid-cols-2 mb-4">
                <form onSubmit={submitClient} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm grid gap-3">
                    <h3 className="font-semibold">{editingClientId ? 'Sửa khách hàng' : 'Thêm khách hàng'}</h3>
                    <input
                        type="text"
                        className="rounded-lg border-slate-300 text-sm"
                        placeholder="Tên liên hệ"
                        value={clientForm.name}
                        onChange={(e) => setClientForm((prev) => ({ ...prev, name: e.target.value }))}
                        required
                    />
                    <input
                        type="text"
                        className="rounded-lg border-slate-300 text-sm"
                        placeholder="Công ty"
                        value={clientForm.company}
                        onChange={(e) => setClientForm((prev) => ({ ...prev, company: e.target.value }))}
                    />
                    <input
                        type="email"
                        className="rounded-lg border-slate-300 text-sm"
                        placeholder="Email"
                        value={clientForm.email}
                        onChange={(e) => setClientForm((prev) => ({ ...prev, email: e.target.value }))}
                    />
                    <div className="flex gap-2">
                        <button type="submit" className="rounded-lg bg-sky-600 text-white font-semibold text-sm px-4 py-2">
                            {editingClientId ? 'Lưu khách hàng' : 'Tạo khách hàng'}
                        </button>
                        {editingClientId && (
                            <button
                                type="button"
                                className="rounded-lg border border-slate-300 text-sm px-4 py-2"
                                onClick={() => {
                                    setEditingClientId(null);
                                    setClientForm({ name: '', company: '', email: '', phone: '', notes: '' });
                                }}
                            >
                                Hủy
                            </button>
                        )}
                    </div>
                </form>

                <form onSubmit={submitPayment} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm grid gap-3">
                    <h3 className="font-semibold">{editingPaymentId ? 'Sửa thanh toán' : 'Thêm thanh toán'}</h3>
                    <select
                        className="rounded-lg border-slate-300 text-sm"
                        value={paymentForm.client_id}
                        onChange={(e) => setPaymentForm((prev) => ({ ...prev, client_id: e.target.value }))}
                        required
                    >
                        <option value="">Chọn khách hàng</option>
                        {clients.map((client) => (
                            <option key={client.id} value={client.id}>
                                {client.company || client.name}
                            </option>
                        ))}
                    </select>
                    <input
                        type="number"
                        className="rounded-lg border-slate-300 text-sm"
                        placeholder="Số tiền"
                        value={paymentForm.amount}
                        onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
                        required
                    />
                    <select
                        className="rounded-lg border-slate-300 text-sm"
                        value={paymentForm.status}
                        onChange={(e) => setPaymentForm((prev) => ({ ...prev, status: e.target.value }))}
                    >
                        <option value="pending">pending</option>
                        <option value="paid">paid</option>
                        <option value="overdue">overdue</option>
                    </select>
                    <div className="flex gap-2">
                        <button type="submit" className="rounded-lg bg-sky-600 text-white font-semibold text-sm px-4 py-2">
                            {editingPaymentId ? 'Lưu thanh toán' : 'Tạo thanh toán'}
                        </button>
                        {editingPaymentId && (
                            <button
                                type="button"
                                className="rounded-lg border border-slate-300 text-sm px-4 py-2"
                                onClick={() => {
                                    setEditingPaymentId(null);
                                    setPaymentForm({
                                        client_id: '',
                                        amount: '',
                                        status: 'pending',
                                        due_date: '',
                                        invoice_no: '',
                                        note: '',
                                    });
                                }}
                            >
                                Hủy
                            </button>
                        )}
                    </div>
                </form>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <form onSubmit={applyClientFilter} className="mb-3 grid gap-2 md:grid-cols-3">
                        <input
                            type="text"
                            className="rounded-lg border-slate-300 text-sm"
                            value={clientFilters.search}
                            onChange={(e) => setClientFilters((prev) => ({ ...prev, search: e.target.value }))}
                            placeholder="Tìm khách hàng"
                        />
                        <select
                            className="rounded-lg border-slate-300 text-sm"
                            value={clientFilters.per_page}
                            onChange={(e) => setClientFilters((prev) => ({ ...prev, per_page: Number(e.target.value) }))}
                        >
                            <option value={5}>5 / trang</option>
                            <option value={10}>10 / trang</option>
                            <option value={20}>20 / trang</option>
                        </select>
                        <button type="submit" className="rounded-lg bg-slate-800 text-white text-sm font-semibold">
                            Lọc
                        </button>
                    </form>
                    <h3 className="font-semibold mb-3">Khách hàng nổi bật</h3>
                    <ul className="space-y-2 text-sm">
                        {clients.map((client) => (
                            <li key={client.id} className="rounded-lg border border-slate-200 p-3">
                                <div className="flex justify-between gap-2">
                                    <span>{client.company || client.name} • {client.email || 'Chưa có email'}</span>
                                    <span className="flex gap-2">
                                        <button type="button" className="text-xs text-sky-700" onClick={() => editClient(client)}>
                                            Sửa
                                        </button>
                                        <button type="button" className="text-xs text-rose-700" onClick={() => deleteClient(client.id)}>
                                            Xóa
                                        </button>
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                    <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between text-sm">
                        <span>
                            Trang {clientMeta.current_page}/{clientMeta.last_page}
                        </span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={prevClientPage}
                                disabled={clientMeta.current_page <= 1}
                                className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
                            >
                                Trước
                            </button>
                            <button
                                type="button"
                                onClick={nextClientPage}
                                disabled={clientMeta.current_page >= clientMeta.last_page}
                                className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
                            >
                                Sau
                            </button>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <form onSubmit={applyPaymentFilter} className="mb-3 grid gap-2 md:grid-cols-3">
                        <select
                            className="rounded-lg border-slate-300 text-sm"
                            value={paymentFilters.status}
                            onChange={(e) => setPaymentFilters((prev) => ({ ...prev, status: e.target.value }))}
                        >
                            <option value="">Tất cả trạng thái</option>
                            <option value="pending">pending</option>
                            <option value="paid">paid</option>
                            <option value="overdue">overdue</option>
                        </select>
                        <select
                            className="rounded-lg border-slate-300 text-sm"
                            value={paymentFilters.per_page}
                            onChange={(e) => setPaymentFilters((prev) => ({ ...prev, per_page: Number(e.target.value) }))}
                        >
                            <option value={5}>5 / trang</option>
                            <option value={10}>10 / trang</option>
                            <option value={20}>20 / trang</option>
                        </select>
                        <button type="submit" className="rounded-lg bg-slate-800 text-white text-sm font-semibold">
                            Lọc
                        </button>
                    </form>
                    <h3 className="font-semibold mb-3">Thanh toán cần theo dõi</h3>
                    <ul className="space-y-2 text-sm">
                        {payments.map((payment) => (
                            <li
                                key={payment.id}
                                className={`rounded-lg p-3 border ${
                                    payment.status === 'overdue'
                                        ? 'border-rose-200 bg-rose-50'
                                        : payment.status === 'pending'
                                        ? 'border-amber-200 bg-amber-50'
                                        : 'border-slate-200'
                                }`}
                            >
                                <div className="flex justify-between gap-2">
                                    <span>
                                        {payment.client?.company || payment.client?.name || 'Khách hàng'} -{' '}
                                        {Number(payment.amount || 0).toLocaleString('vi-VN')}đ - {payment.status}
                                    </span>
                                    <span className="flex gap-2">
                                        <button type="button" className="text-xs text-sky-700" onClick={() => editPayment(payment)}>
                                            Sửa
                                        </button>
                                        <button type="button" className="text-xs text-rose-700" onClick={() => deletePayment(payment.id)}>
                                            Xóa
                                        </button>
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                    <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between text-sm">
                        <span>
                            Trang {paymentMeta.current_page}/{paymentMeta.last_page}
                        </span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={prevPaymentPage}
                                disabled={paymentMeta.current_page <= 1}
                                className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
                            >
                                Trước
                            </button>
                            <button
                                type="button"
                                onClick={nextPaymentPage}
                                disabled={paymentMeta.current_page >= paymentMeta.last_page}
                                className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
                            >
                                Sau
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
