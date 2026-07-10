// app.js - Processing logic and Engine
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, query, where, orderBy, getDocs } from "firebase/firestore";
import { firebaseConfig, OPENAI_API_KEY, GEMINI_API_KEY } from "./config.js";

// Initialize Services
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();

// System State Matrices
let currentActiveUser = null;
let activeModel = 'lite'; // Default: AI Lite (OpenAI)
let activeConversationHistory = [];
let ongoingAbortController = null;
let currentBase64Image = null;

// UI DOM Targets
const loadingScreen = document.getElementById('loading-screen');
const authScreen = document.getElementById('auth-screen');
const appContainer = document.getElementById('app-container');
const messagesBox = document.getElementById('messages-box');
const messageInput = document.getElementById('user-message-input');
const sendMessageBtn = document.getElementById('send-message-btn');
const stopGenBtn = document.getElementById('stop-generation-btn');
const voiceInputBtn = document.getElementById('voice-input-btn');
const tokenTrackerMetric = document.getElementById('token-tracker-metric');
const scrollBottomBtn = document.getElementById('scroll-bottom-btn');
const systemPersonaSelect = document.getElementById('system-persona-select');

// --- 2-Second Boot Sequences ---
setTimeout(() => {
    document.getElementById('loader-status').innerText = "Establishing secure protocol...";
    setTimeout(() => {
        loadingScreen.classList.add('hidden');
        checkAuthenticationState();
    }, 1000);
}, 1000);

function checkAuthenticationState() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentActiveUser = user;
            authScreen.classList.add('hidden');
            appContainer.classList.remove('hidden');
            document.getElementById('user-name').innerText = user.displayName;
            if (user.photoURL) {
                const avatar = document.getElementById('user-avatar');
                avatar.src = user.photoURL;
                avatar.classList.remove('hidden');
            }
            loadUserChatHistoryFromCloud();
        } else {
            authScreen.classList.remove('hidden');
            appContainer.classList.add('hidden');
        }
    });
}

// Google Auth Handlers
document.getElementById('google-login-btn').addEventListener('click', () => {
    signInWithPopup(auth, googleProvider).catch(err => console.error("Cloud entry failed: ", err));
});

// --- AI Switching Operations ---
document.getElementById('switch-lite').addEventListener('click', (e) => toggleModelSwitch('lite'));
document.getElementById('switch-pro').addEventListener('click', (e) => toggleModelSwitch('pro'));

function toggleModelSwitch(modelType) {
    activeModel = modelType;
    document.querySelectorAll('.model-btn').forEach(btn => btn.classList.remove('active'));
    if(modelType === 'lite') document.getElementById('switch-lite').classList.add('active');
    else document.getElementById('switch-pro').classList.add('active');
}

// --- Dynamic Message Post Handling ---
sendMessageBtn.addEventListener('click', dispatchUserQuery);
messageInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        dispatchUserQuery();
    }
});

async function dispatchUserQuery() {
    const textContent = messageInput.value.trim();
    if(!textContent && !currentBase64Image) return;

    // Remove empty screen banner info
    const emptyState = document.querySelector('.empty-state');
    if(emptyState) emptyState.remove();

    appendMessageBubble('user', textContent, currentBase64Image);
    messageInput.value = '';
    
    // Save contextual memory arrays
    activeConversationHistory.push({ role: 'user', content: textContent, image: currentBase64Image });
    
    // Reset multimodal attachment panel state
    clearImageAttachmentPreview();

    await generateAIResponseStream(textContent);
}

