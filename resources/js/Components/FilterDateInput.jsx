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

    const emitValue = (nextValue) => {
        onChangeRef.current?.({ target: { value: nextValue } });
    };

    const syncAltInputState = () => {
        const instance = fpRef.current;
        if (!instance?.altInput) return;
        instance.altInput.placeholder = placeholder;
        instance.altInput.disabled = Boolean(disabled);
        instance.altInput.autocomplete = 'off';
        instance.altInput.inputMode = 'numeric';
        instance.altInput.title = 'Nhập ngày dạng dd/mm/yyyy hoặc chọn trên lịch';
    };

    const restoreAltInputFromCurrentValue = () => {
        const instance = fpRef.current;
        if (!instance?.altInput) return;
        const currentValue = String(instance.input?.value || '').trim();
        if (!currentValue) {
            instance.altInput.value = '';
            return;
        }
        const parsedCurrent = flatpickr.parseDate(currentValue, 'Y-m-d');
        instance.altInput.value = parsedCurrent
            ? instance.formatDate(parsedCurrent, 'd/m/Y')
            : currentValue;
    };

    const commitTypedValue = (rawValue) => {
        const instance = fpRef.current;
        if (!instance) return;

        const normalizedRaw = String(rawValue || '').trim();
        if (!normalizedRaw) {
            instance.clear(false);
            emitValue('');
            restoreAltInputFromCurrentValue();
            return;
        }

        const acceptedFormats = ['d/m/Y', 'Y-m-d', 'd-m-Y', 'd.m.Y'];
        const parsedDate = acceptedFormats
            .map((format) => flatpickr.parseDate(normalizedRaw, format))
            .find(Boolean);

        if (!parsedDate) {
            restoreAltInputFromCurrentValue();
            return;
        }

        const normalizedValue = instance.formatDate(parsedDate, 'Y-m-d');
        instance.setDate(parsedDate, false);
        if (instance.altInput) {
            instance.altInput.value = instance.formatDate(parsedDate, 'd/m/Y');
        }
        emitValue(normalizedValue);
    };

    useEffect(() => {
        if (!ref.current) return;
        let altInputBlurHandler = null;
        let altInputKeydownHandler = null;

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
            onReady: () => {
                syncAltInputState();
                const altInput = fpRef.current?.altInput;
                if (!altInput) return;

                altInputBlurHandler = () => commitTypedValue(altInput.value);
                altInputKeydownHandler = (event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    commitTypedValue(altInput.value);
                    fpRef.current?.close();
                };

                altInput.addEventListener('blur', altInputBlurHandler);
                altInput.addEventListener('keydown', altInputKeydownHandler);
            },
            onChange: (_selectedDates, dateStr) => {
                emitValue(dateStr);
            },
            onValueUpdate: (_selectedDates, dateStr) => {
                if (!dateStr) {
                    emitValue('');
                }
            },
            onClose: () => {
                const altInput = fpRef.current?.altInput;
                if (!altInput) return;
                commitTypedValue(altInput.value);
            },
        };
        fpOptions.altInputClass = className ? `${className} pl-11 pr-12` : 'pl-11 pr-12';
        fpRef.current = flatpickr(ref.current, fpOptions);
        return () => {
            const altInput = fpRef.current?.altInput;
            if (altInputBlurHandler && altInput) {
                altInput.removeEventListener('blur', altInputBlurHandler);
            }
            if (altInputKeydownHandler && altInput) {
                altInput.removeEventListener('keydown', altInputKeydownHandler);
            }
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
        restoreAltInputFromCurrentValue();
    }, [value]);

    useEffect(() => {
        syncAltInputState();
    }, [placeholder, disabled]);

    const clearValue = () => {
        if (!fpRef.current) return;
        fpRef.current.clear(false);
        emitValue('');
        restoreAltInputFromCurrentValue();
        fpRef.current.altInput?.focus();
    };

    return (
        <div className="relative">
            <button
                type="button"
                className="absolute inset-y-0 left-0 z-10 flex w-10 items-center justify-center text-slate-400 transition hover:text-slate-600"
                onClick={() => fpRef.current?.open()}
                tabIndex={-1}
                aria-label="Mở lịch"
            >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10m-12 9h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2Z" />
                </svg>
            </button>

            <input
                ref={ref}
                type="text"
                className={className}
                placeholder={placeholder}
                disabled={disabled}
                autoComplete="off"
                {...rest}
            />

            {value ? (
                <button
                    type="button"
                    className="absolute inset-y-0 right-0 z-10 flex w-10 items-center justify-center text-slate-400 transition hover:text-slate-600"
                    onClick={clearValue}
                    tabIndex={-1}
                    aria-label="Xóa ngày đã chọn"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2.4" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                </button>
            ) : null}
        </div>
    );
}
