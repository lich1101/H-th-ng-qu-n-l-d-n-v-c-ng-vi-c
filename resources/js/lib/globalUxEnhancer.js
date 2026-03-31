const TABLE_SELECTOR = '.overflow-x-auto > table';
const SELECT_QUERY_RESET_MS = 900;
const SORT_ICON_SVG = `
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M3 5h7M3 9h5M3 13h3" class="table-az-lines" />
        <path d="M13 4v10" class="table-az-stem" />
        <path d="M11 6l2-2 2 2" class="table-az-up" />
        <path d="M11 12l2 2 2-2" class="table-az-down" />
    </svg>
`;

const selectQueryState = new WeakMap();

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

const comparableValue = (cellText) => {
    const text = normalizeText(cellText);
    if (!text) return { type: 'empty', value: '' };

    const dateValue = parseDateValue(text);
    if (dateValue !== null) {
        return { type: 'number', value: dateValue };
    }

    const numberValue = parseNumberValue(text);
    if (numberValue !== null) {
        return { type: 'number', value: numberValue };
    }

    return {
        type: 'text',
        value: text.toLocaleLowerCase('vi'),
    };
};

const compareRows = (leftRow, rightRow, columnIndex, direction) => {
    const leftText = leftRow.cells[columnIndex]?.innerText || '';
    const rightText = rightRow.cells[columnIndex]?.innerText || '';

    const left = comparableValue(leftText);
    const right = comparableValue(rightText);

    if (left.type === 'empty' && right.type !== 'empty') return 1;
    if (left.type !== 'empty' && right.type === 'empty') return -1;
    if (left.type === 'empty' && right.type === 'empty') return 0;

    let result = 0;
    if (left.type === 'number' && right.type === 'number') {
        result = left.value - right.value;
    } else {
        result = left.value.localeCompare(right.value, 'vi', {
            sensitivity: 'base',
            numeric: true,
        });
    }

    return direction === 'desc' ? -result : result;
};

const sortTableByColumn = (table, columnIndex, direction) => {
    const tbody = table.tBodies?.[0];
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll(':scope > tr'));
    if (rows.length <= 1) return;

    const sortableRows = rows.filter((row) => {
        if (!row.cells?.length) return false;
        if (row.cells.length === 1 && row.cells[0].hasAttribute('colspan')) return false;
        return row.cells.length > columnIndex;
    });

    if (sortableRows.length <= 1) return;

    sortableRows.sort((left, right) => compareRows(left, right, columnIndex, direction));

    const staticRows = rows.filter((row) => !sortableRows.includes(row));
    [...sortableRows, ...staticRows].forEach((row) => tbody.appendChild(row));
};

const updateHeaderButtonState = (button, state) => {
    if (!button) return;
    button.dataset.state = state;
    button.setAttribute('aria-label', state === 'desc' ? 'Sắp xếp Z đến A' : 'Sắp xếp A đến Z');
};

const decorateHeaderCell = (table, headerCell, columnIndex) => {
    if (!headerCell || headerCell.dataset.azReady === '1') return;
    if (table.dataset.azFilter === 'off') return;

    const label = normalizeText(headerCell.textContent);
    if (!label) {
        headerCell.dataset.azReady = '1';
        return;
    }
    if (headerCell.hasAttribute('data-az-ignore')) {
        headerCell.dataset.azReady = '1';
        return;
    }

    const childNodes = Array.from(headerCell.childNodes);
    const wrapper = document.createElement('span');
    wrapper.className = 'table-az-header';

    const labelNode = document.createElement('span');
    labelNode.className = 'table-az-label';
    childNodes.forEach((node) => labelNode.appendChild(node));

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'table-az-control';
    button.innerHTML = SORT_ICON_SVG;
    updateHeaderButtonState(button, 'asc');

    button.addEventListener('click', (event) => {
        event.preventDefault();
        const nextState = button.dataset.state === 'asc' ? 'desc' : 'asc';

        table.querySelectorAll('.table-az-control').forEach((control) => {
            if (control === button) return;
            updateHeaderButtonState(control, 'asc');
        });

        updateHeaderButtonState(button, nextState);
        sortTableByColumn(table, columnIndex, nextState);
    });

    wrapper.appendChild(labelNode);
    wrapper.appendChild(button);
    headerCell.appendChild(wrapper);
    headerCell.dataset.azReady = '1';
};

const enhanceTables = (root = document) => {
    const tables = root.querySelectorAll(TABLE_SELECTOR);
    tables.forEach((table) => {
        const headerRow = table.tHead?.rows?.[0];
        if (!headerRow) return;

        Array.from(headerRow.cells).forEach((cell, index) => {
            decorateHeaderCell(table, cell, index);
        });
    });
};

const normalizeSelectQuery = (select, key) => {
    const previous = selectQueryState.get(select) || { value: '', ts: 0 };
    const now = Date.now();
    if (now - previous.ts > SELECT_QUERY_RESET_MS) {
        return key;
    }

    return `${previous.value}${key}`;
};

const findMatchingOptionIndex = (select, query) => {
    const normalizedQuery = normalizeText(query).toLocaleLowerCase('vi');
    if (!normalizedQuery) return -1;

    const options = Array.from(select.options || []);
    if (!options.length) return -1;

    const startIndex = Math.max(0, select.selectedIndex);

    for (let offset = 1; offset <= options.length; offset += 1) {
        const index = (startIndex + offset) % options.length;
        const option = options[index];
        if (!option || option.disabled) continue;
        if (normalizeText(option.text).toLocaleLowerCase('vi').includes(normalizedQuery)) {
            return index;
        }
    }

    return -1;
};

const handleSelectSearch = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.disabled || target.options.length <= 2) return;
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === 'Escape') {
        selectQueryState.delete(target);
        return;
    }

    if (event.key === 'Backspace') {
        const current = selectQueryState.get(target) || { value: '', ts: Date.now() };
        const nextValue = current.value.slice(0, -1);
        selectQueryState.set(target, { value: nextValue, ts: Date.now() });
        return;
    }

    if (event.key.length !== 1) return;

    const nextQuery = normalizeSelectQuery(target, event.key);
    selectQueryState.set(target, { value: nextQuery, ts: Date.now() });

    const matchIndex = findMatchingOptionIndex(target, nextQuery);
    if (matchIndex < 0) return;

    if (target.selectedIndex !== matchIndex) {
        target.selectedIndex = matchIndex;
        target.dispatchEvent(new Event('change', { bubbles: true }));
    }
    event.preventDefault();
};

const enhanceSelect = (select) => {
    if (select.dataset.searchableReady === '1') return;
    select.dataset.searchableReady = '1';
    select.classList.add('searchable-native-select');
    if (!select.title) {
        select.title = 'Gõ để tìm nhanh';
    }
};

const enhanceSelects = (root = document) => {
    const selects = root.querySelectorAll('select');
    selects.forEach((select) => enhanceSelect(select));
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

    document.addEventListener('keydown', handleSelectSearch, true);
    scheduleEnhancement();

    return () => {
        if (rafId !== null) {
            window.cancelAnimationFrame(rafId);
        }
        document.removeEventListener('keydown', handleSelectSearch, true);
        observer.disconnect();
    };
};
