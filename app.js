// Sach.in - Application Logic

let tasks = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Set default date to today
    const dateInput = document.getElementById('schedule-date');
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;

    // Initialize Lucide Icons
    lucide.createIcons();
    
    // Add Form Listener
    const form = document.getElementById('task-form');
    form.addEventListener('submit', handleAddTask);

    // Add Export Listener
    const exportBtn = document.getElementById('export-btn');
    exportBtn.addEventListener('click', handleExportJPG);

    updateUI();
});

/**
 * Handle adding a new task from the form
 */
function handleAddTask(event) {
    event.preventDefault();

    const startTime = document.getElementById('start-time').value;
    const endTime = document.getElementById('end-time').value;
    const activity = document.getElementById('activity').value;

    if (!startTime || !endTime || !activity) return;

    // Validate times (End should be after start)
    if (endTime <= startTime) {
        alert("End time must be after the start time.");
        return;
    }

    const duration = calculateDuration(startTime, endTime);
    
    const newTask = {
        id: Date.now(),
        start: startTime,
        end: endTime,
        duration: duration.text,
        minutes: duration.minutes,
        activity: activity
    };

    tasks.push(newTask);
    event.target.reset(); 
    updateUI();
}

/**
 * Calculate duration between two times
 */
function calculateDuration(start, end) {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);

    let diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    
    const h = Math.floor(diffMinutes / 60);
    const m = diffMinutes % 60;

    return {
        text: `${h}h ${m}m`,
        minutes: diffMinutes
    };
}

/**
 * Update the Table and UI elements
 */
function updateUI() {
    const listElement = document.getElementById('task-list');
    const emptyState = document.getElementById('empty-state');
    const table = document.getElementById('task-table');
    const totalDisplay = document.getElementById('total-duration');
    const exportBtn = document.getElementById('export-btn');

    // Clear list
    listElement.innerHTML = '';

    if (tasks.length === 0) {
        emptyState.style.display = 'flex';
        table.style.display = 'none';
        exportBtn.disabled = true;
        exportBtn.style.opacity = '0.5';
    } else {
        emptyState.style.display = 'none';
        table.style.display = 'table';
        exportBtn.disabled = false;
        exportBtn.style.opacity = '1';

        let totalMinutes = 0;

        tasks.forEach(task => {
            totalMinutes += task.minutes;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${format12h(task.start)}</td>
                <td>${format12h(task.end)}</td>
                <td style="font-weight: 600;">${task.duration}</td>
                <td>${task.activity}</td>
                <td class="text-center">
                    <button class="btn-danger" onclick="deleteTask(${task.id})" title="Delete Activity">
                        <i data-lucide="trash-2" style="width: 18px; height: 18px;"></i>
                    </button>
                </td>
            `;
            listElement.appendChild(tr);
        });

        const totalH = Math.floor(totalMinutes / 60);
        const totalM = totalMinutes % 60;
        totalDisplay.innerText = `${totalH}h ${totalM}m`;
    }

    // Refresh icons for new elements
    lucide.createIcons();
}

/**
 * Format 24h time to 12h for better readability
 */
function format12h(time) {
    let [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/**
 * Remove a task from the list
 */
window.deleteTask = function(id) {
    tasks = tasks.filter(t => t.id !== id);
    updateUI();
}

/**
 * Handle Excel Exporting
 */
/**
 * Handle JPG Exporting - Robust Version
 */
async function handleExportJPG() {
    if (tasks.length === 0) return;

    const exportBtn = document.getElementById('export-btn');
    const originalContent = exportBtn.innerHTML;
    
    // Loading State
    exportBtn.disabled = true;
    exportBtn.innerHTML = '<i data-lucide="loader-2"></i> Capturing...';
    lucide.createIcons();

    const exportArea = document.querySelector('.table-section');
    const dateVal = document.getElementById('schedule-date').value;

    // Hide actions column
    const actionTh = exportArea.querySelector('th:last-child');
    const actionTds = exportArea.querySelectorAll('td:last-child');
    actionTh.style.display = 'none';
    actionTds.forEach(td => td.style.display = 'none');

    try {
        const canvas = await html2canvas(exportArea, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
            // Ensure shadow and radius are captured cleanly
            onclone: (clonedDoc) => {
                const clonedTable = clonedDoc.querySelector('.table-section');
                clonedTable.style.padding = '40px'; // Add padding for a professional "image" look
                clonedTable.style.boxShadow = 'none'; // Avoid shadow artifacts in some browsers
                clonedTable.style.borderRadius = '0';
            }
        });

        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `Sach_in_Schedule_${dateVal.replace(/-/g, '_') || 'daily'}.jpg`;
            link.href = url;
            link.click();
            
            // Cleanup
            setTimeout(() => URL.revokeObjectURL(url), 100);
        }, 'image/jpeg', 0.9);

    } catch (err) {
        console.error("Export failed:", err);
        alert("Could not save image. Please try again.");
    } finally {
        // Restore actions column
        actionTh.style.display = '';
        actionTds.forEach(td => td.style.display = '');

        // Restore Button
        exportBtn.disabled = false;
        exportBtn.innerHTML = originalContent;
        lucide.createIcons();
    }
}
