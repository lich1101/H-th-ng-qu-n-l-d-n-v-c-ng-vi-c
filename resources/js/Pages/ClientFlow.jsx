import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link } from '@inertiajs/inertia-react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import AppIcon from '@/Components/AppIcon';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

const TYPE_LABELS = {
    client: 'Khách hàng',
    contract: 'Hợp đồng',
    project: 'Dự án',
    task: 'Công việc',
    item: 'Đầu việc',
};

const TYPE_COLORS = {
    client: '#0f766e',
    contract: '#2563eb',
    project: '#0891b2',
    task: '#7c3aed',
    item: '#ea580c',
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

const HINT_CARD_WIDTH = 360;
const HINT_CARD_MAX_HEIGHT = 430;

const statusLabel = (value) => LABELS[String(value || '').toLowerCase()] || value || '—';

const statusColor = (value, fallback = '#2563eb') => {
    const key = String(value || '').toLowerCase();
    if (['dang_trien_khai', 'doing', 'active', 'paid'].includes(key)) return '#16a34a';
    if (['cho_duyet', 'pending', 'waiting'].includes(key)) return '#d97706';
    if (['blocked', 'tam_dung', 'paused', 'rejected'].includes(key)) return '#dc2626';
    if (['hoan_thanh', 'done', 'completed', 'closed', 'approved'].includes(key)) return '#0f766e';
    return fallback;
};

const clampPercent = (value) => {
    const parsed = Number(value || 0);
    if (Number.isNaN(parsed)) return 0;
    return Math.max(0, Math.min(100, parsed));
};

const formatDate = (raw) => {
    if (!raw) return '—';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return String(raw).slice(0, 10);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
};

const formatCurrency = (value) => Number(value || 0).toLocaleString('vi-VN');

const serviceLabel = (project) => {
    if (!project) return '—';
    if (project.service_type === 'khac') return project.service_type_other || 'Khác';
    return SERVICE_LABELS[project.service_type] || project.service_type || '—';
};

const safeText = (value, fallback = '—') => {
    if (value === null || value === undefined || value === '') return fallback;
    return value;
};

const hexToRgba = (hex, alpha) => {
    const value = String(hex || '').replace('#', '');
    if (value.length !== 6) return `rgba(37, 99, 235, ${alpha})`;
    const r = Number.parseInt(value.slice(0, 2), 16);
    const g = Number.parseInt(value.slice(2, 4), 16);
    const b = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const nodeStyle = (accent, isActive) => ({
    width: 276,
    padding: 0,
    overflow: 'hidden',
    cursor: 'pointer',
    borderRadius: 24,
    border: `1px solid ${hexToRgba(accent, isActive ? 0.56 : 0.22)}`,
    background: '#ffffff',
    boxShadow: isActive
        ? `0 20px 48px ${hexToRgba(accent, 0.22)}`
        : '0 14px 34px rgba(15, 23, 42, 0.08)',
});

function FlowNodeCard({ detail }) {
    const accent = detail.accentColor || TYPE_COLORS[detail.type] || '#2563eb';
    const stats = (detail.stats || []).slice(0, 2);
    const rows = (detail.rows || []).slice(0, 2);

    return (
        <div className="relative overflow-hidden text-left">
            <div
                className="absolute inset-x-0 top-0 h-20"
                style={{ background: `linear-gradient(135deg, ${hexToRgba(accent, 0.18)}, ${hexToRgba(accent, 0.03)})` }}
            />
            <div className="relative space-y-3 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div
                            className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
                            style={{ backgroundColor: hexToRgba(accent, 0.12), color: accent }}
                        >
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
                            {TYPE_LABELS[detail.type] || detail.type}
                        </div>
                        <div className="mt-3 text-[14px] font-semibold leading-5 text-slate-900 break-words">{detail.title}</div>
                        {detail.subtitle && (
                            <div className="mt-1 text-[11px] leading-4 text-slate-500 break-words">{detail.subtitle}</div>
                        )}
                    </div>
                    <div
                        className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                        style={{ backgroundColor: hexToRgba(accent, 0.12), color: accent }}
                    >
                        {detail.statusText}
                    </div>
                </div>

                {typeof detail.progress === 'number' && (
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>Tiến độ</span>
                            <span className="font-semibold text-slate-700">{clampPercent(detail.progress)}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                                className="h-full rounded-full"
                                style={{ width: `${clampPercent(detail.progress)}%`, backgroundColor: accent }}
                            />
                        </div>
                    </div>
                )}

                {stats.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                        {stats.map((stat) => (
                            <div key={`${detail.id}-${stat.label}`} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-2">
                                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{stat.label}</div>
                                <div className="mt-1 text-[12px] font-semibold text-slate-800 break-words">{stat.value}</div>
                            </div>
                        ))}
                    </div>
                )}

                {rows.length > 0 && (
                    <div className="space-y-2 border-t border-slate-200/80 pt-3">
                        {rows.map((row) => (
                            <div key={`${detail.id}-${row.label}`} className="flex items-start justify-between gap-3 text-[11px]">
                                <span className="text-slate-400">{row.label}</span>
                                <span className="text-right font-semibold text-slate-700 break-words">{row.value}</span>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex items-center justify-between pt-1 text-[11px]">
                    <span className="text-slate-400">{detail.footer || 'Nhấn để xem ghi chú nhanh'}</span>
                    <span className="font-semibold" style={{ color: accent }}>Xem chú thích</span>
                </div>
            </div>
        </div>
    );
}

function DetailList({ rows }) {
    return (
        <div className="space-y-2">
            {(rows || []).map((row) => (
                <div key={`${row.label}-${row.value}`} className="flex items-start justify-between gap-3 text-xs">
                    <span className="text-slate-400">{row.label}</span>
                    <span className="max-w-[62%] text-right font-semibold text-slate-800 break-words">{row.value}</span>
                </div>
            ))}
        </div>
    );
}

function FloatingDetailHint({ hint, onClose }) {
    const detail = hint?.detail;
    if (!detail) {
        return null;
    }

    const accent = detail.accentColor || TYPE_COLORS[detail.type] || '#2563eb';
    const rows = (detail.rows || []).slice(0, 6);

    return (
        <div className="pointer-events-auto absolute z-20" style={{ left: hint.position.x, top: hint.position.y, width: hint.width }}>
            <div
                className="absolute -top-2 h-4 w-4 rotate-45 rounded-[4px] border-l border-t border-slate-200/80 bg-white"
                style={{ left: hint.arrowLeft - 8 }}
            />

            <div className="relative overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
                <div
                    className="absolute inset-x-0 top-0 h-20"
                    style={{ background: `linear-gradient(135deg, ${hexToRgba(accent, 0.18)}, ${hexToRgba(accent, 0.03)})` }}
                />

                <div className="relative space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div
                                className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
                                style={{ backgroundColor: hexToRgba(accent, 0.12), color: accent }}
                            >
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
                                {TYPE_LABELS[detail.type] || detail.type}
                            </div>
                            <div className="mt-3 text-sm font-semibold text-slate-900 break-words">{detail.title}</div>
                        </div>

                        <div className="flex shrink-0 items-start gap-2">
                            <div
                                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                                style={{ backgroundColor: hexToRgba(accent, 0.12), color: accent }}
                            >
                                {detail.statusText}
                            </div>
                            <button
                                type="button"
                                className="rounded-full border border-slate-200 bg-white p-1 text-slate-400 transition hover:text-slate-600"
                                onClick={onClose}
                            >
                                <AppIcon name="x-mark" className="h-4 w-4" strokeWidth={2.1} />
                            </button>
                        </div>
                    </div>

                    <DetailList rows={rows} />

                    {detail.description && (
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3 py-3">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Ghi chú</div>
                            <div className="mt-1 text-xs leading-6 text-slate-600 break-words">{detail.description}</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function ClientFlow({ auth, clientId }) {
    const toast = useToast();
    const [flow, setFlow] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeHint, setActiveHint] = useState(null);
    const flowSurfaceRef = useRef(null);

    const fetchFlow = async () => {
        setLoading(true);
        setActiveHint(null);
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

    useEffect(() => {
        if (!activeHint) {
            return undefined;
        }

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                setActiveHint(null);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [activeHint]);

    const { nodes, edges } = useMemo(() => {
        if (!flow?.client) {
            return { nodes: [], edges: [] };
        }

        const nodes = [];
        const edges = [];
        const selectedId = activeHint?.id || null;

        const contracts = flow.contracts || [];
        const projects = flow.projects || [];
        const tasks = flow.tasks || [];
        const items = flow.items || [];

        const COL_X = {
            client: 0,
            contract: 500,
            project: 1020,
            task: 1540,
            item: 2060,
        };
        const ROW_GAP = 280;

        const addNode = (id, detail, x, y) => {
            const accent = detail.accentColor || TYPE_COLORS[detail.type] || '#2563eb';
            nodes.push({
                id,
                position: { x, y },
                data: {
                    label: <FlowNodeCard detail={detail} />,
                    detail,
                },
                style: nodeStyle(accent, selectedId === id),
                sourcePosition: 'right',
                targetPosition: 'left',
                draggable: false,
            });
        };

        const contractNodeById = new Map();
        const projectNodeById = new Map();
        const taskNodeById = new Map();

        const client = flow.client;
        const clientNodeId = `client-${client.id}`;
        addNode(
            clientNodeId,
            {
                id: clientNodeId,
                type: 'client',
                title: client.name || 'Khách hàng',
                subtitle: client.company || 'Chưa có công ty',
                statusText: client.has_purchased ? 'Đã mua' : 'Tiềm năng',
                accentColor: statusColor(client.has_purchased ? 'approved' : 'pending', TYPE_COLORS.client),
                stats: [
                    { label: 'Doanh thu', value: `${formatCurrency(client.total_revenue)} VNĐ` },
                    { label: 'Hợp đồng', value: String(contracts.length) },
                ],
                rows: [
                    { label: 'Nguồn', value: [client.lead_source, client.lead_channel].filter(Boolean).join(' • ') || '—' },
                    { label: 'Email', value: safeText(client.email) },
                    { label: 'Điện thoại', value: safeText(client.phone) },
                ],
                description: safeText(client.notes, ''),
                footer: 'Nút gốc hành trình khách hàng',
            },
            COL_X.client,
            Math.max(0, ((Math.max(contracts.length, 1) - 1) * ROW_GAP) / 2)
        );

        contracts.forEach((contract, index) => {
            const nodeId = `contract-${contract.id}`;
            const y = index * ROW_GAP;
            const status = contract.status || contract.approval_status;
            contractNodeById.set(contract.id, nodeId);

            addNode(
                nodeId,
                {
                    id: nodeId,
                    type: 'contract',
                    title: contract.title || contract.code || `Hợp đồng #${contract.id}`,
                    subtitle: contract.code || 'Chưa có mã',
                    statusText: statusLabel(status),
                    accentColor: statusColor(status, TYPE_COLORS.contract),
                    stats: [
                        { label: 'Giá trị', value: `${formatCurrency(contract.value)} VNĐ` },
                        { label: 'Thanh toán', value: `${contract.payment_times || 0} đợt` },
                    ],
                    rows: [
                        { label: 'Ngày ký', value: formatDate(contract.signed_at) },
                        { label: 'Hiệu lực', value: formatDate(contract.end_date) },
                    ],
                    description: safeText(contract.notes, ''),
                    footer: 'Nhấn để xem chú thích nhanh',
                },
                COL_X.contract,
                y
            );

            edges.push({
                id: `${clientNodeId}-${nodeId}`,
                source: clientNodeId,
                target: nodeId,
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#94a3b8', strokeWidth: 2 },
            });
        });

        projects.forEach((project, index) => {
            const nodeId = `project-${project.id}`;
            const y = index * ROW_GAP;
            projectNodeById.set(project.id, nodeId);

            addNode(
                nodeId,
                {
                    id: nodeId,
                    type: 'project',
                    title: project.name || `Dự án #${project.id}`,
                    subtitle: serviceLabel(project),
                    statusText: statusLabel(project.status),
                    accentColor: statusColor(project.status, TYPE_COLORS.project),
                    progress: clampPercent(project.progress_percent),
                    stats: [
                        { label: 'Tiến độ', value: `${clampPercent(project.progress_percent)}%` },
                        { label: 'Deadline', value: formatDate(project.deadline) },
                    ],
                    rows: [
                        { label: 'Mã dự án', value: safeText(project.code) },
                        { label: 'Dịch vụ', value: serviceLabel(project) },
                    ],
                    description: safeText(project.customer_requirement, ''),
                    footer: 'Nhánh dự án',
                },
                COL_X.project,
                y
            );

            const sourceNode = project.contract_id && contractNodeById.has(project.contract_id)
                ? contractNodeById.get(project.contract_id)
                : clientNodeId;
            edges.push({
                id: `${sourceNode}-${nodeId}`,
                source: sourceNode,
                target: nodeId,
                type: 'smoothstep',
                style: { stroke: '#cbd5e1', strokeWidth: 2 },
            });
        });

        tasks.forEach((task, index) => {
            const nodeId = `task-${task.id}`;
            const y = index * ROW_GAP;
            taskNodeById.set(task.id, nodeId);

            addNode(
                nodeId,
                {
                    id: nodeId,
                    type: 'task',
                    title: task.title || `Công việc #${task.id}`,
                    subtitle: safeText(task.department?.name, 'Chưa có phòng ban'),
                    statusText: statusLabel(task.status),
                    accentColor: statusColor(task.status, TYPE_COLORS.task),
                    progress: clampPercent(task.progress_percent),
                    stats: [
                        { label: 'Tiến độ', value: `${clampPercent(task.progress_percent)}%` },
                        { label: 'Deadline', value: formatDate(task.deadline) },
                    ],
                    rows: [
                        { label: 'Phụ trách', value: safeText(task.assignee?.name) },
                        { label: 'Phòng ban', value: safeText(task.department?.name) },
                    ],
                    footer: 'Nhánh công việc',
                },
                COL_X.task,
                y
            );

            const parentProjectId = projectNodeById.get(task.project_id);
            if (parentProjectId) {
                edges.push({
                    id: `${parentProjectId}-${nodeId}`,
                    source: parentProjectId,
                    target: nodeId,
                    type: 'smoothstep',
                    style: { stroke: '#dbeafe', strokeWidth: 2 },
                });
            }
        });

        items.forEach((item, index) => {
            const nodeId = `item-${item.id}`;
            const y = index * ROW_GAP;

            addNode(
                nodeId,
                {
                    id: nodeId,
                    type: 'item',
                    title: item.title || `Đầu việc #${item.id}`,
                    subtitle: safeText(item.assignee?.name, 'Chưa phân công'),
                    statusText: statusLabel(item.status),
                    accentColor: statusColor(item.status, TYPE_COLORS.item),
                    progress: clampPercent(item.progress_percent),
                    stats: [
                        { label: 'Tiến độ', value: `${clampPercent(item.progress_percent)}%` },
                        { label: 'Deadline', value: formatDate(item.deadline) },
                    ],
                    rows: [
                        { label: 'Nhân sự', value: safeText(item.assignee?.name) },
                        { label: 'Bắt đầu', value: formatDate(item.start_date) },
                        { label: 'Deadline', value: formatDate(item.deadline) },
                    ],
                    footer: 'Nút cuối của nhánh',
                },
                COL_X.item,
                y
            );

            const parentTaskId = taskNodeById.get(item.task_id);
            if (parentTaskId) {
                edges.push({
                    id: `${parentTaskId}-${nodeId}`,
                    source: parentTaskId,
                    target: nodeId,
                    type: 'smoothstep',
                    style: { stroke: '#e2e8f0', strokeWidth: 1.8 },
                });
            }
        });

        return { nodes, edges };
    }, [activeHint, flow]);

    const openHintAtCursor = (event, node) => {
        const detail = node?.data?.detail;
        if (!detail) {
            return;
        }

        if (!flowSurfaceRef.current) {
            setActiveHint({
                id: node.id,
                detail,
                position: { x: 24, y: 24 },
                width: HINT_CARD_WIDTH,
                arrowLeft: 36,
            });
            return;
        }

        const rect = flowSurfaceRef.current.getBoundingClientRect();
        const rawX = event.clientX - rect.left;
        const rawY = event.clientY - rect.top;
        const width = Math.min(HINT_CARD_WIDTH, Math.max(280, rect.width - 32));
        const x = Math.min(Math.max(rawX + 20, 16), Math.max(16, rect.width - width - 16));
        const y = Math.min(Math.max(rawY + 18, 16), Math.max(16, rect.height - HINT_CARD_MAX_HEIGHT - 16));
        const arrowLeft = Math.min(Math.max(rawX - x, 28), width - 28);

        setActiveHint((current) => {
            if (current?.id === node.id) {
                return null;
            }

            return {
                id: node.id,
                detail,
                position: { x, y },
                width,
                arrowLeft,
            };
        });
    };

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
            <div className="flex flex-col gap-3 mb-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-xs text-text-muted">
                    Luồng hiển thị theo cây: Khách hàng → Hợp đồng → Dự án → Công việc → Đầu việc. Nhấn vào node để xem chú thích ngay tại vị trí bấm.
                </div>
                <Link href={route('crm.index')} className="rounded-xl bg-primary text-white px-4 py-2 text-xs font-semibold">
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
                    <div
                        ref={flowSurfaceRef}
                        className="relative h-[80vh] min-h-[700px] bg-white rounded-2xl border border-slate-200/80 shadow-card overflow-hidden"
                    >
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            fitView
                            fitViewOptions={{ padding: 0.2, minZoom: 0.5 }}
                            nodesDraggable={false}
                            nodesConnectable={false}
                            minZoom={0.35}
                            maxZoom={1.4}
                            onNodeClick={openHintAtCursor}
                            onPaneClick={() => setActiveHint(null)}
                            defaultEdgeOptions={{ animated: false, type: 'smoothstep' }}
                            zoomOnDoubleClick={false}
                        >
                            <Background color="#e2e8f0" gap={28} />
                            <Controls showInteractive={false} />
                        </ReactFlow>

                        {activeHint && (
                            <div className="pointer-events-none absolute inset-0 z-20">
                                <FloatingDetailHint hint={activeHint} onClose={() => setActiveHint(null)} />
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 space-y-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-text-subtle">Timeline mốc chính</p>
                            <p className="text-sm text-text-muted mt-1">
                                Giữ khung này để theo dõi timeline, còn chi tiết node nằm ở chú thích ngay trong sơ đồ.
                            </p>
                        </div>

                        <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
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
            )}
        </PageContainer>
    );
}
