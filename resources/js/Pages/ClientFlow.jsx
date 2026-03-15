import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link } from '@inertiajs/inertia-react';
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
    client: '#2563EB',
    contract: '#10B981',
    project: '#8B5CF6',
    task: '#F59E0B',
    item: '#0EA5E9',
};

const NODE_SIZES = {
    client: { width: 280, height: 120 },
    contract: { width: 250, height: 102 },
    project: { width: 240, height: 98 },
    task: { width: 232, height: 94 },
    item: { width: 220, height: 92 },
};

const INACTIVE_STATUSES = new Set([
    'cancelled',
    'canceled',
    'void',
    'rejected',
    'tam_dung',
    'paused',
    'stop',
    'hoan_thanh',
    'completed',
    'done',
    'closed',
]);

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

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const statusLabel = (value) => LABELS[normalizeStatus(value)] || value || '—';

const statusColor = (value) => {
    const key = normalizeStatus(value);
    if (['dang_trien_khai', 'doing', 'active', 'success', 'paid'].includes(key)) return '#10B981';
    if (['cho_duyet', 'pending', 'waiting'].includes(key)) return '#F59E0B';
    if (['blocked', 'tam_dung', 'paused', 'overdue'].includes(key)) return '#EF4444';
    if (['hoan_thanh', 'done', 'completed', 'closed'].includes(key)) return '#64748B';
    if (['rejected', 'cancelled', 'canceled', 'void'].includes(key)) return '#94A3B8';
    return '#2563EB';
};

