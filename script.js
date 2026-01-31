import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";

// --- KONFIGURASI FIREBASE ---
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

// --- GAME STATE ---
let allQuestions = [];
let gameQuestions = [];
let currentIdx = 0;
let score = 0;
let playerName = "";

// --- UTILITY: LOAD COMPONENT ---
async function loadView(path) {
    const res = await fetch(`./components/${path}`);
    const html = await res.text();
    document.getElementById('app-container').innerHTML = html;
}

async function loadModal(path) {
    const res = await fetch(`./components/${path}`);
    const html = await res.text();
    document.getElementById('modal-container').innerHTML = html;
}

// --- INITIALIZATION ---
async function init() {
    try {
        const res = await fetch('./data/questions.json');
        allQuestions = await res.json();
        
        await loadView('start.html');
        signInAnonymously(auth).catch(() => console.error("Database Offline"));
    } catch (err) {
        console.error("Gagal inisialisasi:", err);
    }
}

init();

// --- GAME FUNCTIONS ---

// 1. Mulai Game
window.handleStart = async function() {
    const input = document.getElementById('player-name').value.trim();
    if (input === '1921310012') { await openAdmin(); return; }
    if (input.length < 3) return alert("Nama minimal 3 huruf!");

    playerName = input;
    // Acak 50 soal dan ambil 10 saja
    gameQuestions = [...allQuestions].sort(() => Math.random() - 0.5).slice(0, 10);
    
    await loadView('game.html');
    document.getElementById('display-name').innerText = playerName;
    loadQuestion();
};

// 2. Tampilkan Soal
function loadQuestion() {
    const q = gameQuestions[currentIdx];
    
    // Reset tampilan nomor soal
    document.getElementById('current-q').innerText = currentIdx + 1;
    
    // Tampilkan Pertanyaan & Kode
    document.getElementById('question-container').innerHTML = `
        <div class="flex flex-col items-center gap-4 w-full animate-fadeIn">
            <p class="text-gray-600 font-bold text-lg text-center">${q.q}</p>
            <div class="python-block w-full"><span class="text-blue-500">>>></span> ${q.code}</div>
        </div>`;
    
    // Tampilkan Pilihan Jawaban
    const container = document.getElementById('options-container');
    container.innerHTML = '';
    q.opt.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = "p-4 border-2 border-gray-200 rounded-2xl font-bold bg-white hover:bg-blue-50 transition-all active:scale-95";
        btn.innerText = opt;
        btn.onclick = () => window.checkAnswer(i, btn);
        container.appendChild(btn);
    });

    // Pastikan kotak penjelasan sembunyi saat soal baru
    const expBox = document.getElementById('explanation-box');
    if(expBox) expBox.classList.add('hidden');
}

// 3. Cek Jawaban & Beri Penjelasan
window.checkAnswer = function(selected, btn) {
    const q = gameQuestions[currentIdx];
    const btns = document.querySelectorAll('#options-container button');
    
    const expBox = document.getElementById('explanation-box');
    const expIcon = document.getElementById('exp-icon');
    const expTitle = document.getElementById('exp-title');
    const expText = document.getElementById('exp-text');

    // Kunci semua tombol agar tidak bisa klik lagi
    btns.forEach(b => b.disabled = true);

    // Tampilkan kotak penjelasan
    expBox.classList.remove('hidden');

    if (selected === q.corr) {
        // JAWABAN BENAR
        score += 10;
        document.getElementById('score').innerText = score;
        btn.classList.add('bg-green-500', 'text-white', 'border-green-700', 'correct-anim');
        
        expBox.className = "mt-6 p-6 rounded-3xl border-4 border-green-400 bg-green-50 animate-slideUp";
        expIcon.innerText = "🌟";
        expTitle.innerText = "HEBAT! JAWABAN BENAR";
        expTitle.className = "font-black text-xl text-green-700";
    } else {
        // JAWABAN SALAH
        btn.classList.add('bg-red-500', 'text-white', 'border-red-700', 'wrong-anim');
        btns[q.corr].classList.add('bg-green-100', 'text-green-700', 'border-green-500');
        
        expBox.className = "mt-6 p-6 rounded-3xl border-4 border-red-400 bg-red-50 animate-slideUp";
        expIcon.innerText = "💡";
        expTitle.innerText = "YAH, KURANG TEPAT";
        expTitle.className = "font-black text-xl text-red-700";
    }

    // Masukkan teks hint dari JSON
    expText.innerText = q.hint;
};

// 4. Lanjut ke Soal Berikutnya (Dipanggil tombol di game.html)
window.nextQuestion = async function() {
    currentIdx++;
    if (currentIdx < 10) {
        loadQuestion();
    } else {
        await loadModal('result.html');
        document.getElementById('final-score').innerText = score;
    }
};

// --- DATABASE & SCORE FUNCTIONS ---

window.saveScore = async function() {
    const btn = document.getElementById('save-btn');
    btn.innerText = "Menyimpan..."; btn.disabled = true;
    try {
        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'leaderboard'), {
            name: playerName, 
            score: score, 
            createdAt: serverTimestamp()
        });
        window.toggleLeaderboard(true);
    } catch (err) {
        alert("Gagal menyimpan skor!");
        btn.innerText = "Coba Lagi"; btn.disabled = false;
    }
};

window.toggleLeaderboard = async function(show) {
    if (show) {
        await loadModal('leaderboard.html');
        const list = document.getElementById('lb-list');
        const snap = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'leaderboard'));
        let data = [];
        snap.forEach(d => data.push(d.data()));
        data.sort((a, b) => b.score - a.score);
        
        list.innerHTML = data.slice(0, 10).map((p, i) => `
            <div class="flex justify-between items-center p-4 bg-gray-50 rounded-2xl mb-2 border-2 border-gray-100">
                <span class="font-bold text-gray-700">${i+1}. ${p.name}</span>
                <span class="font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-lg">${p.score}</span>
            </div>`).join('');
    } else {
        document.getElementById('modal-container').innerHTML = '';
    }
};

// --- ADMIN FUNCTIONS ---
async function openAdmin() {
    await loadView('admin.html');
    const list = document.getElementById('admin-list');
    const snap = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'leaderboard'));
    let data = [];
    snap.forEach(d => data.push(d.data()));
    data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    list.innerHTML = data.map(p => `
        <div class="flex justify-between p-4 bg-white border-2 rounded-2xl mb-2 shadow-sm">
            <div>
                <div class="font-bold text-gray-800">${p.name}</div>
                <div class="text-xs text-gray-400">${p.createdAt ? new Date(p.createdAt.seconds*1000).toLocaleString('id-ID') : 'Baru saja'}</div>
            </div>
            <div class="font-black text-red-500 text-xl">${p.score}</div>
        </div>`).join('');
}