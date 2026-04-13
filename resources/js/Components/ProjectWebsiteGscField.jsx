import React, { useEffect, useState } from 'react';
import axios from 'axios';

/**
 * Website dự án cho GSC: chọn property từ API sites.list hoặc nhập tay (giữ đúng chuỗi lưu).
 *
 * @param {{ value: string, onChange: (url: string) => void, active?: boolean }} props
 */
export default function ProjectWebsiteGscField({ value, onChange, active = true }) {
    const [gscSites, setGscSites] = useState([]);
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState('gsc');

    useEffect(() => {
        if (!active) return undefined;
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await axios.get('/api/v1/search-console/sites');
                const rows = Array.isArray(res.data?.data) ? res.data.data : [];
                if (!cancelled) setGscSites(rows);
            } catch {
                if (!cancelled) setGscSites([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [active]);

    useEffect(() => {
        const u = (value || '').trim();
        if (!u) {
            setMode('gsc');
            return;
        }
        if (loading) return;
        const inList = gscSites.some((s) => String(s.site_url) === u);
        setMode(inList ? 'gsc' : 'manual');
    }, [value, gscSites, loading]);

    return (
        <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
                Website dự án (Google Search Console)
            </label>
            <div className="mb-2 flex flex-wrap gap-2">
                <button
                    type="button"
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        mode === 'gsc'
                            ? 'bg-primary text-white'
                            : 'border border-slate-200 bg-white text-slate-700 hover:border-primary/40'
                    }`}
                    onClick={() => setMode('gsc')}
                >
                    Chọn từ Search Console
                </button>
                <button
                    type="button"
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        mode === 'manual'
                            ? 'bg-primary text-white'
                            : 'border border-slate-200 bg-white text-slate-700 hover:border-primary/40'
                    }`}
                    onClick={() => setMode('manual')}
                >
                    Nhập URL khác
                </button>
            </div>
            {mode === 'gsc' ? (
                <select
                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 disabled:opacity-60"
                    disabled={loading}
                    value={gscSites.some((s) => String(s.site_url) === (value || '').trim()) ? (value || '').trim() : ''}
                    onChange={(e) => onChange(e.target.value)}
                >
                    <option value="">{loading ? 'Đang tải danh sách site…' : '— Chọn property —'}</option>
                    {gscSites.map((s) => (
                        <option key={s.site_url} value={s.site_url}>
                            {s.site_url}
                            {s.permission_level ? ` (${s.permission_level})` : ''}
                        </option>
                    ))}
                </select>
            ) : (
                <input
                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                    placeholder="VD: https://example.com/ hoặc sc-domain:example.com"
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                />
            )}
            <p className="mt-1 text-xs text-text-muted">
                Giá trị lưu khớp chuỗi property trên Google Search Console. Vào chi tiết dự án để bật thông báo GSC khi cần.
            </p>
        </div>
    );
}
