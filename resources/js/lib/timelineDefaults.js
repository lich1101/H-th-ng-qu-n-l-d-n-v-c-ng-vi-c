import { toDateInputValue } from './vietnamTime';

export function contractFromProject(project) {
    if (!project) return null;
    if (project.contract && Object.keys(project.contract).length > 0) return project.contract;
    if (project.linked_contract && Object.keys(project.linked_contract).length > 0) return project.linked_contract;
    return null;
}

function firstDateInputValue(values) {
    for (const value of values) {
        const normalized = toDateInputValue(value);
        if (normalized) return normalized;
    }
    return '';
}

/** Form tạo dự án: từ bản ghi hợp đồng (dropdown). */
export function datesFromContract(contract) {
    if (!contract) return { start: '', end: '' };
    return {
        start: toDateInputValue(contract.start_date),
        end: toDateInputValue(contract.end_date),
    };
}

/** Mặc định công việc: hợp đồng gắn dự án → dự án. */
export function taskDefaultsFromProject(project) {
    const c = contractFromProject(project);
    return {
        start: firstDateInputValue([c?.start_date, project?.start_date]),
        end: firstDateInputValue([c?.end_date, project?.deadline]),
    };
}

/** Mặc định đầu việc: hợp đồng gắn dự án → dự án → công việc. */
export function taskItemDefaults(task, project) {
    const p = taskDefaultsFromProject(project);
    return {
        start: p.start || toDateInputValue(task?.start_at),
        end: p.end || toDateInputValue(task?.deadline),
    };
}
