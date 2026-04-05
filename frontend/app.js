import * as THREE from 'three';

// ========== АДРЕС БОТА (RENDER) ==========
const API_BASE = 'https://startoplanet.onrender.com';

// ========== Telegram WebApp ==========
let tg = null;
let userId = null;
let displayName = "Игрок";
let userAvatar = 'https://telegram.org/img/tg_icon_light.png';

if (window.Telegram && window.Telegram.WebApp) {
    tg = window.Telegram.WebApp;
    tg.expand();
    tg.ready();
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        userId = tg.initDataUnsafe.user.id;
        if (tg.initDataUnsafe.user.username) displayName = `@${tg.initDataUnsafe.user.username}`;
        else if (tg.initDataUnsafe.user.first_name) displayName = tg.initDataUnsafe.user.first_name;
        userAvatar = tg.initDataUnsafe.user.photo_url || userAvatar;
        console.log('✅ Пользователь авторизован, ID:', userId);
    }
}

// Элементы профиля
const userNameElem = document.getElementById('userName');
const profileNameElem = document.getElementById('profileName');
const userAvatarElem = document.getElementById('userAvatar');
const profileAvatarElem = document.getElementById('profileAvatar');
if (userNameElem) userNameElem.textContent = displayName;
if (profileNameElem) profileNameElem.textContent = displayName;
if (userAvatarElem) userAvatarElem.src = userAvatar;
if (profileAvatarElem) profileAvatarElem.src = userAvatar;

// ========== ИГРОВЫЕ ПЕРЕМЕННЫЕ ==========
let coins = 0;
let energy = 100;
let maxEnergy = 100;
let clickPower = 1;
let clickUpgradeCost = 100;
let clickUpgradeLevel = 1;
let energyUpgradeCost = 200;
let energyUpgradeLevel = 1;
let passiveIncomeLevel = 0;
let passiveIncomeUpgradeCost = 500;
let passiveIncomeRate = 0;

let hasMoon = false;
let hasEarth = false;
let hasSun = false;

let dailyClickCount = 0, dailyCoinsEarned = 0, dailyTasksClaimed = { click: false, coins: false };
let weeklyClickCount = 0, weeklyCoinsEarned = 0, weeklyTasksClaimed = { click: false, coins: false };

let lastClickTime = 0;
let clickCooldown = 30;

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
camera.position.set(0, 0, 3.5);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
if (container) container.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0x404060);
scene.add(ambientLight);
const mainLight = new THREE.DirectionalLight(0xffffff, 1);
mainLight.position.set(2, 3, 4);
scene.add(mainLight);
const fillLight = new THREE.PointLight(0x4466aa, 0.5);
fillLight.position.set(-2, 1, 2);
scene.add(fillLight);

// Планета/звезда
let planetMesh = null;
let starsField = null;

function createStar() {
    if (planetMesh) scene.remove(planetMesh);
    const geometry = new THREE.SphereGeometry(0.85, 128, 128);
    const material = new THREE.MeshStandardMaterial({
        color: 0xffdd99,
        emissive: 0xffaa66,
        emissiveIntensity: 0.7,
        roughness: 0.2,
        metalness: 0.0
    });
    planetMesh = new THREE.Mesh(geometry, material);
    scene.add(planetMesh);
    
    const rayCount = 12;
    for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * Math.PI * 2;
        const rayGeo = new THREE.CylinderGeometry(0.05, 0.12, 0.9, 6);
        const rayMat = new THREE.MeshStandardMaterial({ color: 0xffaa66, emissive: 0xff4422, emissiveIntensity: 0.5 });
        const ray = new THREE.Mesh(rayGeo, rayMat);
        ray.position.set(Math.cos(angle) * 1.15, Math.sin(angle) * 1.15, 0);
        ray.rotation.z = angle;
        scene.add(ray);
    }
}