const isActiveStatus = (status) => {
    if (!status) return true;
    return !INACTIVE_STATUSES.has(normalizeStatus(status));
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

const truncateText = (ctx, text, maxWidth) => {
    const raw = String(text || '');
    if (!raw) return '';
    if (ctx.measureText(raw).width <= maxWidth) return raw;
    let trimmed = raw;
    while (trimmed.length > 0 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
        trimmed = trimmed.slice(0, -1);
    }
    return `${trimmed}…`;
};

const buildGraph = (flow) => {
    const nodes = [];
    const edges = [];
    const nodeMap = new Map();

    const pushNode = (node) => {
        nodes.push(node);
        nodeMap.set(node.id, node);
    };

    const clientId = `client-${flow.client.id}`;
    const clientActive = flow.client.has_purchased || Number(flow.client.total_revenue || 0) > 0;

    pushNode({
        id: clientId,
        type: 'client',
        label: flow.client.name || 'Khách hàng',
        lines: [
            flow.client.company || 'Khách hàng tiềm năng',
            clientActive ? `Đã mua • ${formatCurrency(flow.client.total_revenue)} VNĐ` : 'Tiềm năng',
        ],
        status: clientActive ? 'active' : 'lead',
        statusLabel: clientActive ? 'Đã mua' : 'Tiềm năng',
        active: clientActive,
        accent: statusColor(clientActive ? 'active' : 'lead'),
        meta: {
            'Doanh thu': `${formatCurrency(flow.client.total_revenue)} VNĐ`,
            'Nguồn': [flow.client.lead_source, flow.client.lead_channel].filter(Boolean).join(' • ') || '—',
        },
    });

    flow.contracts.forEach((contract) => {
        const statusLabelText = statusLabel(contract.status || contract.approval_status);
        const active = isActiveStatus(contract.status) && contract.approval_status !== 'rejected';
        const accentColor = statusColor(contract.status || contract.approval_status);
        const nodeId = `contract-${contract.id}`;
        pushNode({
            id: nodeId,
            type: 'contract',
            label: contract.title || contract.code || `Hợp đồng #${contract.id}`,
            lines: [
                `Giá trị: ${formatCurrency(contract.value)} VNĐ`,
                `Trạng thái: ${statusLabelText}`,
            ],
            status: contract.status,
            statusLabel: statusLabelText,
            deadline: contract.end_date,
            active,
            accent: accentColor,
            meta: {
                'Mã hợp đồng': contract.code || `#${contract.id}`,
                'Trạng thái': statusLabelText,
                'Giá trị': `${formatCurrency(contract.value)} VNĐ`,
                'Ngày ký': contract.signed_at ? formatDate(contract.signed_at) : '—',
                'Deadline': contract.end_date ? formatDate(contract.end_date) : '—',
            },
        });
        edges.push({
            from: clientId,
            to: nodeId,
            active,
        });
    });

    flow.projects.forEach((project) => {
        const statusLabelText = statusLabel(project.status);
        const active = isActiveStatus(project.status);
        const serviceLabel = project.service_type === 'khac'
            ? project.service_type_other || 'Khác'
            : SERVICE_LABELS[project.service_type] || project.service_type || '—';
        const accentColor = statusColor(project.status);
        const nodeId = `project-${project.id}`;
        pushNode({
            id: nodeId,
            type: 'project',
            label: project.name || `Dự án #${project.id}`,
            lines: [
                `Dịch vụ: ${serviceLabel}`,
                `Deadline: ${project.deadline ? formatDate(project.deadline) : '—'}`,
            ],
            status: project.status,
            statusLabel: statusLabelText,
            deadline: project.deadline,
            active,
            accent: accentColor,
            meta: {
                'Trạng thái': statusLabelText,
                'Dịch vụ': serviceLabel,
                'Deadline': project.deadline ? formatDate(project.deadline) : '—',
            },
        });

        const parent = project.contract_id ? `contract-${project.contract_id}` : clientId;
        edges.push({
            from: parent,
            to: nodeId,
            active,
        });
    });

    flow.tasks.forEach((task) => {
        const statusLabelText = statusLabel(task.status);
        const active = isActiveStatus(task.status);
        const assigneeName = task.assignee?.name || 'Chưa phân';
        const accentColor = statusColor(task.status);
        const nodeId = `task-${task.id}`;
        pushNode({
            id: nodeId,
            type: 'task',
            label: task.title || `Công việc #${task.id}`,
            lines: [
                `Phụ trách: ${assigneeName}`,
                `Deadline: ${task.deadline ? formatDate(task.deadline) : '—'}`,
            ],
            status: task.status,
            statusLabel: statusLabelText,
            deadline: task.deadline,
            active,
            accent: accentColor,
            meta: {
                'Trạng thái': statusLabelText,
                'Phụ trách': assigneeName,
                'Phòng ban': task.department?.name || '—',
                'Deadline': task.deadline ? formatDate(task.deadline) : '—',
            },
        });

        edges.push({
            from: `project-${task.project_id}`,
            to: nodeId,
            active,
        });
    });

    flow.items.forEach((item) => {
        const statusLabelText = statusLabel(item.status);
        const active = isActiveStatus(item.status);
        const assigneeName = item.assignee?.name || 'Chưa phân';
        const accentColor = statusColor(item.status);
        const nodeId = `item-${item.id}`;
        pushNode({
            id: nodeId,
            type: 'item',
            label: item.title || `Đầu việc #${item.id}`,
            lines: [
                `Nhân sự: ${assigneeName}`,
                `Deadline: ${item.deadline ? formatDate(item.deadline) : '—'}`,
            ],
            status: item.status,
            statusLabel: statusLabelText,
            deadline: item.deadline,
            active,
            accent: accentColor,
            meta: {
                'Trạng thái': statusLabelText,
                'Nhân sự': assigneeName,
                'Deadline': item.deadline ? formatDate(item.deadline) : '—',
            },
        });
        edges.push({
            from: `task-${item.task_id}`,
            to: nodeId,
            active,
        });
    });

    return { nodes, edges, rootId: clientId, nodeMap };
};

const layoutGraph = (graph, options) => {
    const { nodes, edges, rootId } = graph;
    const { columnGap, rowGap, padding } = options;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const childrenMap = new Map();

    edges.forEach((edge) => {
        if (!childrenMap.has(edge.from)) childrenMap.set(edge.from, []);
        childrenMap.get(edge.from).push(edge.to);
    });

    const levels = [];
    const visit = (nodeId, depth) => {
        if (!levels[depth]) levels[depth] = [];
        levels[depth].push(nodeId);
        const children = childrenMap.get(nodeId) || [];
        children.forEach((childId) => visit(childId, depth + 1));
    };

    visit(rootId, 0);

    const columnWidths = levels.map((ids) => {
        return Math.max(...ids.map((id) => nodeMap.get(id)?.width || NODE_SIZES.project.width));
    });

    const totalWidth = padding * 2 + columnWidths.reduce((sum, w) => sum + w, 0) + columnGap * Math.max(columnWidths.length - 1, 0);

    const levelHeights = levels.map((ids) => {
        let sum = 0;
        ids.forEach((id) => {
            const node = nodeMap.get(id);
            sum += node?.height || 0;
        });
        return sum + rowGap * Math.max(ids.length - 1, 0);
    });

    const totalHeight = padding * 2 + Math.max(...levelHeights, 0);

    let currentX = padding;
    levels.forEach((ids, depth) => {
        const columnWidth = columnWidths[depth];
        const columnHeight = levelHeights[depth];
        let currentY = padding + Math.max(0, (totalHeight - padding * 2 - columnHeight) / 2);
        ids.forEach((id) => {
            const node = nodeMap.get(id);
            if (!node) return;
            node.x = currentX;
            node.y = currentY;
            currentY += node.height + rowGap;
        });
        currentX += columnWidth + columnGap;
    });

    return { nodes, edges, width: totalWidth, height: totalHeight };
};

const drawRoundedRect = (ctx, x, y, width, height, radius) => {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
};

export default function ClientFlow({ auth, clientId }) {
    const toast = useToast();
    const [flow, setFlow] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedId, setSelectedId] = useState('');
    const [hoveredId, setHoveredId] = useState('');
    const [tooltip, setTooltip] = useState(null);
    const [detailTab, setDetailTab] = useState('detail');
    const [graphKey, setGraphKey] = useState(0);

    const canvasRef = useRef(null);
    const wrapperRef = useRef(null);
    const graphRef = useRef({ nodes: [], edges: [], width: 0, height: 0, pan: { x: 0, y: 0 }, scale: 1 });
    const dragRef = useRef({ type: null });
    const dashOffsetRef = useRef(0);
    const animationRef = useRef(null);

    const fetchFlow = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await axios.get(`/api/v1/crm/clients/${clientId}/flow`);
            setFlow(res.data);
        } catch (e) {
            setError(e?.response?.data?.message || 'Không tải được luồng khách hàng.');
            toast.error(e?.response?.data?.message || 'Không tải được luồng khách hàng.');
        } finally {
            setLoading(false);
        }
    }, [clientId, toast]);

    const buildLayout = useCallback(() => {
        if (!flow) return;
        const graph = buildGraph(flow);
        const sized = graph.nodes.map((node) => {
            const size = NODE_SIZES[node.type] || NODE_SIZES.project;
            return { ...node, width: size.width, height: size.height };
        });
        const layout = layoutGraph(
            { ...graph, nodes: sized },
            { columnGap: 140, rowGap: 36, padding: 40 }
        );
        graphRef.current = {
            nodes: layout.nodes,
            edges: layout.edges,
            width: layout.width,
            height: layout.height,
            pan: { x: 0, y: 0 },
            scale: 1,
        };
        setGraphKey((k) => k + 1);
    }, [flow]);

    useEffect(() => {
        fetchFlow();
    }, [fetchFlow]);

    useEffect(() => {
        if (!flow) return;
        buildLayout();
    }, [flow, buildLayout]);

    const stats = useMemo(() => {
        if (!flow) return [];
        return [
            { label: 'Hợp đồng', value: String(flow.contracts.length) },
            { label: 'Dự án', value: String(flow.projects.length) },
            { label: 'Công việc', value: String(flow.tasks.length) },
            { label: 'Đầu việc', value: String(flow.items.length) },
        ];
    }, [flow]);

    const selectedNode = useMemo(() => {
        if (!selectedId) return null;
        return graphRef.current.nodes.find((node) => node.id === selectedId) || null;
    }, [selectedId, graphKey]);

    const timeline = useMemo(() => {
        if (!flow) return [];
        const items = [];
        flow.contracts.forEach((contract) => {
            if (contract.signed_at) {
                items.push({
                    id: `contract-signed-${contract.id}`,
                    date: contract.signed_at,
                    title: `Ký hợp đồng: ${contract.title || contract.code || `#${contract.id}`}`,
                    status: contract.status || contract.approval_status,
                    type: 'contract',
                });
            }
            if (contract.end_date) {
                items.push({
                    id: `contract-end-${contract.id}`,
                    date: contract.end_date,
                    title: `Deadline hợp đồng: ${contract.title || contract.code || `#${contract.id}`}`,
                    status: contract.status || contract.approval_status,
                    type: 'contract',
                });
            }
        });
        flow.projects.forEach((project) => {
            if (project.deadline) {
                items.push({
                    id: `project-${project.id}`,
                    date: project.deadline,
                    title: `Deadline dự án: ${project.name || `#${project.id}`}`,
                    status: project.status,
                    type: 'project',
                });
            }
        });
        flow.tasks.forEach((task) => {
            if (task.deadline) {
                items.push({
                    id: `task-${task.id}`,
                    date: task.deadline,
                    title: `Deadline công việc: ${task.title || `#${task.id}`}`,
                    status: task.status,
                    type: 'task',
                });
            }
        });
        flow.items.forEach((item) => {
            if (item.deadline) {
                items.push({
                    id: `item-${item.id}`,
                    date: item.deadline,
                    title: `Deadline đầu việc: ${item.title || `#${item.id}`}`,
                    status: item.status,
                    type: 'item',
                });
            }
        });
        return items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [flow]);

    const resizeCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const wrapper = wrapperRef.current;
        if (!canvas || !wrapper) return;
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(wrapper.clientWidth, graphRef.current.width || 0);
        const height = Math.max(wrapper.clientHeight, graphRef.current.height || 0);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }, []);

    const fitToView = useCallback(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        const graph = graphRef.current;
        const availableW = wrapper.clientWidth;
        const availableH = wrapper.clientHeight;
        if (!graph.width || !graph.height) return;
        const scale = Math.min(availableW / graph.width, availableH / graph.height, 1);
        graph.scale = Math.max(0.55, Math.min(scale, 1));
        graph.pan.x = (availableW - graph.width * graph.scale) / 2;
        graph.pan.y = (availableH - graph.height * graph.scale) / 2;
        drawGraph();
    }, [drawGraph]);

    const drawGraph = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(0, 0, width, height);

        const { nodes, edges, pan, scale } = graphRef.current;
        const nodeMap = new Map(nodes.map((node) => [node.id, node]));

        ctx.save();
        ctx.translate(pan.x, pan.y);
        ctx.scale(scale || 1, scale || 1);

        edges.forEach((edge) => {
            const from = nodeMap.get(edge.from);
            const to = nodeMap.get(edge.to);
            if (!from || !to) return;

            const startX = from.x + from.width;
            const startY = from.y + from.height / 2;
            const endX = to.x;
            const endY = to.y + to.height / 2;
            const midX = startX + (endX - startX) * 0.5;

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.bezierCurveTo(midX, startY, midX, endY, endX, endY);
            const activeColor = to?.accent || '#22C55E';
            ctx.strokeStyle = edge.active ? activeColor : '#CBD5E1';
            ctx.lineWidth = edge.active ? 2.5 : 1.5;
            ctx.setLineDash(edge.active ? [10, 6] : []);
            ctx.lineDashOffset = edge.active ? -dashOffsetRef.current : 0;
            ctx.stroke();

            ctx.setLineDash([]);
            ctx.fillStyle = edge.active ? activeColor : '#CBD5E1';
            ctx.beginPath();
            ctx.arc(endX, endY, 3.5, 0, Math.PI * 2);
            ctx.fill();
        });

        nodes.forEach((node) => {
            const isSelected = node.id === selectedId;
            const isHovered = node.id === hoveredId;
            const isHighlighted = isSelected || isHovered;
            ctx.save();
            ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
            ctx.shadowBlur = 12;
            ctx.shadowOffsetY = 6;
            ctx.fillStyle = '#FFFFFF';
            drawRoundedRect(ctx, node.x, node.y, node.width, node.height, 16);
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = isHighlighted ? '#2563EB' : '#E2E8F0';
            ctx.lineWidth = isHighlighted ? 2 : 1;
            drawRoundedRect(ctx, node.x, node.y, node.width, node.height, 16);
            ctx.stroke();

            ctx.fillStyle = node.accent || TYPE_COLORS[node.type] || '#94A3B8';
            drawRoundedRect(ctx, node.x + 10, node.y + 12, 5, node.height - 24, 10);
            ctx.fill();

            ctx.fillStyle = node.active ? (node.accent || '#22C55E') : '#CBD5E1';
            ctx.beginPath();
            ctx.arc(node.x + node.width - 18, node.y + 18, 6, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#64748B';
            ctx.font = '600 11px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
            ctx.fillText(TYPE_LABELS[node.type] || node.type, node.x + 22, node.y + 20);

            ctx.fillStyle = '#0F172A';
            ctx.font = '600 15px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
            ctx.fillText(truncateText(ctx, node.label, node.width - 40), node.x + 22, node.y + 44);

            ctx.fillStyle = '#475569';
            ctx.font = '12px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
            const line1 = node.lines?.[0] || '';
            const line2 = node.lines?.[1] || '';
            if (line1) {
                ctx.fillText(truncateText(ctx, line1, node.width - 40), node.x + 22, node.y + 66);
            }
            if (line2) {
                ctx.fillText(truncateText(ctx, line2, node.width - 40), node.x + 22, node.y + 86);
            }
        });

        ctx.restore();
    }, [selectedId, hoveredId]);

    useEffect(() => {
        resizeCanvas();
        drawGraph();
        requestAnimationFrame(() => {
            fitToView();
        });
    }, [graphKey, resizeCanvas, drawGraph, fitToView]);

    useEffect(() => {
        if (!wrapperRef.current) return undefined;
        const observer = new ResizeObserver(() => {
            resizeCanvas();
            fitToView();
        });
        observer.observe(wrapperRef.current);
        return () => observer.disconnect();
    }, [resizeCanvas, fitToView]);

    useEffect(() => {
        const animate = () => {
            dashOffsetRef.current = (dashOffsetRef.current + 1) % 200;
            drawGraph();
            animationRef.current = requestAnimationFrame(animate);
        };
        animationRef.current = requestAnimationFrame(animate);
        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [drawGraph]);

    const getPoint = (event) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        return {
            x: (x - graphRef.current.pan.x) / (graphRef.current.scale || 1),
            y: (y - graphRef.current.pan.y) / (graphRef.current.scale || 1),
        };
    };

    const hitTest = (point) => {
        const nodes = graphRef.current.nodes;
        for (let i = nodes.length - 1; i >= 0; i -= 1) {
            const node = nodes[i];
            if (
                point.x >= node.x &&
                point.x <= node.x + node.width &&
                point.y >= node.y &&
                point.y <= node.y + node.height
            ) {
                return node;
            }
        }
        return null;
    };

    const handlePointerDown = (event) => {
        const point = getPoint(event);
        const node = hitTest(point);
        setTooltip(null);
        setHoveredId(node ? node.id : '');
        if (node) {
            setSelectedId(node.id);
            dragRef.current = {
                type: 'node',
                nodeId: node.id,
                offsetX: point.x - node.x,
                offsetY: point.y - node.y,
            };
        } else {
            dragRef.current = {
                type: 'pan',
                startX: event.clientX,
                startY: event.clientY,
                panX: graphRef.current.pan.x,
                panY: graphRef.current.pan.y,
            };
        }
    };

    const handlePointerMove = (event) => {
        if (!dragRef.current.type) {
            const point = getPoint(event);
            const node = hitTest(point);
            if (!wrapperRef.current) return;
            if (!node) {
                if (hoveredId) setHoveredId('');
                if (tooltip) setTooltip(null);
                return;
            }
            const rect = wrapperRef.current.getBoundingClientRect();
            const tooltipWidth = 260;
            const tooltipHeight = 150;
            let x = event.clientX - rect.left + 12;
            let y = event.clientY - rect.top + 12;
            if (x + tooltipWidth > rect.width) x = rect.width - tooltipWidth - 12;
            if (y + tooltipHeight > rect.height) y = rect.height - tooltipHeight - 12;
            setHoveredId(node.id);
            setTooltip({
                x,
                y,
                node,
            });
            return;
        }
        setTooltip(null);
        if (dragRef.current.type === 'node') {
            const point = getPoint(event);
            const node = graphRef.current.nodes.find((n) => n.id === dragRef.current.nodeId);
            if (!node) return;
            node.x = point.x - dragRef.current.offsetX;
            node.y = point.y - dragRef.current.offsetY;
            drawGraph();
        } else if (dragRef.current.type === 'pan') {
            const dx = event.clientX - dragRef.current.startX;
            const dy = event.clientY - dragRef.current.startY;
            graphRef.current.pan.x = dragRef.current.panX + dx;
            graphRef.current.pan.y = dragRef.current.panY + dy;
            drawGraph();
        }
    };

    const handlePointerUp = () => {
        dragRef.current = { type: null };
        setHoveredId('');
        setTooltip(null);
    };

    const resetLayout = () => {
        buildLayout();
        setSelectedId('');
    };

    const zoomTo = (nextScale, anchorX, anchorY) => {
        const graph = graphRef.current;
        const scale = graph.scale || 1;
        const clamped = Math.max(0.55, Math.min(nextScale, 1.6));
        const worldX = (anchorX - graph.pan.x) / scale;
        const worldY = (anchorY - graph.pan.y) / scale;
        graph.scale = clamped;
        graph.pan.x = anchorX - worldX * clamped;
        graph.pan.y = anchorY - worldY * clamped;
        drawGraph();
    };

    const zoomBy = (delta, anchorOverride) => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        const rect = wrapper.getBoundingClientRect();
        const anchorX = anchorOverride?.x ?? rect.width / 2;
        const anchorY = anchorOverride?.y ?? rect.height / 2;
        zoomTo((graphRef.current.scale || 1) + delta, anchorX, anchorY);
    };

    const handleWheel = (event) => {
        event.preventDefault();
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        const rect = wrapper.getBoundingClientRect();
        const anchorX = event.clientX - rect.left;
        const anchorY = event.clientY - rect.top;
        const delta = event.deltaY > 0 ? -0.08 : 0.08;
        zoomBy(delta, { x: anchorX, y: anchorY });
    };

    return (
        <PageContainer
            auth={auth}
            title="Luồng khách hàng"
            description={flow?.client?.name ? `Luồng xử lý cho ${flow.client.name}` : 'Theo dõi hành trình khách hàng.'}
            stats={stats}
        >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-3 text-xs text-text-muted">
                    <span className="inline-flex items-center gap-2">
                        <span className="w-8 border-t-2 border-dashed border-emerald-500" />
                        Đang hoạt động
                    </span>
                    <span className="inline-flex items-center gap-2">
                        <span className="w-8 border-t-2 border-slate-300" />
                        Không hoạt động
                    </span>
                    <span className="text-text-subtle">Kéo thả khối hoặc kéo nền để di chuyển</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                        onClick={resetLayout}
                    >
                        Reset bố cục
                    </button>
                    <Link
                        href={route('crm.index')}
                        className="rounded-xl bg-primary text-white px-4 py-2 text-xs font-semibold"
                    >
                        Quay lại khách hàng
                    </Link>
                </div>
            </div>

            {loading && (
                <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-text-muted">
                    Đang tải luồng khách hàng...
                </div>
            )}

            {!loading && error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-600">
                    {error}
                </div>
            )}

            {!loading && !error && flow && (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-4 relative">
                        <div className="absolute right-6 top-6 z-10 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/90 p-2 shadow-sm">
                            <button
                                type="button"
                                className="h-9 w-9 rounded-xl border border-slate-200 text-lg font-semibold text-slate-700 hover:bg-slate-50"
                                onClick={() => zoomBy(0.12)}
                            >
                                +
                            </button>
                            <button
                                type="button"
                                className="h-9 w-9 rounded-xl border border-slate-200 text-lg font-semibold text-slate-700 hover:bg-slate-50"
                                onClick={() => zoomBy(-0.12)}
                            >
                                −
                            </button>
                            <button
                                type="button"
                                className="rounded-xl border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600"
                                onClick={fitToView}
                            >
                                Fit
                            </button>
                            <div className="text-[11px] text-center text-text-subtle">
                                {Math.round((graphRef.current.scale || 1) * 100)}%
                            </div>
                        </div>
                        <div
                            ref={wrapperRef}
                            className="relative h-[70vh] min-h-[520px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                        >
                            <canvas
                                ref={canvasRef}
                                onPointerDown={handlePointerDown}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerLeave={handlePointerUp}
                                onWheel={handleWheel}
                                className="block"
                                style={{ touchAction: 'none' }}
                            />
                            {tooltip?.node && (
                                <div
                                    className="absolute z-20 w-64 rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl"
                                    style={{ left: tooltip.x, top: tooltip.y, pointerEvents: 'none' }}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] uppercase tracking-[0.2em] text-text-subtle">
                                            {TYPE_LABELS[tooltip.node.type] || tooltip.node.type}
                                        </span>
                                        <span
                                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                                            style={{ backgroundColor: tooltip.node.accent || '#2563EB' }}
                                        >
                                            {tooltip.node.statusLabel || tooltip.node.status || '—'}
                                        </span>
                                    </div>
                                    <p className="mt-2 text-sm font-semibold text-slate-900">{tooltip.node.label}</p>
                                    {tooltip.node.lines?.map((line, idx) => (
                                        <p key={`${tooltip.node.id}-tip-${idx}`} className="text-xs text-text-muted">
                                            {line}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 space-y-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-text-subtle">Chi tiết</p>
                            <h3 className="text-lg font-semibold text-slate-900">Thông tin & Timeline</h3>
                            <p className="text-xs text-text-muted mt-1">
                                Xem nhanh thông tin khối hoặc timeline các mốc quan trọng.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                                    detailTab === 'detail'
                                        ? 'bg-primary text-white'
                                        : 'border border-slate-200 text-slate-600'
                                }`}
                                onClick={() => setDetailTab('detail')}
                            >
                                Chi tiết khối
                            </button>
                            <button
                                type="button"
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                                    detailTab === 'timeline'
                                        ? 'bg-primary text-white'
                                        : 'border border-slate-200 text-slate-600'
                                }`}
                                onClick={() => setDetailTab('timeline')}
                            >
                                Timeline
                            </button>
                        </div>

                        {detailTab === 'detail' && (
                            <>
                                {selectedNode ? (
                                    <div className="space-y-3 text-sm">
                                        <div className="rounded-xl border border-slate-200 p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-xs uppercase tracking-wide text-text-subtle">
                                                    {TYPE_LABELS[selectedNode.type] || selectedNode.type}
                                                </p>
                                                <span
                                                    className="rounded-full px-2 py-1 text-[10px] font-semibold text-white"
                                                    style={{ backgroundColor: selectedNode.accent || '#2563EB' }}
                                                >
                                                    {selectedNode.statusLabel || selectedNode.status || '—'}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-base font-semibold text-slate-900">{selectedNode.label}</p>
                                            {selectedNode.lines?.map((line, idx) => (
                                                <p key={`${selectedNode.id}-line-${idx}`} className="text-xs text-text-muted">
                                                    {line}
                                                </p>
                                            ))}
                                        </div>
                                        <div className="space-y-2">
                                            {selectedNode.meta &&
                                                Object.entries(selectedNode.meta).map(([label, value]) => (
                                                    <div key={label} className="flex items-start justify-between gap-3 text-xs text-slate-600">
                                                        <span className="text-text-subtle">{label}</span>
                                                        <span className="text-right font-semibold text-slate-800">{value || '—'}</span>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-text-muted">
                                        Chưa chọn khối nào.
                                    </div>
                                )}
                            </>
                        )}

                        {detailTab === 'timeline' && (
                            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                                {timeline.length ? (
                                    timeline.map((item) => (
                                        <div key={item.id} className="flex items-start gap-3">
                                            <span
                                                className="mt-1 h-2.5 w-2.5 rounded-full"
                                                style={{ backgroundColor: statusColor(item.status) }}
                                            />
                                            <div className="flex-1">
                                                <div className="text-[11px] uppercase tracking-[0.2em] text-text-subtle">
                                                    {formatDate(item.date)} • {TYPE_LABELS[item.type]}
                                                </div>
                                                <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                                                <div className="text-xs text-text-muted">
                                                    {statusLabel(item.status)}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-text-muted">
                                        Chưa có mốc timeline.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </PageContainer>
    );
}
