// ==================== ИНИЦИАЛИЗАЦИЯ ====================
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// ==================== ПОЛУЧЕНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЯ ====================
const tgUser = tg.initDataUnsafe?.user;

let authMethod = 'telegram';
let userId = null;
let displayName = "Игрок";
let botUsername = 'startoplanet_bot';  // ЗАМЕНИТЕ НА USERNAME ВАШЕГО БОТА

// API URL бота
const BOT_API_URL = 'https://startoplanet.onrender.com';  // Замените на ваш URL

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
    if (tgUser.username) {
        displayName = `@${tgUser.username}`;
    } else if (tgUser.first_name && tgUser.last_name) {
        displayName = `${tgUser.first_name} ${tgUser.last_name}`;
    } else if (tgUser.first_name) {
        displayName = tgUser.first_name;
    }
    authMethod = 'telegram';
} else {
    userId = 'guest_' + Math.floor(Math.random() * 1000000000);
    displayName = "Гость";
    authMethod = 'guest';
}

// ==================== ИГРОВЫЕ ПЕРЕМЕННЫЕ ====================
let coins = 0, energy = 100, maxEnergy = 100, clickPower = 1;
let clickUpgradeCost = 100, clickUpgradeLevel = 1;
let energyUpgradeCost = 200, energyUpgradeLevel = 1;
let passiveIncomeLevel = 0, passiveIncomeUpgradeCost = 500, passiveIncomeRate = 0;
let referralBonusClaimed = { manager: false, supervisor: false, director: false, magnate: false, legend: false };
let referralCount = 0, referralBonusTotal = 0, leaderboardPosition = 1, registrationDate = new Date().toLocaleDateString();

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

// Флаги выполненных заданий (чтобы нельзя было получить награду дважды)
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
const upgradeBtn = document.getElementById('upgradeBtn');
const userNameSpan = document.getElementById('userName');
const userLevelSpan = document.getElementById('userLevel');
const messageDiv = document.getElementById('message');

// ==================== BOOST МОДАЛЬНОЕ ОКНО ====================
const boostModal = document.getElementById('boostModal');
const boostBtn = document.getElementById('boostBtn');
const closeBoostModal = document.getElementById('closeBoostModal');

if (boostBtn) {
    boostBtn.addEventListener('click', () => {
        if (boostModal) boostModal.classList.add('active');
    });
}

if (closeBoostModal) {
    closeBoostModal.addEventListener('click', () => {
        if (boostModal) boostModal.classList.remove('active');
    });
}

if (boostModal) {
    boostModal.addEventListener('click', (e) => {
        if (e.target === boostModal) {
            boostModal.classList.remove('active');
        }
    });
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
    if (referralBonusClaimed.manager) rate += 10;
    if (referralBonusClaimed.supervisor) rate += 25;
    if (referralBonusClaimed.director) rate += 50;
    if (referralBonusClaimed.magnate) rate += 100;
    if (referralBonusClaimed.legend) rate += 250;
    passiveIncomeRate = rate;
    const passiveIncomeSpan = document.getElementById('passiveIncomeRate');
    if (passiveIncomeSpan) passiveIncomeSpan.textContent = formatNumber(passiveIncomeRate);
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
        console.error('Ошибка синхронизации:', error);
    }
}

// ==================== ЗАДАНИЯ ====================
function loadTasksProgress() {
    const saved = localStorage.getItem('starToPlanetTasks');
    if (saved) {
        try {
            const data = JSON.parse(saved);
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
        } catch(e) {}
    }
    updateTasksUI();
}

function saveTasksProgress() {
    const data = {
        dailyClickCount, dailyCoinsEarned, dailyReferralCount, dailyUpgradeCount,
        weeklyClickCount, weeklyCoinsEarned, weeklyReferralCount, weeklyUpgradeCount, weeklyEnergyCount,
        dailyTasksClaimed, weeklyTasksClaimed
    };
    localStorage.setItem('starToPlanetTasks', JSON.stringify(data));
}

