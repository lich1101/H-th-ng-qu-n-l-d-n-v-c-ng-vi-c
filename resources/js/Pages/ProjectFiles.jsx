import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import PageContainer from '@/Components/PageContainer';
import { useToast } from '@/Contexts/ToastContext';

const formatSize = (size) => {
  if (!size) return '0 KB';
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
};

const formatDateTime = (raw) => {
  if (!raw) return '—';
  try {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return raw;
  }
};

const kindLabel = (item) => {
  if (item.is_folder) return 'Thư mục';
  if (item.mime_type?.includes('image')) return 'Hình ảnh';
  if (item.mime_type?.includes('pdf')) return 'Tài liệu PDF';
  if (item.extension) return `Tệp ${item.extension.toUpperCase()}`;
  return 'Tài liệu';
};

function FolderIcon({ muted = false }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`h-5 w-5 ${muted ? 'text-slate-500' : 'text-sky-600'}`}>
      <path d="M3 7.75A2.75 2.75 0 0 1 5.75 5h3.17c.6 0 1.18.24 1.6.66l1.02 1.02c.42.42 1 .66 1.6.66h5.11A2.75 2.75 0 0 1 21 10.09v6.16A2.75 2.75 0 0 1 18.25 19H5.75A2.75 2.75 0 0 1 3 16.25V7.75Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.75 9.5h16.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-slate-500">
      <path d="M8 3.75h5.68c.53 0 1.04.21 1.41.59l3.57 3.57c.38.37.59.88.59 1.41V19A1.75 1.75 0 0 1 17.5 20.75h-9A1.75 1.75 0 0 1 6.75 19V5.5A1.75 1.75 0 0 1 8.5 3.75Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 3.75V8a1 1 0 0 0 1 1h4.25" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function ToolbarButton({ active = false, onClick, children, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
        active
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

export default function ProjectFiles(props) {
  const toast = useToast();
  const projectId = props.projectId;
  const fileInputRef = useRef(null);

  const [items, setItems] = useState([]);
  const [parentId, setParentId] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [trashMode, setTrashMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState(null);

  const currentFolder = breadcrumbs[breadcrumbs.length - 1] || null;

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
    setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId, trashMode]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [contextMenu]);

  const breadcrumbLabel = useMemo(() => {
    if (!breadcrumbs.length) return 'Kho dự án';
    return breadcrumbs.map((item) => item.name).join(' / ');
  }, [breadcrumbs]);

  const enterFolder = (item) => {
    if (!item?.is_folder) return;
    setBreadcrumbs((prev) => [...prev, item]);
    setParentId(item.id);
  };

  const goRoot = () => {
    setBreadcrumbs([]);
    setParentId(null);
  };

  const goUp = () => {
    if (!breadcrumbs.length) return;
    const next = breadcrumbs.slice(0, -1);
    setBreadcrumbs(next);
    setParentId(next[next.length - 1]?.id || null);
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
      toast.success('Đã tạo thư mục.');
      setFolderName('');
      fetchItems();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không tạo được thư mục.');
    } finally {
      setCreatingFolder(false);
    }
  };

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    setUploading(true);
    try {
      for (const file of files) {
        const data = new FormData();
        data.append('file', file);
        if (parentId) data.append('parent_id', parentId);
        await axios.post(`/api/v1/projects/${projectId}/files/upload`, data, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      toast.success(files.length > 1 ? 'Đã tải lên các tệp.' : 'Đã tải lên tệp.');
      fetchItems();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Tải lên thất bại.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const openItem = (item) => {
    if (!item) return;
    if (item.is_folder) {
      enterFolder(item);
      return;
    }
    if (item.public_url) {
      window.open(item.public_url, '_blank', 'noopener,noreferrer');
    }
  };

  const moveToTrash = async (item) => {
    try {
      await axios.post(`/api/v1/projects/${projectId}/files/${item.id}/trash`);
      toast.success('Đã chuyển vào thùng rác.');
      fetchItems();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không thể chuyển vào thùng rác.');
    }
  };

  const restore = async (item) => {
    try {
      await axios.post(`/api/v1/projects/${projectId}/files/${item.id}/restore`);
      toast.success('Đã khôi phục mục.');
      fetchItems();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không thể khôi phục.');
    }
  };

  const removeForever = async (item) => {
    if (!window.confirm(`Xóa vĩnh viễn "${item.name}"?`)) return;
    try {
      await axios.delete(`/api/v1/projects/${projectId}/files/${item.id}`);
      toast.success('Đã xóa vĩnh viễn.');
      fetchItems();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không thể xóa vĩnh viễn.');
    }
  };

  const duplicateItem = async (item) => {
    try {
      setContextMenu(null);
      await axios.post(`/api/v1/projects/${projectId}/files/${item.id}/duplicate`);
      toast.success('Đã nhân bản mục.');
      fetchItems();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không thể nhân bản.');
    }
  };

  const submitRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await axios.put(`/api/v1/projects/${projectId}/files/${renameTarget.id}`, {
        name: renameValue.trim(),
      });
      toast.success('Đã đổi tên.');
      setRenameTarget(null);
      setRenameValue('');
      fetchItems();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Không thể đổi tên.');
    }
  };

  const openRename = (item) => {
    setRenameTarget(item);
    setRenameValue(item.name || '');
    setContextMenu(null);
  };

  const currentStats = [
    { label: 'Vị trí', value: trashMode ? 'Thùng rác' : breadcrumbLabel },
    { label: 'Mục hiện tại', value: String(items.length) },
    { label: 'Chế độ', value: viewMode === 'grid' ? 'Lưới' : 'Danh sách' },
    { label: 'Tải tệp', value: uploading ? 'Đang tải' : 'Sẵn sàng' },
  ];

  const renderContextMenu = () => {
    if (!contextMenu?.item) return null;
    const item = contextMenu.item;

    return (
      <div
        className="fixed z-50 w-64 rounded-2xl border border-slate-200 bg-white/98 p-2 shadow-2xl backdrop-blur"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        onClick={(e) => e.stopPropagation()}
      >
        {!trashMode && (
          <>
            <button
              type="button"
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => {
                setContextMenu(null);
                openItem(item);
              }}
            >
              {item.is_folder ? 'Mở' : 'Mở ở tab mới'}
            </button>
            {!item.is_folder && item.public_url && (
              <a
                className="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                href={item.public_url}
                target="_blank"
                rel="noreferrer"
                download={item.name}
                onClick={() => setContextMenu(null)}
              >
                Tải xuống
              </a>
            )}
            <button
              type="button"
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => duplicateItem(item)}
            >
              Nhân bản
            </button>
            <button
              type="button"
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => openRename(item)}
            >
              Đổi tên
            </button>
            <button
              type="button"
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
              onClick={() => {
                setContextMenu(null);
                moveToTrash(item);
              }}
            >
              Chuyển vào thùng rác
            </button>
          </>
        )}

        {trashMode && (
          <>
            <button
              type="button"
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => {
                setContextMenu(null);
                restore(item);
              }}
            >
              Khôi phục
            </button>
            <button
              type="button"
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
              onClick={() => {
                setContextMenu(null);
                removeForever(item);
              }}
            >
              Xóa vĩnh viễn
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <PageContainer
      auth={props.auth}
      title="Kho dự án"
      description="Kho file dùng chung cho dự án, chat công việc và tài liệu triển khai."
      stats={currentStats}
    >
      <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-card">
        <div className="grid lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="border-r border-slate-200/80 bg-slate-50/80 p-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Truy cập nhanh
              </div>
              <div className="mt-3 space-y-1">
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm ${
                    !trashMode && !currentFolder ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  onClick={() => {
                    setTrashMode(false);
                    goRoot();
                  }}
                >
                  <span>Kho dự án</span>
                  <span className="text-xs opacity-70">{items.length}</span>
                </button>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm ${
                    trashMode ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  onClick={() => {
                    setTrashMode(true);
                    goRoot();
                  }}
                >
                  <span>Thùng rác</span>
                  <span className="text-xs opacity-70">{trashMode ? items.length : '—'}</span>
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Điều hướng
              </div>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <div>
                  <div className="text-xs text-slate-400">Hiện tại</div>
                  <div className="font-semibold text-slate-900">{trashMode ? 'Thùng rác' : (currentFolder?.name || 'Kho dự án')}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Đường dẫn</div>
                  <div className="leading-6">{breadcrumbLabel}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Mẹo dùng nhanh</div>
                  <div className="leading-6">
                    Nhấp đúp để mở, nhấp phải để hiện menu thao tác giống Finder.
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <section className="min-w-0 bg-[#fcfcfd]">
            <div className="border-b border-slate-200/80 bg-white/90 px-4 py-4 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Kho dự án
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900">
                    {trashMode ? 'Thùng rác' : (currentFolder?.name || 'Kho dự án')}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <ToolbarButton onClick={goRoot}>Về gốc</ToolbarButton>
                  <ToolbarButton onClick={goUp}>Lùi cấp</ToolbarButton>
                  <ToolbarButton active={viewMode === 'list'} onClick={() => setViewMode('list')}>Danh sách</ToolbarButton>
                  <ToolbarButton active={viewMode === 'grid'} onClick={() => setViewMode('grid')}>Lưới</ToolbarButton>
                  {!trashMode && (
                    <>
                      <ToolbarButton onClick={() => fileInputRef.current?.click()}>
                        {uploading ? 'Đang tải...' : 'Tải tệp'}
                      </ToolbarButton>
                      <ToolbarButton onClick={createFolder}>
                        {creatingFolder ? 'Đang tạo...' : 'Thư mục mới'}
                      </ToolbarButton>
                    </>
                  )}
                  <ToolbarButton onClick={fetchItems}>Tải lại</ToolbarButton>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => uploadFiles(e.target.files)}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <button type="button" className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700" onClick={goRoot}>
                  Gốc
                </button>
                {breadcrumbs.map((crumb, index) => (
                  <button
                    key={crumb.id}
                    type="button"
                    className="rounded-full bg-white px-3 py-1.5 font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                    onClick={() => goBreadcrumb(index)}
                  >
                    {crumb.name}
                  </button>
                ))}
              </div>

              {!trashMode && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <input
                    className="w-full max-w-sm rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm"
                    placeholder="Tên thư mục mới"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') createFolder();
                    }}
                  />
                  <div className="text-xs text-slate-500">
                    File tải lên từ chat công việc sẽ được gom trong cùng kho dự án.
                  </div>
                </div>
              )}
            </div>

            <div className="p-4">
              {loading && (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                  Đang tải dữ liệu...
                </div>
              )}

              {!loading && items.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-500">
                  {trashMode ? 'Thùng rác đang trống.' : 'Thư mục này chưa có dữ liệu.'}
                </div>
              )}

              {!loading && items.length > 0 && viewMode === 'list' && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="grid grid-cols-[minmax(0,1.6fr)_160px_120px_200px] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    <div>Tên</div>
                    <div>Loại</div>
                    <div>Dung lượng</div>
                    <div>Ngày thêm</div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {items.map((item) => {
                      const active = selectedId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`grid w-full grid-cols-[minmax(0,1.6fr)_160px_120px_200px] gap-4 px-4 py-3 text-left transition ${
                            active ? 'bg-sky-50' : 'hover:bg-slate-50'
                          }`}
                          onClick={() => setSelectedId(item.id)}
                          onDoubleClick={() => openItem(item)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setSelectedId(item.id);
                            setContextMenu({
                              item,
                              x: Math.min(e.clientX, window.innerWidth - 280),
                              y: Math.min(e.clientY, window.innerHeight - 280),
                            });
                          }}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.is_folder ? 'bg-sky-100' : 'bg-slate-100'}`}>
                              {item.is_folder ? <FolderIcon /> : <FileIcon />}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-slate-900">{item.name}</div>
                              <div className="truncate text-xs text-slate-500">
                                {item.public_url || item.path || '—'}
                              </div>
                            </div>
                          </div>
                          <div className="text-sm text-slate-600">{kindLabel(item)}</div>
                          <div className="text-sm text-slate-600">{item.is_folder ? '—' : formatSize(item.size)}</div>
                          <div className="text-sm text-slate-600">{formatDateTime(item.created_at)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {!loading && items.length > 0 && viewMode === 'grid' && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) => {
                    const active = selectedId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`rounded-2xl border p-4 text-left transition ${
                          active
                            ? 'border-sky-300 bg-sky-50'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                        onClick={() => setSelectedId(item.id)}
                        onDoubleClick={() => openItem(item)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setSelectedId(item.id);
                          setContextMenu({
                            item,
                            x: Math.min(e.clientX, window.innerWidth - 280),
                            y: Math.min(e.clientY, window.innerHeight - 280),
                          });
                        }}
                      >
                        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${item.is_folder ? 'bg-sky-100' : 'bg-slate-100'}`}>
                          {item.is_folder ? <FolderIcon /> : <FileIcon />}
                        </div>
                        <div className="mt-4 truncate font-semibold text-slate-900">{item.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{kindLabel(item)}</div>
                        <div className="mt-3 text-xs text-slate-500">{item.is_folder ? '—' : formatSize(item.size)}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatDateTime(item.created_at)}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {renderContextMenu()}

      {renameTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/35 px-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Đổi tên
            </div>
            <div className="mt-2 text-xl font-semibold text-slate-900">
              Đổi tên {renameTarget.is_folder ? 'thư mục' : 'tệp'}
            </div>
            <input
              className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename();
              }}
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-3">
              <ToolbarButton onClick={() => {
                setRenameTarget(null);
                setRenameValue('');
              }}
              >
                Hủy
              </ToolbarButton>
              <ToolbarButton active onClick={submitRename}>
                Lưu
              </ToolbarButton>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
