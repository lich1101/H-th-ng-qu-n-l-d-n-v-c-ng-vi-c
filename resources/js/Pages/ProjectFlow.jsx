import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

const statusLabel = (value) => {
  switch ((value || '').toString()) {
    case 'moi_tao':
      return 'Mới tạo';
    case 'dang_trien_khai':
      return 'Đang triển khai';
    case 'cho_duyet':
      return 'Chờ duyệt';
    case 'hoan_thanh':
      return 'Hoàn thành';
    case 'tam_dung':
      return 'Tạm dừng';
    case 'todo':
      return 'Cần làm';
    case 'doing':
      return 'Đang làm';
    case 'done':
      return 'Hoàn tất';
    case 'blocked':
      return 'Bị chặn';
    default:
      return value || '—';
  }
};

const colorByStatus = (value) => {
  const key = (value || '').toString();
  if (['dang_trien_khai', 'doing'].includes(key)) return '#22C55E';
  if (['cho_duyet', 'pending'].includes(key)) return '#F59E0B';
  if (['blocked', 'tam_dung'].includes(key)) return '#EF4444';
  if (['hoan_thanh', 'done'].includes(key)) return '#64748B';
  return '#3B82F6';
};

const formatDate = (raw) => {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } catch {
    return String(raw).slice(0, 10);
  }
};

export default function ProjectFlow(props) {
  const toast = useToast();
  const projectId = props.projectId;
  const [data, setData] = useState(null);

  const fetchData = async () => {
    try {
      const res = await axios.get(`/api/v1/projects/${projectId}/flow`);
      setData(res.data || null);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không tải được luồng dự án.');
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };

    const nodes = [];
    const edges = [];

    const contract = data.contract;
    const project = data.project;
    const tasks = data.tasks || [];
    const items = data.items || [];

    const pushNode = (id, label, status, progress, x, y, extra = {}) => {
      nodes.push({
        id,
        position: { x, y },
        data: { label, ...extra },
        style: {
          border: `1px solid ${colorByStatus(status)}`,
          borderRadius: 16,
          padding: 12,
          width: 220,
          background: '#ffffff',
          boxShadow: '0 6px 24px rgba(15, 23, 42, 0.08)',
        },
        sourcePosition: 'bottom',
        targetPosition: 'top',
      });
    };

    const contractId = contract ? `contract-${contract.id}` : 'contract-none';
    pushNode(
      contractId,
      contract ? `${contract.code || 'Hợp đồng'}\n${contract.title || ''}` : 'Chưa có hợp đồng',
      contract?.status || contract?.approval_status,
      0,
      0,
      0,
      {
        tooltip: contract
          ? `Giá trị: ${contract.value || 0}\nNgày ký: ${formatDate(contract.signed_at)}`
          : 'Chưa có hợp đồng',
      }
    );

    const projectIdNode = `project-${project.id}`;
    pushNode(
      projectIdNode,
      `${project.name}\nTiến độ: ${project.progress_percent ?? 0}%`,
      project.status,
      project.progress_percent ?? 0,
      0,
      160,
      {
        tooltip: `Deadline: ${formatDate(project.deadline)}`,
      }
    );

    edges.push({
      id: `${contractId}-${projectIdNode}`,
      source: contractId,
      target: projectIdNode,
      style: { stroke: '#94A3B8', strokeWidth: 2 },
      animated: true,
    });

    const taskStartX = -((tasks.length - 1) * 260) / 2;
    tasks.forEach((task, index) => {
      const nodeId = `task-${task.id}`;
      pushNode(
        nodeId,
        `${task.title}\n${task.progress_percent ?? 0}%`,
        task.status,
        task.progress_percent ?? 0,
        taskStartX + index * 260,
        340,
        {
          tooltip: `Deadline: ${formatDate(task.deadline)}\nTrạng thái: ${statusLabel(task.status)}`,
        }
      );
      edges.push({
        id: `${projectIdNode}-${nodeId}`,
        source: projectIdNode,
        target: nodeId,
        style: { stroke: '#CBD5F5', strokeWidth: 2 },
      });
    });

    const itemsByTask = items.reduce((acc, item) => {
      acc[item.task_id] = acc[item.task_id] || [];
      acc[item.task_id].push(item);
      return acc;
    }, {});

    tasks.forEach((task, taskIndex) => {
      const list = itemsByTask[task.id] || [];
      const baseX = taskStartX + taskIndex * 260;
      const itemStartX = baseX - ((list.length - 1) * 240) / 2;
      list.forEach((item, idx) => {
        const itemId = `item-${item.id}`;
        const assigneeName = item.assignee?.name || 'Chưa phân';
        pushNode(
          itemId,
          `${item.title}\n${item.progress_percent ?? 0}%`,
          item.status,
          item.progress_percent ?? 0,
          itemStartX + idx * 240,
          520,
          {
            tooltip: `Bắt đầu: ${formatDate(item.start_date)}\nDeadline: ${formatDate(item.deadline)}`,
          }
        );
        edges.push({
          id: `task-${task.id}-item-${item.id}`,
          source: `task-${task.id}`,
          target: itemId,
          style: { stroke: '#E2E8F0', strokeWidth: 1.5 },
        });

        const userNodeId = `user-${item.id}`;
        pushNode(
          userNodeId,
          `Nhân sự\n${assigneeName}`,
          'active',
          0,
          itemStartX + idx * 240,
          700,
          {
            tooltip: `Phụ trách: ${assigneeName}`,
          }
        );
        edges.push({
          id: `item-${item.id}-user-${item.id}`,
          source: itemId,
          target: userNodeId,
          style: { stroke: '#E2E8F0', strokeDasharray: '4 4' },
          animated: item.status !== 'done',
        });
      });
    });

    return { nodes, edges };
  }, [data]);

  return (
    <PageContainer
      auth={props.auth}
      title="Luồng dự án"
      description="Theo dõi luồng hợp đồng → dự án → công việc → đầu việc → nhân sự."
    >
      <div className="h-[70vh] bg-white rounded-2xl border border-slate-200/80 shadow-card">
        <ReactFlow
          nodes={nodes.map((n) => ({
            ...n,
            data: { label: n.data.label, tooltip: n.data.tooltip },
            draggable: true,
          }))}
          edges={edges}
          fitView
          nodesDraggable
          nodesConnectable={false}
          onNodeClick={(_, node) => {
            if (node?.data?.tooltip) {
              toast.success(node.data.tooltip);
            }
          }}
          nodeTypes={{}}
          defaultEdgeOptions={{ animated: false }}
        >
          <Background color="#e2e8f0" gap={24} />
          <Controls />
        </ReactFlow>
      </div>
    </PageContainer>
  );
}
