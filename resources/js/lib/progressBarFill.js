/**
 * Lớp Tailwind cho màu fill thanh tiến độ theo % (đồng bộ Flutter StitchTheme.progressPercentFillColor).
 * @param {number|string|null|undefined} percent
 * @returns {string}
 */
export function progressBarFillClass(percent) {
    const n = Math.min(100, Math.max(0, Number(percent) || 0));
    if (n <= 0) return 'bg-slate-400';
    if (n >= 100) return 'bg-emerald-600';
    if (n <= 20) return 'bg-sky-500';
    if (n <= 40) return 'bg-primary';
    if (n <= 60) return 'bg-teal-700';
    if (n <= 80) return 'bg-amber-500';
    return 'bg-orange-600';
}