function updateTasksUI() {
    // Обновляем прогресс в UI
    const dailyClickSpan = document.getElementById('dailyClickProgress');
    const dailyCoinsSpan = document.getElementById('dailyCoinsProgress');
    const dailyReferralSpan = document.getElementById('dailyReferralProgress');
    const dailyUpgradeSpan = document.getElementById('dailyUpgradeProgress');
    const weeklyClickSpan = document.getElementById('weeklyClickProgress');
    const weeklyCoinsSpan = document.getElementById('weeklyCoinsProgress');
    const weeklyReferralSpan = document.getElementById('weeklyReferralProgress');
    const weeklyUpgradeSpan = document.getElementById('weeklyUpgradeProgress');
    const weeklyEnergySpan = document.getElementById('weeklyEnergyProgress');
    
    if (dailyClickSpan) dailyClickSpan.textContent = dailyClickCount;
    if (dailyCoinsSpan) dailyCoinsSpan.textContent = dailyCoinsEarned;
    if (dailyReferralSpan) dailyReferralSpan.textContent = dailyReferralCount;
    if (dailyUpgradeSpan) dailyUpgradeSpan.textContent = dailyUpgradeCount;
    if (weeklyClickSpan) weeklyClickSpan.textContent = weeklyClickCount;
    if (weeklyCoinsSpan) weeklyCoinsSpan.textContent = weeklyCoinsEarned;
    if (weeklyReferralSpan) weeklyReferralSpan.textContent = weeklyReferralCount;
    if (weeklyUpgradeSpan) weeklyUpgradeSpan.textContent = weeklyUpgradeCount;
    if (weeklyEnergySpan) weeklyEnergySpan.textContent = weeklyEnergyCount;
    
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
        else if (dailyTasksClaimed.click) dailyClickBtn.classList.add('disabled');
    }
    if (dailyCoinsBtn) {
        if (dailyCoinsEarned >= 500 && !dailyTasksClaimed.coins) dailyCoinsBtn.classList.remove('disabled');
        else if (dailyTasksClaimed.coins) dailyCoinsBtn.classList.add('disabled');
    }
    if (dailyReferralBtn) {
        if (dailyReferralCount >= 1 && !dailyTasksClaimed.referral) dailyReferralBtn.classList.remove('disabled');
        else if (dailyTasksClaimed.referral) dailyReferralBtn.classList.add('disabled');
    }
    if (dailyUpgradeBtn) {
        if (dailyUpgradeCount >= 5 && !dailyTasksClaimed.upgrade) dailyUpgradeBtn.classList.remove('disabled');
        else if (dailyTasksClaimed.upgrade) dailyUpgradeBtn.classList.add('disabled');
    }
    if (weeklyClickBtn) {
        if (weeklyClickCount >= 1000 && !weeklyTasksClaimed.click) weeklyClickBtn.classList.remove('disabled');
        else if (weeklyTasksClaimed.click) weeklyClickBtn.classList.add('disabled');
    }
    if (weeklyCoinsBtn) {
        if (weeklyCoinsEarned >= 5000 && !weeklyTasksClaimed.coins) weeklyCoinsBtn.classList.remove('disabled');
        else if (weeklyTasksClaimed.coins) weeklyCoinsBtn.classList.add('disabled');
    }
    if (weeklyReferralBtn) {
        if (weeklyReferralCount >= 5 && !weeklyTasksClaimed.referral) weeklyReferralBtn.classList.remove('disabled');
        else if (weeklyTasksClaimed.referral) weeklyReferralBtn.classList.add('disabled');
    }
    if (weeklyUpgradeBtn) {
        if (weeklyUpgradeCount >= 20 && !weeklyTasksClaimed.upgrade) weeklyUpgradeBtn.classList.remove('disabled');
        else if (weeklyTasksClaimed.upgrade) weeklyUpgradeBtn.classList.add('disabled');
    }
    if (weeklyEnergyBtn) {
        if (weeklyEnergyCount >= 500 && !weeklyTasksClaimed.energy) weeklyEnergyBtn.classList.remove('disabled');
        else if (weeklyTasksClaimed.energy) weeklyEnergyBtn.classList.add('disabled');
    }
}

async function claimTask(taskId, reward, taskType, taskName) {
    // Проверяем, не выполнено ли уже задание
    if (taskType === 'daily') {
        if (dailyTasksClaimed[taskName]) {
            showMessage('❌ Это задание уже выполнено!', true);
            return;
        }
        dailyTasksClaimed[taskName] = true;
    } else if (taskType === 'weekly') {
        if (weeklyTasksClaimed[taskName]) {
            showMessage('❌ Это задание уже выполнено!', true);
            return;
        }
        weeklyTasksClaimed[taskName] = true;
    }
    
    coins += reward;
    updateUI();
    saveGame();
    saveTasksProgress();
    syncToServer();
    showMessage(`🎉 +${reward} монет!`);
    
    const btn = document.getElementById(taskId);
    if (btn) {
        btn.classList.add('disabled');
        btn.disabled = true;
    }
}

