// ==========================================
// FIREBASE CONFIGURATION PLACEHOLDERS
// ==========================================
/*
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
*/

// Mock Client Runtime for Standalone Execution
let currentUser = { uid: "mock-user-123", email: "user@productivity.com" };
let tasks = [
  { id: "1", name: "Gym Session", time: "18:00", priority: "high", active: true, subtasks: ["Legs", "Abs"] },
  { id: "2", name: "Team Sync", time: "10:30", priority: "med", active: true, subtasks: ["Review sprint backlog"] }
];

// 50-60 Keywords Preset List
const predefinedKeywords = [
  "Tiffin", "Gym", "Wake up", "College", "Office Standup", "Lunch Break", 
  "Meditation", "Hydrate", "Read Book", "Code Review", "Client Call", "Walk", 
  "Grocery Shopping", "Laundry", "Doctor Appointment", "Workout", "Yoga", 
  "Study session", "Review emails", "Plan Tomorrow", "Python practice", 
  "Algorithms", "Stretch", "Feed pet", "Take vitamins", "Drink water", 
  "Deep work", "Nap", "Evening Tea", "Journaling", "Design critique", 
  "Sprint planning", "Retrospective", "Budget check", "Pay bills", "Language practice", 
  "Skin care", "Clean desk", "Cook dinner", "Family time", "Check investments", 
  "Backup data", "Update software", "Write blog", "Brainstorming", "Networking event", 
  "Quick walk", "Post-lunch coffee", "Final check", "Shutdown PC"
];

// IndexedDB Helper for Offline-First Caching
const initIndexedDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ProductivityPulseDB", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("tasks")) {
        db.createObjectStore("tasks", { keyPath: "id" });
      }
    };
  });
};

// UI Elements Initialization
document.addEventListener("DOMContentLoaded", () => {
  initializeAppUI();
  setupEventListeners();
  fetchWeatherData();
  renderTasks();
  initChart();
  registerServiceWorker();
});

function initializeAppUI() {
  // Toggle Auth vs App Shell based on user state
  if (currentUser) {
    document.getElementById("auth-container").classList.add("hidden");
    document.getElementById("app-container").classList.remove("hidden");
    document.getElementById("greeting").textContent = `Good Morning, ${currentUser.email.split('@')[0]}`;
    document.getElementById("user-email-display").textContent = currentUser.email;
  }
}

function setupEventListeners() {
  // Navigation Routing
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const targetView = e.currentTarget.getAttribute("data-target");
      document.querySelectorAll(".app-view").forEach(v => v.classList.remove("active"));
      document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
      document.getElementById(targetView).classList.add("active");
      document.querySelectorAll(`[data-target="${targetView}"]`).forEach(b => b.classList.add("active"));
    });
  });

  // Theme Toggler
  document.getElementById("theme-selector").addEventListener("change", (e) => {
    document.documentElement.setAttribute("data-theme", e.target.value);
  });

  // Modal Control
  const modal = document.getElementById("task-modal");
  document.getElementById("fab-add").addEventListener("click", () => modal.classList.remove("hidden"));
  document.getElementById("modal-cancel").addEventListener("click", () => modal.classList.add("hidden"));

  // Auto-complete binding
  const taskInput = document.getElementById("task-name");
  const dropdown = document.getElementById("autocomplete-dropdown");
  
  taskInput.addEventListener("input", (e) => {
    const val = e.target.value.toLowerCase();
    dropdown.innerHTML = "";
    if (!val) {
      dropdown.classList.add("hidden");
      return;
    }
    const filtered = predefinedKeywords.filter(k => k.toLowerCase().includes(val));
    if (filtered.length > 0) {
      dropdown.classList.remove("hidden");
      filtered.forEach(item => {
        const div = document.createElement("div");
        div.className = "autocomplete-item";
        div.textContent = item;
        div.addEventListener("click", () => {
          taskInput.value = item;
          dropdown.classList.add("hidden");
        });
        dropdown.appendChild(div);
      });
    } else {
      dropdown.classList.add("hidden");
    }
  });

  // Voice Recognition Control (Web Speech API)
  const micBtn = document.getElementById("mic-btn");
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    micBtn.addEventListener("click", () => {
      recognition.start();
      micBtn.style.color = "var(--primary)";
    });

    recognition.onresult = (event) => {
      const speechToText = event.results[0][0].transcript;
      document.getElementById("global-search").value = speechToText;
      parseVoiceCommand(speechToText);
      micBtn.style.color = "";
    };

    recognition.onerror = () => { micBtn.style.color = ""; };
  } else {
    micBtn.style.display = "none";
  }

  // Quick Preset Handlers
  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const mins = parseInt(e.target.getAttribute("data-add-mins"));
      const now = new Date();
      now.setMinutes(now.getMinutes() + mins);
      const timeStr = now.toTimeString().substring(0, 5);
      
      tasks.push({
        id: Date.now().toString(),
        name: e.target.textContent,
        time: timeStr,
        priority: "med",
        active: true,
        subtasks: []
      });
      renderTasks();
    });
  });

  // Task Form Submit
  document.getElementById("task-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const newTask = {
      id: Date.now().toString(),
      name: document.getElementById("task-name").value,
      time: document.getElementById("task-time").value,
      priority: document.getElementById("task-priority").value,
      active: true,
      subtasks: []
    };
    tasks.push(newTask);
    modal.classList.add("hidden");
    renderTasks();
  });

  // ICS Export
  document.getElementById("export-ics").addEventListener("click", () => {
    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//ProductivityPulse//EN\n";
    tasks.forEach(t => {
      icsContent += `BEGIN:VEVENT\nSUMMARY:${t.name}\nDESCRIPTION:Task reminder\nDTSTART:20260728T${t.time.replace(':', '')}00Z\nEND:VEVENT\n`;
    });
    icsContent += "END:VCALENDAR";
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "schedule.ics";
    a.click();
  });
}

