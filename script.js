import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getDatabase, ref, set, push, onValue, update, remove 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { 
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyD9lfH7kslpRJNlwMfPVjx3Rnx2diF3MM4",
    authDomain: "atlpms.firebaseapp.com",
    projectId: "atlpms",
    storageBucket: "atlpms.firebasestorage.app",
    messagingSenderId: "3454561362",
    appId: "1:3454561362:web:6e41bf35917b1136c8438b",
    measurementId: "G-CFX55RSCRP"
};

let app, db, auth;
try {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    auth = getAuth(app);
} catch (error) {
    console.error(error);
}

let currentUser = null;
let currentProjectId = null;
let projectsData = {};

document.addEventListener('DOMContentLoaded', () => {
    
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            initApp(user);
        } else {
            currentUser = null;
            showLogin();
        }
    });

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleLogin();
        });
    }
    
    bindClick('btnLogout', () => signOut(auth).then(() => window.location.reload()));
    bindClick('btnNavDashboard', () => switchView('dashboard'));
    bindClick('btnBackToDash', () => switchView('dashboard'));
    
    setupModalListeners();
    setupFormListeners();
});

function bindClick(id, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
}

function showLogin() {
    toggleDisplay('loadingOverlay', 'none');
    toggleDisplay('view-login', 'flex');
    toggleDisplay('app-container', 'none');
}

function handleLogin() {
    const emailField = document.getElementById('email');
    const passField = document.getElementById('password');
    const errorMsg = document.getElementById('loginError');
    const btn = document.getElementById('btnLogin');

    if (!emailField || !passField) return;

    const email = emailField.value;
    const password = passField.value;

    if(errorMsg) errorMsg.innerText = "";
    if(btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing In...';
        btn.disabled = true;
    }

    signInWithEmailAndPassword(auth, email, password)
        .catch((error) => {
            console.error(error);
            if(errorMsg) errorMsg.innerText = "Login failed";
            if(btn) {
                btn.innerHTML = 'Sign In';
                btn.disabled = false;
            }
        });
}

function initApp(user) {
    toggleDisplay('view-login', 'none');
    toggleDisplay('app-container', 'flex');
    toggleDisplay('loadingOverlay', 'none');

    const emailDisp = document.getElementById('userEmailDisplay');
    const idDisp = document.getElementById('userIdDisplay');
    const avtDisp = document.getElementById('userAvatar');

    if(emailDisp) emailDisp.innerText = user.email.split('@')[0];
    if(idDisp) idDisp.innerText = `ID: ${user.uid.substring(0,6)}...`;
    if(avtDisp) avtDisp.innerText = user.email.charAt(0).toUpperCase();

    const userProjectsRef = ref(db, 'users/' + user.uid + '/projects');
    
    onValue(userProjectsRef, (snapshot) => {
        const data = snapshot.val();
        projectsData = data || {};
        
        renderDashboard();
        
        if(currentProjectId && projectsData[currentProjectId]) {
            renderProjectDetail(currentProjectId);
        } else if (currentProjectId && !projectsData[currentProjectId]) {
            switchView('dashboard');
        }
    });
}

function switchView(viewName) {
    const viewDash = document.getElementById('view-dashboard');
    const viewDetail = document.getElementById('view-project-detail');
    const navDash = document.getElementById('btnNavDashboard');

    if (viewName === 'dashboard') {
        if(viewDash) viewDash.style.display = 'block';
        if(viewDetail) viewDetail.style.display = 'none';
        if(navDash) navDash.classList.add('active');
        currentProjectId = null;
    } else {
        if(viewDash) viewDash.style.display = 'none';
        if(viewDetail) viewDetail.style.display = 'block';
        if(navDash) navDash.classList.remove('active');
    }
}