function createPlanet(level) {
    if (planetMesh) scene.remove(planetMesh);
    
    const colors = {
        1: 0xb0a790, 2: 0xc46d5e, 3: 0xe6b856, 4: 0x4169e1,
        5: 0xb0e0e6, 6: 0xe8cfaa, 7: 0xd8a27a,
        8: 0xc0c0c0, 9: 0x2e6b8f, 10: 0xffaa44
    };
    const sizes = { 1: 0.9, 2: 0.95, 3: 1.0, 4: 1.05, 5: 1.1, 6: 1.15, 7: 1.2, 8: 1.0, 9: 1.05, 10: 1.3 };
    
    const geometry = new THREE.SphereGeometry(sizes[level] || 1.0, 128, 128);
    const material = new THREE.MeshStandardMaterial({
        color: colors[level] || 0xffffff,
        roughness: 0.5,
        metalness: 0.1
    });
    planetMesh = new THREE.Mesh(geometry, material);
    scene.add(planetMesh);
    
    if (level === 6) {
        const ringGeo = new THREE.TorusGeometry(sizes[level] * 1.2, 0.1, 64, 200);
        const ringMat = new THREE.MeshStandardMaterial({ color: 0xc9b37c, roughness: 0.4 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2.2;
        scene.add(ring);
    }
}

function updatePlanetByLevel() {
    const level = getLevel();
    if (level === 0) createStar();
    else createPlanet(level);
}

// Звёздный фон
const starCount = 2000;
const starGeometry = new THREE.BufferGeometry();
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
    starPositions[i*3] = (Math.random() - 0.5) * 200;
    starPositions[i*3+1] = (Math.random() - 0.5) * 200;
    starPositions[i*3+2] = (Math.random() - 0.5) * 100 - 50;
}
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
starsField = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.6 }));
scene.add(starsField);

