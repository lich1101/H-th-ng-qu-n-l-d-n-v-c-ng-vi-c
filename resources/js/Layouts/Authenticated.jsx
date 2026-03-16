import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import Dropdown from '@/Components/Dropdown';
import { Link, usePage } from '@inertiajs/inertia-react';

export default function Authenticated({ auth, header, children }) {
    const { settings } = usePage().props;
    const [showSidebar, setShowSidebar] = useState(false);
    const currentRole = auth?.user?.role || '';
    const brandName = settings?.brand_name || 'job clickon';
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
                items: [
                    {
                        label: 'Tổng quan',
                        icon: 'dashboard',
                        routeName: 'dashboard',
                        href: route('dashboard'),
                        roles: ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'],
                    },
                ],
            },
            {
                label: 'CRM',
                items: [
                    { label: 'Khách hàng', icon: 'users', routeName: 'crm.index', href: route('crm.index'), roles: ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'] },
                    { label: 'Cơ hội', icon: 'trend', routeName: 'opportunities.index', href: route('opportunities.index'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Form tư vấn', icon: 'form', routeName: 'lead-forms.index', href: route('lead-forms.index'), roles: ['admin'] },
                    { label: 'Facebook Pages', icon: 'facebook', routeName: 'facebook.pages', href: route('facebook.pages'), roles: ['admin', 'quan_ly'] },
                ],
            },
            {
                label: 'Sales',
                items: [
                    { label: 'Hợp đồng', icon: 'file', routeName: 'contracts.index', href: route('contracts.index'), roles: ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'] },
                    { label: 'Sản phẩm', icon: 'box', routeName: 'products.index', href: route('products.index'), roles: ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'] },
                ],
            },
            {
                label: 'Operations',
                items: [
                    { label: 'Dự án', icon: 'project', routeName: 'projects.kanban', href: route('projects.kanban'), roles: ['admin', 'quan_ly'] },
                    { label: 'Công việc', icon: 'tasks', routeName: 'tasks.board', href: route('tasks.board'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Nhắc hạn', icon: 'alarm', routeName: 'deadlines.index', href: route('deadlines.index'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Bàn giao', icon: 'handover', routeName: 'handover.index', href: route('handover.index'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Điều phối phòng ban', icon: 'route', routeName: 'department-assignments.index', href: route('department-assignments.index'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Lịch họp', icon: 'calendar', routeName: 'meetings.index', href: route('meetings.index'), roles: ['admin', 'quan_ly'] },
                ],
            },
            {
                label: 'Reports',
                items: [
                    { label: 'Báo cáo KPI', icon: 'chart', routeName: 'reports.kpi', href: route('reports.kpi'), roles: ['admin', 'quan_ly'] },
                    { label: 'Doanh thu công ty', icon: 'chart', routeName: 'reports.company', href: route('reports.company'), roles: ['admin'] },
                ],
            },
            {
                label: 'System',
                items: [
                    { label: 'Phòng ban', icon: 'department', routeName: 'departments.index', href: route('departments.index'), roles: ['admin', 'quan_ly'] },
                    { label: 'Trạng thái khách hàng', icon: 'tag', routeName: 'lead-types.index', href: route('lead-types.index'), roles: ['admin'] },
                    { label: 'Hạng doanh thu', icon: 'award', routeName: 'revenue-tiers.index', href: route('revenue-tiers.index'), roles: ['admin'] },
                    { label: 'Quy trình dịch vụ', icon: 'workflow', routeName: 'services.workflows', href: route('services.workflows'), roles: ['admin', 'quan_ly', 'nhan_vien'] },
                    { label: 'Thông báo', icon: 'bell', routeName: 'notifications.center', href: route('notifications.center'), roles: ['admin', 'quan_ly', 'nhan_vien', 'ke_toan'] },
                    { label: 'Nhật ký hệ thống', icon: 'history', routeName: 'activity.logs', href: route('activity.logs'), roles: ['admin', 'quan_ly'] },
                    { label: 'Tài khoản người dùng', icon: 'users', routeName: 'accounts.dashboard', href: route('accounts.dashboard'), roles: ['admin'] },
                    { label: 'Phân quyền', icon: 'shield', routeName: 'roles.permissions', href: route('roles.permissions'), roles: ['admin'] },
                    { label: 'Cài đặt hệ thống', icon: 'settings', routeName: 'settings.system', href: route('settings.system'), roles: ['admin'] },
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

    const [collapsedGroups, setCollapsedGroups] = useState(() => {
        const next = {};
        visibleGroups.forEach((group) => {
            const active = group.items.some((item) => route().current(item.routeName));
            next[group.label] = !active;
        });
        return next;
    });

    useEffect(() => {
        const next = {};
        visibleGroups.forEach((group) => {
            const active = group.items.some((item) => route().current(item.routeName));
            next[group.label] = !active;
        });
        setCollapsedGroups(next);
    }, [currentRole]);

    const iconMap = {
        dashboard: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 12l9-9 9 9" />
                <path d="M9 21V9h6v12" />
            </svg>
        ),
        users: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M16 11a4 4 0 10-8 0 4 4 0 008 0z" />
                <path d="M3 21a9 9 0 0118 0" />
            </svg>
        ),
        trend: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 17l6-6 4 4 7-7" />
                <path d="M14 8h7v7" />
            </svg>
        ),
        form: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <path d="M8 7h8M8 11h8M8 15h6" />
            </svg>
        ),
        facebook: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M13 10h4V7h-4V5a2 2 0 012-2h2" />
                <path d="M13 21v-11H9V7h4" />
            </svg>
        ),
        file: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />
                <path d="M14 3v6h6" />
            </svg>
        ),
        box: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 7l9 5 9-5" />
                <path d="M12 12v9" />
                <path d="M3 7v10l9 5 9-5V7" />
            </svg>
        ),
        project: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="6" cy="6" r="2" />
                <circle cx="18" cy="6" r="2" />
                <circle cx="6" cy="18" r="2" />
                <path d="M8 6h8M6 8v8M8 18h8" />
            </svg>
        ),
        tasks: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M9 11l2 2 4-4" />
                <path d="M4 6h16M4 12h16M4 18h10" />
            </svg>
        ),
        alarm: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="13" r="7" />
                <path d="M12 10v4l3 2" />
                <path d="M5 3l-2 2M19 3l2 2" />
            </svg>
        ),
        handover: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M7 7h6a2 2 0 012 2v8H7a2 2 0 01-2-2V9a2 2 0 012-2z" />
                <path d="M7 7V5a2 2 0 012-2h6" />
                <path d="M17 13h2a2 2 0 012 2v2" />
            </svg>
        ),
        route: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="6" cy="6" r="2" />
                <circle cx="18" cy="18" r="2" />
                <path d="M6 8c0 6 6 4 6 8" />
            </svg>
        ),
        calendar: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
        ),
        chat: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 15a4 4 0 01-4 4H7l-4 3V7a4 4 0 014-4h10a4 4 0 014 4z" />
            </svg>
        ),
        chart: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 20V4" />
                <path d="M4 20h16" />
                <path d="M8 16v-4M12 16V8M16 16v-6" />
            </svg>
        ),
        department: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
        ),
        tag: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M20 12l-8 8-8-8V4h8l8 8z" />
                <circle cx="10" cy="6" r="1.5" />
            </svg>
        ),
        award: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="8" r="4" />
                <path d="M8 14l-2 8 6-3 6 3-2-8" />
            </svg>
        ),
        workflow: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="6" cy="6" r="2" />
                <circle cx="18" cy="6" r="2" />
                <circle cx="12" cy="18" r="2" />
                <path d="M8 6h8M6 8v6m12-6v6" />
            </svg>
        ),
        bell: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
        ),
        history: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 12a9 9 0 109-9" />
                <path d="M3 4v5h5" />
                <path d="M12 7v5l3 2" />
            </svg>
        ),
        shield: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3l7 4v5c0 5-3.5 9-7 9s-7-4-7-9V7l7-4z" />
            </svg>
        ),
        settings: (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1 1 0 00.2 1.1l1 1.7-2 3.4-2-1a1 1 0 00-1.1 0l-1.6.9a1 1 0 00-.6.9V22h-4v-1.9a1 1 0 00-.6-.9l-1.6-.9a1 1 0 00-1.1 0l-2 1-2-3.4 1-1.7a1 1 0 00.2-1.1l-.4-1.8a1 1 0 00-.9-.7H2V8h1.9a1 1 0 00.9-.7l.4-1.8a1 1 0 00-.2-1.1l-1-1.7 2-3.4 2 1a1 1 0 001.1 0l1.6-.9A1 1 0 0010.3 0H14v1.9a1 1 0 00.6.9l1.6.9a1 1 0 001.1 0l2-1 2 3.4-1 1.7a1 1 0 00-.2 1.1l.4 1.8a1 1 0 00.9.7H22v4h-1.9a1 1 0 00-.9.7l-.4 1.8z" />
            </svg>
        ),
    };

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
                                    <p className="text-lg font-semibold">Quản lý nội bộ</p>
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
                                                    <span className="flex items-center gap-2">
                                                        <span className="text-slate-500">{iconMap[menu.icon] || iconMap.dashboard}</span>
                                                        <span>{menu.label}</span>
                                                    </span>
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