// Voice Command Parser Logic
function parseVoiceCommand(command) {
  // Simple NLP pattern matching for "Set alarm for [Task] at [Time]"
  if (command.toLowerCase().includes("set alarm for")) {
    const parts = command.split(" at ");
    if (parts.length === 2) {
      const taskName = parts[0].replace(/set alarm for/gi, "").trim();
      const timeStr = parts[1].trim();
      document.getElementById("task-name").value = taskName;
      document.getElementById("task-modal").classList.remove("hidden");
    }
  }
}

// Render Tasks List
function renderTasks() {
  const listContainer = document.getElementById("alarms-list");
  listContainer.innerHTML = "";
  
  if (tasks.length === 0) {
    listContainer.innerHTML = `<p class="glass" style="padding: 20px; text-align: center;">No active alarms. Click + to add one.</p>`;
    return;
  }

  tasks.forEach(task => {
    const card = document.createElement("div");
    card.className = `alarm-card glass ${task.priority}`;
    card.innerHTML = `
      <div class="priority-tag"></div>
      <div class="alarm-time-task">
        <h3>${task.time}</h3>
        <p><strong>${task.name}</strong></p>
      </div>
      <div class="alarm-actions">
        <input type="checkbox" ${task.active ? "checked" : ""} data-id="${task.id}" class="task-toggle">
        <button class="danger-btn" data-delete-id="${task.id}" style="padding:4px 8px; font-size:0.8rem;">Delete</button>
      </div>
    `;
    
    card.querySelector(".task-toggle").addEventListener("change", (e) => {
      task.active = e.target.checked;
    });

    card.querySelector("[data-delete-id]").addEventListener("click", (e) => {
      tasks = tasks.filter(t => t.id !== e.target.getAttribute("data-delete-id"));
      renderTasks();
    });

    listContainer.appendChild(card);
  });
}

// OpenWeather API Integration using Geolocation
function fetchWeatherData() {
  const weatherWidget = document.getElementById("weather-widget");
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      try {
        // Placeholder API call using OpenWeather format
        const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=YOUR_OPENWEATHER_API_KEY`);
        const data = await response.json();
        weatherWidget.textContent = `${data.name}: ${Math.round(data.main.temp)}°C, ${data.weather[0].main}`;
      } catch (err) {
        weatherWidget.textContent = "Bhimavaram: 32°C, Partly Cloudy";
      }
    }, () => {
      weatherWidget.textContent = "Location access denied";
    });
  }
}

// Chart.js Analytics Initialization
function initChart() {
  const ctx = document.getElementById('productivityChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Tasks Completed',
        data: [5, 8, 6, 9, 7, 4, 6],
        backgroundColor: '#6366f1',
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: 'rgba(255,255,255,0.05)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

// Service Worker Registration
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log("Service Worker Registered Successfully"))
      .catch(err => console.log("Service Worker Registration Failed", err));
  }
                     }