// Функции обновления прогресса заданий
function updateTaskProgressOnClick() {
    dailyClickCount++;
    weeklyClickCount++;
    saveTasksProgress();
    updateTasksUI();
}

function updateTaskProgressOnCoins(earned) {
    dailyCoinsEarned += earned;
    weeklyCoinsEarned += earned;
    saveTasksProgress();
    updateTasksUI();
}

function updateTaskProgressOnUpgrade() {
    dailyUpgradeCount++;
    weeklyUpgradeCount++;
    saveTasksProgress();
    updateTasksUI();
}

function updateTaskProgressOnEnergy(energyValue) {
    weeklyEnergyCount = energyValue;
    saveTasksProgress();
    updateTasksUI();
}

function updateTaskProgressOnReferral() {
    dailyReferralCount++;
    weeklyReferralCount++;
    saveTasksProgress();
    updateTasksUI();
}

// ==================== UI ОБНОВЛЕНИЕ ====================
function updateUI() {
    coinsSpan.textContent = formatNumber(Math.floor(coins));
    energySpan.textContent = `${Math.floor(energy)}/${maxEnergy}`;
    energyFill.style.width = (energy / maxEnergy) * 100 + '%';
    clickPowerSpan.textContent = clickPower;
    energyCostSpan.textContent = clickPower;
    
    const upgradeBtnElement = document.getElementById('upgradeBtn');
    if (upgradeBtnElement) upgradeBtnElement.textContent = `📈 Улучшить клик (${formatNumber(clickUpgradeCost)} 🪙)`;
    
    const upgradeLevelSpan = document.getElementById('upgradeLevel');
    if (upgradeLevelSpan) upgradeLevelSpan.textContent = clickUpgradeLevel;
    const energyUpgradeLevelSpan = document.getElementById('energyUpgradeLevel');
    if (energyUpgradeLevelSpan) energyUpgradeLevelSpan.textContent = energyUpgradeLevel;
    const passiveUpgradeLevelSpan = document.getElementById('passiveUpgradeLevel');
    if (passiveUpgradeLevelSpan) passiveUpgradeLevelSpan.textContent = passiveIncomeLevel;
    
    const clickCostDisplay = document.getElementById('clickUpgradeCostDisplay');
    const energyCostDisplay = document.getElementById('energyUpgradeCostDisplay');
    const passiveCostDisplay = document.getElementById('passiveUpgradeCostDisplay');
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
    userLevelSpan.textContent = `Уровень ${level}`;
    
    if (planet) {
        if (level >= 8) { planetCore.textContent = '🌈'; planet.style.background = 'radial-gradient(circle at 30% 30%, #ff69b4, #ff1493)'; }
        else if (level >= 6) { planetCore.textContent = '🌍'; planet.style.background = 'radial-gradient(circle at 30% 30%, #7cfc00, #32cd32)'; }
        else if (level >= 4) { planetCore.textContent = '🪐'; planet.style.background = 'radial-gradient(circle at 30% 30%, #d2b48c, #cd853f)'; }
        else if (level >= 2) { planetCore.textContent = '🌑'; planet.style.background = 'radial-gradient(circle at 30% 30%, #cd7f32, #8b4513)'; }
        else { planetCore.textContent = '⭐'; planet.style.background = 'radial-gradient(circle at 30% 30%, #ffd700, #ff8c00)'; }
    }
    
    const profileCoinsSpan = document.getElementById('profileCoins');
    const profileClickPowerSpan = document.getElementById('profileClickPower');
    const profileMaxEnergySpan = document.getElementById('profileMaxEnergy');
    const profilePassiveIncomeSpan = document.getElementById('profilePassiveIncome');
    const profileReferralsSpan = document.getElementById('profileReferrals');
    const profileRankSpan = document.getElementById('profileRank');
    const profileDateSpan = document.getElementById('profileDate');
    const profileNameSpan = document.getElementById('profileName');
    const profileIdSpan = document.getElementById('profileId');
    
    if (profileCoinsSpan) profileCoinsSpan.textContent = formatNumber(coins);
    if (profileClickPowerSpan) profileClickPowerSpan.textContent = clickPower;
    if (profileMaxEnergySpan) profileMaxEnergySpan.textContent = maxEnergy;
    if (profilePassiveIncomeSpan) profilePassiveIncomeSpan.textContent = formatNumber(passiveIncomeRate);
    if (profileReferralsSpan) profileReferralsSpan.textContent = referralCount;
    if (profileRankSpan) profileRankSpan.textContent = `#${leaderboardPosition}`;
    if (profileDateSpan) profileDateSpan.textContent = registrationDate;
    if (profileNameSpan) profileNameSpan.textContent = displayName;
    if (profileIdSpan) profileIdSpan.textContent = authMethod === 'telegram' ? userId : (authMethod === 'vk' ? userId : 'Гость');
    
    syncToServer();
}

