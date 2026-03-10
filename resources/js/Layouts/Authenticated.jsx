import React, { useMemo, useState } from 'react';
import Dropdown from '@/Components/Dropdown';
import { Link } from '@inertiajs/inertia-react';

export default function Authenticated({ auth, header, children }) {
    const [showSidebar, setShowSidebar] = useState(false);
    const currentRole = auth?.user?.role || '';

    const menus = useMemo(
        () => [
            { label: 'Tổng quan', routeName: 'dashboard', href: route('dashboard') },
            { label: 'Dự án', routeName: 'projects.kanban', href: route('projects.kanban') },
            { label: 'Công việc', routeName: 'tasks.board', href: route('tasks.board') },
            { label: 'Deadline', routeName: 'deadlines.index', href: route('deadlines.index') },
            { label: 'Bàn giao', routeName: 'handover.index', href: route('handover.index') },
            { label: 'Báo cáo KPI', routeName: 'reports.kpi', href: route('reports.kpi') },
            { label: 'Quy trình dịch vụ', routeName: 'services.workflows', href: route('services.workflows') },
            { label: 'Lịch họp', routeName: 'meetings.index', href: route('meetings.index') },
            { label: 'Chat nội bộ', routeName: 'chat.internal', href: route('chat.internal') },
            { label: 'Thông báo', routeName: 'notifications.center', href: route('notifications.center') },
            { label: 'Nhật ký hệ thống', routeName: 'activity.logs', href: route('activity.logs') },
            { label: 'CRM mini', routeName: 'crm.index', href: route('crm.index') },
            { label: 'Tài khoản người dùng', routeName: 'accounts.dashboard', href: route('accounts.dashboard') },
            { label: 'Phân quyền', routeName: 'roles.permissions', href: route('roles.permissions') },
        ],
        []
    );

    const allowedMenus = menus.filter((menu) => {
        if (currentRole === 'admin' || currentRole === 'truong_phong_san_xuat') {
            return true;
        }
        if (currentRole === 'nhan_su_kinh_doanh') {
            return [
                'dashboard',
                'projects.kanban',
                'deadlines.index',
                'handover.index',
                'meetings.index',
                'chat.internal',
                'notifications.center',
                'crm.index',
            ].includes(menu.routeName);
        }
        if (currentRole === 'nhan_su_san_xuat') {
            return [
                'dashboard',
                'tasks.board',
                'deadlines.index',
                'handover.index',
                'chat.internal',
                'notifications.center',
                'services.workflows',
            ].includes(menu.routeName);
        }
        return menu.routeName === 'dashboard';
    });

    return (
        <div className="min-h-screen bg-slate-100 text-slate-800">
            <div className="flex min-h-screen">
                <aside className={`fixed inset-y-0 left-0 z-40 w-72 bg-slate-900 text-slate-100 transform transition-transform duration-200 ${showSidebar ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:inset-auto`}>
                    <div className="h-full flex flex-col">
                        <div className="px-5 py-5 border-b border-slate-800">
                            <p className="text-sm uppercase tracking-wide text-slate-400">WinMap</p>
                            <p className="text-lg font-semibold">Quản lý nội bộ</p>
                            <p className="text-xs text-slate-400 mt-1">Sales • Sản xuất • Admin</p>
                        </div>

                        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
                            {allowedMenus.map((menu) => {
                                const active = route().current(menu.routeName);
                                return (
                                    <Link
                                        key={menu.routeName}
                                        href={menu.href}
                                        className={`block px-3 py-2 rounded-lg text-sm transition ${
                                            active
                                                ? 'bg-sky-500/20 text-sky-300'
                                                : 'text-slate-200 hover:bg-slate-800'
                                        }`}
                                        onClick={() => setShowSidebar(false)}
                                    >
                                        {menu.label}
                                    </Link>
                                );
                            })}
                        </nav>

                        <div className="p-4 border-t border-slate-800 text-xs text-slate-400">
                            Phiên bản nội bộ v1.0
                        </div>
                    </div>
                </aside>

                <div className="flex-1 lg:ml-0">
                    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
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
                                    <p className="text-sm text-slate-500">Hệ thống quản lý dự án</p>
                                    <p className="font-semibold">Bảng điều khiển</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="hidden md:inline-flex rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 text-xs">
                                    {auth?.user?.role || 'user'}
                                </span>
                                <Dropdown>
                                    <Dropdown.Trigger>
                                        <span className="inline-flex rounded-md">
                                            <button
                                                type="button"
                                                className="inline-flex items-center px-3 py-2 border border-slate-200 text-sm leading-4 font-medium rounded-md text-slate-600 bg-white hover:text-slate-800"
                                            >
                                                {auth.user.name}
                                                <svg className="ml-2 -mr-0.5 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
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
                                        <Dropdown.Link href={route('logout')} method="post" as="button">
                                            Đăng xuất
                                        </Dropdown.Link>
                                    </Dropdown.Content>
                                </Dropdown>
                            </div>
                        </div>
                    </header>

                    {header && <div className="px-4 md:px-8 py-5">{header}</div>}

                    <main className="px-4 md:px-8 pb-8">{children}</main>
                </div>
            </div>
        </div>
    );
}
