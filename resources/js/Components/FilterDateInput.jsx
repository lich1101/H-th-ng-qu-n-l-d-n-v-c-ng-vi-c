import React, { useEffect, useRef } from 'react';
import flatpickr from 'flatpickr';
import { Vietnamese } from 'flatpickr/dist/l10n/vn.js';
import 'flatpickr/dist/flatpickr.min.css';

/**
 * Ô chọn ngày cho bộ lọc: hiển thị dd/MM/yyyy (giống bảng), giá trị gửi state/API vẫn `YYYY-MM-DD`.
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
        const fpOptions = {
            locale: Vietnamese,
            dateFormat: 'Y-m-d',
            altInput: true,
            altFormat: 'd/m/Y',
            allowInput: true,
            clickOpens: true,
            // Tránh dropdown tháng (<select>) bị @tailwindcss/forms làm vỡ layout (chồng lên lưới ngày).
            monthSelectorType: 'static',
            appendTo: typeof document !== 'undefined' ? document.body : undefined,
            disableMobile: true,
            minDate: minDate || undefined,
            maxDate: maxDate || undefined,
            onChange: (_selectedDates, dateStr) => {
                onChangeRef.current?.({ target: { value: dateStr } });
            },
        };
        if (className) {
            fpOptions.altInputClass = className;
        }
        fpRef.current = flatpickr(ref.current, fpOptions);
        return () => {
            fpRef.current?.destroy();
            fpRef.current = null;
        };
    }, [className]);

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
