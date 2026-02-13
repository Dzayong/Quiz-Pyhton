import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, collection, addDoc, getDocs, serverTimestamp, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";

// --- 1. KONFIGURASI FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyD45ESoMX5WYEeOEmhzZUvwBsjeRmxpSBY",
    authDomain: "kuis-python-sd.firebaseapp.com",
    projectId: "kuis-python-sd",
    storageBucket: "kuis-python-sd.firebasestorage.app",
    messagingSenderId: "930505177436",
    appId: "1:930505177436:web:c0c25a72dbbe693ebe6999"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const APP_ID = 'python-kids-v1';

// --- 2. GAME STATE ---
let allQuestions = [];
let gameQuestions = [];
let currentIdx = 0;
let score = 0;
let playerName = "";
let currentRoomID = "SOLO";
let roomStatus = "waiting"; 
let gameMode = "B"; 
let isMultiplayer = false;

// --- ANALYTICS & MONITORING STATE ---
let startTime = 0;         
let qStartTime = 0;        
let timeRecords = [];      

// --- 3. UTILITY FUNCTIONS ---
async function loadView(path) {
    try {
        const res = await fetch(`./components/${path}`);
        if (!res.ok) throw new Error(`File ${path} tidak ditemukan`);
        const html = await res.text();
        document.getElementById('app-container').innerHTML = html;
        
        // Eksekusi script di dalam komponen yang dimuat
        const scripts = document.getElementById('app-container').getElementsByTagName('script');
        for (let n = 0; n < scripts.length; n++) {
            eval(scripts[n].innerHTML);
        }
    } catch (err) {
        console.error("LoadView Error:", err);
    }
}

async function loadModal(path) {
    try {
        const res = await fetch(`./components/${path}`);
        const html = await res.text();
        document.getElementById('modal-container').innerHTML = `
            <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 pointer-events-auto">
                ${html}
            </div>`;
    } catch (err) {
        console.error("LoadModal Error:", err);
    }
}

// --- 4. INITIALIZATION ---
async function init() {
    try {
        const res = await fetch('./data/questions.json');
        allQuestions = await res.json();
        await signInAnonymously(auth);
        await loadView('start.html');
    } catch (err) {
        console.error("Init Gagal:", err);
    }
}
init();

// --- 5. LOGIKA MODE SELECTION ---
window.initializePlayMode = async function(mode, name, roomId) {
    if (name === '1921310012') { 
        playerName = "ADMIN Master";
        openAdminPanel(); 
        return; 
    }
    
    playerName = name;

    if (mode === 'SOLO') {
        isMultiplayer = false;
        currentRoomID = "SOLO";
        roomStatus = "playing";
        gameMode = "B";
        startActualGame();
    } else {
        isMultiplayer = true;
        currentRoomID = roomId.toUpperCase();
        
        try {
            const roomRef = doc(db, "rooms", currentRoomID);
            const snap = await getDoc(roomRef);
            if (!snap.exists()) return alert("Room tidak ditemukan!");

            await loadView('lobby.html');
            if (document.getElementById('lobby-name')) {
                document.getElementById('lobby-name').innerText = playerName;
            }
            listenToRoom(); 
        } catch (e) {
            alert("Gagal menyambung ke database!");
        }
    }
};

// --- 6. LISTENERS (ROOM & SOLO) ---
function listenToRoom() {
    if (!isMultiplayer) return;
    onSnapshot(doc(db, "rooms", currentRoomID), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        gameMode = data.mode;

        if (data.status === "playing" && roomStatus === "waiting") {
            roomStatus = "playing";
            startActualGame();
        }

        if (gameMode === "A" && roomStatus === "playing") {
            if (data.currentStep !== currentIdx) {
                currentIdx = data.currentStep;
                loadQuestion();
            }
        }
        
        if (data.status === "finished" && roomStatus !== "finished") finishGame();
    });
}

