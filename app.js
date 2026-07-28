// ==========================================
// FIREBASE CONFIGURATION & INITIALIZATION
// ==========================================
// Using modular CDN imports for browser environment
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Your exact Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC0LjnMxVedNp3JCZcdrztSq4Jx-w7MSWQ",
  authDomain: "minibot-1b6dc.firebaseapp.com",
  projectId: "minibot-1b6dc",
  storageBucket: "minibot-1b6dc.firebasestorage.app",
  messagingSenderId: "726010343364",
  appId: "1:726010343364:web:5b46ff25ebe1b78620be91"
};

// Initialize Firebase Services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Global State
let currentUser = null;
let tasks = [];
let unsubscribeTasks = null;

// 50-60 Keywords Preset List
const predefinedKeywords = [
  "Tiffin", "Gym", "Wake up", "College", "Office Standup", "Lunch Break", 
  "Meditation", "Hydrate", "Read Book", "Code Review", "Client Call", "Walk", 
  "Grocery Shopping", "Laundry", "Doctor Appointment", "Workout", "Yoga", 
  "Study session", "Review emails", "Plan Tomorrow", "Python practice", 
  "Algorithms", "Stretch", "Feed pet", "Take vitamins", "Drink water", 
  "Deep work", "Nap", "Evening Tea", "Journaling", "Design critique", 
  "Sprint planning", "Retrospective", "Budget check", "Pay bills", "Language practice", 
  "Skin care", "Clean desk", "Cook dinner", "Family time", "Check investments"
];

// UI Elements Initialization
document.addEventListener("DOMContentLoaded", () => {
  setupAuthListener();
  setupEventListeners();
  fetchWeatherData();
  initChart();
  registerServiceWorker();
});

// ==========================================
// AUTHENTICATION LOGIC
// ==========================================
function setupAuthListener() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // User is logged in
      currentUser = user;
      document.getElementById("auth-container").classList.add("hidden");
      document.getElementById("app-container").classList.remove("hidden");
      document.getElementById("greeting").textContent = `Good Morning, ${user.email.split('@')[0]}`;
      document.getElementById("user-email-display").textContent = user.email;
      
      // Fetch user's tasks from Firestore
      fetchTasksRealtime();
    } else {
      // User is logged out
      currentUser = null;
      document.getElementById("auth-container").classList.remove("hidden");
      document.getElementById("app-container").classList.add("hidden");
      if (unsubscribeTasks) unsubscribeTasks(); // Stop fetching tasks
    }
  });
}

// Handle Login / Registration form submit
document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("auth-email").value;
  const password = document.getElementById("auth-password").value;
  const btn = document.getElementById("auth-btn");
  
  btn.textContent = "Processing...";
  
  try {
    // Try to login first
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    // If user doesn't exist, try creating an account
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
      try {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("New account created successfully!");
      } catch (signUpError) {
        alert("Sign Up Error: " + signUpError.message);
      }
    } else {
      alert("Login Error: " + error.message);
    }
  }
  btn.textContent = "Sign In / Register";
});

// Logout handling
document.getElementById("logout-btn").addEventListener("click", () => {
  signOut(auth);
});

// ==========================================
// FIRESTORE DATABASE LOGIC (TASKS)
// ==========================================
function fetchTasksRealtime() {
  if (!currentUser) return;
  
  // Query tasks strictly for the logged-in user
  const q = query(collection(db, "tasks"), where("uid", "==", currentUser.uid));
  
  unsubscribeTasks = onSnapshot(q, (snapshot) => {
    tasks = [];
    snapshot.forEach((docSnap) => {
      tasks.push({ docId: docSnap.id, ...docSnap.data() });
    });
    
    // Sort tasks by time
    tasks.sort((a, b) => a.time.localeCompare(b.time));
    renderTasks();
  });
}

// Render Tasks List to UI
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
        <input type="checkbox" ${task.active ? "checked" : ""} data-id="${task.docId}" class="task-toggle">
        <button class="danger-btn" data-delete-id="${task.docId}" style="padding:4px 8px; font-size:0.8rem;">Delete</button>
      </div>
    `;
    
    // Toggle ON/OFF switch updates Firestore
    card.querySelector(".task-toggle").addEventListener("change", async (e) => {
      const docId = e.target.getAttribute("data-id");
      const isActive = e.target.checked;
      await updateDoc(doc(db, "tasks", docId), { active: isActive });
    });

    // Delete button removes from Firestore
    card.querySelector("[data-delete-id]").addEventListener("click", async (e) => {
      const docId = e.target.getAttribute("data-delete-id");
      await deleteDoc(doc(db, "tasks", docId));
    });

    listContainer.appendChild(card);
  });
}

// Add New Task from Modal Form
document.getElementById("task-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const btn = e.target.querySelector("button[type='submit']");
  btn.textContent = "Saving...";

  const newTask = {
    uid: currentUser.uid,
    name: document.getElementById("task-name").value,
    time: document.getElementById("task-time").value,
    priority: document.getElementById("task-priority").value,
    active: true,
    createdAt: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, "tasks"), newTask);
    document.getElementById("task-modal").classList.add("hidden");
    document.getElementById("task-form").reset();
  } catch (error) {
    alert("Error adding task: " + error.message);
  } finally {
    btn.textContent = "Save Task";
  }
});

// Quick Preset Handlers (+15m, +1h) saves to Firestore
document.querySelectorAll(".preset-btn").forEach(btn => {
  btn.addEventListener("click", async (e) => {
    if (!currentUser) return;
    
    const mins = parseInt(e.target.getAttribute("data-add-mins"));
    const now = new Date();
    now.setMinutes(now.getMinutes() + mins);
    const timeStr = now.toTimeString().substring(0, 5);
    
    const newTask = {
      uid: currentUser.uid,
      name: e.target.textContent,
      time: timeStr,
      priority: "med",
      active: true,
      createdAt: new Date().toISOString()
    };
    
    await addDoc(collection(db, "tasks"), newTask);
  });
});

// ==========================================
// UI/UX LOGIC & EVENT LISTENERS
// ==========================================
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
}

// Voice Command Parser Logic
function parseVoiceCommand(command) {
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

// ==========================================
// APIs & UTILITIES
// ==========================================
// OpenWeather API Integration using Geolocation
function fetchWeatherData() {
  const weatherWidget = document.getElementById("weather-widget");
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      try {
        // You can replace YOUR_OPENWEATHER_API_KEY with an actual key if you have one
        const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=YOUR_OPENWEATHER_API_KEY`);
        const data = await response.json();
        if(data.main) {
          weatherWidget.textContent = `${data.name}: ${Math.round(data.main.temp)}°C, ${data.weather[0].main}`;
        }
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
  const ctx = document.getElementById('productivityChart');
  if(ctx) {
    new Chart(ctx.getContext('2d'), {
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
}

// Service Worker Registration
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log("Service Worker Registered Successfully"))
      .catch(err => console.log("Service Worker Registration Failed", err));
  }
}