function animate() {
    requestAnimationFrame(animate);
    if (planetMesh) planetMesh.rotation.y += 0.005;
    if (starsField) starsField.rotation.y += 0.0005;
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ========== ИГРОВАЯ ЛОГИКА ==========
function getLevel() {
    if (hasSun) return 10;
    if (hasEarth) return 9;
    if (hasMoon) return 8;
    if (coins >= 10000000000) return 7;
    if (coins >= 1000000000) return 6;
    if (coins >= 100000000) return 5;
    if (coins >= 10000000) return 4;
    if (coins >= 1000000) return 3;
    if (coins >= 100000) return 2;
    if (coins >= 10000) return 1;
    return 0;
}

function getPassiveRate() {
    let rate = passiveIncomeLevel * 5;
    if (hasSun) rate += 100000;
    else if (hasEarth) rate += 50000;
    else if (hasMoon) rate += 20000;
    return rate;
}

function updateUI() {
    const level = getLevel();
    const levelNames = ['⭐ Белая звезда', '☿ Меркурий', '♂ Марс', '♀ Венера', '♆ Нептун', '⛢ Уран', '♄ Сатурн', '♃ Юпитер', '🌙 Луна', '🌍 Земля', '☀️ Солнце'];
    const userLevelElem = document.getElementById('userLevel');
    if (userLevelElem) userLevelElem.textContent = `Уровень ${level} · ${levelNames[level]}`;
    
    document.getElementById('coins').textContent = Math.floor(coins);
    document.getElementById('energyValue').textContent = `${Math.floor(energy)}/${maxEnergy}`;
    document.getElementById('energyFill').style.width = (energy / maxEnergy) * 100 + '%';
    document.getElementById('clickPower').textContent = clickPower;
    document.getElementById('energyCost').textContent = clickPower;
    document.getElementById('upgradeLevel').textContent = clickUpgradeLevel;
    document.getElementById('energyUpgradeLevel').textContent = energyUpgradeLevel;
    document.getElementById('passiveUpgradeLevel').textContent = passiveIncomeLevel;
    document.getElementById('clickUpgradeCostDisplay').textContent = `${clickUpgradeCost} 🪙`;
    document.getElementById('energyUpgradeCostDisplay').textContent = `${energyUpgradeCost} 🪙`;
    document.getElementById('passiveUpgradeCostDisplay').textContent = `${passiveIncomeUpgradeCost} 🪙`;
    
    let rate = getPassiveRate();
    passiveIncomeRate = rate;
    document.getElementById('passiveIncomeRate').textContent = rate;
    
    updatePlanetByLevel();
    
    document.getElementById('profileCoins').textContent = Math.floor(coins);
    document.getElementById('profileClickPower').textContent = clickPower;
    document.getElementById('profileMaxEnergy').textContent = maxEnergy;
    document.getElementById('profilePassiveIncome').textContent = passiveIncomeRate;
    document.getElementById('profileId').textContent = userId || 'Гость';
    document.getElementById('profileDate').textContent = new Date().toLocaleDateString();
    document.getElementById('dailyClickProgress').textContent = `${dailyClickCount}/100`;
    document.getElementById('dailyCoinsProgress').textContent = `${dailyCoinsEarned}/500`;
    document.getElementById('weeklyClickProgress').textContent = `${weeklyClickCount}/1000`;
    document.getElementById('weeklyCoinsProgress').textContent = `${weeklyCoinsEarned}/5000`;
    updateTaskButtons();
    updatePremiumUI();
}

function updatePremiumUI() {
    const hasJupiter = coins >= 10000000000;
    const moonBtn = document.getElementById('buyMoon');
    const earthBtn = document.getElementById('buyEarth');
    const sunBtn = document.getElementById('buySun');
    const moonCard = document.getElementById('premiumMoonCard');
    const earthCard = document.getElementById('premiumEarthCard');
    const sunCard = document.getElementById('premiumSunCard');
    
    if (hasJupiter && !hasMoon) {
        if (moonCard) moonCard.classList.remove('premium-locked');
        if (moonBtn) { moonBtn.disabled = false; moonBtn.classList.remove('disabled'); moonBtn.textContent = 'Купить за 50 ₽'; }
        const cond = document.getElementById('moonCondition');
        if (cond) cond.innerHTML = '🎉 Доступно для покупки!';
    } else if (hasMoon) {
        if (moonBtn) { moonBtn.disabled = true; moonBtn.classList.add('disabled'); moonBtn.textContent = '✅ КУПЛЕНО'; }
        const cond = document.getElementById('moonCondition');
        if (cond) cond.innerHTML = '✅ Луна куплена';
    }
    if (hasMoon && !hasEarth) {
        if (earthCard) earthCard.classList.remove('premium-locked');
        if (earthBtn) { earthBtn.disabled = false; earthBtn.classList.remove('disabled'); earthBtn.textContent = 'Купить за 100 ₽'; }
        const cond = document.getElementById('earthCondition');
        if (cond) cond.innerHTML = '🎉 Доступно для покупки!';
    } else if (hasEarth) {
        if (earthBtn) { earthBtn.disabled = true; earthBtn.classList.add('disabled'); earthBtn.textContent = '✅ КУПЛЕНО'; }
        const cond = document.getElementById('earthCondition');
        if (cond) cond.innerHTML = '✅ Земля куплена';
    }
    if (hasEarth && !hasSun) {
        if (sunCard) sunCard.classList.remove('premium-locked');
        if (sunBtn) { sunBtn.disabled = false; sunBtn.classList.remove('disabled'); sunBtn.textContent = 'Купить за 200 ₽'; }
        const cond = document.getElementById('sunCondition');
        if (cond) cond.innerHTML = '🎉 Доступно для покупки!';
    } else if (hasSun) {
        if (sunBtn) { sunBtn.disabled = true; sunBtn.classList.add('disabled'); sunBtn.textContent = '✅ КУПЛЕНО'; }
        const cond = document.getElementById('sunCondition');
        if (cond) cond.innerHTML = '✅ Солнце куплено';
    }
}

function buyPremium(type) {
    if (type === 'moon' && coins >= 10000000000 && !hasMoon) {
        hasMoon = true;
        showMessage('🌕 Луна куплена! +20 000 монет/мин');
        updateUI(); saveGame(); syncWithBot();
    } else if (type === 'earth' && hasMoon && !hasEarth) {
        hasEarth = true;
        showMessage('🌍 Земля куплена! +50 000 монет/мин');
        updateUI(); saveGame(); syncWithBot();
    } else if (type === 'sun' && hasEarth && !hasSun) {
        hasSun = true;
        showMessage('☀️ Солнце куплено! +100 000 монет/мин');
        updateUI(); saveGame(); syncWithBot();
    } else {
        showMessage('❌ Условия не выполнены', true);
    }
}

function saveGame() {
    const gameData = {
        coins, energy, maxEnergy, clickPower, clickUpgradeCost, clickUpgradeLevel,
        energyUpgradeCost, energyUpgradeLevel, passiveIncomeLevel, passiveIncomeUpgradeCost,
        dailyClickCount, dailyCoinsEarned, dailyTasksClaimed,
        weeklyClickCount, weeklyCoinsEarned, weeklyTasksClaimed,
        hasMoon, hasEarth, hasSun, soundEnabled
    };
    localStorage.setItem('starToPlanet', JSON.stringify(gameData));
}

function loadGame() {
    const saved = localStorage.getItem('starToPlanet');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            coins = data.coins || 0;
            energy = data.energy ?? 1000;
            maxEnergy = data.maxEnergy ?? 1000;
            clickPower = data.clickPower || 1;
            clickUpgradeCost = data.clickUpgradeCost || 100;
            clickUpgradeLevel = data.clickUpgradeLevel || 1;
            energyUpgradeCost = data.energyUpgradeCost || 200;
            energyUpgradeLevel = data.energyUpgradeLevel || 1;
            passiveIncomeLevel = data.passiveIncomeLevel || 0;
            passiveIncomeUpgradeCost = data.passiveIncomeUpgradeCost || 500;
            dailyClickCount = data.dailyClickCount || 0;
            dailyCoinsEarned = data.dailyCoinsEarned || 0;
            dailyTasksClaimed = data.dailyTasksClaimed || { click: false, coins: false };
            weeklyClickCount = data.weeklyClickCount || 0;
            weeklyCoinsEarned = data.weeklyCoinsEarned || 0;
            weeklyTasksClaimed = data.weeklyTasksClaimed || { click: false, coins: false };
            hasMoon = data.hasMoon || false;
            hasEarth = data.hasEarth || false;
            hasSun = data.hasSun || false;
            soundEnabled = data.soundEnabled !== undefined ? data.soundEnabled : true;
            if (energy > maxEnergy) energy = maxEnergy;
        } catch(e) { console.log(e); }
    }
    updateUI();
}

