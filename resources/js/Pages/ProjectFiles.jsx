import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

const formatSize = (size) => {
  if (!size) return '0 KB';
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

export default function ProjectFiles(props) {
  const toast = useToast();
  const projectId = props.projectId;
  const [items, setItems] = useState([]);
  const [parentId, setParentId] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [trashMode, setTrashMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [uploading, setUploading] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/v1/projects/${projectId}/files`, {
        params: {
          parent_id: parentId,
          trash: trashMode ? 1 : 0,
        },
      });
      setItems(res.data?.data || []);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không tải được kho dự án.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId, trashMode]);

  const enterFolder = (item) => {
    setBreadcrumbs((prev) => [...prev, item]);
    setParentId(item.id);
  };

  const goRoot = () => {
    setBreadcrumbs([]);
    setParentId(null);
  };

  const goBreadcrumb = (index) => {
    if (index < 0) {
      goRoot();
      return;
    }
    const next = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(next);
    setParentId(next[next.length - 1]?.id || null);
  };

  const createFolder = async () => {
    if (!folderName.trim()) return;
    setCreatingFolder(true);
    try {
      await axios.post(`/api/v1/projects/${projectId}/files/folder`, {
        name: folderName.trim(),
        parent_id: parentId,
      });
      setFolderName('');
      toast.success('Đã tạo thư mục.');
      fetchItems();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không tạo được thư mục.');
    } finally {
      setCreatingFolder(false);
    }
  };

  const uploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const data = new FormData();
      data.append('file', file);
      if (parentId) data.append('parent_id', parentId);
      await axios.post(`/api/v1/projects/${projectId}/files/upload`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Đã tải lên.');
      fetchItems();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Tải lên thất bại.');
    } finally {
      setUploading(false);
    }
  };

  const moveToTrash = async (item) => {
    try {
      await axios.post(`/api/v1/projects/${projectId}/files/${item.id}/trash`);
      toast.success('Đã chuyển vào thùng rác.');
      fetchItems();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không thể xóa.');
    }
  };

  const restore = async (item) => {
    try {
      await axios.post(`/api/v1/projects/${projectId}/files/${item.id}/restore`);
      toast.success('Đã khôi phục.');
      fetchItems();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không thể khôi phục.');
    }
  };

  const removeForever = async (item) => {
    if (!confirm('Xóa vĩnh viễn mục này?')) return;
    try {
      await axios.delete(`/api/v1/projects/${projectId}/files/${item.id}`);
      toast.success('Đã xóa vĩnh viễn.');
      fetchItems();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không thể xóa vĩnh viễn.');
    }
  };

  const crumbLabel = useMemo(() => {
    if (!breadcrumbs.length) return 'Thư mục gốc';
    return breadcrumbs.map((b) => b.name).join(' / ');
  }, [breadcrumbs]);

  return (
    <PageContainer
      auth={props.auth}
      title="Kho dự án"
      description="Quản lý thư mục, file và thùng rác của dự án."
    >
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-text-muted">{crumbLabel}</div>
          <div className="flex items-center gap-2">
            <button
              className={`rounded-full px-3 py-1 text-xs font-semibold ${trashMode ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
              onClick={() => setTrashMode((s) => !s)}
              type="button"
            >
              {trashMode ? 'Đang xem thùng rác' : 'Thùng rác'}
            </button>
            <button className="text-xs text-primary font-semibold" onClick={fetchItems} type="button">Tải lại</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button className="text-xs text-primary font-semibold" onClick={goRoot} type="button">Về gốc</button>
          {breadcrumbs.map((b, idx) => (
            <button key={b.id} className="text-xs text-slate-600" onClick={() => goBreadcrumb(idx)} type="button">
              / {b.name}
            </button>
          ))}
        </div>

        {!trashMode && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-2xl border border-slate-200/80 px-3 py-2 text-sm"
                placeholder="Tên thư mục"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
              />
              <button
                className="rounded-2xl bg-primary text-white px-4 py-2 text-sm font-semibold"
                disabled={creatingFolder}
                onClick={createFolder}
                type="button"
              >
                {creatingFolder ? 'Đang tạo...' : 'Tạo thư mục'}
              </button>
            </div>
            <div>
              <input
                type="file"
                onChange={(e) => uploadFile(e.target.files?.[0])}
                className="block w-full text-sm"
                disabled={uploading}
              />
            </div>
          </div>
        )}

        {loading && <p className="text-sm text-text-muted">Đang tải...</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-text-muted">Chưa có dữ liệu.</p>
        )}
        <div className="divide-y divide-slate-100">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${item.is_folder ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-600'}`}>
                  {item.is_folder ? '📁' : '📄'}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{item.name}</p>
                  <p className="text-xs text-text-muted">{item.is_folder ? 'Thư mục' : formatSize(item.size)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {!trashMode && item.is_folder && (
                  <button className="text-primary font-semibold" onClick={() => enterFolder(item)} type="button">Mở</button>
                )}
                {!trashMode && !item.is_folder && item.path && (
                  <a className="text-primary font-semibold" href={`/storage/${item.path}`} target="_blank" rel="noreferrer">Tải về</a>
                )}
                {!trashMode && (
                  <button className="text-rose-600 font-semibold" onClick={() => moveToTrash(item)} type="button">Xóa</button>
                )}
                {trashMode && (
                  <>
                    <button className="text-primary font-semibold" onClick={() => restore(item)} type="button">Khôi phục</button>
                    <button className="text-rose-600 font-semibold" onClick={() => removeForever(item)} type="button">Xóa vĩnh viễn</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