function saveGame() {
    const saveData = { coins, energy, maxEnergy, clickPower, clickUpgradeCost, clickUpgradeLevel, energyUpgradeCost, energyUpgradeLevel, passiveIncomeLevel, passiveIncomeUpgradeCost, referralBonusClaimed, referralCount, referralBonusTotal, registrationDate, displayName };
    localStorage.setItem('starToPlanetSave', JSON.stringify(saveData));
}

async function loadGame() {
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
            referralBonusClaimed = data.referralBonusClaimed || { manager: false, supervisor: false, director: false, magnate: false, legend: false };
            referralCount = data.referralCount || 0;
            referralBonusTotal = data.referralBonusTotal || 0;
            if (data.displayName) displayName = data.displayName;
            if (data.registrationDate) registrationDate = data.registrationDate;
        } catch(e) { console.error(e); }
    }
    
    if (authMethod === 'telegram' && userId) {
        try {
            const response = await fetch(`${BOT_API_URL}/api/user/${userId}`);
            if (response.ok) {
                const serverData = await response.json();
                if (serverData.user) {
                    coins = Math.max(coins, serverData.user.coins || 0);
                    referralCount = serverData.referralsCount || 0;
                    referralBonusTotal = serverData.totalReferralBonus || 0;
                    clickPower = Math.max(clickPower, serverData.user.click_power || 1);
                    maxEnergy = Math.max(maxEnergy, serverData.user.max_energy || 100);
                    updateUI();
                }
            }
        } catch(e) { console.error('Ошибка загрузки с сервера:', e); }
    }
    
    if (referrerId && referrerId !== userId && !localStorage.getItem(`referral_${referrerId}_${userId}`)) {
        localStorage.setItem(`referral_${referrerId}_${userId}`, 'claimed');
        coins += 500;
        showMessage('🎉 +500 монет за приглашение!');
        updateTaskProgressOnReferral();
        saveGame();
        syncToServer();
    }
    updateUI();
}

// ==================== ИГРОВЫЕ ФУНКЦИИ ====================
function handleClick(event) {
    event.preventDefault();
    let clientX, clientY;
    if (event.touches) { clientX = event.touches[0].clientX; clientY = event.touches[0].clientY; }
    else { clientX = event.clientX; clientY = event.clientY; }
    if (energy < clickPower) { showMessage('❌ Нет энергии!', true); return; }
    energy -= clickPower;
    coins += clickPower;
    updateUI();
    saveGame();
    
    // Обновляем прогресс заданий
    updateTaskProgressOnClick();
    updateTaskProgressOnCoins(clickPower);
    
    if (planet) { planet.classList.add('pressed'); setTimeout(() => planet.classList.remove('pressed'), 100); }
    const popup = document.createElement('div');
    popup.className = 'floating-number';
    popup.textContent = `+${clickPower}`;
    popup.style.left = (clientX - 20) + 'px';
    popup.style.top = (clientY - 20) + 'px';
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 500);
}

