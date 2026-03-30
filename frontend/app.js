// ==================== ИНИЦИАЛИЗАЦИЯ ====================
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

const tgUser = tg.initDataUnsafe?.user;
let userId = tgUser?.id || 'guest_' + Math.floor(Math.random() * 1000000000);
let displayName = "Игрок";
if (tgUser) {
    if (tgUser.username) displayName = `@${tgUser.username}`;
    else if (tgUser.first_name) displayName = tgUser.first_name;
}
document.getElementById('userName').textContent = displayName;

function getReferrerId() {
    const urlParams = new URLSearchParams(window.location.search);
    const startapp = urlParams.get('startapp');
    if (startapp && startapp.startsWith('ref_')) {
        return startapp.replace('ref_', '');
    }
    return null;
}
const referrerId = getReferrerId();

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

// ==================== ЗАДАНИЯ ====================
let dailyClickCount = 0;
let dailyCoinsEarned = 0;
let dailyTasksClaimed = { click: false, coins: false };
let weeklyClickCount = 0;
let weeklyCoinsEarned = 0;
let weeklyTasksClaimed = { click: false, coins: false };

// ==================== ЭЛЕМЕНТЫ ====================
let planetElement = null;

// ==================== СОЗДАНИЕ ЗВЕЗДЫ (ЗАПАСНОЙ ВАРИАНТ) ====================
function createFallbackStar() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    
    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.background = 'radial-gradient(circle at 30% 30%, #ffd700, #ff8c00)';
    container.style.borderRadius = '50%';
    container.style.boxShadow = '0 0 30px rgba(255,215,0,0.5)';
    container.style.cursor = 'pointer';
    container.style.touchAction = 'manipulation';
    
    const star = document.createElement('div');
    star.textContent = '⭐';
    star.style.fontSize = '80px';
    star.style.textShadow = '0 0 20px rgba(0,0,0,0.5)';
    star.style.pointerEvents = 'none';
    container.appendChild(star);
    
    planetElement = container;
    
    container.style.animation = 'float 3s ease-in-out infinite';
    
    if (!document.querySelector('#star-animation-style')) {
        const style = document.createElement('style');
        style.id = 'star-animation-style';
        style.textContent = `
            @keyframes float {
                0%, 100% { transform: translateY(0px); }
                50% { transform: translateY(-8px); }
            }
        `;
        document.head.appendChild(style);
    }
    
    setupTouchHandlers(container);
}

// ==================== МУЛЬТИТАЧ ОБРАБОТЧИК ====================
function setupTouchHandlers(element) {
    if (!element) return;
    
    // Удаляем старые обработчики, если есть
    element.removeEventListener('touchstart', touchHandler);
    element.removeEventListener('mousedown', mouseHandler);
    
    // Добавляем новые
    element.addEventListener('touchstart', touchHandler, { passive: false });
    element.addEventListener('mousedown', mouseHandler);
}

function touchHandler(e) {
    e.preventDefault();
    // Обрабатываем каждое касание
    for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        processClick({
            clientX: touch.clientX,
            clientY: touch.clientY
        });
    }
}

function mouseHandler(e) {
    e.preventDefault();
    processClick({
        clientX: e.clientX,
        clientY: e.clientY
    });
}

