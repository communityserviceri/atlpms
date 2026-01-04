// Import fungsi yang dibutuhkan dari CDN (tanpa npm/bundler)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { 
    getDatabase, ref, set, push, onValue, update, remove 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { 
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// === KONFIGURASI FIREBASE ===
const firebaseConfig = {
    apiKey: "AIzaSyD9lfH7kslpRJNlwMfPVjx3Rnx2diF3MM4",
    authDomain: "atlpms.firebaseapp.com",
    projectId: "atlpms",
    storageBucket: "atlpms.firebasestorage.app",
    messagingSenderId: "3454561362",
    appId: "1:3454561362:web:6e41bf35917b1136c8438b",
    measurementId: "G-CFX55RSCRP"
};

// Inisialisasi App
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getDatabase(app);
const auth = getAuth(app);

// === STATE MANAGEMENT ===
let currentUser = null;
let currentProjectId = null;
let projectsData = {}; // Menyimpan data lokal hasil sync RTDB

// === DOM ELEMENTS ===
const els = {
    loading: document.getElementById('loadingOverlay'),
    viewLogin: document.getElementById('view-login'),
    viewApp: document.getElementById('app-container'),
    viewDashboard: document.getElementById('view-dashboard'),
    viewDetail: document.getElementById('view-project-detail'),
    loginForm: document.getElementById('loginForm'),
    loginError: document.getElementById('loginError'),
    navDashboard: document.getElementById('btnNavDashboard'),
    sidebarList: document.getElementById('sidebarProjectList'),
    projectsGrid: document.getElementById('projectsGrid'),
    tasksContainer: document.getElementById('tasksContainer'),
    // Stats
    statTotal: document.getElementById('statTotalProjects'),
    statActive: document.getElementById('statActive'),
    statCompleted: document.getElementById('statCompleted')
};

// === EVENT LISTENERS (INIT) ===
document.addEventListener('DOMContentLoaded', () => {
    // Auth Listener
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            initApp(user);
        } else {
            currentUser = null;
            showLogin();
        }
    });

    // Login Action
    els.loginForm.addEventListener('submit', handleLogin);
    
    // Logout Action
    document.getElementById('btnLogout').addEventListener('click', () => {
        signOut(auth).then(() => window.location.reload());
    });

    // Navigation
    els.navDashboard.addEventListener('click', () => switchView('dashboard'));
    document.getElementById('btnBackToDash').addEventListener('click', () => switchView('dashboard'));
    
    // Modals
    setupModalListeners();
});

// === AUTH LOGIC ===
function showLogin() {
    els.loading.style.display = 'none';
    els.viewLogin.style.display = 'flex';
    els.viewApp.style.display = 'none';
}

function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const btn = document.querySelector('.btn-login');

    els.loginError.innerText = "";
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    btn.disabled = true;

    signInWithEmailAndPassword(auth, email, password)
        .then(() => {
            // Sukses akan ditangani onAuthStateChanged
        })
        .catch((error) => {
            console.error(error);
            els.loginError.innerText = "Login gagal. Cek email/password Anda.";
            btn.innerHTML = 'LOGIN SYSTEM';
            btn.disabled = false;
        });
}

// === APP LOGIC ===
function initApp(user) {
    els.viewLogin.style.display = 'none';
    els.viewApp.style.display = 'flex';
    els.loading.style.display = 'none';

    // Update User Profile UI
    document.getElementById('userEmailDisplay').innerText = user.email.split('@')[0];
    document.getElementById('userIdDisplay').innerText = `ID: ${user.uid.substring(0,6)}...`;
    document.getElementById('userAvatar').innerText = user.email.charAt(0).toUpperCase();

    // Listen to Realtime Database
    const userProjectsRef = ref(db, 'users/' + user.uid + '/projects');
    
    onValue(userProjectsRef, (snapshot) => {
        const data = snapshot.val();
        projectsData = data || {}; // Jika null, set object kosong
        renderDashboard();
        if(currentProjectId && projectsData[currentProjectId]) {
            renderProjectDetail(currentProjectId);
        } else if (currentProjectId && !projectsData[currentProjectId]) {
            // Project dihapus saat sedang dilihat
            switchView('dashboard');
        }
    });
}

// === RENDERING UI ===
function switchView(viewName) {
    if (viewName === 'dashboard') {
        els.viewDashboard.style.display = 'block';
        els.viewDetail.style.display = 'none';
        els.navDashboard.classList.add('active');
        currentProjectId = null;
    } else {
        els.viewDashboard.style.display = 'none';
        els.viewDetail.style.display = 'block';
        els.navDashboard.classList.remove('active');
    }
}