// ========== СИНХРОНИЗАЦИЯ С БОТОМ ==========
async function syncWithBot() {
    if (!tg) return;
    
    const gameData = {
        coins: Math.floor(coins),
        energy: energy,
        maxEnergy: maxEnergy,
        clickPower: clickPower,
        passiveIncomeLevel: passiveIncomeLevel,
        hasMoon: hasMoon,
        hasEarth: hasEarth,
        hasSun: hasSun,
        clickUpgradeLevel: clickUpgradeLevel,
        clickUpgradeCost: clickUpgradeCost,
        energyUpgradeLevel: energyUpgradeLevel,
        energyUpgradeCost: energyUpgradeCost,
        passiveIncomeUpgradeCost: passiveIncomeUpgradeCost,
        soundEnabled: soundEnabled
    };
    
    // Отправка через Telegram WebApp
    tg.sendData(JSON.stringify(gameData));
    
    // Сохранение через API
    try {
        const response = await fetch(`${API_BASE}/api/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId, gameData: gameData })
        });
        const result = await response.json();
        console.log('📤 API ответ:', result);
    } catch(e) {
        console.error('❌ Ошибка API:', e);
    }
}

async function loadFromServer() {
    if (!userId) return;
    try {
        console.log('🔄 Загрузка данных с сервера...');
        const response = await fetch(`${API_BASE}/api/user/${userId}`);
        if (response.ok) {
            const data = await response.json();
            console.log('📥 Полученные данные:', data);
            
            // Проверяем что данные валидны
            if (data && typeof data.coins === 'number') {
                coins = Math.floor(data.coins);
                energy = data.energy ?? 1000;
                maxEnergy = data.maxEnergy ?? 1000;
                clickPower = data.clickPower || 1;
                passiveIncomeLevel = data.passiveIncomeLevel || 0;
                hasMoon = data.hasMoon || false;
                hasEarth = data.hasEarth || false;
                hasSun = data.hasSun || false;
                
                // Новые поля
                clickUpgradeLevel = data.clickUpgradeLevel || 1;
                clickUpgradeCost = data.clickUpgradeCost || 100;
                energyUpgradeLevel = data.energyUpgradeLevel || 1;
                energyUpgradeCost = data.energyUpgradeCost || 200;
                passiveIncomeUpgradeCost = data.passiveIncomeUpgradeCost || 500;
                soundEnabled = data.soundEnabled !== undefined ? data.soundEnabled : true;
                
                if (energy > maxEnergy) energy = maxEnergy;
                updateUI();
                console.log('✅ Данные загружены с сервера:', { coins, energy, maxEnergy, clickPower });
            } else {
                console.log('❌ Неверные данные с сервера:', data);
            }
        }
    } catch(e) { 
        console.log('❌ Ошибка загрузки:', e); 
    }
}

// ========== ОБРАБОТКА КЛИКОВ ==========
function handleClick(event) {
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
    dailyClickCount++; weeklyClickCount++;
    dailyCoinsEarned += clickPower; weeklyCoinsEarned += clickPower;
    updateUI(); saveGame(); syncWithBot();
    
    const target = document.getElementById('star-container');
    if (target) {
        target.style.transform = 'scale(0.95)';
        setTimeout(() => { if (target) target.style.transform = 'scale(1)'; }, 100);
    }
    
    const popup = document.createElement('div');
    popup.textContent = `+${clickPower}`;
    popup.style.position = 'fixed';
    popup.style.left = (event.clientX || window.innerWidth/2) + 'px';
    popup.style.top = (event.clientY || window.innerHeight/2 - 100) + 'px';
    popup.style.color = '#ffd700';
    popup.style.fontSize = '24px';
    popup.style.fontWeight = 'bold';
    popup.style.pointerEvents = 'none';
    popup.style.zIndex = '1000';
    popup.style.textShadow = '0 0 5px #000';
    popup.style.animation = 'popup 0.5s ease-out forwards';
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 500);
}

const starContainerElem = document.getElementById('star-container');
if (starContainerElem) {
    starContainerElem.addEventListener('click', handleClick);
}

// ========== БУСТЫ ==========
function upgradeClick() {
    const cost = Math.floor(100 * Math.pow(1.3, clickPower - 1));
    if (coins >= cost && clickPower < 100) {
        coins -= cost;
        clickPower++;
        clickUpgradeLevel++;
        clickUpgradeCost = Math.floor(clickUpgradeCost * 1.3);
        updateUI(); saveGame(); syncWithBot();
        showMessage(`✅ Сила клика +1 (${clickPower})`);
    } else if (clickPower >= 100) showMessage('⚠️ Максимальный уровень!', true);
    else showMessage(`❌ Нужно ${cost} монет`, true);
}

function upgradeEnergy() {
    const level = (maxEnergy - 100) / 50;
    const cost = Math.floor(200 * Math.pow(1.25, level));
    if (coins >= cost && maxEnergy < 500) {
        coins -= cost;
        maxEnergy += 50;
        energy += 50;
        energyUpgradeLevel++;
        energyUpgradeCost = Math.floor(energyUpgradeCost * 1.25);
        updateUI(); saveGame(); syncWithBot();
        showMessage(`✅ Макс. энергия +50 (${maxEnergy})`);
    } else if (maxEnergy >= 500) showMessage('⚠️ Максимальный уровень!', true);
    else showMessage(`❌ Нужно ${cost} монет`, true);
}

function upgradePassive() {
    const cost = Math.floor(500 * Math.pow(1.25, passiveIncomeLevel));
    if (coins >= cost && passiveIncomeLevel < 100) {
        coins -= cost;
        passiveIncomeLevel++;
        passiveIncomeUpgradeCost = Math.floor(passiveIncomeUpgradeCost * 1.25);
        updateUI(); saveGame(); syncWithBot();
        showMessage(`✅ Пассивный доход +5/мин (${getPassiveRate()}/мин)`);
    } else if (passiveIncomeLevel >= 100) showMessage('⚠️ Максимальный уровень!', true);
    else showMessage(`❌ Нужно ${cost} монет`, true);
}

// ========== ЗАДАНИЯ ==========
function updateTaskButtons() {
    const dailyClickBtn = document.getElementById('dailyClickClaim');
    const dailyCoinsBtn = document.getElementById('dailyCoinsClaim');
    const weeklyClickBtn = document.getElementById('weeklyClickClaim');
    const weeklyCoinsBtn = document.getElementById('weeklyCoinsClaim');
    if (dailyClickBtn) { if (dailyClickCount >= 100 && !dailyTasksClaimed.click) dailyClickBtn.classList.remove('disabled'); else dailyClickBtn.classList.add('disabled'); }
    if (dailyCoinsBtn) { if (dailyCoinsEarned >= 500 && !dailyTasksClaimed.coins) dailyCoinsBtn.classList.remove('disabled'); else dailyCoinsBtn.classList.add('disabled'); }
    if (weeklyClickBtn) { if (weeklyClickCount >= 1000 && !weeklyTasksClaimed.click) weeklyClickBtn.classList.remove('disabled'); else weeklyClickBtn.classList.add('disabled'); }
    if (weeklyCoinsBtn) { if (weeklyCoinsEarned >= 5000 && !weeklyTasksClaimed.coins) weeklyCoinsBtn.classList.remove('disabled'); else weeklyCoinsBtn.classList.add('disabled'); }
}

async function claimTask(taskId, reward, type) {
    if (type === 'daily_click' && !dailyTasksClaimed.click && dailyClickCount >= 100) { dailyTasksClaimed.click = true; coins += reward; showMessage(`🎉 +${reward} монет!`); }
    else if (type === 'daily_coins' && !dailyTasksClaimed.coins && dailyCoinsEarned >= 500) { dailyTasksClaimed.coins = true; coins += reward; showMessage(`🎉 +${reward} монет!`); }
    else if (type === 'weekly_click' && !weeklyTasksClaimed.click && weeklyClickCount >= 1000) { weeklyTasksClaimed.click = true; coins += reward; showMessage(`🎉 +${reward} монет!`); }
    else if (type === 'weekly_coins' && !weeklyTasksClaimed.coins && weeklyCoinsEarned >= 5000) { weeklyTasksClaimed.coins = true; coins += reward; showMessage(`🎉 +${reward} монет!`); }
    else { showMessage('❌ Условия не выполнены', true); return; }
    updateUI(); saveGame(); syncWithBot(); updateTaskButtons();
}

// ========== РЕЙТИНГ ==========
async function loadLeaderboard() {
    const container = document.getElementById('leaderboardList');
    if (!container) return;
    try {
        const response = await fetch(`${API_BASE}/api/leaderboard`);
        if (response.ok) {
            const players = await response.json();
            if (players.length > 0) {
                container.innerHTML = players.map((p, i) => {
                    let medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
                    const isCurrent = p.id == userId;
                    return `<div class="leaderboard-item" style="${isCurrent ? 'border:1px solid #ffd700;background:rgba(255,215,0,0.1);' : ''}"><div class="leaderboard-rank ${i<3?`top-${i+1}`:''}">${medal}</div><div class="leaderboard-name">${p.name} ${isCurrent ? '👤' : ''}</div><div class="leaderboard-coins">${p.coins.toLocaleString()} 🪙</div></div>`;
                }).join('');
                return;
            }
        }
    } catch(e) { console.log(e); }
    container.innerHTML = '<div class="leaderboard-item">🏆 Загрузка...</div>';
}

function loadFriends() {
    const container = document.getElementById('level1List');
    if (container) container.innerHTML = `<div class="level-item"><span>👥 Пригласите друзей через реферальную ссылку</span><span></span></div>`;
    document.getElementById('referralCount').textContent = '0';
    document.getElementById('referralBonus').textContent = '0';
    document.getElementById('profileReferrals').textContent = '0';
}

function updateReferralLink() { 
    const linkInput = document.getElementById('referralLink'); 
    if(linkInput && userId) linkInput.value = `https://t.me/startoplanet_bot?start=ref_${userId}`; 
}

function copyReferralLink() { 
    const input = document.getElementById('referralLink'); 
    if(input) { input.select(); document.execCommand('copy'); showMessage('✅ Ссылка скопирована'); } 
}

function shareReferralLink() {
    const input = document.getElementById('referralLink');
    if(input && tg && tg.openTelegramLink) {
        tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(input.value)}&text=⭐ Star to Planet ⭐ Присоединяйся и получай бонусы!`);
    } else if(input) {
        window.open(`https://t.me/share/url?url=${encodeURIComponent(input.value)}&text=⭐ Star to Planet ⭐ Присоединяйся и получай бонусы!`, '_blank');
    }
}

// ========== ПАНЕЛИ ==========
function setupTabs() {
    const panels = {
        game: document.getElementById('game-area'),
        tasks: document.getElementById('tasksPanel'),
        friends: document.getElementById('friendsPanel'),
        profile: document.getElementById('profilePanel'),
        leaderboard: document.getElementById('leaderboardPanel'),
        airdrop: document.getElementById('airdropPanel')
    };
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            Object.values(panels).forEach(p => { if(p) p.style.display = 'none'; });
            if (panels[tab]) panels[tab].style.display = 'block';
            if (tab === 'game') panels.game.style.display = 'flex';
            if (tab === 'leaderboard') loadLeaderboard();
            if (tab === 'friends') { loadFriends(); updateReferralLink(); }
        });
    });
}