function setupTouchHandlers() {
    if (!planet) return;
    planet.addEventListener('touchstart', (e) => { e.preventDefault(); for (let i = 0; i < e.touches.length; i++) { const touch = e.touches[i]; handleClick({ clientX: touch.clientX, clientY: touch.clientY, touches: null, preventDefault: () => {} }); } }, { passive: false });
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
    
    container.innerHTML = '<div class="leaderboard-item">🏆 Загрузка рейтинга...</div>';
    
    try {
        const response = await fetch(`${BOT_API_URL}/api/leaderboard?limit=50`);
        if (!response.ok) throw new Error('Ошибка загрузки');
        
        const players = await response.json();
        
        if (players.length === 0) {
            container.innerHTML = '<div class="leaderboard-item">🏆 Пока нет игроков. Будьте первым!</div>';
            return;
        }
        
        const currentPlayerIndex = players.findIndex(p => p.telegram_id == userId);
        leaderboardPosition = currentPlayerIndex !== -1 ? currentPlayerIndex + 1 : players.length + 1;
        const leaderboardRankSpan = document.getElementById('leaderboardRank');
        const profileRankSpan = document.getElementById('profileRank');
        if (leaderboardRankSpan) leaderboardRankSpan.textContent = `#${leaderboardPosition}`;
        if (profileRankSpan) profileRankSpan.textContent = `#${leaderboardPosition}`;
        
        container.innerHTML = players.slice(0, 50).map((player, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;
            const playerName = player.first_name || player.username || `Игрок ${player.telegram_id}`;
            const coinsCount = (player.coins || 0).toLocaleString();
            
            return `
                <div class="leaderboard-item">
                    <div class="leaderboard-rank ${index < 3 ? `top-${index+1}` : ''}">${medal}</div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">${escapeHtml(playerName)}</div>
                        <div class="leaderboard-level">Ур. ${player.level || 1}</div>
                    </div>
                    <div class="leaderboard-coins">${coinsCount} 🪙</div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Ошибка загрузки рейтинга:', error);
        container.innerHTML = '<div class="leaderboard-item">❌ Ошибка загрузки рейтинга</div>';
    }
}

// ==================== ДРУЗЬЯ ====================
async function loadFriends() {
    const friendsList = document.getElementById('friendsList');
    if (!friendsList) return;
    
    if (authMethod !== 'telegram' || !userId) {
        friendsList.innerHTML = '<div class="friend-item">👥 Авторизуйтесь через Telegram, чтобы видеть друзей</div>';
        return;
    }
    
    friendsList.innerHTML = '<div class="friend-item">👥 Загрузка списка друзей...</div>';
    
    try {
        const response = await fetch(`${BOT_API_URL}/api/friends/${userId}`);
        if (!response.ok) throw new Error('Ошибка загрузки');
        
        const friends = await response.json();
        
        if (friends.length === 0) {
            friendsList.innerHTML = '<div class="friend-item">👥 Пока нет друзей. Пригласите первого!</div>';
            const referralCountSpan = document.getElementById('referralCount');
            const referralBonusSpan = document.getElementById('referralBonus');
            const profileReferralsSpan = document.getElementById('profileReferrals');
            if (referralCountSpan) referralCountSpan.textContent = '0';
            if (referralBonusSpan) referralBonusSpan.textContent = '0';
            if (profileReferralsSpan) profileReferralsSpan.textContent = '0';
        } else {
            friendsList.innerHTML = friends.map(friend => `
                <div class="friend-item">
                    <div class="friend-name">${escapeHtml(friend.first_name || friend.username || 'Игрок')}</div>
                    <div class="friend-coins">${(friend.coins || 0).toLocaleString()} 🪙</div>
                    <div class="friend-date">${new Date(friend.created_at).toLocaleDateString()}</div>
                </div>
            `).join('');
            
            const referralCountSpan = document.getElementById('referralCount');
            const referralBonusSpan = document.getElementById('referralBonus');
            const profileReferralsSpan = document.getElementById('profileReferrals');
            if (referralCountSpan) referralCountSpan.textContent = friends.length;
            if (referralBonusSpan) referralBonusSpan.textContent = (friends.length * 1000).toLocaleString();
            if (profileReferralsSpan) profileReferralsSpan.textContent = friends.length;
            referralCount = friends.length;
            referralBonusTotal = friends.length * 1000;
        }
    } catch (error) {
        console.error('Ошибка загрузки друзей:', error);
        friendsList.innerHTML = '<div class="friend-item">❌ Ошибка загрузки списка друзей</div>';
    }
}

async function loadReferralStructure() {
    if (authMethod !== 'telegram' || !userId) return;
    
    const level1Container = document.getElementById('level1List');
    const level2Container = document.getElementById('level2List');
    const level3Container = document.getElementById('level3List');
    
    if (!level1Container) return;
    
    level1Container.innerHTML = '<div class="level-item">Загрузка...</div>';
    level2Container.innerHTML = '<div class="level-item">Загрузка...</div>';
    level3Container.innerHTML = '<div class="level-item">Загрузка...</div>';
    
    try {
        const response = await fetch(`${BOT_API_URL}/api/referral-structure/${userId}`);
        if (!response.ok) throw new Error('Ошибка загрузки');
        
        const data = await response.json();
        
        if (data.level1 && data.level1.length > 0) {
            level1Container.innerHTML = data.level1.map(ref => `
                <div class="level-item">
                    <span>${escapeHtml(ref.first_name || ref.username || 'Игрок')}</span>
                    <span>${(ref.coins || 0).toLocaleString()} 🪙</span>
                </div>
            `).join('');
        } else {
            level1Container.innerHTML = '<div class="level-item">👥 Пока нет рефералов 1 уровня</div>';
        }
        
        if (data.level2 && data.level2.length > 0) {
            level2Container.innerHTML = data.level2.map(ref => `
                <div class="level-item">
                    <span>${escapeHtml(ref.first_name || ref.username || 'Игрок')}</span>
                    <span>${(ref.coins || 0).toLocaleString()} 🪙</span>
                </div>
            `).join('');
        } else {
            level2Container.innerHTML = '<div class="level-item">👥 Пока нет рефералов 2 уровня</div>';
        }
        
        if (data.level3 && data.level3.length > 0) {
            level3Container.innerHTML = data.level3.map(ref => `
                <div class="level-item">
                    <span>${escapeHtml(ref.first_name || ref.username || 'Игрок')}</span>
                    <span>${(ref.coins || 0).toLocaleString()} 🪙</span>
                </div>
            `).join('');
        } else {
            level3Container.innerHTML = '<div class="level-item">👥 Пока нет рефералов 3 уровня</div>';
        }
        
    } catch (error) {
        console.error('Ошибка загрузки структуры:', error);
        level1Container.innerHTML = '<div class="level-item">❌ Ошибка загрузки</div>';
        level2Container.innerHTML = '<div class="level-item">❌ Ошибка загрузки</div>';
        level3Container.innerHTML = '<div class="level-item">❌ Ошибка загрузки</div>';
    }
}

// ==================== РЕФЕРАЛЬНЫЕ ФУНКЦИИ ====================
function updateReferralUI() {
    const referralLinkInput = document.getElementById('referralLink');
    if (referralLinkInput && userId) {
        referralLinkInput.value = `https://t.me/${botUsername}?start=ref_${userId}`;
    }
    updateReferralBonusButtons();
}

function updateReferralBonusButtons() {
    const bonuses = [
        { id: 'manager', count: 1, claimed: referralBonusClaimed.manager, btnId: 'claimReferralBonus1' },
        { id: 'supervisor', count: 3, claimed: referralBonusClaimed.supervisor, btnId: 'claimReferralBonus2' },
        { id: 'director', count: 5, claimed: referralBonusClaimed.director, btnId: 'claimReferralBonus3' },
        { id: 'magnate', count: 10, claimed: referralBonusClaimed.magnate, btnId: 'claimReferralBonus4' },
        { id: 'legend', count: 20, claimed: referralBonusClaimed.legend, btnId: 'claimReferralBonus5' }
    ];
    bonuses.forEach((bonus) => {
        const btn = document.getElementById(bonus.btnId);
        if (btn) {
            if (bonus.claimed) {
                btn.textContent = '✓ Получено';
                btn.classList.add('disabled');
                btn.disabled = true;
            } else if (referralCount >= bonus.count) {
                btn.textContent = 'Получить';
                btn.classList.remove('disabled', 'locked');
                btn.disabled = false;
            } else {
                btn.textContent = `🔒 ${bonus.count} друзей`;
                btn.classList.add('locked');
                btn.disabled = true;
            }
        }
    });
}

function claimReferralBonus(bonusId, bonusRate) {
    let canClaim = false;
    switch(bonusId) {
        case 'manager': canClaim = !referralBonusClaimed.manager && referralCount >= 1; if(canClaim) referralBonusClaimed.manager = true; break;
        case 'supervisor': canClaim = !referralBonusClaimed.supervisor && referralCount >= 3; if(canClaim) referralBonusClaimed.supervisor = true; break;
        case 'director': canClaim = !referralBonusClaimed.director && referralCount >= 5; if(canClaim) referralBonusClaimed.director = true; break;
        case 'magnate': canClaim = !referralBonusClaimed.magnate && referralCount >= 10; if(canClaim) referralBonusClaimed.magnate = true; break;
        case 'legend': canClaim = !referralBonusClaimed.legend && referralCount >= 20; if(canClaim) referralBonusClaimed.legend = true; break;
    }
    if (canClaim) {
        referralBonusTotal += bonusRate;
        updateUI(); saveGame();
        showMessage(`🎉 +${bonusRate} монет/мин`);
    } else {
        showMessage(`❌ Нужно друзей`, true);
    }
}

function copyReferralLink() {
    const linkInput = document.getElementById('referralLink');
    if (linkInput) {
        linkInput.select();
        document.execCommand('copy');
        showMessage('✅ Ссылка скопирована');
    }
}

function shareReferralLink() {
    const linkInput = document.getElementById('referralLink');
    if (linkInput && tg.openTelegramLink) {
        tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(linkInput.value)}&text=⭐ Star to Planet ⭐ Присоединяйся и получай бонусы!`);
    } else if (linkInput) {
        window.open(`https://t.me/share/url?url=${encodeURIComponent(linkInput.value)}&text=⭐ Star to Planet ⭐ Присоединяйся и получай бонусы!`, '_blank');
    }
}

function escapeHtml(text) { if (!text) return 'Игрок'; const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

// ==================== ВКЛАДКИ ====================
function setupTabs() {
    const gameArea = document.getElementById('gameArea');
    const tasksPanel = document.getElementById('tasksPanel');
    const friendsPanel = document.getElementById('friendsPanel');
    const profilePanel = document.getElementById('profilePanel');
    const leaderboardPanel = document.getElementById('leaderboardPanel');
    const airdropPanel = document.getElementById('airdropPanel');
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            if (gameArea) gameArea.style.display = 'none';
            if (tasksPanel) tasksPanel.classList.remove('active');
            if (friendsPanel) friendsPanel.classList.remove('active');
            if (profilePanel) profilePanel.classList.remove('active');
            if (leaderboardPanel) leaderboardPanel.classList.remove('active');
            if (airdropPanel) airdropPanel.classList.remove('active');
            
            if (tab === 'game') {
                if (gameArea) gameArea.style.display = 'block';
            } else if (tab === 'tasks') {
                if (tasksPanel) tasksPanel.classList.add('active');
            } else if (tab === 'friends') {
                if (friendsPanel) friendsPanel.classList.add('active');
                updateReferralUI();
                loadFriends();
                loadReferralStructure();
            } else if (tab === 'profile') {
                if (profilePanel) profilePanel.classList.add('active');
            } else if (tab === 'leaderboard') {
                if (leaderboardPanel) leaderboardPanel.classList.add('active');
                loadLeaderboard();
            } else if (tab === 'airdrop') {
                if (airdropPanel) airdropPanel.classList.add('active');
            }
        });
    });
}