function renderDashboard() {
    els.projectsGrid.innerHTML = '';
    els.sidebarList.innerHTML = '';

    const projectsArray = Object.keys(projectsData).map(key => ({
        id: key,
        ...projectsData[key]
    }));

    // Update Stats
    els.statTotal.innerText = projectsArray.length;
    els.statActive.innerText = projectsArray.filter(p => p.status === 'On Progress').length;
    els.statCompleted.innerText = projectsArray.filter(p => Math.round(calculateProgress(p)) === 100).length;

    projectsArray.forEach(p => {
        const progress = calculateProgress(p);
        
        // Sidebar Item
        const sideItem = document.createElement('div');
        sideItem.className = 'nav-btn';
        sideItem.innerHTML = `<i class="fas fa-folder"></i> ${p.name}`;
        sideItem.onclick = () => openProject(p.id);
        els.sidebarList.appendChild(sideItem);

        // Dashboard Card
        const card = document.createElement('div');
        card.className = 'project-card';
        card.onclick = () => openProject(p.id);
        
        let statusClass = p.status === 'On Progress' ? 'on-progress' : 'planning';
        const taskCount = p.tasks ? Object.keys(p.tasks).length : 0;

        card.innerHTML = `
            <span class="p-status ${statusClass}">${p.status}</span>
            <h3 class="p-title">${p.name}</h3>
            <span class="p-client">${p.client}</span>
            <div class="progress-bg">
                <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:#6b7280; margin-top:5px;">
                <span>${taskCount} Task Utama</span>
                <span>${Math.round(progress)}%</span>
            </div>
        `;
        els.projectsGrid.appendChild(card);
    });
}

function openProject(id) {
    currentProjectId = id;
    switchView('detail');
    renderProjectDetail(id);
}

function renderProjectDetail(id) {
    const project = projectsData[id];
    if (!project) return;

    const progress = calculateProgress(project);

    document.getElementById('detailProjectTitle').innerText = project.name;
    const statusBadge = document.getElementById('detailProjectStatus');
    statusBadge.innerText = project.status;
    statusBadge.className = `p-status ${project.status === 'On Progress' ? 'on-progress' : 'planning'}`;

    document.getElementById('detailProjectDates').innerText = `${project.start} s/d ${project.end}`;
    document.getElementById('detailProjectPercent').innerText = `${Math.round(progress)}%`;
    document.getElementById('detailProjectProgress').style.width = `${progress}%`;

    // Setup Delete Button
    document.getElementById('btnDeleteProject').onclick = () => deleteProject(id);

    els.tasksContainer.innerHTML = '';
    
    if (!project.tasks) {
        els.tasksContainer.innerHTML = '<div style="text-align:center; padding:40px; color:#999;">Belum ada task. Tambahkan Task Utama dulu.</div>';
        return;
    }

    Object.keys(project.tasks).forEach(taskId => {
        const task = project.tasks[taskId];
        const taskProgress = calculateTaskProgress(task);
        const progressColor = taskProgress === 100 ? 'var(--success)' : 'var(--primary)';
        
        const div = document.createElement('div');
        div.className = 'task-block';
        
        // Render Subtasks
        let subtasksHtml = '';
        if (task.subtasks) {
            Object.keys(task.subtasks).forEach(subId => {
                const sub = task.subtasks[subId];
                subtasksHtml += `
                    <li class="subtask-item">
                        <input type="checkbox" ${sub.completed ? 'checked' : ''} onchange="window.toggleSubtask('${id}', '${taskId}', '${subId}', ${!sub.completed})">
                        <span style="text-decoration: ${sub.completed ? 'line-through' : 'none'}; color: ${sub.completed ? '#94a3b8' : 'inherit'}">${sub.name}</span>
                        <i class="fas fa-times" style="margin-left:auto; cursor:pointer; color:#ef4444; opacity:0.5;" onclick="window.deleteSubtask('${id}', '${taskId}', '${subId}')"></i>
                    </li>
                `;
            });
        }

        div.innerHTML = `
            <div class="task-header" onclick="window.toggleTaskBody('${taskId}')">
                <div class="task-title">
                    <span class="task-badge badge-${task.priority.toLowerCase()}">${task.priority}</span>
                    <span>${task.name}</span>
                </div>
                <div style="display:flex; align-items:center; gap:15px;">
                    <small style="color:#6b7280;">Due: ${task.due}</small>
                    <div style="width:100px; height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
                        <div style="width:${taskProgress}%; background:${progressColor}; height:100%;"></div>
                    </div>
                    <button class="btn-text" style="color:var(--danger)" onclick="event.stopPropagation(); window.deleteTask('${id}', '${taskId}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            
            <div id="task-body-${taskId}" class="task-body" style="display:none;">
                <ul class="subtask-list">${subtasksHtml}</ul>
                <div class="add-subtask-row">
                    <input type="text" class="input-subtask-new" placeholder="+ Tambah sub-pekerjaan detail lalu tekan Enter" 
                    onkeypress="if(event.key === 'Enter') window.addSubtask(this, '${id}', '${taskId}')">
                </div>
            </div>
        `;
        els.tasksContainer.appendChild(div);
    });
}