function setupTasksTabs() {
    const tabs = document.querySelectorAll('.tasks-tab');
    const contents = { daily: document.getElementById('dailyTasks'), weekly: document.getElementById('weeklyTasks'), premium: document.getElementById('premiumTasks') };
    tabs.forEach(t => {
        t.addEventListener('click', () => {
            const target = t.dataset.tasksTab;
            tabs.forEach(tt => tt.classList.remove('active'));
            t.classList.add('active');
            Object.values(contents).forEach(c => c?.classList.remove('active'));
            if (contents[target]) contents[target].classList.add('active');
        });
    });
}

function showMessage(text, isError = false) {
    const msg = document.getElementById('message');
    if (!msg) return;
    msg.textContent = text;
    msg.style.color = isError ? '#ff6b6b' : '#FFD60A';
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2000);
}

function applyPassiveIncome() { 
    if (passiveIncomeRate > 0) { 
        coins += passiveIncomeRate; 
        updateUI(); 
        saveGame(); 
        syncWithBot(); 
    } 
}

function rechargeEnergy() { 
    if (energy < maxEnergy) { 
        energy = Math.min(energy + 5, maxEnergy); 
        updateUI(); 
    } 
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
async function init() {
    await loadFromServer();
    loadGame();
    setupTabs();
    setupTasksTabs();
    updateReferralLink();
    
    document.getElementById('buyClickUpgrade')?.addEventListener('click', upgradeClick);
    document.getElementById('buyEnergyUpgrade')?.addEventListener('click', upgradeEnergy);
    document.getElementById('buyPassiveUpgrade')?.addEventListener('click', upgradePassive);
    document.getElementById('copyLinkBtn')?.addEventListener('click', copyReferralLink);
    document.getElementById('shareLinkBtn')?.addEventListener('click', shareReferralLink);
    document.getElementById('dailyClickClaim')?.addEventListener('click', () => claimTask('dailyClickClaim', 100, 'daily_click'));
    document.getElementById('dailyCoinsClaim')?.addEventListener('click', () => claimTask('dailyCoinsClaim', 500, 'daily_coins'));
    document.getElementById('weeklyClickClaim')?.addEventListener('click', () => claimTask('weeklyClickClaim', 1000, 'weekly_click'));
    document.getElementById('weeklyCoinsClaim')?.addEventListener('click', () => claimTask('weeklyCoinsClaim', 2500, 'weekly_coins'));
    document.getElementById('buyMoon')?.addEventListener('click', () => buyPremium('moon'));
    document.getElementById('buyEarth')?.addEventListener('click', () => buyPremium('earth'));
    document.getElementById('buySun')?.addEventListener('click', () => buyPremium('sun'));
    
    const boostBtn = document.getElementById('boostBtn');
    const boostModal = document.getElementById('boostModal');
    const closeBoost = document.getElementById('closeBoostModal');
    if(boostBtn) boostBtn.onclick = () => boostModal.classList.add('active');
    if(closeBoost) closeBoost.onclick = () => boostModal.classList.remove('active');
    if(boostModal) boostModal.onclick = (e) => { if(e.target === boostModal) boostModal.classList.remove('active'); };
    
    setInterval(applyPassiveIncome, 60000);
    
    // Периодическая синхронизация с сервером каждые 30 секунд
    setInterval(async () => {
        await loadFromServer();
        console.log('🔄 Данные синхронизированы с сервером');
    }, 30000);
    
    // Синхронизация при фокусе окна (для компьютеров)
    window.addEventListener('focus', async () => {
        await loadFromServer();
        console.log('🔄 Данные синхронизированы при фокусе окна');
    });
    
    // Синхронизация при видимости страницы (для телефонов)
    document.addEventListener('visibilitychange', async () => {
        if (!document.hidden) {
            await loadFromServer();
            console.log('🔄 Данные синхронизированы при возврате на страницу');
        }
    });
    setInterval(rechargeEnergy, 1000);
    
    const raysContainer = document.getElementById('raysContainer');
    if(raysContainer) for(let i=0;i<12;i++) { const ray = document.createElement('div'); ray.className = 'ray'; raysContainer.appendChild(ray); }
    
    const gameArea = document.getElementById('game-area');
    if (gameArea) gameArea.style.display = 'flex';
    
    if(!document.querySelector('#popup-animation')) {
        const style = document.createElement('style');
        style.id = 'popup-animation';
        style.textContent = `@keyframes popup {0%{opacity:1;transform:translateY(0) scale(0.8);}100%{opacity:0;transform:translateY(-50px) scale(1);}}.floating-number{animation:popup 0.5s ease-out forwards !important;}`;
        document.head.appendChild(style);
    }
    
    setTimeout(() => { loadLeaderboard(); loadFriends(); }, 1000);
    
    const soundToggleBtn = document.getElementById('soundToggle');
    if (soundToggleBtn) {
        soundToggleBtn.addEventListener('click', () => {
            soundEnabled = !soundEnabled;
            soundToggleBtn.textContent = soundEnabled ? '🔊' : '🔇';
            showMessage(soundEnabled ? '🔊 Звук включён' : '🔇 Звук выключен');
        });
    }
}

init();