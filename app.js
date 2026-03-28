/**
 * Sach.in — Application Logic (Full Rebuild)
 *
 * Key fixes vs original:
 *  1. XSS: all user data written via textContent / DOM methods, never innerHTML
 *  2. Persistence: tasks saved to localStorage — survive page refresh
 *  3. Export: pure Canvas 2D API — no html2canvas, no DOM screenshot
 *  4. Animation bug: only new rows receive .row-enter, not every row on each render
 *  5. Delete animation: row fades out before removal (not an instant splice)
 *  6. Validation: inline toast replaces native alert()
 *  7. No window.* globals for delete handler; uses closure via addEventListener
 *  8. Stats bar: shows task count + avg duration
 */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────
const STORAGE_KEY  = 'sachin_tasks_v1';
const DAYS         = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── State ───────────────────────────────────────────────────────────────────
let tasks = [];          // [{id, start, end, minutes, duration, activity}]
let toastTimer = null;

// ─── DOM refs ────────────────────────────────────────────────────────────────
const dom = {};

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Cache DOM references
    dom.scheduleDate  = document.getElementById('schedule-date');
    dom.dayDisplay    = document.getElementById('day-display');
    dom.headerPill    = document.getElementById('header-date-pill');
    dom.taskForm      = document.getElementById('task-form');
    dom.startTime     = document.getElementById('start-time');
    dom.endTime       = document.getElementById('end-time');
    dom.activity      = document.getElementById('activity');
    dom.taskList      = document.getElementById('task-list');
    dom.emptyState    = document.getElementById('empty-state');
    dom.tableWrap     = document.getElementById('table-wrap');
    dom.totalDur      = document.getElementById('total-duration');
    dom.exportBtn     = document.getElementById('export-btn');
    dom.statsBar      = document.getElementById('stats-bar');
    dom.notification  = document.getElementById('notification');

    // Set today's date
    const today = new Date();
    dom.scheduleDate.value = toDateString(today);
    updateDateDisplay(today);

    // Listeners
    dom.scheduleDate.addEventListener('change', () => {
        const d = parseLocalDate(dom.scheduleDate.value);
        if (d) updateDateDisplay(d);
    });

    dom.taskForm.addEventListener('submit', handleAddTask);
    dom.exportBtn.addEventListener('click', handleExportJPG);

    // Load persisted tasks
    loadTasks();
    renderTable();

    // Lucide icons
    lucide.createIcons();
});

