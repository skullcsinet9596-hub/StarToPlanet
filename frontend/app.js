import * as THREE from 'three';

// ========== АДРЕС БОТА (RENDER) ==========
// Игра и бот находятся на одном сервере, поэтому используем относительные пути.
// Это проще и надежнее.
const API_BASE = ''; // Пустая строка означает "текущий сервер"

// ========== Telegram WebApp ==========
let tg = null;
let userId = null;
let initData = null;

if (window.Telegram && window.Telegram.WebApp) {
    tg = window.Telegram.WebApp;
    tg.expand();
    tg.ready();
    initData = tg.initDataUnsafe;
    if (initData && initData.user) {
        userId = initData.user.id;
        console.log('✅ Пользователь авторизован в Telegram, ID:', userId);
    } else {
        console.log('⚠️ Запущено вне Telegram или данные пользователя не получены.');
    }
} else {
    console.log('⚠️ Telegram WebApp не обнаружен.');
}

// ========== ИГРОВЫЕ ПЕРЕМЕННЫЕ ==========
let coins = 0;
let energy = 100;
let maxEnergy = 100;
let clickPower = 1;
let passiveIncomeLevel = 0;
let hasMoon = false;
let hasEarth = false;
let hasSun = false;

let lastClickTime = 0;
let clickCooldown = 30;
let isSaving = false;

// ========== ЗВУК ==========
let soundEnabled = true;
let playTapSound = null;
let audioContext = null;

function initAudio() {
    if (audioContext) return;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.25;
        gainNode.connect(audioContext.destination);

        playTapSound = () => {
            if (!soundEnabled) return;
            if (audioContext.state === 'suspended') audioContext.resume();
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.connect(gain);
            gain.connect(gainNode);
            osc.frequency.value = 880;
            gain.gain.value = 0.15;
            osc.type = 'sine';
            osc.start();
            gain.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.2);
            osc.stop(audioContext.currentTime + 0.2);
        };
    } catch(e) { console.log('Web Audio не поддерживается'); }
}

// ========== 3D СЦЕНА ==========
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030318);
scene.fog = new THREE.FogExp2(0x030318, 0.003);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0x404060);
scene.add(ambientLight);
const mainLight = new THREE.DirectionalLight(0xffffff, 1);
mainLight.position.set(2, 3, 4);
scene.add(mainLight);
const fillLight = new THREE.PointLight(0x4466aa, 0.5);
fillLight.position.set(-2, 1, 2);
scene.add(fillLight);

const geometry = new THREE.SphereGeometry(1, 128, 128);
const textureLoader = new THREE.TextureLoader();
const earthMap = textureLoader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg');
const material = new THREE.MeshStandardMaterial({ map: earthMap, roughness: 0.5, metalness: 0.1 });
const planet = new THREE.Mesh(geometry, material);
scene.add(planet);

const starCount = 1500;
const starGeometry = new THREE.BufferGeometry();
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
    starPositions[i*3] = (Math.random() - 0.5) * 200;
    starPositions[i*3+1] = (Math.random() - 0.5) * 200;
    starPositions[i*3+2] = (Math.random() - 0.5) * 100 - 50;
}
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.6 }));
scene.add(stars);

function animate() {
    requestAnimationFrame(animate);
    planet.rotation.y += 0.003;
    stars.rotation.y += 0.0005;
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ========== ЗАГРУЗКА С СЕРВЕРА ==========
async function loadFromServer() {
    if (!userId) {
        console.log('❌ Нет userId, загружаем демо-данные');
        updateUI(); // Показываем интерфейс с 0
        return;
    }
    console.log(`🔄 Загружаем данные для пользователя ${userId}...`);
    try {
        const response = await fetch(`${API_BASE}/api/user/${userId}`);
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Данные получены:', data);
            coins = data.coins || 0;
            energy = data.energy ?? 100;
            maxEnergy = data.maxEnergy ?? 100;
            clickPower = data.clickPower || 1;
            passiveIncomeLevel = data.passiveIncomeLevel || 0;
            hasMoon = data.hasMoon || false;
            hasEarth = data.hasEarth || false;
            hasSun = data.hasSun || false;
            if (energy > maxEnergy) energy = maxEnergy;
            updateUI();
            console.log('✅ Интерфейс обновлён загруженными данными');
        } else {
            console.error('❌ Ошибка загрузки с сервера:', response.status);
        }
    } catch(e) { 
        console.error('❌ Ошибка сети при загрузке:', e);
    }
}

