import TomSelect from 'tom-select';
import Tablesort from 'tablesort';
import { ArrowDownAZ, createElement as createLucideElement } from 'lucide';

const TABLE_SELECTOR = 'table';
const SELECT_SEARCH_MIN_OPTIONS = 11;
const SELECT_MAX_VISIBLE_OPTIONS = 50;
const SELECT_DROPDOWN_Z_INDEX = 10050;
const tableSortInstances = new WeakMap();
const remoteSortListeners = new Map();
let hasRegisteredSortExtensions = false;

const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const hasMeaningfulTextNode = (node) => (
    node?.nodeType === Node.TEXT_NODE && normalizeText(node.textContent).length > 0
);

const buildSelectOptionsSignature = (select) =>
    Array.from(select.options || [])
        .map((option) => {
            const value = String(option?.value ?? '');
            const label = normalizeText(option?.textContent ?? '');
            const disabled = option?.disabled ? '1' : '0';
            return `${value}\u0001${label}\u0001${disabled}`;
        })
        .join('\u0002');

const syncTomSelectValueFromDom = (select, instance, isMultiple) => {
    if (!instance) return;

    if (isMultiple) {
        const domValues = Array.from(select.selectedOptions || []).map((option) => String(option?.value ?? ''));
        const currentValues = Array.isArray(instance.items) ? instance.items.map((item) => String(item ?? '')) : [];
        const isSame = domValues.length === currentValues.length
            && domValues.every((value, index) => value === currentValues[index]);
        if (!isSame) {
            instance.setValue(domValues, true);
        }
        return;
    }

    const domValue = String(select.value ?? '');
    const currentValue = Array.isArray(instance.items) && instance.items.length > 0
        ? String(instance.items[0] ?? '')
        : '';

    if (domValue === currentValue) return;
    if (domValue === '') {
        instance.clear(true);
        return;
    }
    instance.setValue(domValue, true);
};

const hasDropdownInputLayout = (instance) => Boolean(
    instance?.dropdown && instance.dropdown.querySelector('.dropdown-input-wrap')
);

const resolveTomSelectDropdownParent = (select) => (
    select?.closest('[data-modal-panel="true"]') || document.body
);

const ensureTomSelectDropdownLayer = (instance, dropdownParent = document.body) => {
    if (!instance?.dropdown) return;
    if (instance.dropdown.parentNode !== dropdownParent) {
        dropdownParent.appendChild(instance.dropdown);
    }
    instance.dropdown.style.zIndex = String(SELECT_DROPDOWN_Z_INDEX);
};

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

const ensureSortHeaderLayout = (headerCell) => {
    const existing = headerCell.querySelector(':scope > .table-az-header');
    if (existing) return existing;

    const wrapper = document.createElement('span');
    wrapper.className = 'table-az-header';

    const label = document.createElement('span');
    label.className = 'table-az-label';

    Array.from(headerCell.childNodes).forEach((node) => {
        if (
            node.nodeType === Node.ELEMENT_NODE
            && node.classList
            && (node.classList.contains('table-az-control') || node.classList.contains('table-az-header'))
        ) {
            return;
        }
        if (node.nodeType === Node.TEXT_NODE && !hasMeaningfulTextNode(node)) {
            return;
        }
        if (hasMeaningfulTextNode(node)) {
            node.textContent = normalizeText(node.textContent);
            label.appendChild(node);
            return;
        }
        label.appendChild(node);
    });

    wrapper.appendChild(label);
    headerCell.appendChild(wrapper);

    return wrapper;
};

const decorateSortHeader = (headerCell) => {
    if (!headerCell) return;
    headerCell.classList.add('table-sortable-header');

    const wrapper = ensureSortHeaderLayout(headerCell);
    if (!wrapper) return;

    if (wrapper.querySelector(':scope > .table-az-control')) return;

    const icon = document.createElement('span');
    icon.className = 'table-az-control';
    icon.setAttribute('aria-hidden', 'true');
    icon.appendChild(createLucideElement(ArrowDownAZ, {
        class: 'table-az-icon',
        width: 14,
        height: 14,
        'stroke-width': 2,
        'aria-hidden': 'true',
        focusable: 'false',
    }));
    wrapper.appendChild(icon);
};

