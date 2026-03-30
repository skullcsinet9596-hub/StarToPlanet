// ==================== ИНИЦИАЛИЗАЦИЯ TELEGRAM WEBAPP ====================
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// ==================== ПОЛУЧЕНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЯ ====================
const tgUser = tg.initDataUnsafe?.user;
let authMethod = 'telegram';
let userId = null;
let displayName = "Игрок";
let botUsername = 'startoplanet_bot';
const BOT_API_URL = 'https://star-to-planet-bot.onrender.com';

function getReferrerId() {
    const urlParams = new URLSearchParams(window.location.search);
    const startapp = urlParams.get('startapp');
    if (startapp && startapp.startsWith('ref_')) {
        return startapp.replace('ref_', '');
    }
    return null;
}
const referrerId = getReferrerId();

if (tgUser) {
    userId = tgUser.id;
    if (tgUser.username) displayName = `@${tgUser.username}`;
    else if (tgUser.first_name && tgUser.last_name) displayName = `${tgUser.first_name} ${tgUser.last_name}`;
    else if (tgUser.first_name) displayName = tgUser.first_name;
    authMethod = 'telegram';
} else {
    userId = 'guest_' + Math.floor(Math.random() * 1000000000);
    displayName = "Гость";
    authMethod = 'guest';
}

// ==================== ИГРОВЫЕ ПЕРЕМЕННЫЕ ====================
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
let referralCount = 0;
let referralBonusTotal = 0;
let leaderboardPosition = 1;
let registrationDate = new Date().toLocaleDateString();

// ==================== ПЕРЕМЕННЫЕ ЗАДАНИЙ ====================
let dailyClickCount = 0;
let dailyCoinsEarned = 0;
let dailyReferralCount = 0;
let dailyUpgradeCount = 0;
let weeklyClickCount = 0;
let weeklyCoinsEarned = 0;
let weeklyReferralCount = 0;
let weeklyUpgradeCount = 0;
let weeklyEnergyCount = 0;

let dailyTasksClaimed = {
    click: false, coins: false, referral: false, upgrade: false
};
let weeklyTasksClaimed = {
    click: false, coins: false, referral: false, upgrade: false, energy: false
};

// ==================== ЭЛЕМЕНТЫ DOM ====================
const planet = document.getElementById('planet');
const planetCore = document.getElementById('planetCore');
const coinsSpan = document.getElementById('coins');
const energySpan = document.getElementById('energyValue');
const energyFill = document.getElementById('energyFill');
const clickPowerSpan = document.getElementById('clickPower');
const energyCostSpan = document.getElementById('energyCost');
const userNameSpan = document.getElementById('userName');
const userLevelSpan = document.getElementById('userLevel');
const messageDiv = document.getElementById('message');

// ==================== 3D ПЛАНЕТА (Three.js) ====================
let scene, camera, renderer, planet3d, clouds;
function init3D() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    const width = Math.min(260, window.innerWidth * 0.7);
    const height = width;
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    
    import('https://unpkg.com/three@0.128.0/build/three.module.js').then(THREE => {
        scene = new THREE.Scene();
        scene.background = null;
        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.set(0, 0, 3.5);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);
        
        const textureLoader = new THREE.TextureLoader();
        const planetMap = textureLoader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg');
        const planetSpecular = textureLoader.load('https://threejs.org/examples/textures/planets/earth_specular_2048.jpg');
        const planetNormal = textureLoader.load('https://threejs.org/examples/textures/planets/earth_normal_2048.jpg');
        const cloudMap = textureLoader.load('https://threejs.org/examples/textures/planets/earth_clouds_1024.png');
        
        const geometry = new THREE.SphereGeometry(1.2, 128, 128);
        const material = new THREE.MeshPhongMaterial({
            map: planetMap,
            specularMap: planetSpecular,
            specular: new THREE.Color('grey'),
            shininess: 25,
            normalMap: planetNormal
        });
        planet3d = new THREE.Mesh(geometry, material);
        scene.add(planet3d);
        
        const cloudGeometry = new THREE.SphereGeometry(1.22, 128, 128);
        const cloudMaterial = new THREE.MeshPhongMaterial({
            map: cloudMap,
            transparent: true,
            opacity: 0.15,
            blending: THREE.AdditiveBlending
        });
        clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
        scene.add(clouds);
        
        const ambientLight = new THREE.AmbientLight(0x404060);
        scene.add(ambientLight);
        const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
        mainLight.position.set(5, 3, 5);
        scene.add(mainLight);
        const backLight = new THREE.PointLight(0x4466cc, 0.4);
        backLight.position.set(-2, -1, -3);
        scene.add(backLight);
        
        function animate() {
            requestAnimationFrame(animate);
            if (planet3d) planet3d.rotation.y += 0.003;
            if (clouds) clouds.rotation.y += 0.0015;
            renderer.render(scene, camera);
        }
        animate();
        
        window.addEventListener('resize', () => {
            const newWidth = Math.min(260, window.innerWidth * 0.7);
            const newHeight = newWidth;
            container.style.width = `${newWidth}px`;
            container.style.height = `${newHeight}px`;
            camera.aspect = newWidth / newHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(newWidth, newHeight);
        });
    }).catch(err => console.error('Three.js error:', err));
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function showMessage(text, isError = false) {
    if (!messageDiv) return;
    messageDiv.textContent = text;
    messageDiv.style.color = isError ? '#ff6b6b' : '#ffd700';
    messageDiv.classList.add('show');
    setTimeout(() => messageDiv.classList.remove('show'), 2000);
}