// ==================== ОСНОВНАЯ ЛОГИКА КЛИКА ====================
function processClick(eventData) {
    if (energy < clickPower) {
        showMessage('❌ Нет энергии!', true);
        return;
    }
    
    energy -= clickPower;
    coins += clickPower;
    dailyClickCount++;
    weeklyClickCount++;
    dailyCoinsEarned += clickPower;
    weeklyCoinsEarned += clickPower;
    updateUI();
    saveGame();
    
    // Анимация нажатия
    if (planetElement) {
        planetElement.style.transform = 'scale(0.95)';
        setTimeout(() => {
            if (planetElement) planetElement.style.transform = 'scale(1)';
        }, 100);
    }
    
    // Всплывающая цифра
    const popup = document.createElement('div');
    popup.textContent = `+${clickPower}`;
    popup.style.position = 'fixed';
    popup.style.left = (eventData.clientX || window.innerWidth/2) + 'px';
    popup.style.top = (eventData.clientY || window.innerHeight/2 - 100) + 'px';
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

// ==================== 3D ПЛАНЕТА ====================
let scene, camera, renderer, planet3d;

function init3D() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    
    const width = 240, height = 240;
    
    import('https://unpkg.com/three@0.128.0/build/three.module.js').then(THREE => {
        container.innerHTML = '';
        
        scene = new THREE.Scene();
        scene.background = null;
        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.set(0, 0, 3);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        container.appendChild(renderer.domElement);
        
        const textureLoader = new THREE.TextureLoader();
        const map = textureLoader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg');
        const geometry = new THREE.SphereGeometry(1, 64, 64);
        const material = new THREE.MeshPhongMaterial({ map: map });
        planet3d = new THREE.Mesh(geometry, material);
        scene.add(planet3d);
        
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(1, 1, 1);
        scene.add(light);
        const ambient = new THREE.AmbientLight(0x404060);
        scene.add(ambient);
        
        function animate() {
            requestAnimationFrame(animate);
            if (planet3d) planet3d.rotation.y += 0.005;
            renderer.render(scene, camera);
        }
        animate();
        
        planetElement = container;
        container.style.cursor = 'pointer';
        container.style.touchAction = 'manipulation';
        setupTouchHandlers(container);
        
    }).catch(err => {
        console.error('Three.js error:', err);
        createFallbackStar();
    });
    
    setTimeout(() => {
        const container = document.getElementById('canvas-container');
        if (container && container.children.length === 0) {
            createFallbackStar();
        }
    }, 3000);
}

// ==================== UI ФУНКЦИИ ====================
function updateUI() {
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
    
    let rate = passiveIncomeLevel * 5;
    passiveIncomeRate = rate;
    document.getElementById('passiveIncomeRate').textContent = rate;
    
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
    document.getElementById('userLevel').textContent = `Уровень ${level}`;
    
    document.getElementById('profileCoins').textContent = Math.floor(coins);
    document.getElementById('profileClickPower').textContent = clickPower;
    document.getElementById('profileMaxEnergy').textContent = maxEnergy;
    document.getElementById('profilePassiveIncome').textContent = passiveIncomeRate;
    document.getElementById('profileId').textContent = userId;
    document.getElementById('profileDate').textContent = new Date().toLocaleDateString();
    document.getElementById('profileName').textContent = displayName;
    
    document.getElementById('dailyClickProgress').textContent = `${dailyClickCount}/100`;
    document.getElementById('dailyCoinsProgress').textContent = `${dailyCoinsEarned}/500`;
    document.getElementById('weeklyClickProgress').textContent = `${weeklyClickCount}/1000`;
    document.getElementById('weeklyCoinsProgress').textContent = `${weeklyCoinsEarned}/5000`;
    
    updateTaskButtons();
}

function saveGame() {
    localStorage.setItem('starToPlanet', JSON.stringify({
        coins, energy, maxEnergy, clickPower, clickUpgradeCost, clickUpgradeLevel,
        energyUpgradeCost, energyUpgradeLevel, passiveIncomeLevel, passiveIncomeUpgradeCost,
        dailyClickCount, dailyCoinsEarned, dailyTasksClaimed,
        weeklyClickCount, weeklyCoinsEarned, weeklyTasksClaimed
    }));
}

function loadGame() {
    const saved = localStorage.getItem('starToPlanet');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            coins = data.coins || 0;
            energy = data.energy ?? 100;
            maxEnergy = data.maxEnergy ?? 100;
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
        } catch(e) {}
    }
    updateUI();
}

function updateTaskButtons() {
    const dailyClickBtn = document.getElementById('dailyClickClaim');
    const dailyCoinsBtn = document.getElementById('dailyCoinsClaim');
    const weeklyClickBtn = document.getElementById('weeklyClickClaim');
    const weeklyCoinsBtn = document.getElementById('weeklyCoinsClaim');
    
    if (dailyClickBtn) {
        if (dailyClickCount >= 100 && !dailyTasksClaimed.click) dailyClickBtn.classList.remove('disabled');
        else dailyClickBtn.classList.add('disabled');
    }
    if (dailyCoinsBtn) {
        if (dailyCoinsEarned >= 500 && !dailyTasksClaimed.coins) dailyCoinsBtn.classList.remove('disabled');
        else dailyCoinsBtn.classList.add('disabled');
    }
    if (weeklyClickBtn) {
        if (weeklyClickCount >= 1000 && !weeklyTasksClaimed.click) weeklyClickBtn.classList.remove('disabled');
        else weeklyClickBtn.classList.add('disabled');
    }
    if (weeklyCoinsBtn) {
        if (weeklyCoinsEarned >= 5000 && !weeklyTasksClaimed.coins) weeklyCoinsBtn.classList.remove('disabled');
        else weeklyCoinsBtn.classList.add('disabled');
    }
}

