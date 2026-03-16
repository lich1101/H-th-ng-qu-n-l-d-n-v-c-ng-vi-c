import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';

export default function FacebookPages(props) {
    const connected = Boolean(props.facebookConnected);
    const expiresAt = props.facebookTokenExpiresAt;
    const [pages, setPages] = useState([]);
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const fetchPages = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/v1/facebook/pages');
            setPages(res.data || []);
        } catch (e) {
            setMessage(e?.response?.data?.message || 'Không tải được danh sách Page.');
        } finally {
            setLoading(false);
        }
    };

    const autoSyncPages = async () => {
        if (!connected) return;
        setSyncing(true);
        setMessage('');
        try {
            const res = await axios.post('/api/v1/facebook/pages/sync');
            setPages(res.data?.pages || []);
            setMessage(res.data?.message || 'Đã tự động đồng bộ danh sách Page.');
        } catch (e) {
            setMessage(e?.response?.data?.message || 'Đồng bộ danh sách Page thất bại.');
        } finally {
            setSyncing(false);
        }
    };

    useEffect(() => {
        fetchPages();
        if (connected) {
            autoSyncPages();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connected]);

    const subscribePage = async (pageId) => {
        setMessage('');
        try {
            const res = await axios.post(`/api/v1/facebook/pages/${pageId}/subscribe`);
            setMessage(res.data?.message || 'Đã kích hoạt webhook.');
            fetchPages();
        } catch (e) {
            setMessage(e?.response?.data?.message || 'Kích hoạt webhook thất bại.');
        }
    };

    const unsubscribePage = async (pageId) => {
        if (!window.confirm('Bạn có chắc muốn hủy kích hoạt Page này?')) {
            return;
        }
        setMessage('');
        try {
            const res = await axios.post(`/api/v1/facebook/pages/${pageId}/unsubscribe`);
            setMessage(res.data?.message || 'Đã hủy kích hoạt webhook.');
            fetchPages();
        } catch (e) {
            setMessage(e?.response?.data?.message || 'Hủy kích hoạt thất bại.');
        }
    };

    const stats = useMemo(() => {
        const total = pages.length;
        const subscribed = pages.filter((p) => p.is_subscribed).length;
        return [
            { label: 'Page đã kết nối', value: total },
            { label: 'Webhook hoạt động', value: subscribed },
        ];
    }, [pages]);

    const handleConnect = () => {
        window.location.href = route('facebook.login');
    };

    return (
        <PageContainer
            auth={props.auth}
            title="Facebook Pages"
            description="Kết nối Page Facebook để tự động tạo khách hàng tiềm năng từ tin nhắn."
            stats={stats}
        >
            <div className="grid gap-5 lg:grid-cols-3">
                <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card">
                    <h3 className="font-semibold text-slate-900">Kết nối Page</h3>
                    <p className="text-sm text-text-muted mt-1">
                        Sau khi đăng nhập Facebook, hệ thống tự động đồng bộ danh sách Page.
                    </p>
                    <div className="mt-4 space-y-3">
                        <div className="rounded-2xl border border-slate-200/80 p-4">
                            <p className="text-xs text-text-muted">Trạng thái</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">
                                {connected ? 'Đã kết nối Facebook Login' : 'Chưa kết nối'}
                            </p>
                            {connected && expiresAt && (
                                <p className="text-xs text-text-muted mt-1">
                                    Hết hạn: {new Date(expiresAt).toLocaleString()}
                                </p>
                            )}
                            {syncing && (
                                <p className="text-xs text-primary mt-2">
                                    Đang tự động đồng bộ danh sách Page...
                                </p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={handleConnect}
                            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 transition"
                        >
                            Đăng nhập Facebook
                        </button>
                        {message && (
                            <p className="text-sm text-emerald-600">{message}</p>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-slate-900">Danh sách Page</h3>
                        <button
                            type="button"
                            onClick={fetchPages}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
                        >
                            Làm mới
                        </button>
                    </div>
                    {loading ? (
                        <p className="text-sm text-text-muted">Đang tải...</p>
                    ) : pages.length === 0 ? (
                        <p className="text-sm text-text-muted">Chưa có Page nào được kết nối.</p>
                    ) : (
                        <div className="space-y-3">
                            {pages.map((page) => (
                                <div key={page.id} className="rounded-2xl border border-slate-200/80 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <p className="font-semibold text-slate-900">{page.name}</p>
                                        <p className="text-xs text-text-muted">Page ID: {page.page_id}</p>
                                        {page.category && (
                                            <p className="text-xs text-text-muted">Category: {page.category}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${page.is_subscribed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {page.is_subscribed ? 'Webhook hoạt động' : 'Chưa subscribe'}
                                        </span>
                                        {!page.is_subscribed && (
                                            <button
                                                type="button"
                                                onClick={() => subscribePage(page.id)}
                                                className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 transition"
                                            >
                                                Kích hoạt
                                            </button>
                                        )}
                                        {page.is_subscribed && (
                                            <button
                                                type="button"
                                                onClick={() => unsubscribePage(page.id)}
                                                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                                            >
                                                Hủy kích hoạt
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </PageContainer>
    );
}