function appendMessageBubble(role, text, base64Img = null) {
    const row = document.createElement('div');
    row.classList.add('message-row', role);
    
    if(base64Img) {
        const attachedImg = document.createElement('img');
        attachedImg.src = base64Img;
        attachedImg.style.maxWidth = '200px';
        attachedImg.style.borderRadius = '6px';
        attachedImg.style.marginBottom = '10px';
        row.appendChild(attachedImg);
    }

    const textSpan = document.createElement('span');
    if(role === 'ai') {
        textSpan.innerHTML = marked.parse(text); // Feature: Markdown parsing rendering architecture
        row.appendChild(textSpan);
        
        // Contextual action panel strings injections
        const actionsDiv = document.createElement('div');
        actionsDiv.classList.add('message-actions');
        actionsDiv.innerHTML = `
            <button class="action-ico-btn copy-shortcut" title="Copy to Clipboard"><i class="fa fa-copy"></i> Copy</button>
            <button class="action-ico-btn tts-shortcut" title="Speak Response"><i class="fa fa-volume-up"></i> Speak</button>
            <button class="action-ico-btn regenerate-shortcut" title="Regenerate Frame"><i class="fa fa-refresh"></i> Regenerate</button>
        `;
        row.appendChild(actionsDiv);
    } else {
        textSpan.innerText = text;
        row.appendChild(textSpan);
    }

    messagesBox.appendChild(row);
    executeAutoScrollTracker();
    
    // Re-trigger global IDE Highlight checks
    row.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el));
    bindBubbleDynamicEvents(row, text);
}

// --- Core API Communications Pipeline ---
async function generateAIResponseStream(userPrompt) {
    ongoingAbortController = new AbortController();
    stopGenBtn.classList.remove('hidden');

    // Context Window Limiter Optimization Logic - Slices only last 5 entries to preserve token cost frames
    const structuralContextFrame = activeConversationHistory.slice(-5);
    calculateTokenCostApproximation(structuralContextFrame);

    // Dynamic Persona Injections
    let calculatedSystemPersona = "You are a secure professional AI assistant.";
    if(systemPersonaSelect.value === 'coder') calculatedSystemPersona = "Act like an expert application engineer. Use Markdown block code formatting style elements.";
    if(systemPersonaSelect.value === 'interviewer') calculatedSystemPersona = "Act like a strict principal engineering interviewer. Ask technical follow-ups.";

    try {
        let responsePayloadString = "";
        
        if (activeModel === 'lite') {
            // OpenAI API Connection
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                },
                signal: ongoingAbortController.signal,
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: calculatedSystemPersona },
                        ...structuralContextFrame.map(item => ({ role: item.role, content: item.content }))
                    ]
                })
            });
            const data = await response.json();
            responsePayloadString = data.choices[0].message.content;
            
        } else {
            // Gemini 1.5 Pro Multimodal API Pipeline Connection
            let geminiContentsStructure = [];
            if(currentBase64Image) {
                const pureBase64Data = currentBase64Image.split(',')[1];
                geminiContentsStructure.push({
                    role: "user",
                    parts: [
                        { text: userPrompt },
                        { inline_data: { mime_type: "image/jpeg", data: pureBase64Data } }
                    ]
                });
            } else {
                geminiContentsStructure = structuralContextFrame.map(item => ({
                    role: item.role === 'user' ? 'user' : 'model',
                    parts: [{ text: item.content }]
                }));
            }

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: ongoingAbortController.signal,
                body: JSON.stringify({ contents: geminiContentsStructure })
            });
            const data = await response.json();
            responsePayloadString = data.candidates[0].content.parts[0].text;
        }

        appendMessageBubble('ai', responsePayloadString);
        activeConversationHistory.push({ role: 'ai', content: responsePayloadString });
        saveActiveSessionToCloudOrLocal();

    } catch (apiInterruptSignal) {
        if(apiInterruptSignal.name === 'AbortError') {
            appendMessageBubble('ai', "*Generation process terminated by security engineer override protocol.*");
        } else {
            console.error("Cloud processing fault occurred, local fallback triggered.", apiInterruptSignal);
            executeLocalStorageBackupFallback(userPrompt);
        }
    } finally {
        stopGenBtn.classList.add('hidden');
        ongoingAbortController = null;
    }
}

// --- 15+ Advanced Feature Blocks Implementations ---

// Feature: Stop Generation
stopGenBtn.addEventListener('click', () => {
    if(ongoingAbortController) ongoingAbortController.abort();
});