// ==================== ПОДВКЛАДКИ ЗАДАНИЙ ====================
function setupTasksTabs() {
    const dailyTab = document.querySelector('[data-tasks-tab="daily"]');
    const weeklyTab = document.querySelector('[data-tasks-tab="weekly"]');
    const dailyContent = document.getElementById('dailyTasks');
    const weeklyContent = document.getElementById('weeklyTasks');
    
    if (dailyTab) {
        dailyTab.addEventListener('click', () => {
            dailyTab.classList.add('active');
            weeklyTab.classList.remove('active');
            dailyContent.classList.add('active');
            weeklyContent.classList.remove('active');
        });
    }
    
    if (weeklyTab) {
        weeklyTab.addEventListener('click', () => {
            weeklyTab.classList.add('active');
            dailyTab.classList.remove('active');
            weeklyContent.classList.add('active');
            dailyContent.classList.remove('active');
        });
    }
}

// ==================== АВТОРИЗАЦИЯ ====================
function authTelegram() { if(tgUser) { authMethod='telegram'; userId=tgUser.id; displayName=tgUser.username?`@${tgUser.username}`:(tgUser.first_name||'Игрок'); updateUI(); loadGame(); showMessage('✅ Telegram'); } else showMessage('❌ Откройте через Telegram',true); }
function authVK() { const id=prompt('Введите ID ВКонтакте:'); if(id&&/^\d+$/.test(id)) { authMethod='vk'; userId=`vk_${id}`; displayName=prompt('Ваше имя:',`VK${id}`)||`VK${id}`; updateUI(); saveGame(); showMessage('✅ VK'); } }
function exportSave() { const data={version:1,coins,energy,maxEnergy,clickPower,clickUpgradeCost,clickUpgradeLevel,energyUpgradeCost,energyUpgradeLevel,passiveIncomeLevel,passiveIncomeUpgradeCost,referralBonusClaimed,referralCount,referralBonusTotal,registrationDate,displayName}; const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='star_to_planet_save.json'; a.click(); URL.revokeObjectURL(a.href); showMessage('💾 Экспорт'); }
function importSave(file) { const reader=new FileReader(); reader.onload=e=>{ try{ const data=JSON.parse(e.target.result); if(data.version===1){ coins=data.coins||0; energy=data.energy!==undefined?data.energy:100; maxEnergy=data.maxEnergy!==undefined?data.maxEnergy:100; clickPower=data.clickPower||1; clickUpgradeCost=data.clickUpgradeCost||100; clickUpgradeLevel=data.clickUpgradeLevel||1; energyUpgradeCost=data.energyUpgradeCost||200; energyUpgradeLevel=data.energyUpgradeLevel||1; passiveIncomeLevel=data.passiveIncomeLevel||0; passiveIncomeUpgradeCost=data.passiveIncomeUpgradeCost||500; referralBonusClaimed=data.referralBonusClaimed||{}; referralCount=data.referralCount||0; referralBonusTotal=data.referralBonusTotal||0; if(data.displayName)displayName=data.displayName; if(data.registrationDate)registrationDate=data.registrationDate; updateUI(); saveGame(); showMessage('✅ Импорт'); } else showMessage('❌ Версия',true); }catch(e){showMessage('❌ Ошибка',true);} }; reader.readAsText(file); }

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
async function init() {
    if (userNameSpan) userNameSpan.textContent = displayName;
    await loadGame();
    loadTasksProgress();
    setupTouchHandlers();
    
    if (authMethod === 'telegram' && userId) {
        await loadLeaderboard();
        await loadFriends();
        await loadReferralStructure();
    }
    
    // Кнопки улучшений в Boost модальном окне
    const buyClickUpgrade = document.getElementById('buyClickUpgrade');
    const buyEnergyUpgrade = document.getElementById('buyEnergyUpgrade');
    const buyPassiveUpgrade = document.getElementById('buyPassiveUpgrade');
    if (buyClickUpgrade) buyClickUpgrade.addEventListener('click', upgradeClick);
    if (buyEnergyUpgrade) buyEnergyUpgrade.addEventListener('click', upgradeEnergy);
    if (buyPassiveUpgrade) buyPassiveUpgrade.addEventListener('click', upgradePassiveIncome);
    
    // Реферальные бонусы
    for(let i=1;i<=5;i++) document.getElementById(`claimReferralBonus${i}`)?.addEventListener('click', () => claimReferralBonus(['manager','supervisor','director','magnate','legend'][i-1], [10,25,50,100,250][i-1]));
    
    // Кнопки заданий
    document.getElementById('dailyClickClaim')?.addEventListener('click', () => claimTask('dailyClickClaim', 100, 'daily', 'click'));
    document.getElementById('dailyCoinsClaim')?.addEventListener('click', () => claimTask('dailyCoinsClaim', 500, 'daily', 'coins'));
    document.getElementById('dailyReferralClaim')?.addEventListener('click', () => claimTask('dailyReferralClaim', 1000, 'daily', 'referral'));
    document.getElementById('dailyUpgradeClaim')?.addEventListener('click', () => claimTask('dailyUpgradeClaim', 750, 'daily', 'upgrade'));
    document.getElementById('weeklyClickClaim')?.addEventListener('click', () => claimTask('weeklyClickClaim', 1000, 'weekly', 'click'));
    document.getElementById('weeklyCoinsClaim')?.addEventListener('click', () => claimTask('weeklyCoinsClaim', 2500, 'weekly', 'coins'));
    document.getElementById('weeklyReferralClaim')?.addEventListener('click', () => claimTask('weeklyReferralClaim', 5000, 'weekly', 'referral'));
    document.getElementById('weeklyUpgradeClaim')?.addEventListener('click', () => claimTask('weeklyUpgradeClaim', 3000, 'weekly', 'upgrade'));
    document.getElementById('weeklyEnergyClaim')?.addEventListener('click', () => claimTask('weeklyEnergyClaim', 2000, 'weekly', 'energy'));
    
    document.getElementById('copyLinkBtn')?.addEventListener('click', copyReferralLink);
    document.getElementById('shareLinkBtn')?.addEventListener('click', shareReferralLink);
    document.getElementById('authTelegramBtn')?.addEventListener('click', authTelegram);
    document.getElementById('authVkBtn')?.addEventListener('click', authVK);
    document.getElementById('exportSaveBtn')?.addEventListener('click', exportSave);
    document.getElementById('importSaveBtn')?.addEventListener('click', () => document.getElementById('importFile')?.click());
    document.getElementById('importFile')?.addEventListener('change', (e) => { if(e.target.files[0]) importSave(e.target.files[0]); });
    
    setInterval(applyPassiveIncome, 60000);
    setInterval(rechargeEnergy, 1000);
    
    setupTabs();
    setupTasksTabs();
    document.getElementById('gameArea').style.display = 'block';
    updateReferralUI();
    
    console.log('✅ Игра загружена! Многоуровневая реферальная система активна');
    console.log('✅ Система заданий активна');
}

init();