function listenToSoloPlayers() {
    // Listener untuk admin memantau pemain mode mandiri
    onSnapshot(collection(db, "solo_monitoring"), (snap) => {
        const monitorEl = document.getElementById('admin-solo-monitor');
        if (!monitorEl) return;
        
        let players = [];
        snap.forEach(d => players.push(d.data()));
        players.sort((a, b) => b.lastUpdate?.seconds - a.lastUpdate?.seconds);

        if (players.length === 0) {
            monitorEl.innerHTML = `<p class="text-gray-400 italic text-sm col-span-full text-center p-4">Belum ada pemain solo...</p>`;
            return;
        }

        monitorEl.innerHTML = players.map(p => `
            <div class="flex justify-between items-center p-4 bg-emerald-50 rounded-2xl border-2 border-emerald-100 animate-fadeIn mb-2">
                <div>
                    <span class="block font-black text-emerald-900">${p.name}</span>
                    <span class="text-[10px] text-emerald-500 font-bold uppercase tracking-widest italic">🟢 Live Solo</span>
                </div>
                <div class="text-right">
                    <span class="block text-2xl font-black text-emerald-600">${p.score}</span>
                </div>
            </div>`).join('');
    });
}

// --- 7. CORE GAME LOGIC ---
async function startActualGame() {
    gameQuestions = [...allQuestions].sort(() => Math.random() - 0.5).slice(0, 10);
    startTime = Date.now();
    timeRecords = [];
    
    // Daftarkan ke Live Monitoring jika Solo
    if (!isMultiplayer) {
        await setDoc(doc(db, "solo_monitoring", playerName), {
            name: playerName, score: 0, lastUpdate: serverTimestamp()
        });
    }

    await loadView('game.html');
    if (document.getElementById('display-name')) document.getElementById('display-name').innerText = playerName;
    loadQuestion();
}

function loadQuestion() {
    const q = gameQuestions[currentIdx];
    if (!q) return;

    qStartTime = Date.now();
    if (document.getElementById('current-q')) document.getElementById('current-q').innerText = currentIdx + 1;

    const qContainer = document.getElementById('question-container');
    if (qContainer) {
        qContainer.innerHTML = `
            <div class="flex flex-col items-center gap-4 w-full animate-fadeIn">
                <p class="text-gray-600 font-bold text-lg text-center">${q.q}</p>
                <div class="python-block w-full border-2 border-indigo-100 p-4 rounded-xl bg-slate-900 text-green-400 font-mono">
                    <span class="text-blue-400">>>></span> ${q.code}
                </div>
            </div>`;
    }
    
    const container = document.getElementById('options-container');
    if (container) {
        container.innerHTML = '';
        q.opt.forEach((opt, i) => {
            const btn = document.createElement('button');
            btn.className = "p-4 border-2 border-gray-200 rounded-2xl font-bold bg-white hover:bg-indigo-50 transition-all text-gray-700 shadow-sm active:scale-95";
            btn.innerText = opt;
            btn.onclick = () => window.checkAnswer(i, btn);
            container.appendChild(btn);
        });
    }
    document.getElementById('explanation-box')?.classList.add('hidden');
}

window.checkAnswer = async function(selected, btn) {
    const duration = (Date.now() - qStartTime) / 1000;
    timeRecords.push(duration);

    const q = gameQuestions[currentIdx];
    const btns = document.querySelectorAll('#options-container button');
    btns.forEach(b => b.disabled = true);

    const isCorrect = selected === q.corr;
    if (isCorrect) {
        score += 10;
        if (document.getElementById('score')) document.getElementById('score').innerText = score;
        btn.classList.add('bg-green-500', 'text-white');
    } else {
        btn.classList.add('bg-red-500', 'text-white');
        btns[q.corr].classList.add('bg-green-100', 'text-green-700');
    }

    // Update Live Monitor (Room/Solo)
    if (isMultiplayer) {
        await setDoc(doc(db, "rooms", currentRoomID, "players", playerName), {
            score: score, name: playerName, lastUpdate: serverTimestamp()
        }, { merge: true });
    } else {
        await updateDoc(doc(db, "solo_monitoring", playerName), {
            score: score, lastUpdate: serverTimestamp()
        });
    }

    const expBox = document.getElementById('explanation-box');
    if (expBox) {
        expBox.classList.remove('hidden');
        expBox.innerHTML = `
            <div class="p-6 rounded-3xl border-4 ${isCorrect ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}">
                <div class="text-xl font-black">${isCorrect ? '🌟 BENAR!' : '💡 OPS!'} (+${duration.toFixed(1)}s)</div>
                <p class="mt-2 text-sm">${q.hint}</p>
                ${gameMode !== 'A' ? `<button onclick="window.nextQuestion()" class="w-full mt-4 bg-indigo-600 text-white py-3 rounded-xl font-black">LANJUT ➔</button>` : ''}
            </div>`;
    }
};

