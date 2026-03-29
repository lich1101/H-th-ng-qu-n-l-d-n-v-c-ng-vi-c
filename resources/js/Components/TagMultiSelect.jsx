import React, { useMemo } from 'react';
import AppIcon from '@/Components/AppIcon';

const normalizeIds = (values) => Array.from(new Set((values || [])
    .map((value) => Number(typeof value === 'object' && value !== null ? value.id : value))
    .filter((value) => Number.isInteger(value) && value > 0)));

export default function TagMultiSelect({
    options = [],
    selectedIds = [],
    onChange,
    addPlaceholder = 'Thêm mục',
    emptyLabel = 'Chưa chọn mục nào.',
    disabled = false,
}) {
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

    const updateSelection = (nextIds) => {
        if (typeof onChange === 'function') {
            onChange(normalizeIds(nextIds).sort((a, b) => a - b));
        }
    };

    const removeSelected = (staffId) => {
        updateSelection(normalizedSelectedIds.filter((id) => id !== staffId));
    };

    const addSelected = (event) => {
        const nextId = Number(event.target.value || 0);
        if (!nextId) return;
        updateSelection([...normalizedSelectedIds, nextId]);
        event.target.value = '';
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
                <select
                    className="w-full rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                    defaultValue=""
                    onChange={addSelected}
                >
                    <option value="">{availableOptions.length > 0 ? addPlaceholder : 'Đã chọn hết nhân sự khả dụng'}</option>
                    {availableOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                            {option.label}{option.meta ? ` • ${option.meta}` : ''}
                        </option>
                    ))}
                </select>
            ) : null}
        </div>
    );
}
