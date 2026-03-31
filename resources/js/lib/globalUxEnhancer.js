import TomSelect from 'tom-select';
import Tablesort from 'tablesort';
import { ArrowDownAZ, createElement as createLucideElement } from 'lucide';

const TABLE_SELECTOR = 'table';
const SELECT_SEARCH_MIN_OPTIONS = 2;
const tableSortInstances = new WeakMap();
let hasRegisteredSortExtensions = false;

const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const parseDateValue = (raw) => {
    const value = normalizeText(raw);
    if (!value) return null;

    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        const [, year, month, day] = isoMatch;
        const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
        return Number.isFinite(timestamp) ? timestamp : null;
    }

    const vnMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (vnMatch) {
        const [, day, month, year] = vnMatch;
        const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
        return Number.isFinite(timestamp) ? timestamp : null;
    }

    return null;
};

const parseNumberValue = (raw) => {
    const value = normalizeText(raw);
    if (!value) return null;
    if (/[a-z]/i.test(value)) return null;

    let numeric = value.replace(/₫|đ|VNĐ|VND|%/gi, '').replace(/\s+/g, '');
    const hasComma = numeric.includes(',');
    const hasDot = numeric.includes('.');

    if (hasComma && hasDot) {
        numeric = numeric.replace(/\./g, '').replace(/,/g, '.');
    } else if (hasComma) {
        const parts = numeric.split(',');
        numeric = parts.length > 2 || parts[1]?.length === 3
            ? numeric.replace(/,/g, '')
            : numeric.replace(',', '.');
    } else if (hasDot) {
        const parts = numeric.split('.');
        if (parts.length > 2 || parts[1]?.length === 3) {
            numeric = numeric.replace(/\./g, '');
        }
    }

    numeric = numeric.replace(/[^\d.-]/g, '');
    if (!numeric || numeric === '-' || numeric === '.') return null;

    const parsed = Number(numeric);
    return Number.isFinite(parsed) ? parsed : null;
};

const registerTablesortExtensions = () => {
    if (hasRegisteredSortExtensions) return;

    Tablesort.extend(
        'number-vi',
        (item) => parseNumberValue(item) !== null,
        (a, b) => {
            const left = parseNumberValue(a) ?? 0;
            const right = parseNumberValue(b) ?? 0;
            return right - left;
        },
    );

    Tablesort.extend(
        'date-vi',
        (item) => parseDateValue(item) !== null,
        (a, b) => {
            const left = parseDateValue(a) ?? 0;
            const right = parseDateValue(b) ?? 0;
            return right - left;
        },
    );

    hasRegisteredSortExtensions = true;
};

const shouldEnableSortHeader = (headerCell) => {
    if (!headerCell) return false;
    if (headerCell.getAttribute('data-sort-method') === 'none') return false;
    if (headerCell.hasAttribute('data-az-ignore')) return false;

    const label = normalizeText(headerCell.textContent);
    return Boolean(label);
};

const decorateSortHeader = (headerCell) => {
    if (!headerCell) return;
    headerCell.classList.add('table-sortable-header');

    if (headerCell.querySelector(':scope > .table-az-control')) return;

    const icon = document.createElement('span');
    icon.className = 'table-az-control';
    icon.setAttribute('aria-hidden', 'true');
    icon.appendChild(createLucideElement(ArrowDownAZ, {
        class: 'table-az-icon',
        width: 16,
        height: 16,
        'stroke-width': 2,
        'aria-hidden': 'true',
        focusable: 'false',
    }));
    headerCell.appendChild(icon);
};