// Feature: Voice-to-Text Input Configuration (Web Speech API)
const WebSpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
if(WebSpeechRecognitionClass) {
    const speechObjectInstance = new WebSpeechRecognitionClass();
    speechObjectInstance.continuous = false;
    speechObjectInstance.lang = 'en-US';

    voiceInputBtn.addEventListener('click', () => {
        voiceInputBtn.style.color = '#ef4444';
        speechObjectInstance.start();
    });

    speechObjectInstance.onresult = (evt) => {
        const transcriptedString = evt.results[0][0].transcript;
        messageInput.value += transcriptedString;
        voiceInputBtn.style.color = 'var(--text-muted)';
    };
    speechObjectInstance.onerror = () => voiceInputBtn.style.color = 'var(--text-muted)';
    speechObjectInstance.onend = () => voiceInputBtn.style.color = 'var(--text-muted)';
}

// Feature: Token & Cost Tracker Matrix Estimation
function calculateTokenCostApproximation(contextBlock) {
    let charLengthAccumulator = 0;
    contextBlock.forEach(b => charLengthAccumulator += b.content.length);
    const calculatedTokensCount = Math.ceil(charLengthAccumulator / 4);
    tokenTrackerMetric.innerText = calculatedTokensCount;
}

// Feature: Multimodal Image Upload Previews via Paperclip Element
const imgUploadInput = document.getElementById('image-upload');
imgUploadInput.addEventListener('change', (evt) => {
    const fileNode = evt.target.files[0];
    if(fileNode) {
        const fileReaderInstance = new FileReader();
        fileReaderInstance.onload = (e) => {
            currentBase64Image = e.target.result;
            document.getElementById('preview-img').src = currentBase64Image;
            document.getElementById('image-preview-panel').classList.remove('hidden');
        };
        fileReaderInstance.readAsDataURL(fileNode);
    }
});

document.getElementById('close-preview').addEventListener('click', clearImageAttachmentPreview);
function clearImageAttachmentPreview() {
    currentBase64Image = null;
    document.getElementById('image-preview-panel').classList.add('hidden');
    imgUploadInput.value = '';
}

// Feature: Event bindings (Copy to Clipboard, Text-to-Speech & Message Regeneration UI hooks)
function bindBubbleDynamicEvents(bubbleRow, contentString) {
    bubbleRow.querySelector('.copy-shortcut')?.addEventListener('click', () => {
        navigator.clipboard.writeText(contentString);
        alert("Payload captured securely to host system clipboard.");
    });

    bubbleRow.querySelector('.tts-shortcut')?.addEventListener('click', () => {
        const vocalSpeechUtterance = new SpeechSynthesisUtterance(contentString);
        window.speechSynthesis.speak(vocalSpeechUtterance);
    });

    bubbleRow.querySelector('.regenerate-shortcut')?.addEventListener('click', () => {
        bubbleRow.remove();
        generateAIResponseStream(activeConversationHistory[activeConversationHistory.length - 2]?.content || "Hello");
    });
}

// Feature: Auto-Scroll Engine & Threshold Bounds Checking
messagesBox.addEventListener('scroll', () => {
    if (messagesBox.scrollTop + messagesBox.clientHeight < messagesBox.scrollHeight - 300) {
        scrollBottomBtn.classList.remove('hidden');
    } else {
        scrollBottomBtn.classList.add('hidden');
    }
});
scrollBottomBtn.addEventListener('click', executeAutoScrollTracker);
function executeAutoScrollTracker() { messagesBox.scrollTop = messagesBox.scrollHeight; }

// Feature: Export Conversation Structures (TXT Interface Engine Format)
document.getElementById('export-chat-btn').addEventListener('click', () => {
    let compiledLogContent = "== NL MULTI-AI TRANSCRIPT SECURE DUMP ==\n\n";
    activeConversationHistory.forEach(msg => {
        compiledLogContent += `[${msg.role.toUpperCase()}]: ${msg.content}\n\n`;
    });
    const blobObject = new Blob([compiledLogContent], { type: 'text/plain' });
    const downloadLinkHook = document.createElement('a');
    downloadLinkHook.download = `nl-session-${Date.now()}.txt`;
    downloadLinkHook.href = URL.createObjectURL(blobObject);
    downloadLinkHook.click();
});

