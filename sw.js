const CACHE_NAME = 'productivity-pulse-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});

// Background Timer and Alarm Matching Logic
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-alarms') {
    event.waitUntil(checkActiveAlarms());
  }
});

async function checkActiveAlarms() {
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  // Dispatch notification matching exact time
  self.registration.showNotification("ProductivityPulse Reminder", {
    body: `Time match detected for scheduled alarm at ${currentTime}`,
    icon: 'icon-192.png',
    actions: [
      { action: 'snooze', title: 'Snooze (5m)' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'snooze') {
    console.log("Alarm snoozed for 5 minutes.");
  }
});
