// Sach.in — Application Logic (Fixed)

const STORAGE_KEY = 'sachin_time_tasks';
let tasks = [];

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // Default date to today
    const dateInput = document.getElementById('schedule-date');
    dateInput.value = new Date().toISOString().split('T')[0];

    lucide.createIcons();

    document.getElementById('task-form').addEventListener('submit', handleAddTask);
    document.getElementById('export-btn').addEventListener('click', handleExportJPG);

    loadTasks();
    updateUI();
});

// ─── Persistence ─────────────────────────────────────────────────────────────

function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function loadTasks() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        tasks = stored ? JSON.parse(stored) : [];
    } catch {
        // Corrupted storage — start fresh
        tasks = [];
    }
}

// ─── Notifications ────────────────────────────────────────────────────────────

let _notifTimer = null;

function showNotification(message, type = 'error') {
    const notif = document.getElementById('notification');
    notif.textContent = message;
    notif.className = `notification ${type} show`;
    clearTimeout(_notifTimer);
    _notifTimer = setTimeout(() => notif.classList.remove('show'), 3500);
}

// ─── Task Handlers ────────────────────────────────────────────────────────────

function handleAddTask(event) {
    event.preventDefault();

    const startTime = document.getElementById('start-time').value;
    const endTime   = document.getElementById('end-time').value;
    const activity  = document.getElementById('activity').value.trim();

    if (!startTime || !endTime || !activity) {
        showNotification('Please fill in all fields.');
        return;
    }

    // BUG FIX: string comparison is valid for zero-padded "HH:MM" format,
    // but now backed by numeric check for clarity and correctness.
    const [sH, sM] = startTime.split(':').map(Number);
    const [eH, eM] = endTime.split(':').map(Number);
    if ((eH * 60 + eM) <= (sH * 60 + sM)) {
        showNotification('End time must be after start time.');
        return;
    }

    const duration = calculateDuration(startTime, endTime);

    const newTask = {
        id: Date.now(),
        start: startTime,
        end: endTime,
        duration: duration.text,
        minutes: duration.minutes,
        activity
    };

    tasks.push(newTask);
    saveTasks();
    event.target.reset();
    updateUI(newTask.id); // pass new ID so only that row gets the entry animation
}

function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    updateUI(); // no newTaskId → no animation on remaining rows
}

// ─── Calculations ─────────────────────────────────────────────────────────────

function calculateDuration(start, end) {
    const [sH, sM] = start.split(':').map(Number);
    const [eH, eM] = end.split(':').map(Number);
    const diffMinutes = (eH * 60 + eM) - (sH * 60 + sM);
    return {
        text: `${Math.floor(diffMinutes / 60)}h ${diffMinutes % 60}m`,
        minutes: diffMinutes
    };
}

function format12h(time) {
    let [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// ─── UI Renderer ──────────────────────────────────────────────────────────────

function updateUI(newTaskId = null) {
    const listEl      = document.getElementById('task-list');
    const emptyState  = document.getElementById('empty-state');
    const table       = document.getElementById('task-table');
    const totalDisplay = document.getElementById('total-duration');
    const exportBtn   = document.getElementById('export-btn');

    listEl.innerHTML = '';

    const isEmpty = tasks.length === 0;

    emptyState.style.display  = isEmpty ? 'flex' : 'none';
    table.style.display       = isEmpty ? 'none' : 'table';
    exportBtn.disabled        = isEmpty;
    exportBtn.style.opacity   = isEmpty ? '0.5' : '1';
    exportBtn.style.cursor    = isEmpty ? 'not-allowed' : 'pointer';

    if (!isEmpty) {
        let totalMinutes = 0;

        tasks.forEach(task => {
            totalMinutes += task.minutes;

            const tr = document.createElement('tr');

            // BUG FIX (animation): only the newly added row gets the slide-in class.
            // Previously ALL rows animated on every updateUI call (e.g. on delete).
            if (newTaskId && task.id === newTaskId) {
                tr.classList.add('row-new');
            }

            // BUG FIX (XSS): use textContent, NOT innerHTML, for user-supplied data.
            // Inserting activity via innerHTML allowed script-injection attacks.
            const cells = [
                { text: format12h(task.start) },
                { text: format12h(task.end) },
                { text: task.duration, bold: true },
                { text: task.activity },
            ];

            cells.forEach(({ text, bold }) => {
                const td = document.createElement('td');
                td.textContent = text; // XSS-safe
                if (bold) td.style.fontWeight = '600';
                tr.appendChild(td);
            });

            // Action cell — built with DOM methods, no inline onclick
            const actionTd = document.createElement('td');
            actionTd.className = 'text-center action-cell';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-danger';
            // BUG FIX (a11y): aria-label gives screen readers context for icon-only button
            deleteBtn.setAttribute('aria-label', `Delete: ${task.activity}`);
            deleteBtn.title = 'Delete Activity';
            deleteBtn.innerHTML = '<i data-lucide="trash-2" style="width:18px;height:18px;"></i>';
            // BUG FIX: use addEventListener instead of window.deleteTask / onclick coupling
            deleteBtn.addEventListener('click', () => deleteTask(task.id));

            actionTd.appendChild(deleteBtn);
            tr.appendChild(actionTd);
            listEl.appendChild(tr);
        });

        const totalH = Math.floor(totalMinutes / 60);
        const totalM = totalMinutes % 60;
        // BUG FIX: textContent is preferred over innerText (no reflow, consistent)
        totalDisplay.textContent = `${totalH}h ${totalM}m`;
    }

    lucide.createIcons();
}

// ─── JPG Export ───────────────────────────────────────────────────────────────

async function handleExportJPG() {
    if (tasks.length === 0) return;

    const exportBtn = document.getElementById('export-btn');
    const originalHTML = exportBtn.innerHTML;

    exportBtn.disabled = true;
    exportBtn.innerHTML = '<i data-lucide="loader-2"></i> Capturing...';
    lucide.createIcons();

    const exportArea = document.querySelector('.table-section');
    const dateVal    = document.getElementById('schedule-date').value;

    // BUG FIX (export): previous code used generic `td:last-child` which also
    // matched tfoot cells. Now we hide only the specific action-column elements.
    const actionHeader = exportArea.querySelector('thead th:last-child');
    const actionCells  = [...exportArea.querySelectorAll('tbody td.action-cell')];
    const actionFooter = exportArea.querySelector('tfoot td:last-child');
    const toHide = [actionHeader, ...actionCells, actionFooter].filter(Boolean);

    toHide.forEach(el => (el.style.display = 'none'));

    try {
        const canvas = await html2canvas(exportArea, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
            onclone: (clonedDoc) => {
                const cloned = clonedDoc.querySelector('.table-section');
                if (cloned) {
                    cloned.style.padding      = '40px';
                    cloned.style.boxShadow    = 'none';
                    cloned.style.borderRadius = '0';
                }
            }
        });

        canvas.toBlob((blob) => {
            const url  = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `Sach_in_Schedule_${dateVal.replace(/-/g, '_') || 'daily'}.jpg`;
            link.href = url;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 100);
        }, 'image/jpeg', 0.95);

    } catch (err) {
        console.error('Export failed:', err);
        showNotification('Could not save image. Please try again.');
    } finally {
        toHide.forEach(el => (el.style.display = ''));
        exportBtn.disabled = false;
        exportBtn.innerHTML = originalHTML;
        lucide.createIcons();
    }
}
