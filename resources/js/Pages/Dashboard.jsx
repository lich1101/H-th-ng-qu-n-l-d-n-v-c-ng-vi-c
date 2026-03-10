import React from 'react';
import Authenticated from '@/Layouts/Authenticated';
import { Head } from '@inertiajs/inertia-react';

const modules = [
    'Quan ly du an: Kanban / Timeline / Gantt',
    'Order va phan cong task theo luong Sales -> Leader -> San xuat',
    'Nhac deadline tu dong (3 ngay, 1 ngay, qua han)',
    'Nop tai lieu va link video ban giao theo version',
    'Bao cao KPI theo ca nhan, du an va dich vu',
    'Lich meet, chat noi bo, log system, mini CRM',
];

const stitchReferences = [
    'manager_dashboard_overview',
    'project_kanban_board_view',
    'task_details_and_collaboration',
    'service_performance_reports',
    't_ng_quan_dashboard_ng_b_kh_i',
];

export default function Dashboard(props) {
    return (
        <Authenticated
            auth={props.auth}
            errors={props.errors}
            header={
                <h2 className="font-semibold text-xl text-gray-800 leading-tight">
                    Internal Task Manager
                </h2>
            }
        >
            <Head title="Internal Task Manager" />

            <div className="py-12">
                <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="bg-white overflow-hidden shadow-sm sm:rounded-lg">
                            <div className="p-6 bg-white border-b border-gray-200">
                                <p className="font-semibold text-gray-900 mb-2">Module tong quan</p>
                                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                                    {modules.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        <div className="bg-white overflow-hidden shadow-sm sm:rounded-lg">
                            <div className="p-6 bg-white border-b border-gray-200">
                                <p className="font-semibold text-gray-900 mb-2">Mau giao dien stitch</p>
                                <p className="text-sm text-gray-500 mb-3">
                                    Ban web se bám theo cac template ban da cung cap:
                                </p>
                                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                                    {stitchReferences.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Authenticated>
    );
}