function renderDashboard() {
    const grid = document.getElementById('projectsGrid');
    const sidebar = document.getElementById('sidebarProjectList');
    
    if(!grid || !sidebar) return;

    grid.innerHTML = '';
    sidebar.innerHTML = '';

    const projectsArray = Object.keys(projectsData).map(key => ({
        id: key,
        ...projectsData[key]
    }));

    updateText('statTotalProjects', projectsArray.length);
    updateText('statActive', projectsArray.filter(p => p.status === 'On Progress').length);
    updateText('statCompleted', projectsArray.filter(p => Math.round(calculateProgress(p)) === 100).length);

    projectsArray.forEach(p => {
        const progress = calculateProgress(p);
        
        const sideItem = document.createElement('div');
        sideItem.className = 'nav-btn';
        sideItem.innerHTML = `<i class="fas fa-folder"></i> ${p.name}`;
        sideItem.onclick = () => openProject(p.id);
        sidebar.appendChild(sideItem);

        const card = document.createElement('div');
        card.className = 'project-card';
        card.onclick = () => openProject(p.id);
        
        let statusClass = p.status === 'On Progress' ? 'on-progress' : 'planning';
        const taskCount = p.tasks ? Object.keys(p.tasks).length : 0;

        card.innerHTML = `
            <span class="p-status ${statusClass}">${p.status}</span>
            <h3 class="p-title">${p.name}</h3>
            <span class="p-client">${p.client || 'Internal'}</span>
            <div class="progress-bg">
                <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:#6b7280; margin-top:5px;">
                <span>${taskCount} Tasks</span>
                <span>${Math.round(progress)}%</span>
            </div>
        `;
        grid.appendChild(card);
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
    const container = document.getElementById('tasksContainer');

    updateText('detailProjectTitle', project.name);
    updateText('detailProjectDates', `${project.start || '-'} s/d ${project.end || '-'}`);
    updateText('detailProjectPercent', `${Math.round(progress)}%`);
    
    const bar = document.getElementById('detailProjectProgress');
    if(bar) bar.style.width = `${progress}%`;

    const status = document.getElementById('detailProjectStatus');
    if(status) {
        status.innerText = project.status;
        status.className = `p-status ${project.status === 'On Progress' ? 'on-progress' : 'planning'}`;
    }

    const btnDel = document.getElementById('btnDeleteProject');
    if(btnDel) {
        btnDel.onclick = () => deleteProject(id);
    }

    if(container) {
        container.innerHTML = '';
        if (!project.tasks) {
            container.innerHTML = `
                <div style="text-align:center; padding:60px 20px; color:#94a3b8; display:flex; flex-direction:column; align-items:center;">
                    <i class="fas fa-clipboard-list" style="font-size:3rem; margin-bottom:15px; opacity:0.3;"></i>
                    <p>No tasks yet.</p>
                    <button class="btn-text" onclick="document.getElementById('modalTask').style.display='flex'" style="color:var(--primary); margin-top:10px;">
                        + Create First Task
                    </button>
                </div>`;
            return;
        }

        Object.keys(project.tasks).forEach(taskId => {
            const task = project.tasks[taskId];
            const taskProgress = calculateTaskProgress(task);
            const progressColor = taskProgress === 100 ? 'var(--success)' : 'var(--primary)';
            
            const div = document.createElement('div');
            div.className = 'task-block';
            
            let subtasksHtml = '';
            if (task.subtasks) {
                Object.keys(task.subtasks).forEach(subId => {
                    const sub = task.subtasks[subId];
                    subtasksHtml += `
                        <li class="subtask-item">
                            <input type="checkbox" ${sub.completed ? 'checked' : ''} 
                                onchange="window.toggleSubtask('${id}', '${taskId}', '${subId}', this.checked)">
                            <span style="flex:1; text-decoration: ${sub.completed ? 'line-through' : 'none'}; 
                                color: ${sub.completed ? '#94a3b8' : 'inherit'}; transition: all 0.2s;">
                                ${sub.name}
                            </span>
                            <i class="fas fa-times" style="cursor:pointer; color:#ef4444; opacity:0.5;" 
                                onclick="window.deleteSubtask('${id}', '${taskId}', '${subId}')"></i>
                        </li>
                    `;
                });
            }

            div.innerHTML = `
                <div class="task-header" onclick="window.toggleTaskBody('${taskId}')">
                    <div class="task-title">
                        <span class="task-badge badge-${(task.priority || 'Medium').toLowerCase()}">${task.priority || 'Medium'}</span>
                        <span>${task.name}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:15px;">
                        <small style="color:#6b7280;">${task.due || '-'}</small>
                        <div style="width:100px; height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
                            <div style="width:${taskProgress}%; background:${progressColor}; height:100%; transition: width 0.3s;"></div>
                        </div>
                        <button class="btn-text" style="color:var(--danger)" 
                            onclick="event.stopPropagation(); window.deleteTask('${id}', '${taskId}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                
                <div id="task-body-${taskId}" class="task-body">
                    <ul class="subtask-list">${subtasksHtml}</ul>
                    <div class="add-subtask-row">
                        <input type="text" class="input-subtask-new" placeholder="+ Add subtask & Enter..." 
                        onkeypress="if(event.key === 'Enter') window.addSubtask(this, '${id}', '${taskId}')">
                    </div>
                </div>
            `;
            container.appendChild(div);
        });
    }
}

function calculateProgress(project) {
    if (!project || !project.tasks) return 0;
    const tasks = Object.values(project.tasks);
    if (tasks.length === 0) return 0;

    let totalProgress = 0;
    tasks.forEach(task => totalProgress += calculateTaskProgress(task));
    return totalProgress / tasks.length;
}

function calculateTaskProgress(task) {
    if (!task || !task.subtasks) return 0;
    const subs = Object.values(task.subtasks);
    if (subs.length === 0) return 0;

    const completed = subs.filter(s => s.completed).length;
    return (completed / subs.length) * 100;
}

function setupFormListeners() {
    bindClick('btnCreateProject', () => {
        const name = getValue('inpProjName');
        const client = getValue('inpProjClient');
        const start = getValue('inpProjStart');
        const end = getValue('inpProjEnd');
        const status = getValue('inpProjStatus');

        if (!name) return alert("Name Required");

        const newProjectRef = push(ref(db, `users/${currentUser.uid}/projects`));
        set(newProjectRef, {
            name, client, start, end, status,
            createdAt: Date.now()
        }).then(() => {
            closeModal('modalProject');
            document.getElementById('inpProjName').value = '';
            document.getElementById('inpProjClient').value = '';
        });
    });

    bindClick('btnCreateTask', () => {
        const name = getValue('inpTaskName');
        const priority = getValue('inpTaskPriority');
        const due = getValue('inpTaskDue');

        if (!name || !currentProjectId) return alert("Task Name Required");

        const newTaskRef = push(ref(db, `users/${currentUser.uid}/projects/${currentProjectId}/tasks`));
        set(newTaskRef, {
            name, priority, due
        }).then(() => {
            closeModal('modalTask');
            document.getElementById('inpTaskName').value = '';
        });
    });
}

window.addSubtask = (input, projId, taskId) => {
    if (!input.value.trim()) return;
    const newSubRef = push(ref(db, `users/${currentUser.uid}/projects/${projId}/tasks/${taskId}/subtasks`));
    set(newSubRef, {
        name: input.value,
        completed: false
    });
    input.value = '';
};

window.toggleSubtask = (projId, taskId, subId, status) => {
    const subRef = ref(db, `users/${currentUser.uid}/projects/${projId}/tasks/${taskId}/subtasks/${subId}`);
    update(subRef, { completed: status });
};

window.deleteSubtask = (projId, taskId, subId) => {
    if(confirm('Delete subtask?')) {
        const subRef = ref(db, `users/${currentUser.uid}/projects/${projId}/tasks/${taskId}/subtasks/${subId}`);
        remove(subRef);
    }
};

window.deleteTask = (projId, taskId) => {
    if(confirm('Delete task?')) {
        const taskRef = ref(db, `users/${currentUser.uid}/projects/${projId}/tasks/${taskId}`);
        remove(taskRef);
    }
};

window.deleteProject = (projId) => {
    if(confirm('Delete Project?')) {
        const projRef = ref(db, `users/${currentUser.uid}/projects/${projId}`);
        remove(projRef).then(() => {
            switchView('dashboard');
        });
    }
};

window.toggleTaskBody = (taskId) => {
    const el = document.getElementById(`task-body-${taskId}`);
    if(el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
};

function setupModalListeners() {
    bindClick('btnOpenModalProject', () => toggleDisplay('modalProject', 'flex'));
    bindClick('closeModalProject', () => closeModal('modalProject'));
    bindClick('btnOpenModalTask', () => toggleDisplay('modalTask', 'flex'));
    bindClick('closeModalTask', () => closeModal('modalTask'));

    window.onclick = (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = "none";
        }
    };
}

function closeModal(id) {
    toggleDisplay(id, 'none');
}

function toggleDisplay(id, val) {
    const el = document.getElementById(id);
    if(el) el.style.display = val;
}

function updateText(id, text) {
    const el = document.getElementById(id);
    if(el) el.innerText = text;
}

function getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}