// === DATA OPERATIONS (CREATE/UPDATE/DELETE) ===

// 1. Create Project
document.getElementById('btnCreateProject').addEventListener('click', () => {
    const name = document.getElementById('inpProjName').value;
    const client = document.getElementById('inpProjClient').value;
    const start = document.getElementById('inpProjStart').value;
    const end = document.getElementById('inpProjEnd').value;
    const status = document.getElementById('inpProjStatus').value;

    if (!name) return alert("Nama proyek wajib diisi!");

    const newProjectRef = push(ref(db, `users/${currentUser.uid}/projects`));
    set(newProjectRef, {
        name, client, start, end, status,
        createdAt: Date.now()
    }).then(() => {
        closeModal('modalProject');
        document.getElementById('inpProjName').value = '';
    });
});

// 2. Create Task
document.getElementById('btnCreateTask').addEventListener('click', () => {
    const name = document.getElementById('inpTaskName').value;
    const priority = document.getElementById('inpTaskPriority').value;
    const due = document.getElementById('inpTaskDue').value;

    if (!name || !currentProjectId) return;

    const newTaskRef = push(ref(db, `users/${currentUser.uid}/projects/${currentProjectId}/tasks`));
    set(newTaskRef, {
        name, priority, due
    }).then(() => {
        closeModal('modalTask');
        document.getElementById('inpTaskName').value = '';
    });
});

// 3. Subtask Operations (Window scope for inline HTML calls)
window.addSubtask = (input, projId, taskId) => {
    if (!input.value.trim()) return;
    const newSubRef = push(ref(db, `users/${currentUser.uid}/projects/${projId}/tasks/${taskId}/subtasks`));
    set(newSubRef, {
        name: input.value,
        completed: false
    });
    input.value = ''; // Reset input, jangan close toggle
};

window.toggleSubtask = (projId, taskId, subId, status) => {
    const subRef = ref(db, `users/${currentUser.uid}/projects/${projId}/tasks/${taskId}/subtasks/${subId}`);
    update(subRef, { completed: status });
};

window.deleteSubtask = (projId, taskId, subId) => {
    if(confirm('Hapus subtask ini?')) {
        const subRef = ref(db, `users/${currentUser.uid}/projects/${projId}/tasks/${taskId}/subtasks/${subId}`);
        remove(subRef);
    }
};

window.deleteTask = (projId, taskId) => {
    if(confirm('Hapus task ini beserta isinya?')) {
        const taskRef = ref(db, `users/${currentUser.uid}/projects/${projId}/tasks/${taskId}`);
        remove(taskRef);
    }
};

window.deleteProject = (projId) => {
    if(confirm('Yakin menghapus SELURUH proyek ini? Data tidak bisa kembali.')) {
        const projRef = ref(db, `users/${currentUser.uid}/projects/${projId}`);
        remove(projRef);
    }
};

// === UTILS ===
function calculateProgress(project) {
    if (!project.tasks) return 0;
    const tasks = Object.values(project.tasks);
    if (tasks.length === 0) return 0;

    let totalProgress = 0;
    tasks.forEach(task => totalProgress += calculateTaskProgress(task));
    return totalProgress / tasks.length;
}

function calculateTaskProgress(task) {
    if (!task.subtasks) return 0; // Ubah logic: jika tidak ada subtask, progress 0 (harus add subtask)
    const subs = Object.values(task.subtasks);
    if (subs.length === 0) return 0;

    const completed = subs.filter(s => s.completed).length;
    return (completed / subs.length) * 100;
}

// === MODAL UTILS ===
window.toggleTaskBody = (taskId) => {
    const el = document.getElementById(`task-body-${taskId}`);
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

function setupModalListeners() {
    // Project Modal
    document.getElementById('btnOpenModalProject').onclick = () => document.getElementById('modalProject').style.display = "flex";
    document.getElementById('closeModalProject').onclick = () => closeModal('modalProject');
    
    // Task Modal
    document.getElementById('btnOpenModalTask').onclick = () => document.getElementById('modalTask').style.display = "flex";
    document.getElementById('closeModalTask').onclick = () => closeModal('modalTask');
}

function closeModal(id) {
    document.getElementById(id).style.display = "none";
}
