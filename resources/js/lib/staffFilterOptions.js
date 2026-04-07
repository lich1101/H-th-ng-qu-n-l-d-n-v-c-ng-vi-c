import axios from 'axios';

/**
 * Nhân sự thực tế xuất hiện trên dữ liệu trong phạm vi quyền (phụ trách / chăm sóc / v.v. tùy context).
 *
 * @param {'crm_clients'|'contracts'|'projects'|'opportunities'|'tasks'|'task_items'} context
 * @returns {Promise<Array<{id:number,name?:string,email?:string,role?:string,department_id?:number}>>}
 */
export async function fetchStaffFilterOptions(context) {
    try {
        const { data } = await axios.get('/api/v1/staff-filter-options', {
            params: { context },
        });
        return Array.isArray(data?.data) ? data.data : [];
    } catch {
        return [];
    }
}

/** @param {Array<{id?:unknown,name?:string,email?:string}>} users */
export function usersToStaffTagOptions(users) {
    return (users || []).map((u) => ({
        id: Number(u.id || 0),
        label: u.name || `Nhân sự #${u.id}`,
        meta: u.email || '',
    })).filter((o) => o.id > 0);
}