async function claimTask(taskId, reward, type) {
    if (type === 'daily_click') {
        if (dailyTasksClaimed.click) return;
        dailyTasksClaimed.click = true;
        coins += reward;
        showMessage(`🎉 +${reward} монет!`);
    } else if (type === 'daily_coins') {
        if (dailyTasksClaimed.coins) return;
        dailyTasksClaimed.coins = true;
        coins += reward;
        showMessage(`🎉 +${reward} монет!`);
    } else if (type === 'weekly_click') {
        if (weeklyTasksClaimed.click) return;
        weeklyTasksClaimed.click = true;
        coins += reward;
        showMessage(`🎉 +${reward} монет!`);
    } else if (type === 'weekly_coins') {
        if (weeklyTasksClaimed.coins) return;
        weeklyTasksClaimed.coins = true;
        coins += reward;
        showMessage(`🎉 +${reward} монет!`);
    }
    updateUI();
    saveGame();
    updateTaskButtons();
}

function upgradeClick() {
    if (coins >= clickUpgradeCost && clickUpgradeLevel < 100) {
        coins -= clickUpgradeCost;
        clickPower++;
        clickUpgradeLevel++;
        clickUpgradeCost = Math.floor(clickUpgradeCost * 1.3);
        updateUI();
        saveGame();
        showMessage('✅ Сила клика +1');
    } else if (clickUpgradeLevel >= 100) {
        showMessage('⚠️ Максимальный уровень!', true);
    } else {
        showMessage('❌ Не хватает монет!', true);
    }
}

function upgradeEnergy() {
    if (coins >= energyUpgradeCost && energyUpgradeLevel < 100) {
        coins -= energyUpgradeCost;
        maxEnergy += 50;
        energy += 50;
        energyUpgradeLevel++;
        energyUpgradeCost = Math.floor(energyUpgradeCost * 1.25);
        updateUI();
        saveGame();
        showMessage('✅ Энергия +50');
    } else if (energyUpgradeLevel >= 100) {
        showMessage('⚠️ Максимальный уровень!', true);
    } else {
        showMessage('❌ Не хватает монет!', true);
    }
}

function upgradePassive() {
    if (coins >= passiveIncomeUpgradeCost && passiveIncomeLevel < 100) {
        coins -= passiveIncomeUpgradeCost;
        passiveIncomeLevel++;
        passiveIncomeUpgradeCost = Math.floor(passiveIncomeUpgradeCost * 1.25);
        updateUI();
        saveGame();
        showMessage('✅ Пассивный доход +5/мин');
    } else if (passiveIncomeLevel >= 100) {
        showMessage('⚠️ Максимальный уровень!', true);
    } else {
        showMessage('❌ Не хватает монет!', true);
    }
}

function applyPassiveIncome() {
    if (passiveIncomeRate > 0) {
        coins += passiveIncomeRate;
        updateUI();
        saveGame();
    }
}

function rechargeEnergy() {
    if (energy < maxEnergy) {
        energy = Math.min(energy + 3, maxEnergy);
        updateUI();
    }
}

function showMessage(text, isError = false) {
    const msg = document.getElementById('message');
    msg.textContent = text;
    msg.style.color = isError ? '#ff6b6b' : '#ffd700';
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2000);
}

// ==================== РЕЙТИНГ ====================
async function loadLeaderboard() {
    const container = document.getElementById('leaderboardList');
    if (!container) return;
    container.innerHTML = '<div class="leaderboard-item">🏆 Загрузка...</div>';
    try {
        const response = await fetch(`https://startoplanet.onrender.com/api/leaderboard?limit=20`);
        if (!response.ok) throw new Error();
        const players = await response.json();
        if (players.length === 0) {
            container.innerHTML = '<div class="leaderboard-item">🏆 Пока нет игроков</div>';
            return;
        }
        container.innerHTML = players.slice(0, 10).map((p, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
            const name = p.first_name || p.username || `Игрок ${p.telegram_id}`;
            return `<div class="leaderboard-item"><div class="leaderboard-rank ${i < 3 ? `top-${i+1}` : ''}">${medal}</div><div class="leaderboard-name">${name}</div><div class="leaderboard-coins">${(p.coins || 0).toLocaleString()} 🪙</div></div>`;
        }).join('');
    } catch(e) {
        container.innerHTML = '<div class="leaderboard-item">❌ Ошибка</div>';
    }
}

