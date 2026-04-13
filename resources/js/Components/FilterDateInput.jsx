import React, { useEffect, useRef } from 'react';
import flatpickr from 'flatpickr';
import { Vietnamese } from 'flatpickr/dist/l10n/vn.js';
import 'flatpickr/dist/flatpickr.min.css';

/**
 * Ô chọn ngày cho bộ lọc: popup Flatpickr locale tiếng Việt, giá trị `YYYY-MM-DD` (tương thích API / input type="date").
 */
export default function FilterDateInput({
    className,
    value,
    onChange,
    minDate,
    maxDate,
    placeholder = '',
    disabled,
    ...rest
}) {
    const ref = useRef(null);
    const fpRef = useRef(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useEffect(() => {
        if (!ref.current) return;
        fpRef.current = flatpickr(ref.current, {
            locale: Vietnamese,
            dateFormat: 'Y-m-d',
            allowInput: true,
            clickOpens: true,
            minDate: minDate || undefined,
            maxDate: maxDate || undefined,
            onChange: (_selectedDates, dateStr) => {
                onChangeRef.current?.({ target: { value: dateStr } });
            },
        });
        return () => {
            fpRef.current?.destroy();
            fpRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!fpRef.current) return;
        fpRef.current.set('minDate', minDate || undefined);
        fpRef.current.set('maxDate', maxDate || undefined);
    }, [minDate, maxDate]);

    useEffect(() => {
        if (!fpRef.current) return;
        const v = value == null || value === '' ? '' : String(value).trim();
        const cur = fpRef.current.input.value;
        if (v === cur) return;
        fpRef.current.setDate(v || '', false);
    }, [value]);

    return (
        <input
            ref={ref}
            type="text"
            className={className}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            {...rest}
        />
    );
}