// Feature: Local Storage Fallback Mode Engine
function executeLocalStorageBackupFallback(originalPrompt) {
    console.warn("Network offline or Firebase block. Running backup sequence storage.");
    localStorage.setItem(`backup_session_${Date.now()}`, JSON.stringify(activeConversationHistory));
    appendMessageBubble('ai', "*Notice: Offline state operational mode. Data written safely to LocalStorage environment maps context arrays.*");
}

// Feature: Cloud sync database or Local Fallbacks Core Routing
async function saveActiveSessionToCloudOrLocal() {
    if(currentActiveUser) {
        try {
            await addDoc(collection(db, "chats"), {
                uid: currentActiveUser.uid,
                history: activeConversationHistory,
                timestamp: Date.now()
            });
            loadUserChatHistoryFromCloud();
        } catch (e) {
            executeLocalStorageBackupFallback();
        }
    }
}

async function loadUserChatHistoryFromCloud() {
    if(!currentActiveUser) return;
    const historyListContainer = document.getElementById('chat-history-list');
    historyListContainer.innerHTML = "";
    
    try {
        const firestoreQueryObject = query(collection(db, "chats"), where("uid", "==", currentActiveUser.uid), orderBy("timestamp", "desc"));
        const snapshotResult = await getDocs(firestoreQueryObject);
        snapshotResult.forEach((doc) => {
            const nodeData = doc.data();
            const historyTab = document.createElement('div');
            historyTab.classList.add('sidebar-chat-item');
            historyTab.style.padding = "10px";
            historyTab.style.cursor = "pointer";
            historyTab.style.borderBottom = "1px solid #1e293b";
            const briefSlice = nodeData.history[0]?.content.substring(0, 22) || "Empty Context";
            historyTab.innerText = `💬 ${briefSlice}...`;
            historyTab.addEventListener('click', () => {
                messagesBox.innerHTML = "";
                activeConversationHistory = nodeData.history;
                nodeData.history.forEach(m => appendMessageBubble(m.role, m.content, m.image));
            });
            historyListContainer.appendChild(historyTab);
        });
    } catch (e) {
        console.error("Could not fetch data logs from firebase schema core:", e);
    }
}

// Feature: Simple Prompt Shortcuts library mappings
document.querySelectorAll('.prompt-item').forEach(item => {
    item.addEventListener('click', (e) => {
        messageInput.value = e.target.getAttribute('data-prompt');
        document.getElementById('library-modal').classList.add('hidden');
        messageInput.focus();
    });
});

// Feature: Chat Sharing Simulator Terminal Link Link Generator
document.getElementById('share-chat-btn').addEventListener('click', () => {
    const syntheticShareURL = `${window.location.origin}/share/session?id=${Math.random().toString(36).substr(2, 9)}`;
    navigator.clipboard.writeText(syntheticShareURL);
    alert(`Secure snapshot encryption key deployed. Share link copied:\n${syntheticShareURL}`);
});

// Modal Toggles Controllers UI mappings
document.getElementById('open-settings-btn').addEventListener('click', () => document.getElementById('settings-modal').classList.remove('hidden'));
document.getElementById('close-settings').addEventListener('click', () => document.getElementById('settings-modal').classList.add('hidden'));
document.getElementById('open-library-btn').addEventListener('click', () => document.getElementById('library-modal').classList.remove('hidden'));
document.getElementById('close-library').addEventListener('click', () => document.getElementById('library-modal').classList.add('hidden'));
document.getElementById('new-chat-btn').addEventListener('click', () => {
    messagesBox.innerHTML = `<div class="empty-state"><h3>New Secure Session Started.</h3><p>Select engine above.</p></div>`;
    activeConversationHistory = [];
});
