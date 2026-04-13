import React, { useEffect, useState } from 'react';
import axios from 'axios';

/**
 * Chuẩn hóa về domain thuần (vd. biihappy.com), khớp backend ProjectGscSyncService::normalizeStoredWebsiteDomain.
 * @param {string|null|undefined} raw
 * @returns {string}
 */
export function normalizeStoredWebsiteDomain(raw) {
    let v = String(raw ?? '').trim();
    if (!v) return '';
    v = v.replace(/\s+\([^)]+\)\s*$/, '').trim();
    const lower = v.toLowerCase();
    if (lower.startsWith('sc-domain:')) {
        let rest = v.slice('sc-domain:'.length).trim().replace(/^\/+|\/+$/g, '');
        const segment = rest.split('/')[0]?.split(':')[0] ?? '';
        return stripWww(segment.toLowerCase());
    }
    if (/^https?:\/\//i.test(v)) {
        try {
            const u = new URL(v);
            return stripWww(u.hostname.toLowerCase());
        } catch {
            return '';
        }
    }
    const segment = v.replace(/^\/+/, '').split(/[/:]/)[0] ?? '';
    return stripWww(segment.toLowerCase());
}

function stripWww(h) {
    return h.replace(/^www\./i, '');
}

/**
 * Website dự án cho GSC: chọn property từ API sites.list hoặc nhập domain; lưu chỉ domain.
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

    const valueNorm = normalizeStoredWebsiteDomain(value);

    useEffect(() => {
        const u = (value || '').trim();
        if (!u) {
            setMode('gsc');
            return;
        }
        if (loading) return;
        const inList = gscSites.some((s) => normalizeStoredWebsiteDomain(s.site_url) === valueNorm && valueNorm !== '');
        setMode(inList ? 'gsc' : 'manual');
    }, [value, valueNorm, gscSites, loading]);

    const matchingSite = gscSites.find((s) => normalizeStoredWebsiteDomain(s.site_url) === valueNorm && valueNorm !== '');
    const selectValue = matchingSite ? matchingSite.site_url : '';

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
                    Nhập domain
                </button>
            </div>
            {mode === 'gsc' ? (
                <select
                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2 disabled:opacity-60"
                    disabled={loading}
                    value={selectValue}
                    onChange={(e) => {
                        const next = e.target.value;
                        onChange(next ? normalizeStoredWebsiteDomain(next) : '');
                    }}
                >
                    <option value="">{loading ? 'Đang tải danh sách site…' : '— Chọn property —'}</option>
                    {gscSites.map((s) => {
                        const dom = normalizeStoredWebsiteDomain(s.site_url);
                        if (!dom) return null;
                        return (
                            <option key={s.site_url} value={s.site_url}>
                                {dom}
                                {s.permission_level ? ` (${s.permission_level})` : ''}
                            </option>
                        );
                    })}
                </select>
            ) : (
                <input
                    className="w-full rounded-2xl border border-slate-200/80 px-3 py-2"
                    placeholder="VD: biihappy.com (chỉ domain, không cần https://)"
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={(e) => {
                        const n = normalizeStoredWebsiteDomain(e.target.value);
                        if (n !== (value || '').trim()) {
                            onChange(n);
                        }
                    }}
                />
            )}
            <p className="mt-1 text-xs text-text-muted">
                Hệ thống lưu <strong className="font-semibold">domain</strong> (vd. biihappy.com). Đồng bộ GSC dùng đúng property trên tài khoản Search Console. Vào chi tiết dự án để bật thông báo GSC khi cần.
            </p>
        </div>
    );
}
