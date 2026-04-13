import { toDateInputValue } from './vietnamTime';

export function contractFromProject(project) {
    if (!project) return null;
    if (project.contract) return project.contract;
    if (project.linked_contract) return project.linked_contract;
    return null;
}

/** Form tạo dự án: từ bản ghi hợp đồng (dropdown). */
export function datesFromContract(contract) {
    if (!contract) return { start: '', end: '' };
    return {
        start: toDateInputValue(contract.start_date),
        end: toDateInputValue(contract.end_date),
    };
}

/** Mặc định công việc: dự án → hợp đồng. */
export function taskDefaultsFromProject(project) {
    const c = contractFromProject(project);
    const startRaw = project?.start_date ?? c?.start_date;
    const endRaw = project?.deadline ?? c?.end_date;
    return {
        start: toDateInputValue(startRaw),
        end: toDateInputValue(endRaw),
    };
}

/** Mặc định đầu việc: công việc → dự án → hợp đồng. */
export function taskItemDefaults(task, project) {
    const p = taskDefaultsFromProject(project);
    return {
        start: toDateInputValue(task?.start_at) || p.start,
        end: toDateInputValue(task?.deadline) || p.end,
    };
}
