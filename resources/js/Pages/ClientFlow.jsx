import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from '@inertiajs/inertia-react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

const TYPE_LABELS = {
    client: 'Khách hàng',
    contract: 'Hợp đồng',
    project: 'Dự án',
    task: 'Công việc',
    item: 'Đầu việc',
};

const LABELS = {
    moi_tao: 'Mới tạo',
    dang_trien_khai: 'Đang triển khai',
    cho_duyet: 'Chờ duyệt',
    hoan_thanh: 'Hoàn thành',
    tam_dung: 'Tạm dừng',
    pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Từ chối',
    backlog: 'Backlog',
    todo: 'Cần làm',
    doing: 'Đang làm',
    blocked: 'Bị chặn',
    done: 'Hoàn tất',
};

const SERVICE_LABELS = {
    backlinks: 'Backlinks',
    viet_content: 'Content',
    audit_content: 'Audit Content',
    cham_soc_website_tong_the: 'Website Care',
    khac: 'Khác',
};

const statusLabel = (value) => LABELS[String(value || '').toLowerCase()] || value || '—';

const statusColor = (value) => {
    const key = String(value || '').toLowerCase();
    if (['dang_trien_khai', 'doing', 'active', 'paid'].includes(key)) return '#16a34a';
    if (['cho_duyet', 'pending', 'waiting'].includes(key)) return '#d97706';
    if (['blocked', 'tam_dung', 'paused', 'rejected'].includes(key)) return '#dc2626';
    if (['hoan_thanh', 'done', 'completed', 'closed', 'approved'].includes(key)) return '#0f766e';
    return '#2563eb';
};

const formatDate = (raw) => {
    if (!raw) return '—';
    try {
        const date = new Date(raw);
        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
    } catch {
        return String(raw).slice(0, 10);
    }
};

const formatCurrency = (value) => Number(value || 0).toLocaleString('vi-VN');

const serviceLabel = (project) => {
    if (!project) return '—';
    if (project.service_type === 'khac') return project.service_type_other || 'Khác';
    return SERVICE_LABELS[project.service_type] || project.service_type || '—';
};

const nodeStyle = (color) => ({
    border: `1px solid ${color}`,
    borderRadius: 16,
    padding: 12,
    width: 260,
    background: '#ffffff',
    boxShadow: '0 6px 24px rgba(15, 23, 42, 0.08)',
});