// ==================== ДРУЗЬЯ ====================
async function loadFriends() {
    if (!userId || userId.toString().startsWith('guest')) return;
    try {
        const response = await fetch(`https://startoplanet.onrender.com/api/friends/${userId}`);
        if (!response.ok) throw new Error();
        const friends = await response.json();
        const container = document.getElementById('level1List');
        if (container) {
            if (friends.length === 0) container.innerHTML = '<div class="level-item">👥 Пока нет друзей</div>';
            else container.innerHTML = friends.slice(0, 5).map(f => `<div class="level-item"><span>${f.first_name || f.username}</span><span>${(f.coins || 0).toLocaleString()} 🪙</span></div>`).join('');
        }
        document.getElementById('referralCount').textContent = friends.length;
        document.getElementById('referralBonus').textContent = (friends.length * 1000).toLocaleString();
    } catch(e) { console.error(e); }
}

function updateReferralLink() {
    const linkInput = document.getElementById('referralLink');
    if (linkInput && userId) {
        linkInput.value = `https://t.me/startoplanet_bot?start=ref_${userId}`;
    }
}

function copyReferralLink() {
    const input = document.getElementById('referralLink');
    if (input) { input.select(); document.execCommand('copy'); showMessage('✅ Ссылка скопирована'); }
}

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
            if (tab === 'friends') { loadFriends(); updateReferralLink(); }
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

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
function init() {
    loadGame();
    init3D();
    setupTabs();
    setupTasksTabs();
    updateReferralLink();
    
    document.getElementById('buyClickUpgrade')?.addEventListener('click', upgradeClick);
    document.getElementById('buyEnergyUpgrade')?.addEventListener('click', upgradeEnergy);
    document.getElementById('buyPassiveUpgrade')?.addEventListener('click', upgradePassive);
    document.getElementById('copyLinkBtn')?.addEventListener('click', copyReferralLink);
    
    document.getElementById('dailyClickClaim')?.addEventListener('click', () => claimTask('dailyClickClaim', 100, 'daily_click'));
    document.getElementById('dailyCoinsClaim')?.addEventListener('click', () => claimTask('dailyCoinsClaim', 500, 'daily_coins'));
    document.getElementById('weeklyClickClaim')?.addEventListener('click', () => claimTask('weeklyClickClaim', 1000, 'weekly_click'));
    document.getElementById('weeklyCoinsClaim')?.addEventListener('click', () => claimTask('weeklyCoinsClaim', 2500, 'weekly_coins'));
    
    const boostBtn = document.getElementById('boostBtn');
    const boostModal = document.getElementById('boostModal');
    const closeBoost = document.getElementById('closeBoostModal');
    if (boostBtn) boostBtn.onclick = () => boostModal.classList.add('active');
    if (closeBoost) closeBoost.onclick = () => boostModal.classList.remove('active');
    if (boostModal) boostModal.onclick = (e) => { if (e.target === boostModal) boostModal.classList.remove('active'); };
    
    setInterval(applyPassiveIncome, 60000);
    setInterval(rechargeEnergy, 1000);
    
    const raysContainer = document.getElementById('raysContainer');
    if (raysContainer) {
        for (let i = 0; i < 12; i++) {
            const ray = document.createElement('div');
            ray.className = 'ray';
            raysContainer.appendChild(ray);
        }
    }
    
    document.getElementById('gameArea').style.display = 'flex';
    console.log('✅ Игра загружена! Мультитач активен');
    
    if (!document.querySelector('#popup-animation')) {
        const style = document.createElement('style');
        style.id = 'popup-animation';
        style.textContent = `
            @keyframes popup {
                0% { opacity: 1; transform: translateY(0) scale(0.8); }
                100% { opacity: 0; transform: translateY(-50px) scale(1); }
            }
            .floating-number {
                animation: popup 0.5s ease-out forwards !important;
            }
        `;
        document.head.appendChild(style);
    }
}

init();