const prepareHeaderCell = (headerCell, table) => {
    if (!headerCell) return;

    if (!shouldEnableSortHeader(headerCell)) {
        if (!headerCell.getAttribute('data-sort-method')) {
            headerCell.setAttribute('data-sort-method', 'none');
        }
        return;
    }

    const isRemoteSortTable = table?.dataset?.sortScope === 'remote';

    if (!isRemoteSortTable && headerCell.getAttribute('data-sort-method') === null) {
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

const updateRemoteSortState = (table, selectedKey, selectedDir) => {
    const headerRow = table?.tHead?.rows?.[table.tHead.rows.length - 1];
    if (!headerRow) return;

    Array.from(headerRow.cells || []).forEach((cell) => {
        if (!(cell instanceof HTMLTableCellElement)) return;
        if (cell.getAttribute('data-sort-key') === selectedKey) {
            cell.setAttribute('aria-sort', selectedDir === 'asc' ? 'ascending' : 'descending');
            return;
        }
        cell.removeAttribute('aria-sort');
    });
};

const bindRemoteSort = (table) => {
    if (!(table instanceof HTMLTableElement)) return;
    if (remoteSortListeners.has(table)) return;

    const handler = (event) => {
        const headerCell = event.target instanceof Element
            ? event.target.closest('th')
            : null;
        if (!(headerCell instanceof HTMLTableCellElement)) return;
        if (!table.contains(headerCell)) return;
        if (!shouldEnableSortHeader(headerCell)) return;

        const sortBy = String(headerCell.getAttribute('data-sort-key') || '').trim();
        if (!sortBy) return;

        event.preventDefault();

        const current = headerCell.getAttribute('aria-sort');
        const nextSortDir = current === 'ascending' ? 'desc' : 'asc';

        updateRemoteSortState(table, sortBy, nextSortDir);

        table.dispatchEvent(new CustomEvent('table:remote-sort', {
            bubbles: true,
            detail: {
                sortBy,
                sortDir: nextSortDir,
            },
        }));
    };

    table.addEventListener('click', handler);
    remoteSortListeners.set(table, handler);
};

const enhanceTableSort = (table) => {
    if (!(table instanceof HTMLTableElement)) return;
    if (table.dataset.azFilter === 'off') return;
    if (!table.tHead || !table.tHead.rows?.length) return;

    const headerRow = table.tHead.rows[table.tHead.rows.length - 1];
    Array.from(headerRow.cells || []).forEach((cell) => {
        prepareHeaderCell(cell, table);
    });

    if (table.dataset.sortScope === 'remote') {
        bindRemoteSort(table);
        updateRemoteSortState(
            table,
            String(table.dataset.sortBy || '').trim(),
            String(table.dataset.sortDir || '').toLowerCase() === 'asc' ? 'asc' : 'desc'
        );
        return;
    }

    registerTablesortExtensions();

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
    const isEligible = shouldEnhanceSelect(select);
    const existing = select.tomselect;
    if (!isEligible) {
        if (existing) {
            existing.destroy();
        }
        delete select.dataset.searchableReady;
        delete select.dataset.searchOptionsSignature;
        return;
    }

    if (existing) {
        const nextSignature = buildSelectOptionsSignature(select);
        const currentSignature = String(select.dataset.searchOptionsSignature || '');
        const needsDropdownInput = !Boolean(select.multiple);
        const missingDropdownInputLayout = needsDropdownInput && !hasDropdownInputLayout(existing);

        if (currentSignature !== nextSignature || missingDropdownInputLayout) {
            existing.destroy();
            delete select.dataset.searchableReady;
            delete select.dataset.searchOptionsSignature;
        } else {
            syncTomSelectValueFromDom(select, existing, Boolean(select.multiple));
            if (select.disabled) existing.disable();
            else existing.enable();
            return;
        }
    }

    const current = select.tomselect;
    if (current) {
        if (select.disabled) current.disable();
        else current.enable();
        return;
    }

    const isMultiple = Boolean(select.multiple);
    const emptyOptionLabel = normalizeText(
        Array.from(select.options || [])
            .find((option) => option && option.value === '')
            ?.text,
    );
    const placeholder = normalizeText(
        select.getAttribute('placeholder')
        || select.dataset.placeholder
        || emptyOptionLabel
        || 'Chọn giá trị',
    );
    const dropdownParent = resolveTomSelectDropdownParent(select);

    try {
        const instance = new TomSelect(select, {
            create: false,
            persist: false,
            allowEmptyOption: true,
            hidePlaceholder: false,
            copyClassesToDropdown: false,
            dropdownParent,
            searchField: ['text'],
            sortField: [{ field: '$score' }, { field: '$order' }],
            maxOptions: SELECT_MAX_VISIBLE_OPTIONS,
            openOnFocus: true,
            placeholder,
            plugins: isMultiple ? ['remove_button'] : ['dropdown_input'],
            closeAfterSelect: !isMultiple,
            render: {
                no_results(data, escape) {
                    return `<div class="no-results">Không tìm thấy: ${escape(data.input)}</div>`;
                },
            },
        });

        if (!isMultiple && select.value === '') {
            instance.clear(true);
        }
        ensureTomSelectDropdownLayer(instance, dropdownParent);
        const inheritedInputClasses = Array.from(select.classList || []);
        if (inheritedInputClasses.length > 0 && instance.wrapper) {
            instance.wrapper.classList.remove(...inheritedInputClasses);
        }
        if (!isMultiple && instance.control_input) {
            instance.control_input.setAttribute('placeholder', select.dataset.searchPlaceholder || placeholder || 'Tìm nhanh...');
            instance.control_input.classList.add('ts-dropdown-search-input');
            instance.on('dropdown_open', () => {
                ensureTomSelectDropdownLayer(instance, dropdownParent);
                instance.setTextboxValue('');
                instance.refreshOptions(false);
            });
        } else {
            instance.on('dropdown_open', () => {
                ensureTomSelectDropdownLayer(instance, dropdownParent);
            });
        }

        select.dataset.searchableReady = '1';
        select.dataset.searchOptionsSignature = buildSelectOptionsSignature(select);
        if (select.disabled) instance.disable();
    } catch {
        select.dataset.searchableReady = 'fallback';
        delete select.dataset.searchOptionsSignature;
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
        delete select.dataset.searchOptionsSignature;
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
        remoteSortListeners.forEach((handler, table) => {
            table.removeEventListener('click', handler);
        });
        remoteSortListeners.clear();
        destroyEnhancedSelects();
        observer.disconnect();
    };
};