export default function ClientFlow({ auth, clientId }) {
    const toast = useToast();
    const [flow, setFlow] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedNode, setSelectedNode] = useState(null);

    const fetchFlow = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/v1/crm/clients/${clientId}/flow`);
            setFlow(res.data || null);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Không tải được luồng khách hàng.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFlow();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientId]);

    const { nodes, edges } = useMemo(() => {
        if (!flow?.client) {
            return { nodes: [], edges: [] };
        }

        const nodes = [];
        const edges = [];

        const contractYById = new Map();
        const projectYById = new Map();
        const taskYById = new Map();

        const pushNode = (id, type, label, color, x, y, detail) => {
            nodes.push({
                id,
                position: { x, y },
                data: { label, detail },
                style: nodeStyle(color),
                sourcePosition: 'right',
                targetPosition: 'left',
            });
        };

        const client = flow.client;
        const clientIdNode = `client-${client.id}`;
        pushNode(
            clientIdNode,
            'client',
            `${client.name || 'Khách hàng'}\nDoanh thu: ${formatCurrency(client.total_revenue)} VNĐ`,
            '#2563eb',
            0,
            120,
            {
                type: 'client',
                title: client.name || 'Khách hàng',
                status: client.has_purchased ? 'Đã mua' : 'Tiềm năng',
                rows: [
                    { label: 'Nguồn', value: [client.lead_source, client.lead_channel].filter(Boolean).join(' • ') || '—' },
                    { label: 'Công ty', value: client.company || '—' },
                ],
            }
        );

        const contracts = flow.contracts || [];
        contracts.forEach((contract, index) => {
            const y = index * 190;
            const id = `contract-${contract.id}`;
            const status = contract.status || contract.approval_status;
            contractYById.set(contract.id, y);
            pushNode(
                id,
                'contract',
                `${contract.title || contract.code || `Hợp đồng #${contract.id}`}\n${statusLabel(status)}`,
                statusColor(status),
                320,
                y,
                {
                    type: 'contract',
                    title: contract.title || contract.code || `Hợp đồng #${contract.id}`,
                    status: statusLabel(status),
                    rows: [
                        { label: 'Mã', value: contract.code || '—' },
                        { label: 'Giá trị', value: `${formatCurrency(contract.value)} VNĐ` },
                        { label: 'Ngày ký', value: formatDate(contract.signed_at) },
                        { label: 'Hạn', value: formatDate(contract.end_date) },
                    ],
                }
            );
            edges.push({
                id: `${clientIdNode}-${id}`,
                source: clientIdNode,
                target: id,
                animated: true,
                style: { stroke: '#94a3b8', strokeWidth: 2 },
            });
        });

        const projects = flow.projects || [];
        projects.forEach((project, index) => {
            const y = index * 190;
            const id = `project-${project.id}`;
            projectYById.set(project.id, y);
            pushNode(
                id,
                'project',
                `${project.name || `Dự án #${project.id}`}\n${statusLabel(project.status)} • ${project.progress_percent ?? 0}%`,
                statusColor(project.status),
                640,
                y,
                {
                    type: 'project',
                    title: project.name || `Dự án #${project.id}`,
                    status: statusLabel(project.status),
                    rows: [
                        { label: 'Dịch vụ', value: serviceLabel(project) },
                        { label: 'Tiến độ', value: `${project.progress_percent ?? 0}%` },
                        { label: 'Deadline', value: formatDate(project.deadline) },
                    ],
                }
            );
            const parentContractId = project.contract_id ? `contract-${project.contract_id}` : clientIdNode;
            edges.push({
                id: `${parentContractId}-${id}`,
                source: parentContractId,
                target: id,
                style: { stroke: '#cbd5e1', strokeWidth: 2 },
            });
        });

        const tasks = flow.tasks || [];
        tasks.forEach((task, index) => {
            const y = index * 170;
            const id = `task-${task.id}`;
            taskYById.set(task.id, y);
            pushNode(
                id,
                'task',
                `${task.title || `Công việc #${task.id}`}\n${statusLabel(task.status)} • ${task.progress_percent ?? 0}%`,
                statusColor(task.status),
                980,
                y,
                {
                    type: 'task',
                    title: task.title || `Công việc #${task.id}`,
                    status: statusLabel(task.status),
                    rows: [
                        { label: 'Phụ trách', value: task.assignee?.name || '—' },
                        { label: 'Phòng ban', value: task.department?.name || '—' },
                        { label: 'Deadline', value: formatDate(task.deadline) },
                    ],
                }
            );
            const parentProjectId = `project-${task.project_id}`;
            edges.push({
                id: `${parentProjectId}-${id}`,
                source: parentProjectId,
                target: id,
                style: { stroke: '#dbeafe', strokeWidth: 2 },
            });
        });

        const items = flow.items || [];
        items.forEach((item, index) => {
            const y = index * 150;
            const id = `item-${item.id}`;
            pushNode(
                id,
                'item',
                `${item.title || `Đầu việc #${item.id}`}\n${statusLabel(item.status)} • ${item.progress_percent ?? 0}%`,
                statusColor(item.status),
                1320,
                y,
                {
                    type: 'item',
                    title: item.title || `Đầu việc #${item.id}`,
                    status: statusLabel(item.status),
                    rows: [
                        { label: 'Nhân sự', value: item.assignee?.name || '—' },
                        { label: 'Bắt đầu', value: formatDate(item.start_date) },
                        { label: 'Deadline', value: formatDate(item.deadline) },
                    ],
                }
            );
            const parentTaskId = `task-${item.task_id}`;
            edges.push({
                id: `${parentTaskId}-${id}`,
                source: parentTaskId,
                target: id,
                style: { stroke: '#e2e8f0', strokeWidth: 1.6 },
            });
        });

        return { nodes, edges };
    }, [flow]);

    const timeline = useMemo(() => {
        if (!flow) return [];
        const rows = [];
        (flow.contracts || []).forEach((contract) => {
            if (contract.signed_at) {
                rows.push({
                    id: `contract-signed-${contract.id}`,
                    date: contract.signed_at,
                    title: `Ký hợp đồng: ${contract.title || contract.code || `#${contract.id}`}`,
                    status: contract.status || contract.approval_status,
                });
            }
            if (contract.end_date) {
                rows.push({
                    id: `contract-end-${contract.id}`,
                    date: contract.end_date,
                    title: `Hạn hợp đồng: ${contract.title || contract.code || `#${contract.id}`}`,
                    status: contract.status || contract.approval_status,
                });
            }
        });
        (flow.projects || []).forEach((project) => {
            if (project.deadline) {
                rows.push({
                    id: `project-${project.id}`,
                    date: project.deadline,
                    title: `Deadline dự án: ${project.name || `#${project.id}`}`,
                    status: project.status,
                });
            }
        });
        (flow.tasks || []).forEach((task) => {
            if (task.deadline) {
                rows.push({
                    id: `task-${task.id}`,
                    date: task.deadline,
                    title: `Deadline công việc: ${task.title || `#${task.id}`}`,
                    status: task.status,
                });
            }
        });
        (flow.items || []).forEach((item) => {
            if (item.deadline) {
                rows.push({
                    id: `item-${item.id}`,
                    date: item.deadline,
                    title: `Deadline đầu việc: ${item.title || `#${item.id}`}`,
                    status: item.status,
                });
            }
        });
        return rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [flow]);

    return (
        <PageContainer
            auth={auth}
            title="Luồng khách hàng"
            description={flow?.client?.name ? `Luồng xử lý cho ${flow.client.name}` : 'Theo dõi hành trình khách hàng.'}
        >
            <div className="flex items-center justify-between mb-4">
                <div className="text-xs text-text-muted">
                    Luồng hiển thị theo cây: Khách hàng → Hợp đồng → Dự án → Công việc → Đầu việc
                </div>
                <Link
                    href={route('crm.index')}
                    className="rounded-xl bg-primary text-white px-4 py-2 text-xs font-semibold"
                >
                    Quay lại khách hàng
                </Link>
            </div>

            {loading && (
                <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-text-muted">
                    Đang tải luồng khách hàng...
                </div>
            )}

            {!loading && flow && (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="h-[72vh] min-h-[540px] bg-white rounded-2xl border border-slate-200/80 shadow-card">
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            fitView
                            nodesDraggable
                            nodesConnectable={false}
                            onNodeClick={(_, node) => {
                                setSelectedNode(node?.data?.detail || null);
                            }}
                            defaultEdgeOptions={{ animated: false }}
                        >
                            <Background color="#e2e8f0" gap={24} />
                            <Controls />
                        </ReactFlow>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 space-y-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-text-subtle">Chi tiết nút</p>
                            {!selectedNode ? (
                                <p className="text-sm text-text-muted mt-1">Chọn một nút trong luồng để xem chi tiết.</p>
                            ) : (
                                <div className="mt-2 space-y-2">
                                    <div className="text-xs uppercase tracking-wide text-text-subtle">
                                        {TYPE_LABELS[selectedNode.type] || selectedNode.type}
                                    </div>
                                    <h3 className="text-base font-semibold text-slate-900">{selectedNode.title}</h3>
                                    <div className="text-xs font-semibold" style={{ color: statusColor(selectedNode.status) }}>
                                        {selectedNode.status}
                                    </div>
                                    <div className="space-y-1 pt-1">
                                        {(selectedNode.rows || []).map((row) => (
                                            <div key={`${selectedNode.type}-${row.label}`} className="flex items-start justify-between gap-3 text-xs">
                                                <span className="text-text-subtle">{row.label}</span>
                                                <span className="text-right font-semibold text-slate-800">{row.value || '—'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="pt-4 border-t border-slate-200/80">
                            <p className="text-xs uppercase tracking-[0.2em] text-text-subtle mb-3">Timeline mốc chính</p>
                            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                                {timeline.length === 0 && (
                                    <p className="text-sm text-text-muted">Chưa có mốc timeline.</p>
                                )}
                                {timeline.map((row) => (
                                    <div key={row.id} className="flex items-start gap-3">
                                        <span
                                            className="mt-1 h-2.5 w-2.5 rounded-full"
                                            style={{ backgroundColor: statusColor(row.status) }}
                                        />
                                        <div className="flex-1">
                                            <div className="text-[11px] uppercase tracking-[0.2em] text-text-subtle">
                                                {formatDate(row.date)}
                                            </div>
                                            <div className="text-sm font-semibold text-slate-900">{row.title}</div>
                                            <div className="text-xs text-text-muted">{statusLabel(row.status)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </PageContainer>
    );
}
