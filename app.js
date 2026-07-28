import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// MEE FIREBASE CONFIG IKKADA ADD CHEYANDI
const firebaseConfig = {
  apiKey: "AIzaSyC0LjnMxVedNp3JCZcdrztSq4Jx-w7MSWQ",
  authDomain: "minibot-1b6dc.firebaseapp.com",
  projectId: "minibot-1b6dc",
  storageBucket: "minibot-1b6dc.firebasestorage.app",
  messagingSenderId: "726010343364",
  appId: "1:726010343364:web:5b46ff25ebe1b78620be91"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let tasks = [];

document.addEventListener("DOMContentLoaded", () => {
  checkPermissions();
  fetchTasks();
  setupUI();
  startAlarmChecker(); // Exact time checker
  registerServiceWorker();
});

// 1. MUNDHE PERMISSIONS THESUKOVADAM
function checkPermissions() {
  if (Notification.permission === "default") {
    document.getElementById("permission-overlay").classList.remove("hidden");
  }
}

document.getElementById("grant-permission-btn").addEventListener("click", () => {
  Notification.requestPermission().then(perm => {
    document.getElementById("permission-overlay").classList.add("hidden");
    if (perm !== "granted") {
      alert("Please allow notifications from browser settings to make alarms work in background!");
    }
  });
});

// 2. FETCH TASKS (No loading hangs)
function fetchTasks() {
  onSnapshot(collection(db, "tasks"), (snapshot) => {
    tasks = [];
    snapshot.forEach(docSnap => tasks.push({ id: docSnap.id, ...docSnap.data() }));
    // Sort by time
    tasks.sort((a, b) => a.time.localeCompare(b.time));
    renderTasks();
  }, (error) => {
    document.getElementById("alarms-list").innerHTML = `<p style="color:red">Error loading: ${error.message}</p>`;
  });
}

function renderTasks() {
  const list = document.getElementById("alarms-list");
  list.innerHTML = "";
  if (tasks.length === 0) {
    list.innerHTML = '<div class="loading-text">No active alarms. Tap + to create.</div>';
    return;
  }
  
  tasks.forEach(task => {
    list.innerHTML += `
      <div class="alarm-card glass ${task.priority}">
        <div>
          <div class="task-time">${task.time}</div>
          <div class="task-name">${task.name} ${task.everyday ? '🔁' : ''}</div>
        </div>
        <div style="display:flex; gap:15px; align-items:center;">
          <label class="switch">
            <input type="checkbox" ${task.active ? 'checked' : ''} onchange="toggleTask('${task.id}', this.checked)">
            <span class="slider"></span>
          </label>
          <button onclick="deleteTask('${task.id}')" style="background:transparent; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer;">🗑️</button>
        </div>
      </div>
    `;
  });
}

window.toggleTask = async (id, status) => { await updateDoc(doc(db, "tasks", id), { active: status }); }
window.deleteTask = async (id) => { await deleteDoc(doc(db, "tasks", id)); }

// 3. UI SETUP (Modals & Presets)
function setupUI() {
  const modal = document.getElementById("task-modal");
  document.getElementById("fab-add").onclick = () => modal.classList.remove("hidden");
  document.getElementById("modal-cancel").onclick = () => modal.classList.add("hidden");

  // Quick Preset Buttons
  document.querySelectorAll(".category-btn").forEach(btn => {
    btn.onclick = () => {
      document.getElementById("task-name").value = btn.getAttribute("data-preset");
      modal.classList.remove("hidden");
    };
  });

  // Save Form
  document.getElementById("task-form").onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById("save-task-btn");
    btn.textContent = "Saving...";
    btn.disabled = true;

    try {
      await addDoc(collection(db, "tasks"), {
        name: document.getElementById("task-name").value,
        time: document.getElementById("task-time").value,
        priority: document.getElementById("task-priority").value,
        everyday: document.getElementById("task-everyday").checked,
        active: true
      });
      modal.classList.add("hidden");
      e.target.reset();
    } catch (err) {
      alert("Save failed! " + err.message);
    } finally {
      btn.textContent = "Save Alarm";
      btn.disabled = false;
    }
  };
}

// 4. EXACT TIME BACKGROUND ALARM CHECKER
function startAlarmChecker() {
  // Checks every 20 seconds
  setInterval(() => {
    const now = new Date();
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMins = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${currentHours}:${currentMins}`;
    const currentSecs = now.getSeconds();

    // Trigger only exactly when the minute matches (to avoid spamming)
    if(currentSecs < 20) {
      tasks.forEach(task => {
        if (task.active && task.time === currentTime) {
          triggerNotification(task);
        }
      });
    }
  }, 20000); 
}

function triggerNotification(task) {
  if ('serviceWorker' in navigator && Notification.permission === 'granted') {
    navigator.serviceWorker.ready.then(registration => {
      
      // Select Emoji/Logo based on task name dynamically
      let iconStr = "🔔";
      let nameL = task.name.toLowerCase();
      if(nameL.includes("water")) iconStr = "💧";
      if(nameL.includes("gym") || nameL.includes("workout")) iconStr = "🏋️";
      if(nameL.includes("breakfast") || nameL.includes("food")) iconStr = "🥞";
      if(nameL.includes("lunch")) iconStr = "🍱";

      registration.showNotification(`${iconStr} Pulse Alarm: ${task.name}`, {
        body: `It is exactly ${task.time}. Tap to open.`,
        icon: 'https://cdn-icons-png.flaticon.com/512/3239/3239958.png', // Generic fallback
        vibrate: [500, 250, 500, 250, 1000, 250, 1000, 250, 500], // Heavy vibration for screen off
        requireInteraction: true,
        tag: task.id // Prevents duplicate notifications
      });
    });
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => console.log("SW Registered"));
  }
}