// ─── Date helpers ─────────────────────────────────────────────────────────────
function toDateString(d) {
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function parseLocalDate(str) {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function updateDateDisplay(d) {
    dom.dayDisplay.textContent  = DAYS[d.getDay()];
    dom.headerPill.textContent  = `${DAYS[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatDateFull(dateStr) {
    const d = parseLocalDate(dateStr);
    if (!d) return 'Daily Schedule';
    return `${DAYS[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ─── Persistence ──────────────────────────────────────────────────────────────
function saveTasks() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
    catch (e) { console.warn('Storage write failed:', e); }
}

function loadTasks() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        tasks = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(tasks)) tasks = [];
    } catch {
        tasks = [];
    }
}

// ─── Toast notifications (replaces alert) ─────────────────────────────────────
function showToast(msg, type = 'error') {
    const el = dom.notification;
    el.textContent = msg;
    el.className   = `toast ${type} show`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

// ─── Add task handler ─────────────────────────────────────────────────────────
function handleAddTask(e) {
    e.preventDefault();

    const start    = dom.startTime.value;
    const end      = dom.endTime.value;
    const activity = dom.activity.value.trim();

    if (!start || !end || !activity) {
        showToast('Please fill in all three fields.');
        return;
    }

    // Numeric comparison (avoids edge-case of string comparison for 24h times)
    const [sH, sM] = start.split(':').map(Number);
    const [eH, eM] = end.split(':').map(Number);
    const startMin = sH * 60 + sM;
    const endMin   = eH * 60 + eM;

    if (endMin <= startMin) {
        showToast('End time must be after start time.');
        return;
    }

    const diffMin = endMin - startMin;
    const task = {
        id:       Date.now(),
        start,
        end,
        minutes:  diffMin,
        duration: fmtDuration(diffMin),
        activity
    };

    tasks.push(task);
    saveTasks();
    e.target.reset();
    renderTable(task.id);     // pass new ID → only this row gets entry animation
    dom.startTime.focus();
}

// ─── Delete task ──────────────────────────────────────────────────────────────
function deleteTask(id) {
    // Animate the row out before removing from DOM
    const row = dom.taskList.querySelector(`tr[data-id="${id}"]`);
    if (row) {
        row.classList.add('row-exit');
        row.addEventListener('animationend', () => {
            tasks = tasks.filter(t => t.id !== id);
            saveTasks();
            renderTable();    // no newId → no entry animation on remaining rows
        }, { once: true });
    } else {
        tasks = tasks.filter(t => t.id !== id);
        saveTasks();
        renderTable();
    }
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderTable(newTaskId = null) {
    dom.taskList.innerHTML = '';  // clear tbody

    const isEmpty = tasks.length === 0;

    // Show/hide empty state vs table
    dom.emptyState.hidden  = !isEmpty;
    dom.tableWrap.hidden   = isEmpty;
    dom.statsBar.hidden    = isEmpty;
    dom.exportBtn.disabled = isEmpty;

    if (isEmpty) {
        dom.totalDur.textContent = '0h 0m';
        lucide.createIcons();
        return;
    }

    let totalMin = 0;

    tasks.forEach(task => {
        totalMin += task.minutes;

        const tr = document.createElement('tr');
        tr.dataset.id = task.id;

        // FIX: only the newly added row gets the entrance animation.
        // Previously ALL rows animated on every renderTable() call (eg. after delete).
        if (newTaskId && task.id === newTaskId) {
            tr.classList.add('row-enter');
        }

        // FIX (XSS): all user-supplied data written via textContent, never innerHTML
        const mkTd = (cls, text) => {
            const td = document.createElement('td');
            td.className = cls;
            td.textContent = text;
            return td;
        };

        tr.appendChild(mkTd('td-time', fmt12(task.start)));
        tr.appendChild(mkTd('td-time', fmt12(task.end)));
        tr.appendChild(mkTd('td-dur',  task.duration));
        tr.appendChild(mkTd('td-act',  task.activity));

        // Action cell
        const actionTd = document.createElement('td');
        actionTd.className = 'td-action';

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-del';
        // FIX (a11y): aria-label gives screen readers context for the icon-only button
        delBtn.setAttribute('aria-label', `Remove: ${task.activity}`);
        delBtn.title = 'Remove activity';
        // FIX: closure-based listener — no global window.deleteTask or inline onclick
        delBtn.addEventListener('click', () => deleteTask(task.id));

        // Icon markup (safe — not user data)
        const ico = document.createElement('i');
        ico.dataset.lucide = 'x';
        delBtn.appendChild(ico);
        actionTd.appendChild(delBtn);
        tr.appendChild(actionTd);

        dom.taskList.appendChild(tr);
    });

    // FIX: textContent not innerText (no layout reflow, consistent across engines)
    dom.totalDur.textContent = fmtDuration(totalMin);

    // Stats bar
    const avgMin  = Math.round(totalMin / tasks.length);
    const longest = tasks.reduce((a, b) => a.minutes > b.minutes ? a : b);
    dom.statsBar.innerHTML = '';
    [
        { label: 'Tasks',    value: tasks.length },
        { label: 'Avg duration',  value: fmtDuration(avgMin) },
        { label: 'Longest',  value: `${longest.activity.slice(0, 20)}${longest.activity.length > 20 ? '…' : ''} (${longest.duration})` },
    ].forEach(({ label, value }) => {
        const wrap = document.createElement('div');
        wrap.className = 'stat-item';
        const lbl = document.createElement('span');
        lbl.className = 'stat-label';
        lbl.textContent = label;
        const val = document.createElement('span');
        val.className = 'stat-value';
        val.textContent = value;
        wrap.appendChild(lbl);
        wrap.appendChild(val);
        dom.statsBar.appendChild(wrap);
    });

    lucide.createIcons();
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtDuration(minutes) {
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function fmt12(time) {
    let [h, m] = time.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${pad(m)} ${ap}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

// ═══════════════════════════════════════════════════════════════════════════════
//  CANVAS-BASED JPG EXPORT
//  Draws the schedule programmatically — zero screenshots, zero html2canvas.
//  This is pixel-perfect, always crisp, and works offline.
// ═══════════════════════════════════════════════════════════════════════════════
async function handleExportJPG() {
    if (tasks.length === 0) return;

    const btn = dom.exportBtn;
    const originalHTML = btn.innerHTML;
    btn.disabled  = true;
    btn.classList.add('loading');
    btn.innerHTML = '<i data-lucide="loader-2"></i><span>Generating…</span>';
    lucide.createIcons();

    try {
        // Wait for Google Fonts (DM Sans / Sora) to be ready so canvas renders them
        await document.fonts.ready;

        const dateStr    = dom.scheduleDate.value;
        const dateFull   = formatDateFull(dateStr);
        const fileDate   = (dateStr || 'daily').replace(/-/g, '_');

        // ── Layout constants ───────────────────────────────────────────────
        const SCALE   = 2;     // Retina / high-DPI
        const W       = 820;   // logical width

        const PAD     = 40;
        const HDR_H   = 100;   // navy header height
        const COL_H   = 40;    // column-labels row
        const ROW_H   = 50;    // each task row
        const TOT_H   = 52;    // totals row
        const FTR_H   = 48;    // footer
        const GAP     = 0;

        const H = HDR_H + GAP + COL_H + (tasks.length * ROW_H) + TOT_H + FTR_H;

        // ── Create offscreen canvas ────────────────────────────────────────
        const canvas = document.createElement('canvas');
        canvas.width  = W * SCALE;
        canvas.height = H * SCALE;
        const ctx = canvas.getContext('2d');
        ctx.scale(SCALE, SCALE);

        // ── Helpers ────────────────────────────────────────────────────────
        const fillRect = (x, y, w, h, color) => {
            ctx.fillStyle = color;
            ctx.fillRect(x, y, w, h);
        };

        const text = (str, x, y, { font = '14px "DM Sans"', color = '#1e293b', align = 'left', baseline = 'middle' } = {}) => {
            ctx.font = font;
            ctx.fillStyle = color;
            ctx.textAlign = align;
            ctx.textBaseline = baseline;
            ctx.fillText(str, x, y);
        };

        const line = (x1, y1, x2, y2, color = '#e2e8f0', width = 1) => {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth   = width;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.restore();
        };

        // ── Column layout ──────────────────────────────────────────────────
        // Widths as fractions of (W - 2*PAD)
        const TW   = W - PAD * 2;  // usable table width
        const COL  = [
            { label: 'START',    frac: 0.145 },
            { label: 'END',      frac: 0.145 },
            { label: 'DURATION', frac: 0.155 },
            { label: 'ACTIVITY', frac: 0.555 },
        ];
        // Compute absolute X positions
        let cx = PAD;
        const colX = COL.map(c => { const x = cx; cx += TW * c.frac; return x; });

        // ── BG ─────────────────────────────────────────────────────────────
        fillRect(0, 0, W, H, '#f8fafc');

        // ── Header bar ─────────────────────────────────────────────────────
        fillRect(0, 0, W, HDR_H, '#0d1b2a');

        // Logo: Sach
        ctx.font = 'bold 30px "Sora", Georgia, serif';
        ctx.fillStyle   = '#f0f6ff';
        ctx.textAlign   = 'left';
        ctx.textBaseline = 'middle';
        const sachW = ctx.measureText('Sach').width;
        ctx.fillText('Sach', PAD, HDR_H / 2 - 4);

        // Logo: .in (sky accent)
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('.in', PAD + sachW, HDR_H / 2 - 4);

        // Subtitle
        ctx.font = '400 12px "DM Sans", sans-serif';
        ctx.fillStyle = 'rgba(148,163,184,0.85)';
        ctx.fillText('Time Management Authority', PAD, HDR_H / 2 + 20);

        // Date (right-aligned)
        ctx.textAlign = 'right';
        ctx.font = '600 13px "Sora", Georgia, serif';
        ctx.fillStyle = 'rgba(240,246,255,0.9)';
        ctx.fillText(dateFull, W - PAD, HDR_H / 2 - 4);

        // "Daily Schedule" label
        ctx.font = '400 11px "DM Sans", sans-serif';
        ctx.fillStyle = 'rgba(148,163,184,0.7)';
        ctx.fillText('Daily Schedule', W - PAD, HDR_H / 2 + 20);

        ctx.textAlign = 'left';

        // ── Column-label row ───────────────────────────────────────────────
        const colRowY = HDR_H + GAP;
        fillRect(0, colRowY, W, COL_H, '#162640');

        ctx.font = '700 10px "DM Sans", sans-serif';
        ctx.fillStyle   = 'rgba(148,163,184,0.75)';
        ctx.textBaseline = 'middle';

        COL.forEach((col, i) => {
            ctx.fillText(col.label, colX[i] + 12, colRowY + COL_H / 2);
        });

        // ── Task rows ──────────────────────────────────────────────────────
        tasks.forEach((task, idx) => {
            const ry = colRowY + COL_H + idx * ROW_H;

            // Alternating row backgrounds
            fillRect(0, ry, W, ROW_H, idx % 2 === 0 ? '#ffffff' : '#f1f5f9');

            // Row bottom separator
            line(PAD, ry + ROW_H, W - PAD, ry + ROW_H, '#e2e8f0');

            const cy = ry + ROW_H / 2;

            // Start time
            ctx.font = '600 13px "Sora", Georgia, serif';
            ctx.fillStyle   = '#334155';
            ctx.textBaseline = 'middle';
            ctx.fillText(fmt12(task.start), colX[0] + 12, cy);

            // End time
            ctx.fillText(fmt12(task.end), colX[1] + 12, cy);

            // Duration (blue accent)
            ctx.font = '700 13px "Sora", Georgia, serif';
            ctx.fillStyle = '#0ea5e9';
            ctx.fillText(task.duration, colX[2] + 12, cy);

            // Activity — truncate to fit column width
            const maxActW = TW * 0.555 - 24;
            ctx.font = '500 13px "DM Sans", sans-serif';
            ctx.fillStyle = '#1e293b';
            let act = task.activity;
            while (ctx.measureText(act).width > maxActW && act.length > 1) {
                act = act.slice(0, -1);
            }
            if (act !== task.activity) act += '…';
            ctx.fillText(act, colX[3] + 12, cy);
        });

        // ── Total row ──────────────────────────────────────────────────────
        const totY = colRowY + COL_H + tasks.length * ROW_H;
        fillRect(0, totY, W, TOT_H, '#dbeafe');

        // Top border on total row
        line(0, totY, W, totY, '#93c5fd', 2);

        const totalMin = tasks.reduce((s, t) => s + t.minutes, 0);

        ctx.font = '600 11px "DM Sans", sans-serif';
        ctx.fillStyle   = '#475569';
        ctx.textBaseline = 'middle';
        ctx.fillText('TOTAL DURATION', colX[0] + 12, totY + TOT_H / 2);

        ctx.font = 'bold 18px "Sora", Georgia, serif';
        ctx.fillStyle = '#1d4ed8';
        ctx.fillText(fmtDuration(totalMin), colX[2] + 12, totY + TOT_H / 2);

        // Tasks count (right side)
        ctx.textAlign  = 'right';
        ctx.font       = '500 11px "DM Sans", sans-serif';
        ctx.fillStyle  = '#64748b';
        ctx.fillText(`${tasks.length} activit${tasks.length === 1 ? 'y' : 'ies'}`, W - PAD, totY + TOT_H / 2);
        ctx.textAlign = 'left';

        // ── Footer strip ───────────────────────────────────────────────────
        const ftrY = totY + TOT_H;
        fillRect(0, ftrY, W, FTR_H, '#0d1b2a');

        ctx.font       = '400 11px "DM Sans", sans-serif';
        ctx.fillStyle  = 'rgba(148,163,184,0.65)';
        ctx.textAlign  = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Generated by Sach.in — Time Management Authority • ${new Date().getFullYear()}`, W / 2, ftrY + FTR_H / 2);

        // ── Export as JPEG ─────────────────────────────────────────────────
        canvas.toBlob(
            (blob) => {
                if (!blob) { showToast('Export failed — please try again.'); return; }
                const url  = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = `Sach_in_Schedule_${fileDate}.jpg`;
                link.href = url;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(url), 500);
                showToast('Schedule exported!', 'success');
            },
            'image/jpeg',
            0.95
        );

    } catch (err) {
        console.error('Export error:', err);
        showToast('Export failed — please try again.');
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.innerHTML = originalHTML;
        lucide.createIcons();
    }
}