function formatNumber(num) {
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toString();
}

function calculatePassiveIncome() {
    let rate = passiveIncomeLevel * 5;
    passiveIncomeRate = rate;
    const span = document.getElementById('passiveIncomeRate');
    if (span) span.textContent = formatNumber(passiveIncomeRate);
    return rate;
}

async function syncToServer() {
    if (authMethod !== 'telegram' || !userId) return;
    try {
        await fetch(`${BOT_API_URL}/api/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegramId: userId,
                coins: Math.floor(coins),
                clickPower: clickPower,
                maxEnergy: maxEnergy
            })
        });
    } catch (error) {
        console.error('sync error:', error);
    }
}

// ==================== UI ОБНОВЛЕНИЕ ====================
function updateUI() {
    if (coinsSpan) coinsSpan.textContent = formatNumber(Math.floor(coins));
    if (energySpan) energySpan.textContent = `${Math.floor(energy)}/${maxEnergy}`;
    if (energyFill) energyFill.style.width = (energy / maxEnergy) * 100 + '%';
    if (clickPowerSpan) clickPowerSpan.textContent = clickPower;
    if (energyCostSpan) energyCostSpan.textContent = clickPower;
    
    const upgradeLevelSpan = document.getElementById('upgradeLevel');
    const energyUpgradeLevelSpan = document.getElementById('energyUpgradeLevel');
    const passiveUpgradeLevelSpan = document.getElementById('passiveUpgradeLevel');
    const clickCostDisplay = document.getElementById('clickUpgradeCostDisplay');
    const energyCostDisplay = document.getElementById('energyUpgradeCostDisplay');
    const passiveCostDisplay = document.getElementById('passiveUpgradeCostDisplay');
    
    if (upgradeLevelSpan) upgradeLevelSpan.textContent = clickUpgradeLevel;
    if (energyUpgradeLevelSpan) energyUpgradeLevelSpan.textContent = energyUpgradeLevel;
    if (passiveUpgradeLevelSpan) passiveUpgradeLevelSpan.textContent = passiveIncomeLevel;
    if (clickCostDisplay) clickCostDisplay.textContent = `Стоимость: ${formatNumber(clickUpgradeCost)} 🪙`;
    if (energyCostDisplay) energyCostDisplay.textContent = `Стоимость: ${formatNumber(energyUpgradeCost)} 🪙`;
    if (passiveCostDisplay) passiveCostDisplay.textContent = `Стоимость: ${formatNumber(passiveIncomeUpgradeCost)} 🪙`;
    
    calculatePassiveIncome();
    
    let level = 1;
    if (coins >= 100000) level = 10;
    else if (coins >= 50000) level = 9;
    else if (coins >= 25000) level = 8;
    else if (coins >= 10000) level = 7;
    else if (coins >= 5000) level = 6;
    else if (coins >= 2500) level = 5;
    else if (coins >= 1000) level = 4;
    else if (coins >= 500) level = 3;
    else if (coins >= 100) level = 2;
    if (userLevelSpan) userLevelSpan.textContent = `Уровень ${level}`;
    
    if (planetCore) {
        if (level >= 10) { planetCore.textContent = '🌠'; planet.style.background = 'radial-gradient(circle at 30% 30%, #ff69b4, #ff1493)'; }
        else if (level >= 8) { planetCore.textContent = '🌈'; planet.style.background = 'radial-gradient(circle at 30% 30%, #ff69b4, #ff1493)'; }
        else if (level >= 6) { planetCore.textContent = '🌍'; planet.style.background = 'radial-gradient(circle at 30% 30%, #7cfc00, #32cd32)'; }
        else if (level >= 4) { planetCore.textContent = '🪐'; planet.style.background = 'radial-gradient(circle at 30% 30%, #d2b48c, #cd853f)'; }
        else if (level >= 2) { planetCore.textContent = '🌑'; planet.style.background = 'radial-gradient(circle at 30% 30%, #cd7f32, #8b4513)'; }
        else { planetCore.textContent = '⭐'; planet.style.background = 'radial-gradient(circle at 30% 30%, #ffd700, #ff8c00)'; }
    }
    
    const profileCoins = document.getElementById('profileCoins');
    const profileClickPower = document.getElementById('profileClickPower');
    const profileMaxEnergy = document.getElementById('profileMaxEnergy');
    const profilePassiveIncome = document.getElementById('profilePassiveIncome');
    const profileReferrals = document.getElementById('profileReferrals');
    const profileRank = document.getElementById('profileRank');
    const profileDate = document.getElementById('profileDate');
    const profileName = document.getElementById('profileName');
    const profileId = document.getElementById('profileId');
    
    if (profileCoins) profileCoins.textContent = formatNumber(coins);
    if (profileClickPower) profileClickPower.textContent = clickPower;
    if (profileMaxEnergy) profileMaxEnergy.textContent = maxEnergy;
    if (profilePassiveIncome) profilePassiveIncome.textContent = formatNumber(passiveIncomeRate);
    if (profileReferrals) profileReferrals.textContent = referralCount;
    if (profileRank) profileRank.textContent = `#${leaderboardPosition}`;
    if (profileDate) profileDate.textContent = registrationDate;
    if (profileName) profileName.textContent = displayName;
    if (profileId) profileId.textContent = authMethod === 'telegram' ? userId : (authMethod === 'vk' ? userId : 'Гость');
    if (userNameSpan) userNameSpan.textContent = displayName;
    
    syncToServer();
}

function saveGame() {
    const saveData = {
        coins, energy, maxEnergy, clickPower,
        clickUpgradeCost, clickUpgradeLevel,
        energyUpgradeCost, energyUpgradeLevel,
        passiveIncomeLevel, passiveIncomeUpgradeCost,
        referralCount, referralBonusTotal,
        registrationDate, displayName,
        dailyClickCount, dailyCoinsEarned, dailyReferralCount, dailyUpgradeCount,
        weeklyClickCount, weeklyCoinsEarned, weeklyReferralCount, weeklyUpgradeCount, weeklyEnergyCount,
        dailyTasksClaimed, weeklyTasksClaimed
    };
    localStorage.setItem('starToPlanetSave', JSON.stringify(saveData));
}

function loadGame() {
    const saveData = localStorage.getItem('starToPlanetSave');
    if (saveData) {
        try {
            const data = JSON.parse(saveData);
            coins = data.coins || 0;
            energy = data.energy !== undefined ? data.energy : 100;
            maxEnergy = data.maxEnergy !== undefined ? data.maxEnergy : 100;
            clickPower = data.clickPower || 1;
            clickUpgradeCost = data.clickUpgradeCost || 100;
            clickUpgradeLevel = data.clickUpgradeLevel || 1;
            energyUpgradeCost = data.energyUpgradeCost || 200;
            energyUpgradeLevel = data.energyUpgradeLevel || 1;
            passiveIncomeLevel = data.passiveIncomeLevel || 0;
            passiveIncomeUpgradeCost = data.passiveIncomeUpgradeCost || 500;
            referralCount = data.referralCount || 0;
            referralBonusTotal = data.referralBonusTotal || 0;
            if (data.displayName) displayName = data.displayName;
            if (data.registrationDate) registrationDate = data.registrationDate;
            dailyClickCount = data.dailyClickCount || 0;
            dailyCoinsEarned = data.dailyCoinsEarned || 0;
            dailyReferralCount = data.dailyReferralCount || 0;
            dailyUpgradeCount = data.dailyUpgradeCount || 0;
            weeklyClickCount = data.weeklyClickCount || 0;
            weeklyCoinsEarned = data.weeklyCoinsEarned || 0;
            weeklyReferralCount = data.weeklyReferralCount || 0;
            weeklyUpgradeCount = data.weeklyUpgradeCount || 0;
            weeklyEnergyCount = data.weeklyEnergyCount || 0;
            dailyTasksClaimed = data.dailyTasksClaimed || { click: false, coins: false, referral: false, upgrade: false };
            weeklyTasksClaimed = data.weeklyTasksClaimed || { click: false, coins: false, referral: false, upgrade: false, energy: false };
        } catch(e) { console.error(e); }
    }
    
    if (referrerId && referrerId !== userId && !localStorage.getItem(`referral_${referrerId}_${userId}`)) {
        localStorage.setItem(`referral_${referrerId}_${userId}`, 'claimed');
        coins += 500;
        showMessage('🎉 +500 монет за приглашение!');
        saveGame();
        syncToServer();
    }
    updateUI();
    updateTasksUI();
}

// ==================== ЗАДАНИЯ ====================
function updateTasksUI() {
    const dailyClickProgress = document.getElementById('dailyClickProgress');
    const dailyCoinsProgress = document.getElementById('dailyCoinsProgress');
    const dailyReferralProgress = document.getElementById('dailyReferralProgress');
    const dailyUpgradeProgress = document.getElementById('dailyUpgradeProgress');
    const weeklyClickProgress = document.getElementById('weeklyClickProgress');
    const weeklyCoinsProgress = document.getElementById('weeklyCoinsProgress');
    const weeklyReferralProgress = document.getElementById('weeklyReferralProgress');
    const weeklyUpgradeProgress = document.getElementById('weeklyUpgradeProgress');
    const weeklyEnergyProgress = document.getElementById('weeklyEnergyProgress');
    
    if (dailyClickProgress) dailyClickProgress.textContent = dailyClickCount;
    if (dailyCoinsProgress) dailyCoinsProgress.textContent = dailyCoinsEarned;
    if (dailyReferralProgress) dailyReferralProgress.textContent = dailyReferralCount;
    if (dailyUpgradeProgress) dailyUpgradeProgress.textContent = dailyUpgradeCount;
    if (weeklyClickProgress) weeklyClickProgress.textContent = weeklyClickCount;
    if (weeklyCoinsProgress) weeklyCoinsProgress.textContent = weeklyCoinsEarned;
    if (weeklyReferralProgress) weeklyReferralProgress.textContent = weeklyReferralCount;
    if (weeklyUpgradeProgress) weeklyUpgradeProgress.textContent = weeklyUpgradeCount;
    if (weeklyEnergyProgress) weeklyEnergyProgress.textContent = weeklyEnergyCount;
    
    updateTaskButtons();
}

function updateTaskButtons() {
    const dailyClickBtn = document.getElementById('dailyClickClaim');
    const dailyCoinsBtn = document.getElementById('dailyCoinsClaim');
    const dailyReferralBtn = document.getElementById('dailyReferralClaim');
    const dailyUpgradeBtn = document.getElementById('dailyUpgradeClaim');
    const weeklyClickBtn = document.getElementById('weeklyClickClaim');
    const weeklyCoinsBtn = document.getElementById('weeklyCoinsClaim');
    const weeklyReferralBtn = document.getElementById('weeklyReferralClaim');
    const weeklyUpgradeBtn = document.getElementById('weeklyUpgradeClaim');
    const weeklyEnergyBtn = document.getElementById('weeklyEnergyClaim');
    
    if (dailyClickBtn) {
        if (dailyClickCount >= 100 && !dailyTasksClaimed.click) dailyClickBtn.classList.remove('disabled');
        else dailyClickBtn.classList.add('disabled');
    }
    if (dailyCoinsBtn) {
        if (dailyCoinsEarned >= 500 && !dailyTasksClaimed.coins) dailyCoinsBtn.classList.remove('disabled');
        else dailyCoinsBtn.classList.add('disabled');
    }
    if (dailyReferralBtn) {
        if (dailyReferralCount >= 1 && !dailyTasksClaimed.referral) dailyReferralBtn.classList.remove('disabled');
        else dailyReferralBtn.classList.add('disabled');
    }
    if (dailyUpgradeBtn) {
        if (dailyUpgradeCount >= 5 && !dailyTasksClaimed.upgrade) dailyUpgradeBtn.classList.remove('disabled');
        else dailyUpgradeBtn.classList.add('disabled');
    }
    if (weeklyClickBtn) {
        if (weeklyClickCount >= 1000 && !weeklyTasksClaimed.click) weeklyClickBtn.classList.remove('disabled');
        else weeklyClickBtn.classList.add('disabled');
    }
    if (weeklyCoinsBtn) {
        if (weeklyCoinsEarned >= 5000 && !weeklyTasksClaimed.coins) weeklyCoinsBtn.classList.remove('disabled');
        else weeklyCoinsBtn.classList.add('disabled');
    }
    if (weeklyReferralBtn) {
        if (weeklyReferralCount >= 5 && !weeklyTasksClaimed.referral) weeklyReferralBtn.classList.remove('disabled');
        else weeklyReferralBtn.classList.add('disabled');
    }
    if (weeklyUpgradeBtn) {
        if (weeklyUpgradeCount >= 20 && !weeklyTasksClaimed.upgrade) weeklyUpgradeBtn.classList.remove('disabled');
        else weeklyUpgradeBtn.classList.add('disabled');
    }
    if (weeklyEnergyBtn) {
        if (weeklyEnergyCount >= 500 && !weeklyTasksClaimed.energy) weeklyEnergyBtn.classList.remove('disabled');
        else weeklyEnergyBtn.classList.add('disabled');
    }
}

async function claimTask(taskId, reward, taskType, taskName) {
    if (taskType === 'daily') {
        if (dailyTasksClaimed[taskName]) { showMessage('❌ Задание уже выполнено!', true); return; }
        dailyTasksClaimed[taskName] = true;
    } else if (taskType === 'weekly') {
        if (weeklyTasksClaimed[taskName]) { showMessage('❌ Задание уже выполнено!', true); return; }
        weeklyTasksClaimed[taskName] = true;
    }
    
    coins += reward;
    updateUI();
    saveGame();
    updateTasksUI();
    syncToServer();
    showMessage(`🎉 +${reward} монет!`);
    
    const btn = document.getElementById(taskId);
    if (btn) {
        btn.classList.add('disabled');
        btn.disabled = true;
    }
}

function updateTaskProgressOnClick() { dailyClickCount++; weeklyClickCount++; saveGame(); updateTasksUI(); }
function updateTaskProgressOnCoins(earned) { dailyCoinsEarned += earned; weeklyCoinsEarned += earned; saveGame(); updateTasksUI(); }
function updateTaskProgressOnUpgrade() { dailyUpgradeCount++; weeklyUpgradeCount++; saveGame(); updateTasksUI(); }
function updateTaskProgressOnEnergy(energyValue) { weeklyEnergyCount = energyValue; saveGame(); updateTasksUI(); }
function updateTaskProgressOnReferral() { dailyReferralCount++; weeklyReferralCount++; saveGame(); updateTasksUI(); }

// ==================== ИГРОВЫЕ ФУНКЦИИ ====================
function handleClick(event) {
    event.preventDefault();
    if (energy < clickPower) { showMessage('❌ Нет энергии!', true); return; }
    energy -= clickPower;
    coins += clickPower;
    updateUI();
    saveGame();
    updateTaskProgressOnClick();
    updateTaskProgressOnCoins(clickPower);
    
    if (planet) {
        planet.classList.add('pressed');
        setTimeout(() => planet.classList.remove('pressed'), 100);
    }
    
    const popup = document.createElement('div');
    popup.className = 'floating-number';
    popup.textContent = `+${clickPower}`;
    popup.style.left = (event.clientX || window.innerWidth/2) + 'px';
    popup.style.top = (event.clientY || window.innerHeight/2 - 100) + 'px';
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 500);
}

function setupTouchHandlers() {
    if (!planet) return;
    planet.addEventListener('touchstart', (e) => { e.preventDefault(); handleClick(e); }, { passive: false });
    planet.addEventListener('mousedown', (e) => { e.preventDefault(); handleClick(e); });
}

function upgradeClick() {
    if (coins >= clickUpgradeCost && clickUpgradeLevel < 100) {
        coins -= clickUpgradeCost;
        clickPower += 1;
        clickUpgradeLevel++;
        clickUpgradeCost = Math.floor(clickUpgradeCost * 1.3);
        updateUI(); saveGame();
        updateTaskProgressOnUpgrade();
        showMessage('✅ Сила клика +1');
    } else if (clickUpgradeLevel >= 100) { showMessage('⚠️ Максимальный уровень!', true); }
    else { showMessage('❌ Не хватает монет!', true); }
}

function upgradeEnergy() {
    if (coins >= energyUpgradeCost && energyUpgradeLevel < 100) {
        coins -= energyUpgradeCost;
        maxEnergy += 50;
        energy += 50;
        energyUpgradeLevel++;
        energyUpgradeCost = Math.floor(energyUpgradeCost * 1.25);
        updateUI(); saveGame();
        updateTaskProgressOnEnergy(maxEnergy);
        showMessage('✅ Энергия +50');
    } else if (energyUpgradeLevel >= 100) { showMessage('⚠️ Максимальный уровень!', true); }
    else { showMessage('❌ Не хватает монет!', true); }
}

function upgradePassiveIncome() {
    if (coins >= passiveIncomeUpgradeCost && passiveIncomeLevel < 100) {
        coins -= passiveIncomeUpgradeCost;
        passiveIncomeLevel++;
        passiveIncomeUpgradeCost = Math.floor(passiveIncomeUpgradeCost * 1.25);
        updateUI(); saveGame();
        showMessage('✅ Пассивный доход +5/мин');
    } else if (passiveIncomeLevel >= 100) { showMessage('⚠️ Максимальный уровень!', true); }
    else { showMessage('❌ Не хватает монет!', true); }
}

function applyPassiveIncome() { if (passiveIncomeRate > 0) { coins += passiveIncomeRate; updateUI(); saveGame(); } }
function rechargeEnergy() { if (energy < maxEnergy) { energy = Math.min(energy + 3, maxEnergy); updateUI(); } }

// ==================== РЕЙТИНГ ====================
async function loadLeaderboard() {
    const container = document.getElementById('leaderboardList');
    if (!container) return;
    container.innerHTML = '<div class="leaderboard-item">🏆 Загрузка...</div>';
    try {
        const response = await fetch(`${BOT_API_URL}/api/leaderboard?limit=20`);
        if (!response.ok) throw new Error();
        const players = await response.json();
        if (players.length === 0) { container.innerHTML = '<div class="leaderboard-item">🏆 Пока нет игроков</div>'; return; }
        
        const currentPlayerIndex = players.findIndex(p => p.telegram_id == userId);
        leaderboardPosition = currentPlayerIndex !== -1 ? currentPlayerIndex + 1 : players.length + 1;
        const leaderboardRankSpan = document.getElementById('leaderboardRank');
        if (leaderboardRankSpan) leaderboardRankSpan.textContent = `#${leaderboardPosition}`;
        
        container.innerHTML = players.slice(0, 20).map((p, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
            const name = p.first_name || p.username || `Игрок ${p.telegram_id}`;
            return `<div class="leaderboard-item"><div class="leaderboard-rank ${i < 3 ? `top-${i+1}` : ''}">${medal}</div><div class="leaderboard-name">${escapeHtml(name)}</div><div class="leaderboard-coins">${(p.coins || 0).toLocaleString()} 🪙</div></div>`;
        }).join('');
    } catch(e) { container.innerHTML = '<div class="leaderboard-item">❌ Ошибка</div>'; }
}

// ==================== ДРУЗЬЯ ====================
async function loadFriends() {
    if (authMethod !== 'telegram' || !userId) return;
    try {
        const response = await fetch(`${BOT_API_URL}/api/friends/${userId}`);
        if (!response.ok) throw new Error();
        const friends = await response.json();
        const level1Container = document.getElementById('level1List');
        if (level1Container) {
            if (friends.length === 0) level1Container.innerHTML = '<div class="level-item">👥 Пока нет друзей</div>';
            else level1Container.innerHTML = friends.slice(0, 5).map(f => `<div class="level-item"><span>${escapeHtml(f.first_name || f.username)}</span><span>${(f.coins || 0).toLocaleString()} 🪙</span></div>`).join('');
        }
        const referralCountSpan = document.getElementById('referralCount');
        const referralBonusSpan = document.getElementById('referralBonus');
        const profileReferralsSpan = document.getElementById('profileReferrals');
        if (referralCountSpan) referralCountSpan.textContent = friends.length;
        if (referralBonusSpan) referralBonusSpan.textContent = (friends.length * 1000).toLocaleString();
        if (profileReferralsSpan) profileReferralsSpan.textContent = friends.length;
        referralCount = friends.length;
        referralBonusTotal = friends.length * 1000;
        updateReferralUI();
    } catch(e) { console.error(e); }
}

async function loadReferralStructure() {
    if (authMethod !== 'telegram' || !userId) return;
    try {
        const response = await fetch(`${BOT_API_URL}/api/referral-structure/${userId}`);
        if (!response.ok) throw new Error();
        const data = await response.json();
        
        const level1Container = document.getElementById('level1List');
        const level2Container = document.getElementById('level2List');
        const level3Container = document.getElementById('level3List');
        
        if (level1Container) {
            if (data.level1 && data.level1.length) level1Container.innerHTML = data.level1.map(ref => `<div class="level-item"><span>${escapeHtml(ref.first_name || ref.username)}</span><span>${(ref.coins || 0).toLocaleString()} 🪙</span></div>`).join('');
            else level1Container.innerHTML = '<div class="level-item">👥 Нет рефералов 1 уровня</div>';
        }
        if (level2Container) {
            if (data.level2 && data.level2.length) level2Container.innerHTML = data.level2.map(ref => `<div class="level-item"><span>${escapeHtml(ref.first_name || ref.username)}</span><span>${(ref.coins || 0).toLocaleString()} 🪙</span></div>`).join('');
            else level2Container.innerHTML = '<div class="level-item">✨ Нет рефералов 2 уровня</div>';
        }
        if (level3Container) {
            if (data.level3 && data.level3.length) level3Container.innerHTML = data.level3.map(ref => `<div class="level-item"><span>${escapeHtml(ref.first_name || ref.username)}</span><span>${(ref.coins || 0).toLocaleString()} 🪙</span></div>`).join('');
            else level3Container.innerHTML = '<div class="level-item">💫 Нет рефералов 3 уровня</div>';
        }
    } catch(e) { console.error(e); }
}

function updateReferralUI() {
    const linkInput = document.getElementById('referralLink');
    if (linkInput && userId) {
        linkInput.value = `https://t.me/${botUsername}?start=ref_${userId}`;
    }
}

function copyReferralLink() {
    const linkInput = document.getElementById('referralLink');
    if (linkInput) { linkInput.select(); document.execCommand('copy'); showMessage('✅ Ссылка скопирована'); }
}

function shareReferralLink() {
    const linkInput = document.getElementById('referralLink');
    if (linkInput && tg.openTelegramLink) {
        tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(linkInput.value)}&text=⭐ Star to Planet ⭐ Присоединяйся и получай бонусы!`);
    }
}

function escapeHtml(text) { if (!text) return 'Игрок'; const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

// ==================== ВКЛАДКИ ====================
function setupTabs() {
    const panels = {
        game: document.getElementById('gameArea'),
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
            if (tab === 'friends') { loadFriends(); loadReferralStructure(); updateReferralUI(); }
        });
    });
}

function setupTasksTabs() {
    const tabs = document.querySelectorAll('.tasks-tab');
    const contents = {
        daily: document.getElementById('dailyTasks'),
        weekly: document.getElementById('weeklyTasks'),
        premium: document.getElementById('premiumTasks')
    };
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

// ==================== АВТОРИЗАЦИЯ ====================
function authTelegram() { if(tgUser) { authMethod='telegram'; userId=tgUser.id; displayName=tgUser.username?`@${tgUser.username}`:(tgUser.first_name||'Игрок'); updateUI(); loadGame(); showMessage('✅ Telegram'); } else showMessage('❌ Откройте через Telegram',true); }
function authVK() { const id=prompt('Введите ID ВКонтакте:'); if(id&&/^\d+$/.test(id)) { authMethod='vk'; userId=`vk_${id}`; displayName=prompt('Ваше имя:',`VK${id}`)||`VK${id}`; updateUI(); saveGame(); showMessage('✅ VK'); } }
function exportSave() { const data={version:1,coins,energy,maxEnergy,clickPower,clickUpgradeCost,clickUpgradeLevel,energyUpgradeCost,energyUpgradeLevel,passiveIncomeLevel,passiveIncomeUpgradeCost,referralCount,referralBonusTotal,registrationDate,displayName,dailyClickCount,dailyCoinsEarned,dailyReferralCount,dailyUpgradeCount,weeklyClickCount,weeklyCoinsEarned,weeklyReferralCount,weeklyUpgradeCount,weeklyEnergyCount,dailyTasksClaimed,weeklyTasksClaimed}; const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='star_to_planet_save.json'; a.click(); URL.revokeObjectURL(a.href); showMessage('💾 Экспорт'); }
function importSave(file) { const reader=new FileReader(); reader.onload=e=>{ try{ const data=JSON.parse(e.target.result); if(data.version===1){ coins=data.coins||0; energy=data.energy!==undefined?data.energy:100; maxEnergy=data.maxEnergy!==undefined?data.maxEnergy:100; clickPower=data.clickPower||1; clickUpgradeCost=data.clickUpgradeCost||100; clickUpgradeLevel=data.clickUpgradeLevel||1; energyUpgradeCost=data.energyUpgradeCost||200; energyUpgradeLevel=data.energyUpgradeLevel||1; passiveIncomeLevel=data.passiveIncomeLevel||0; passiveIncomeUpgradeCost=data.passiveIncomeUpgradeCost||500; referralCount=data.referralCount||0; referralBonusTotal=data.referralBonusTotal||0; if(data.displayName)displayName=data.displayName; if(data.registrationDate)registrationDate=data.registrationDate; dailyClickCount=data.dailyClickCount||0; dailyCoinsEarned=data.dailyCoinsEarned||0; dailyReferralCount=data.dailyReferralCount||0; dailyUpgradeCount=data.dailyUpgradeCount||0; weeklyClickCount=data.weeklyClickCount||0; weeklyCoinsEarned=data.weeklyCoinsEarned||0; weeklyReferralCount=data.weeklyReferralCount||0; weeklyUpgradeCount=data.weeklyUpgradeCount||0; weeklyEnergyCount=data.weeklyEnergyCount||0; dailyTasksClaimed=data.dailyTasksClaimed||{}; weeklyTasksClaimed=data.weeklyTasksClaimed||{}; updateUI(); saveGame(); showMessage('✅ Импорт'); } else showMessage('❌ Версия',true); }catch(e){showMessage('❌ Ошибка',true);} }; reader.readAsText(file); }

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
function init() {
    if (userNameSpan) userNameSpan.textContent = displayName;
    loadGame();
    setupTouchHandlers();
    init3D();
    
    if (authMethod === 'telegram' && userId) {
        loadLeaderboard();
        loadFriends();
        loadReferralStructure();
    }
    
    const buyClickUpgrade = document.getElementById('buyClickUpgrade');
    const buyEnergyUpgrade = document.getElementById('buyEnergyUpgrade');
    const buyPassiveUpgrade = document.getElementById('buyPassiveUpgrade');
    if (buyClickUpgrade) buyClickUpgrade.addEventListener('click', upgradeClick);
    if (buyEnergyUpgrade) buyEnergyUpgrade.addEventListener('click', upgradeEnergy);
    if (buyPassiveUpgrade) buyPassiveUpgrade.addEventListener('click', upgradePassiveIncome);
    
    const copyLinkBtn = document.getElementById('copyLinkBtn');
    const shareLinkBtn = document.getElementById('shareLinkBtn');
    if (copyLinkBtn) copyLinkBtn.addEventListener('click', copyReferralLink);
    if (shareLinkBtn) shareLinkBtn.addEventListener('click', shareReferralLink);
    
    const authTelegramBtn = document.getElementById('authTelegramBtn');
    const authVkBtn = document.getElementById('authVkBtn');
    if (authTelegramBtn) authTelegramBtn.addEventListener('click', authTelegram);
    if (authVkBtn) authVkBtn.addEventListener('click', authVK);
    
    const exportSaveBtn = document.getElementById('exportSaveBtn');
    const importSaveBtn = document.getElementById('importSaveBtn');
    const importFile = document.getElementById('importFile');
    if (exportSaveBtn) exportSaveBtn.addEventListener('click', exportSave);
    if (importSaveBtn) importSaveBtn.addEventListener('click', () => importFile?.click());
    if (importFile) importFile.addEventListener('change', (e) => { if(e.target.files[0]) importSave(e.target.files[0]); });
    
    const dailyClickClaim = document.getElementById('dailyClickClaim');
    const dailyCoinsClaim = document.getElementById('dailyCoinsClaim');
    const dailyReferralClaim = document.getElementById('dailyReferralClaim');
    const dailyUpgradeClaim = document.getElementById('dailyUpgradeClaim');
    const weeklyClickClaim = document.getElementById('weeklyClickClaim');
    const weeklyCoinsClaim = document.getElementById('weeklyCoinsClaim');
    const weeklyReferralClaim = document.getElementById('weeklyReferralClaim');
    const weeklyUpgradeClaim = document.getElementById('weeklyUpgradeClaim');
    const weeklyEnergyClaim = document.getElementById('weeklyEnergyClaim');
    
    if (dailyClickClaim) dailyClickClaim.addEventListener('click', () => claimTask('dailyClickClaim', 100, 'daily', 'click'));
    if (dailyCoinsClaim) dailyCoinsClaim.addEventListener('click', () => claimTask('dailyCoinsClaim', 500, 'daily', 'coins'));
    if (dailyReferralClaim) dailyReferralClaim.addEventListener('click', () => claimTask('dailyReferralClaim', 1000, 'daily', 'referral'));
    if (dailyUpgradeClaim) dailyUpgradeClaim.addEventListener('click', () => claimTask('dailyUpgradeClaim', 750, 'daily', 'upgrade'));
    if (weeklyClickClaim) weeklyClickClaim.addEventListener('click', () => claimTask('weeklyClickClaim', 1000, 'weekly', 'click'));
    if (weeklyCoinsClaim) weeklyCoinsClaim.addEventListener('click', () => claimTask('weeklyCoinsClaim', 2500, 'weekly', 'coins'));
    if (weeklyReferralClaim) weeklyReferralClaim.addEventListener('click', () => claimTask('weeklyReferralClaim', 5000, 'weekly', 'referral'));
    if (weeklyUpgradeClaim) weeklyUpgradeClaim.addEventListener('click', () => claimTask('weeklyUpgradeClaim', 3000, 'weekly', 'upgrade'));
    if (weeklyEnergyClaim) weeklyEnergyClaim.addEventListener('click', () => claimTask('weeklyEnergyClaim', 2000, 'weekly', 'energy'));
    
    const boostBtn = document.getElementById('boostBtn');
    const boostModal = document.getElementById('boostModal');
    const closeBoost = document.getElementById('closeBoostModal');
    if (boostBtn) boostBtn.onclick = () => boostModal.classList.add('active');
    if (closeBoost) closeBoost.onclick = () => boostModal.classList.remove('active');
    if (boostModal) boostModal.onclick = (e) => { if (e.target === boostModal) boostModal.classList.remove('active'); };
    
    setInterval(applyPassiveIncome, 60000);
    setInterval(rechargeEnergy, 1000);
    
    setupTabs();
    setupTasksTabs();
    updateReferralUI();
    const gameArea = document.getElementById('gameArea');
    if (gameArea) gameArea.style.display = 'flex';
    
    const raysContainer = document.getElementById('raysContainer');
    if (raysContainer) for (let i = 0; i < 12; i++) { const ray = document.createElement('div'); ray.className = 'ray'; raysContainer.appendChild(ray); }
    
    console.log('✅ Игра загружена!');
}

init();