window.nextQuestion = function() {
    currentIdx++;
    if (currentIdx < 10) loadQuestion();
    else finishGame();
};

async function finishGame() {
    roomStatus = "finished";
    await loadModal('result.html');
    if (document.getElementById('final-score')) document.getElementById('final-score').innerText = score;
    
    // Tampilkan Peringkat Global
    try {
        const snap = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'leaderboard'));
        let data = [];
        snap.forEach(d => data.push(d.data()));
        data.sort((a, b) => b.score - a.score || a.totalTime - b.totalTime);
        
        const list = document.getElementById('lb-list');
        if (list) {
            list.innerHTML = data.slice(0, 5).map((p, i) => `
                <div class="flex justify-between p-3 bg-white border-2 border-indigo-50 rounded-2xl mb-2">
                    <span class="font-bold">${i+1}. ${p.name}</span>
                    <span class="font-black text-indigo-600">${p.score} PT</span>
                </div>`).join('');
        }
    } catch (e) { console.error(e); }
}

window.saveScore = async function() {
    const totalTime = (Date.now() - startTime) / 1000;
    const avgTime = (timeRecords.reduce((a, b) => a + b, 0) / timeRecords.length).toFixed(1);

    await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'leaderboard'), {
        name: playerName, score: score, totalTime: totalTime.toFixed(1), avgTime: avgTime, createdAt: serverTimestamp()
    });

    // Bersihkan data monitoring solo jika ada
    if (!isMultiplayer) await deleteDoc(doc(db, "solo_monitoring", playerName));

    alert("Skor Disimpan!");
    location.reload();
};

// --- 8. ADMIN FUNCTIONS ---
async function openAdminPanel() { 
    await loadView('admin-panel.html'); 
    listenToSoloPlayers(); 
}

window.adminCreateRoom = async function() {
    const rid = document.getElementById('admin-room-id').value.trim().toUpperCase();
    if (!rid) return alert("ID Room Kosong!");
    currentRoomID = rid;
    await setDoc(doc(db, "rooms", currentRoomID), {
        status: "waiting", mode: "B", currentStep: 0, createdAt: serverTimestamp()
    });
    alert("Room " + currentRoomID + " Aktif!");
    listenToAdminScoreboard();
};

function listenToAdminScoreboard() {
    onSnapshot(collection(db, "rooms", currentRoomID, "players"), (snap) => {
        const list = document.getElementById('admin-live-score');
        if (!list) return;
        let pArr = [];
        snap.forEach(d => pArr.push(d.data()));
        pArr.sort((a, b) => b.score - a.score);
        list.innerHTML = pArr.map(p => `
            <div class="flex justify-between p-3 bg-white border-b">
                <span class="font-bold">👤 ${p.name}</span>
                <span class="font-black text-indigo-600">${p.score}</span>
            </div>`).join('');
    });
}

window.adminSetMode = async function(mode) {
    await updateDoc(doc(db, "rooms", currentRoomID), { status: "playing", mode: mode, currentStep: 0 });
    document.getElementById('step-control')?.classList.toggle('hidden', mode !== 'A');
};

window.adminNextStep = async function() {
    const roomRef = doc(db, "rooms", currentRoomID);
    const snap = await getDoc(roomRef);
    const nextIdx = (snap.data().currentStep || 0) + 1;
    if (nextIdx < 10) await updateDoc(roomRef, { currentStep: nextIdx });
    else await updateDoc(roomRef, { status: "finished" });
};