// ========== СОХРАНЕНИЕ НА СЕРВЕР ==========
async function saveToServer() {
    if (!userId || isSaving) return;
    isSaving = true;
    const gameData = {
        coins: Math.floor(coins),
        energy: energy,
        maxEnergy: maxEnergy,
        clickPower: clickPower,
        passiveIncomeLevel: passiveIncomeLevel,
        hasMoon: hasMoon,
        hasEarth: hasEarth,
        hasSun: hasSun
    };
    console.log(`🔄 Сохраняем данные для пользователя ${userId}:`, gameData);
    try {
        const response = await fetch(`${API_BASE}/api/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId, gameData: gameData })
        });
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Данные сохранены на сервере. Ранг:', result.rank);
        } else {
            console.error('❌ Ошибка сохранения на сервере:', response.status);
        }
    } catch(e) { 
        console.error('❌ Ошибка сети при сохранении:', e);
    }
    finally { isSaving = false; }
}

// ========== МУЛЬТИТАП ==========
async function handleTap(clientX, clientY) {
    const now = Date.now();
    if (now - lastClickTime < clickCooldown) return;
    lastClickTime = now;
    if (energy < clickPower) {
        showMessage('❌ Нет энергии!', true);
        return;
    }
    if (!audioContext) initAudio();
    if (playTapSound) playTapSound();

    energy -= clickPower;
    coins += clickPower;

    planet.scale.set(0.96, 0.96, 0.96);
    setTimeout(() => planet.scale.set(1, 1, 1), 100);

    const flash = new THREE.PointLight(0xffaa66, 0.8);
    flash.position.set((clientX / window.innerWidth - 0.5) * 5, -(clientY / window.innerHeight - 0.5) * 4, 2);
    scene.add(flash);
    setTimeout(() => scene.remove(flash), 150);

    const popup = document.createElement('div');
    popup.textContent = `+${clickPower}`;
    popup.style.cssText = `position:fixed; left:${clientX}px; top:${clientY-30}px; color:#FFD60A; font-size:22px; font-weight:bold; pointer-events:none; z-index:1000; text-shadow:0 0 5px black; animation:popupAnim 0.4s ease-out forwards;`;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 400);

    updateUI();
    await saveToServer();
}

renderer.domElement.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (let i = 0; i < e.touches.length; i++) handleTap(e.touches[i].clientX, e.touches[i].clientY);
});
renderer.domElement.addEventListener('mousedown', (e) => {
    e.preventDefault();
    handleTap(e.clientX, e.clientY);
});

const styleAnim = document.createElement('style');
styleAnim.textContent = `@keyframes popupAnim { 0% { opacity: 1; transform: translateY(0) scale(0.8); } 100% { opacity: 0; transform: translateY(-40px) scale(1); } }`;
document.head.appendChild(styleAnim);

// ========== ИГРОВАЯ ЛОГИКА ==========
function getPassiveRate() {
    let rate = passiveIncomeLevel * 5;
    if (hasSun) rate += 100000;
    else if (hasEarth) rate += 50000;
    else if (hasMoon) rate += 20000;
    return rate;
}

function updateUI() {
    const coinsElement = document.getElementById('coins');
    const energyValueElement = document.getElementById('energyValue');
    const energyFillElement = document.getElementById('energyFill');
    const clickPowerElement = document.getElementById('clickPower');
    const passiveRateElement = document.getElementById('passiveRate');

    if (coinsElement) coinsElement.textContent = Math.floor(coins);
    if (energyValueElement) energyValueElement.textContent = `${Math.floor(energy)}/${maxEnergy}`;
    if (energyFillElement) energyFillElement.style.width = (energy / maxEnergy) * 100 + '%';
    if (clickPowerElement) clickPowerElement.textContent = clickPower;
    if (passiveRateElement) passiveRateElement.textContent = getPassiveRate();
}

