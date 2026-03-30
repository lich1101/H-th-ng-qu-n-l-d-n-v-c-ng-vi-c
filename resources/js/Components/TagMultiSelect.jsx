import React, { useMemo, useState } from 'react';
import AppIcon from '@/Components/AppIcon';

const normalizeIds = (values) => Array.from(new Set((values || [])
    .map((value) => Number(typeof value === 'object' && value !== null ? value.id : value))
    .filter((value) => Number.isInteger(value) && value > 0)));

export default function TagMultiSelect({
    options = [],
    selectedIds = [],
    onChange,
    addPlaceholder = 'Tìm và thêm mục',
    emptyLabel = 'Chưa chọn mục nào.',
    disabled = false,
}) {
    const [query, setQuery] = useState('');

    const normalizedOptions = useMemo(() => (
        options
            .map((option) => ({
                id: Number(option?.id || 0),
                label: String(option?.label || '').trim(),
                meta: String(option?.meta || '').trim(),
            }))
            .filter((option) => option.id > 0 && option.label)
    ), [options]);

    const normalizedSelectedIds = useMemo(
        () => normalizeIds(selectedIds),
        [selectedIds]
    );

    const optionMap = useMemo(() => (
        normalizedOptions.reduce((acc, option) => {
            acc.set(option.id, option);
            return acc;
        }, new Map())
    ), [normalizedOptions]);

    const selectedOptions = useMemo(() => (
        normalizedSelectedIds.map((id) => optionMap.get(id) || {
            id,
            label: `Nhân sự #${id}`,
            meta: '',
        })
    ), [normalizedSelectedIds, optionMap]);

    const availableOptions = useMemo(() => {
        const selectedSet = new Set(normalizedSelectedIds);
        return normalizedOptions.filter((option) => !selectedSet.has(option.id));
    }, [normalizedOptions, normalizedSelectedIds]);

    const filteredAvailableOptions = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (!keyword) {
            return availableOptions;
        }

        return availableOptions.filter((option) => {
            const haystack = `${option.label} ${option.meta}`.trim().toLowerCase();
            return haystack.includes(keyword);
        });
    }, [availableOptions, query]);

    const updateSelection = (nextIds) => {
        if (typeof onChange === 'function') {
            onChange(normalizeIds(nextIds).sort((a, b) => a - b));
        }
    };

    const removeSelected = (staffId) => {
        updateSelection(normalizedSelectedIds.filter((id) => id !== staffId));
    };

    const addSelected = (nextId) => {
        const normalizedNextId = Number(nextId || 0);
        if (!normalizedNextId) return;
        updateSelection([...normalizedSelectedIds, normalizedNextId]);
        setQuery('');
    };

    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200/80 bg-white px-3 py-3">
                {selectedOptions.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {selectedOptions.map((option) => (
                            <span
                                key={option.id}
                                className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-sm font-medium text-cyan-700"
                            >
                                <span className="truncate max-w-[240px]">{option.label}</span>
                                {option.meta ? (
                                    <span className="max-w-[180px] truncate text-xs font-normal text-cyan-600/80">
                                        {option.meta}
                                    </span>
                                ) : null}
                                {!disabled ? (
                                    <button
                                        type="button"
                                        className="rounded-full text-cyan-700/70 transition hover:text-cyan-900"
                                        onClick={() => removeSelected(option.id)}
                                        aria-label={`Xóa ${option.label}`}
                                    >
                                        <AppIcon name="x-mark" className="h-3.5 w-3.5" strokeWidth={2.2} />
                                    </button>
                                ) : null}
                            </span>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-text-muted">{emptyLabel}</p>
                )}
            </div>

            {!disabled ? (
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-3">
                    <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-3 py-2">
                        <AppIcon name="users" className="h-4 w-4 text-slate-400" strokeWidth={1.9} />
                        <input
                            className="w-full border-0 bg-transparent p-0 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={availableOptions.length > 0 ? addPlaceholder : 'Đã chọn hết nhân sự khả dụng'}
                        />
                    </div>

                    <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white/90 p-2">
                        {availableOptions.length === 0 ? (
                            <p className="px-2 py-1 text-sm text-text-muted">
                                Đã chọn hết nhân sự khả dụng.
                            </p>
                        ) : filteredAvailableOptions.length === 0 ? (
                            <p className="px-2 py-1 text-sm text-text-muted">
                                Không tìm thấy nhân sự phù hợp với từ khóa "{query}".
                            </p>
                        ) : (
                            <div className="flex max-h-52 flex-wrap gap-2 overflow-y-auto pr-1">
                                {filteredAvailableOptions.map((option) => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700"
                                        onClick={() => addSelected(option.id)}
                                    >
                                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-cyan-50 text-xs font-semibold text-cyan-700">
                                            +
                                        </span>
                                        <span className="truncate max-w-[220px]">{option.label}</span>
                                        {option.meta ? (
                                            <span className="max-w-[180px] truncate text-xs text-slate-500">
                                                {option.meta}
                                            </span>
                                        ) : null}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
