import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import Dropdown from '@/Components/Dropdown';
import { Link, usePage } from '@inertiajs/inertia-react';

export default function Authenticated({ auth, header, children }) {
    const { settings } = usePage().props;
    const [showSidebar, setShowSidebar] = useState(false);
    const [collapsedGroups, setCollapsedGroups] = useState({});
    const currentRole = auth?.user?.role || '';
    const brandName = settings?.brand_name || 'ClickOn';
    const brandSubtitle = settings?.brand_subtitle || 'Khách hàng • Phòng ban • Kế toán';
    const logoUrl = settings?.logo_url;
    const [avatarUrl, setAvatarUrl] = useState(auth?.user?.avatar_url || '');
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (!settings?.primary_color) return;
        const hex = settings.primary_color.replace('#', '').trim();
        if (hex.length !== 6) return;
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return;
        document.documentElement.style.setProperty('--color-primary', `${r} ${g} ${b}`);
    }, [settings?.primary_color]);

    const roleLabels = {
        admin: 'Quản trị',
        quan_ly: 'Quản lý',
        nhan_vien: 'Nhân sự',
        ke_toan: 'Kế toán',
    };

    const initials = (name) => {
        const parts = (name || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        if (!parts.length) return 'U';
        if (parts.length === 1) return parts[0][0]?.toUpperCase() || 'U';
        return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const data = new FormData();
            data.append('avatar', file);
            const res = await axios.post('/api/v1/profile/avatar', data, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setAvatarUrl(res.data?.avatar_url || '');
        } catch (err) {
            console.error(err);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const menuGroups = useMemo(
        () => [
            {
                label: 'Tổng quan',
                items: [{ label: 'Tổng quan', routeName: 'dashboard', href: route('dashboard'), roles: ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'] }],
            },
            {
                label: 'CRM',
                items: [
                    { label: 'Khách hàng', routeName: 'crm.index', href: route('crm.index'), roles: ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'] },
                    { label: 'Cơ hội', routeName: 'opportunities.index', href: route('opportunities.index'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Form tư vấn', routeName: 'lead-forms.index', href: route('lead-forms.index'), roles: ['admin'] },
                    { label: 'Facebook Pages', routeName: 'facebook.pages', href: route('facebook.pages'), roles: ['admin', 'quan_ly'] },
                ],
            },
            {
                label: 'Sales',
                items: [
                    { label: 'Hợp đồng', routeName: 'contracts.index', href: route('contracts.index'), roles: ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'] },
                    { label: 'Sản phẩm', routeName: 'products.index', href: route('products.index'), roles: ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'] },
                ],
            },
            {
                label: 'Operations',
                items: [
                    { label: 'Dự án', routeName: 'projects.kanban', href: route('projects.kanban'), roles: ['admin', 'quan_ly'] },
                    { label: 'Công việc', routeName: 'tasks.board', href: route('tasks.board'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Nhắc hạn', routeName: 'deadlines.index', href: route('deadlines.index'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Bàn giao', routeName: 'handover.index', href: route('handover.index'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Điều phối phòng ban', routeName: 'department-assignments.index', href: route('department-assignments.index'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Lịch họp', routeName: 'meetings.index', href: route('meetings.index'), roles: ['admin', 'quan_ly'] },
                    { label: 'Chat nội bộ', routeName: 'chat.internal', href: route('chat.internal'), roles: ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'] },
                ],
            },
            {
                label: 'Reports',
                items: [
                    { label: 'Báo cáo KPI', routeName: 'reports.kpi', href: route('reports.kpi'), roles: ['admin', 'quan_ly'] },
                    { label: 'Doanh thu phòng ban', routeName: 'reports.revenue', href: route('reports.revenue'), roles: ['admin', 'quan_ly'] },
                    { label: 'Doanh thu công ty', routeName: 'reports.company', href: route('reports.company'), roles: ['admin'] },
                ],
            },
            {
                label: 'System',
                items: [
                    { label: 'Phòng ban', routeName: 'departments.index', href: route('departments.index'), roles: ['admin', 'quan_ly'] },
                    { label: 'Trạng thái khách hàng', routeName: 'lead-types.index', href: route('lead-types.index'), roles: ['admin'] },
                    { label: 'Hạng doanh thu', routeName: 'revenue-tiers.index', href: route('revenue-tiers.index'), roles: ['admin'] },
                    { label: 'Quy trình dịch vụ', routeName: 'services.workflows', href: route('services.workflows'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Thông báo', routeName: 'notifications.center', href: route('notifications.center'), roles: ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'] },
                    { label: 'Nhật ký hệ thống', routeName: 'activity.logs', href: route('activity.logs'), roles: ['admin', 'quan_ly'] },
                    { label: 'Tài khoản người dùng', routeName: 'accounts.dashboard', href: route('accounts.dashboard'), roles: ['admin'] },
                    { label: 'Phân quyền', routeName: 'roles.permissions', href: route('roles.permissions'), roles: ['admin'] },
                    { label: 'Cài đặt hệ thống', routeName: 'settings.system', href: route('settings.system'), roles: ['admin'] },
                ],
            },
        ],
        []
    );

    const visibleGroups = menuGroups
        .map((group) => ({
            ...group,
            items: group.items.filter((item) => item.roles.includes(currentRole)),
        }))
        .filter((group) => group.items.length > 0);

    const toggleGroup = (label) => {
        setCollapsedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
    };

    return (
            <div className="min-h-screen bg-app-bg text-slate-900">
            <div className="flex min-h-screen">
                <aside
                    className={`fixed inset-y-0 left-0 z-40 w-72 bg-white border-r border-slate-200/80 transform transition-transform duration-200 group ${
                        showSidebar ? 'translate-x-0' : '-translate-x-full'
                    } lg:translate-x-0`}
                >
                    <div className="h-full flex flex-col">
                        <div className="px-6 py-6 border-b border-slate-200">
                            <div className="flex items-center gap-3">
                                {logoUrl ? (
                                    <img src={logoUrl} alt={brandName} className="h-9 w-9 rounded-xl object-contain" />
                                ) : (
                                    <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-semibold">
                                        {brandName.slice(0, 1).toUpperCase()}
                                    </div>
                                )}
                                <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-text-subtle">{brandName}</p>
                                    <p className="text-lg font-semibold">Quản lý nội bộ</p>
                                    <p className="text-xs text-text-muted mt-1">{brandSubtitle}</p>
                                </div>
                            </div>
                        </div>

                        <nav className="flex-1 overflow-y-hidden group-hover:overflow-y-auto px-4 py-5 space-y-4">
                            {visibleGroups.map((group) => (
                                <div key={group.label} className="space-y-2">
                                    <button
                                        type="button"
                                        onClick={() => toggleGroup(group.label)}
                                        className="w-full flex items-center justify-between px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-subtle"
                                    >
                                        <span>{group.label}</span>
                                        <span
                                            className={`inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-transform ${
                                                collapsedGroups[group.label] ? 'rotate-180' : ''
                                            }`}
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="0 0 20 20"
                                                fill="currentColor"
                                                className="h-3 w-3"
                                            >
                                                <path
                                                    fillRule="evenodd"
                                                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                        </span>
                                    </button>
                                    <div
                                        className={`space-y-1 overflow-hidden transition-all duration-200 ${
                                            collapsedGroups[group.label]
                                                ? 'max-h-0 opacity-0'
                                                : 'max-h-[480px] opacity-100'
                                        }`}
                                    >
                                        {group.items.map((menu) => {
                                            const active = route().current(menu.routeName);
                                            return (
                                                <Link
                                                    key={menu.routeName}
                                                    href={menu.href}
                                                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition ${
                                                        active
                                                            ? 'bg-primary/10 text-primary'
                                                            : 'text-slate-600 hover:bg-slate-100'
                                                    }`}
                                                    onClick={() => setShowSidebar(false)}
                                                >
                                                    <span>{menu.label}</span>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </nav>

                        <div className="px-6 py-4 border-t border-slate-200 text-xs text-text-muted">
                            Phiên bản nội bộ v1.0
                        </div>
                    </div>
                </aside>

                <div className="flex-1 lg:ml-72">
                    <header className="bg-white/80 backdrop-blur border-b border-slate-200 sticky top-0 z-30">
                        <div className="px-4 md:px-8 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowSidebar((prev) => !prev)}
                                    className="lg:hidden inline-flex items-center justify-center rounded-md border border-slate-300 px-2 py-1 text-slate-700"
                                >
                                    Menu
                                </button>
                                <div>
                                    <p className="text-xs text-text-subtle">Hệ thống quản lý dự án</p>
                                    <p className="font-semibold">Bảng điều khiển</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="hidden md:inline-flex rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 text-xs">
                                    {roleLabels[currentRole] || currentRole || 'user'}
                                </span>
                                <Dropdown>
                                    <Dropdown.Trigger>
                                        <span className="inline-flex rounded-md">
                                            <button
                                                type="button"
                                                className="inline-flex items-center px-3 py-2 border border-slate-200 text-sm leading-4 font-medium rounded-md text-slate-700 bg-white hover:text-slate-900"
                                            >
                                                <span className="flex items-center gap-2">
                                                    {avatarUrl ? (
                                                        <img
                                                            src={avatarUrl}
                                                            alt={auth.user.name}
                                                            className="h-7 w-7 rounded-full object-cover border border-slate-200"
                                                        />
                                                    ) : (
                                                        <span className="h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                                                            {initials(auth.user.name)}
                                                        </span>
                                                    )}
                                                    <span>{auth.user.name}</span>
                                                </span>
                                                <svg
                                                    className="ml-2 -mr-0.5 h-4 w-4"
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 20 20"
                                                    fill="currentColor"
                                                >
                                                    <path
                                                        fillRule="evenodd"
                                                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                                        clipRule="evenodd"
                                                    />
                                                </svg>
                                            </button>
                                        </span>
                                    </Dropdown.Trigger>

                                    <Dropdown.Content>
                                        <button
                                            type="button"
                                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            Đổi avatar
                                        </button>
                                        <Dropdown.Link href={route('logout')} method="post" as="button">
                                            Đăng xuất
                                        </Dropdown.Link>
                                    </Dropdown.Content>
                                </Dropdown>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleAvatarChange}
                                />
                            </div>
                        </div>
                    </header>

                    {header && <div className="px-4 md:px-8 py-6">{header}</div>}

                    <main className="px-4 md:px-8 pb-10">{children}</main>
                </div>
            </div>
        </div>
    );
}