function showMessage(text, isError = false) {
    const msg = document.getElementById('message');
    if (!msg) return;
    msg.textContent = text;
    msg.style.color = isError ? '#ff6b6b' : '#FFD60A';
    msg.style.display = 'block';
    msg.style.animation = 'fadeOut 2s forwards';
    setTimeout(() => {
        msg.style.display = 'none';
        msg.style.animation = '';
    }, 2000);
}

// ========== БУСТЫ ==========
async function upgradeClick() {
    const cost = Math.floor(100 * Math.pow(1.3, clickPower - 1));
    if (coins >= cost && clickPower < 100) {
        coins -= cost;
        clickPower++;
        updateUI();
        await saveToServer();
        showMessage(`✅ Сила клика +1 (${clickPower})`);
    } else showMessage(`❌ Нужно ${cost} монет`, true);
}

async function upgradeEnergy() {
    const level = (maxEnergy - 100) / 50;
    const cost = Math.floor(200 * Math.pow(1.25, level));
    if (coins >= cost && maxEnergy < 500) {
        coins -= cost;
        maxEnergy += 50;
        energy += 50;
        updateUI();
        await saveToServer();
        showMessage(`✅ Макс. энергия +50 (${maxEnergy})`);
    } else showMessage(`❌ Нужно ${cost} монет`, true);
}

async function upgradePassive() {
    const cost = Math.floor(500 * Math.pow(1.25, passiveIncomeLevel));
    if (coins >= cost && passiveIncomeLevel < 100) {
        coins -= cost;
        passiveIncomeLevel++;
        updateUI();
        await saveToServer();
        showMessage(`✅ Пассивный доход +5/мин (${getPassiveRate()}/мин)`);
    } else showMessage(`❌ Нужно ${cost} монет`, true);
}

// ========== ПАНЕЛИ ==========
function closePanel() { document.querySelector('.floating-panel')?.remove(); }

function showBoostPanel() {
    closePanel();
    const rate = getPassiveRate();
    const clickCost = Math.floor(100 * Math.pow(1.3, clickPower - 1));
    const level = (maxEnergy - 100) / 50;
    const energyCost = Math.floor(200 * Math.pow(1.25, level));
    const passiveCost = Math.floor(500 * Math.pow(1.25, passiveIncomeLevel));
    const panel = document.createElement('div');
    panel.className = 'floating-panel';
    panel.innerHTML = `
        <h3>⚡ УЛУЧШЕНИЯ</h3>
        <button id="upgrade-click">⭐ Сила клика (${clickPower}) — ${clickCost} 🪙</button>
        <button id="upgrade-energy">⚡ Энергия (${maxEnergy}) — ${energyCost} 🪙</button>
        <button id="upgrade-passive">🤖 Пассивный доход (${rate}/мин) — ${passiveCost} 🪙</button>
        <button class="close-btn" id="close-boost">Закрыть</button>
    `;
    document.body.appendChild(panel);
    document.getElementById('upgrade-click').onclick = () => { upgradeClick(); panel.remove(); showBoostPanel(); };
    document.getElementById('upgrade-energy').onclick = () => { upgradeEnergy(); panel.remove(); showBoostPanel(); };
    document.getElementById('upgrade-passive').onclick = () => { upgradePassive(); panel.remove(); showBoostPanel(); };
    document.getElementById('close-boost').onclick = () => panel.remove();
}