const prepareHeaderCell = (headerCell) => {
    if (!headerCell) return;

    if (!shouldEnableSortHeader(headerCell)) {
        if (!headerCell.getAttribute('data-sort-method')) {
            headerCell.setAttribute('data-sort-method', 'none');
        }
        return;
    }

    if (headerCell.getAttribute('data-sort-method') === null) {
        headerCell.setAttribute('data-sort-method', 'number-vi');
        const sampleRows = headerCell.closest('table')?.tBodies?.[0]?.rows || [];
        let matchedNumber = false;
        let matchedDate = false;

        for (let i = 0; i < sampleRows.length && i < 8; i += 1) {
            const text = normalizeText(sampleRows[i]?.cells?.[headerCell.cellIndex]?.textContent || '');
            if (!text) continue;
            matchedNumber = matchedNumber || parseNumberValue(text) !== null;
            matchedDate = matchedDate || parseDateValue(text) !== null;
        }

        if (matchedDate) {
            headerCell.setAttribute('data-sort-method', 'date-vi');
        } else if (matchedNumber) {
            headerCell.setAttribute('data-sort-method', 'number-vi');
        } else {
            headerCell.removeAttribute('data-sort-method');
        }
    }

    decorateSortHeader(headerCell);
};

const enhanceTableSort = (table) => {
    if (!(table instanceof HTMLTableElement)) return;
    if (table.dataset.azFilter === 'off') return;
    if (!table.tHead || !table.tHead.rows?.length) return;

    registerTablesortExtensions();

    const headerRow = table.tHead.rows[table.tHead.rows.length - 1];
    Array.from(headerRow.cells || []).forEach((cell) => {
        prepareHeaderCell(cell);
    });

    if (tableSortInstances.has(table)) return;

    const instance = new Tablesort(table, {
        sortAttribute: 'data-sort',
    });
    tableSortInstances.set(table, instance);
};

const enhanceTables = (root = document) => {
    root.querySelectorAll(TABLE_SELECTOR).forEach((table) => {
        enhanceTableSort(table);
    });
};

const shouldEnhanceSelect = (select) => {
    if (!(select instanceof HTMLSelectElement)) return false;
    if (select.dataset.searchInput === 'off') return false;
    if (select.closest('[data-search-input="off"]')) return false;
    if (select.multiple && select.dataset.searchInput !== 'on') return false;

    const optionCount = Array.from(select.options || []).filter((option) => option && !option.disabled).length;
    return optionCount >= SELECT_SEARCH_MIN_OPTIONS;
};

const enhanceSelect = (select) => {
    if (!shouldEnhanceSelect(select)) return;

    const existing = select.tomselect;
    if (existing) {
        if (select.disabled) existing.disable();
        else existing.enable();
        return;
    }

    const isMultiple = Boolean(select.multiple);
    const placeholder = normalizeText(
        select.getAttribute('placeholder')
        || select.dataset.placeholder
        || select.options?.[0]?.text
        || 'Chọn giá trị',
    );

    try {
        const instance = new TomSelect(select, {
            create: false,
            persist: false,
            allowEmptyOption: true,
            hidePlaceholder: false,
            copyClassesToDropdown: false,
            dropdownParent: 'body',
            searchField: ['text'],
            sortField: [{ field: '$score' }, { field: '$order' }],
            placeholder,
            plugins: isMultiple ? ['remove_button'] : [],
            render: {
                no_results(data, escape) {
                    return `<div class="no-results">Không tìm thấy: ${escape(data.input)}</div>`;
                },
            },
        });

        select.dataset.searchableReady = '1';
        if (select.disabled) instance.disable();
    } catch {
        select.dataset.searchableReady = 'fallback';
    }
};

const enhanceSelects = (root = document) => {
    root.querySelectorAll('select').forEach((select) => {
        enhanceSelect(select);
    });
};

const destroyEnhancedSelects = () => {
    document.querySelectorAll('select').forEach((select) => {
        const instance = select.tomselect;
        if (!instance) return;
        instance.destroy();
        delete select.dataset.searchableReady;
    });
};

export const setupGlobalUxEnhancer = () => {
    let rafId = null;

    const runEnhancement = () => {
        rafId = null;
        enhanceTables(document);
        enhanceSelects(document);
    };

    const scheduleEnhancement = () => {
        if (rafId !== null) return;
        rafId = window.requestAnimationFrame(runEnhancement);
    };

    const observer = new MutationObserver(() => {
        scheduleEnhancement();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    scheduleEnhancement();

    return () => {
        if (rafId !== null) {
            window.cancelAnimationFrame(rafId);
        }
        destroyEnhancedSelects();
        observer.disconnect();
    };
};