function showProfilePanel() {
    closePanel();
    const rate = getPassiveRate();
    let planetName = '⭐ Белая звезда';
    if (hasSun) planetName = '☀️ Солнце';
    else if (hasEarth) planetName = '🌍 Земля';
    else if (hasMoon) planetName = '🌙 Луна';
    else if (coins >= 10000000000) planetName = '♃ Юпитер';
    else if (coins >= 1000000000) planetName = '♄ Сатурн';
    else if (coins >= 100000000) planetName = '⛢ Уран';
    else if (coins >= 10000000) planetName = '♆ Нептун';
    else if (coins >= 1000000) planetName = '♀ Венера';
    else if (coins >= 100000) planetName = '♂ Марс';
    else if (coins >= 10000) planetName = '☿ Меркурий';
    const panel = document.createElement('div');
    panel.className = 'floating-panel';
    panel.innerHTML = `
        <h3>👤 ПРОФИЛЬ</h3>
        <div class="profile-row"><b>⭐ Уровень:</b> ${planetName}</div>
        <div class="profile-row"><b>💰 Монет:</b> ${Math.floor(coins).toLocaleString()}</div>
        <div class="profile-row"><b>💪 Сила клика:</b> ${clickPower}</div>
        <div class="profile-row"><b>⚡ Энергия:</b> ${Math.floor(energy)}/${maxEnergy}</div>
        <div class="profile-row"><b>🤖 Пассивный доход:</b> ${rate}/мин</div>
        <button class="close-btn" id="close-profile">Закрыть</button>
    `;
    document.body.appendChild(panel);
    document.getElementById('close-profile').onclick = () => panel.remove();
}

async function showRatingPanel() {
    closePanel();
    let players = [];
    try {
        const response = await fetch(`${API_BASE}/api/leaderboard`);
        if (response.ok) {
            players = await response.json();
        }
    } catch(e) { console.log('Ошибка рейтинга', e); }

    if (!players || players.length === 0) {
        players = [{ name: 'Вы', coins: Math.floor(coins), isCurrent: true }];
    } else {
        // Обновляем данные текущего игрока в списке лидеров
        const currentPlayerIndex = players.findIndex(p => p.id == userId);
        if (currentPlayerIndex !== -1) {
            players[currentPlayerIndex].coins = Math.floor(coins);
            players[currentPlayerIndex].isCurrent = true;
        } else if (userId) {
            players.push({ id: userId, name: 'Вы', coins: Math.floor(coins), isCurrent: true });
        }
        players.sort((a,b) => b.coins - a.coins);
    }

    let html = '<h3>🏆 ТАБЛИЦА ЛИДЕРОВ</h3>';
    for (let i = 0; i < Math.min(players.length, 10); i++) {
        const p = players[i];
        let medal = i === 0 ? '👑 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : `${i+1}. `;
        const marker = p.isCurrent ? ' 👈' : '';
        const name = p.name && p.name !== 'Вы' ? p.name : (p.isCurrent ? 'Вы' : `Игрок ${p.id || '?'}`);
        html += `<div class="profile-row" style="${p.isCurrent ? 'color:#FFD60A; font-weight:bold;' : ''}">${medal}${name} — ${p.coins.toLocaleString()} 🪙${marker}</div>`;
    }
    html += '<button class="close-btn" id="close-rating">Закрыть</button>';
    const panel = document.createElement('div');
    panel.className = 'floating-panel';
    panel.innerHTML = html;
    document.body.appendChild(panel);
    document.getElementById('close-rating').onclick = () => panel.remove();
}

function showTab(tab) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (btn.dataset.tab === tab) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    closePanel();
    if (tab === 'boost') showBoostPanel();
    else if (tab === 'profile') showProfilePanel();
    else if (tab === 'rating') showRatingPanel();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

// ========== ЗВУК TOGGLE ==========
const soundToggle = document.getElementById('soundToggle');
if (soundToggle) {
    soundToggle.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        soundToggle.textContent = soundEnabled ? '🔊' : '🔇';
        showMessage(soundEnabled ? '🔊 Звук включён' : '🔇 Звук выключен');
    });
} else {
    console.error('❌ Кнопка звука (#soundToggle) не найдена в DOM!');
}

// ========== ЭНЕРГИЯ 5/СЕК ==========
setInterval(async () => {
    if (energy < maxEnergy) {
        energy = Math.min(energy + 5, maxEnergy);
        updateUI();
        await saveToServer();
    }
}, 1000);

// ========== ПАССИВНЫЙ ДОХОД ==========
setInterval(async () => {
    const rate = getPassiveRate();
    if (rate > 0) {
        coins += rate;
        updateUI();
        await saveToServer();
    }
}, 60000);

// ========== ЗАПУСК ==========
// Загружаем данные с сервера и запускаем игру
loadFromServer().then(() => {
    console.log('✅ Игра загружена и синхронизирована с сервером');
}).catch(err => {
    console.error('❌ Критическая ошибка при загрузке игры:', err);
});