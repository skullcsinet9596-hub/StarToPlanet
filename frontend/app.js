// ==================== ИНИЦИАЛИЗАЦИЯ ====================
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

const tgUser = tg.initDataUnsafe?.user;
let userId = tgUser?.id || 'guest_' + Math.floor(Math.random() * 1000000000);
let displayName = "Игрок";
let userAvatar = tgUser?.photo_url || 'https://telegram.org/img/tg_icon_light.png';
if (tgUser) {
    if (tgUser.username) displayName = `@${tgUser.username}`;
    else if (tgUser.first_name) displayName = tgUser.first_name;
}
document.getElementById('userName').textContent = displayName;
document.getElementById('profileName').textContent = displayName;
document.getElementById('userAvatar')?.setAttribute('src', userAvatar);
document.getElementById('profileAvatar')?.setAttribute('src', userAvatar);

function getReferrerId() {
    const urlParams = new URLSearchParams(window.location.search);
    const startapp = urlParams.get('startapp');
    if (startapp && startapp.startsWith('ref_')) return startapp.replace('ref_', '');
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

let hasMoon = false;
let hasEarth = false;
let hasSun = false;

let dailyClickCount = 0, dailyCoinsEarned = 0, dailyTasksClaimed = { click: false, coins: false };
let weeklyClickCount = 0, weeklyCoinsEarned = 0, weeklyTasksClaimed = { click: false, coins: false };

// ==================== ЗВЕЗДА (клик по контейнеру) ====================
const starContainer = document.getElementById('star-container');
if (starContainer) {
    starContainer.addEventListener('click', handleClick);
}

function handleClick(event) {
    if (energy < clickPower) {
        showMessage('❌ Нет энергии!', true);
        return;
    }
    energy -= clickPower;
    coins += clickPower;
    dailyClickCount++; weeklyClickCount++;
    dailyCoinsEarned += clickPower; weeklyCoinsEarned += clickPower;
    updateUI(); saveGame(); syncToServer();
    
    // Анимация нажатия
    starContainer.style.transform = 'scale(0.95)';
    setTimeout(() => { if (starContainer) starContainer.style.transform = 'scale(1)'; }, 100);
    
    // Всплывающая цифра
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

async function syncToServer() {
    if (!userId || userId.toString().startsWith('guest')) return;
    try { await fetch(`https://startoplanet.onrender.com/api/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegramId: userId, coins: Math.floor(coins), clickPower, maxEnergy }) }); } catch(e) {}
}

function getLevel() {
    if (coins >= 10000000000) return 7;
    if (coins >= 1000000000) return 6;
    if (coins >= 100000000) return 5;
    if (coins >= 10000000) return 4;
    if (coins >= 1000000) return 3;
    if (coins >= 100000) return 2;
    if (coins >= 10000) return 1;
    return 0;
}

function updateStarOrPlanet() {
    const level = getLevel();
    const container = document.getElementById('star-container');
    if (!container) return;
    
    // Убираем старые классы планет
    container.classList.remove('planet-mercury', 'planet-mars', 'planet-venus', 'planet-neptune', 'planet-uranus', 'planet-saturn', 'planet-jupiter');
    
    if (level === 0) {
        // Звезда
        container.innerHTML = `
            <div class="star-core"></div>
            <div class="star-rays"></div>
        `;
        container.style.background = 'transparent';
        container.style.boxShadow = 'none';
    } else {
        // Планета
        const planetNames = ['', 'mercury', 'mars', 'venus', 'neptune', 'uranus', 'saturn', 'jupiter'];
        container.classList.add(`planet-${planetNames[level]}`);
        container.innerHTML = '';
        container.style.background = 'radial-gradient(circle at 30% 30%, var(--color1), var(--color2))';
        container.style.borderRadius = '50%';
        container.style.boxShadow = '0 0 30px rgba(0,0,0,0.3)';
        
        // Добавляем эмодзи планеты
        const emoji = document.createElement('div');
        emoji.style.fontSize = '80px';
        emoji.style.textAlign = 'center';
        emoji.style.lineHeight = '200px';
        const planetEmojis = ['', '☿', '♂', '♀', '♆', '⛢', '♄', '♃'];
        emoji.textContent = planetEmojis[level];
        container.innerHTML = '';
        container.appendChild(emoji);
    }
}

function updateUI() {
    const level = getLevel();
    const levelNames = ['⭐ Белая звезда', '☿ Меркурий', '♂ Марс', '♀ Венера', '♆ Нептун', '⛢ Уран', '♄ Сатурн', '♃ Юпитер'];
    document.getElementById('userLevel').textContent = `Уровень ${level} · ${levelNames[level]}`;
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
    if (hasSun) rate += 100000;
    else if (hasEarth) rate += 50000;
    else if (hasMoon) rate += 20000;
    passiveIncomeRate = rate;
    document.getElementById('passiveIncomeRate').textContent = rate;
    
    updateStarOrPlanet();
    
    document.getElementById('profileCoins').textContent = Math.floor(coins);
    document.getElementById('profileClickPower').textContent = clickPower;
    document.getElementById('profileMaxEnergy').textContent = maxEnergy;
    document.getElementById('profilePassiveIncome').textContent = passiveIncomeRate;
    document.getElementById('profileId').textContent = userId;
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
    const moonCard = document.getElementById('premiumMoonCard');
    const earthCard = document.getElementById('premiumEarthCard');
    const sunCard = document.getElementById('premiumSunCard');
    const moonBtn = document.getElementById('buyMoon');
    const earthBtn = document.getElementById('buyEarth');
    const sunBtn = document.getElementById('buySun');
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
        updateUI(); saveGame();
    } else if (type === 'earth' && hasMoon && !hasEarth) {
        hasEarth = true;
        showMessage('🌍 Земля куплена! +50 000 монет/мин');
        updateUI(); saveGame();
    } else if (type === 'sun' && hasEarth && !hasSun) {
        hasSun = true;
        showMessage('☀️ Солнце куплено! +100 000 монет/мин');
        updateUI(); saveGame();
    } else {
        showMessage('❌ Условия не выполнены', true);
    }
}

function saveGame() {
    localStorage.setItem('starToPlanet', JSON.stringify({
        coins, energy, maxEnergy, clickPower, clickUpgradeCost, clickUpgradeLevel,
        energyUpgradeCost, energyUpgradeLevel, passiveIncomeLevel, passiveIncomeUpgradeCost,
        dailyClickCount, dailyCoinsEarned, dailyTasksClaimed,
        weeklyClickCount, weeklyCoinsEarned, weeklyTasksClaimed,
        hasMoon, hasEarth, hasSun, displayName
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
            hasMoon = data.hasMoon || false;
            hasEarth = data.hasEarth || false;
            hasSun = data.hasSun || false;
            if (data.displayName) displayName = data.displayName;
        } catch(e) {}
    }
    if (referrerId && referrerId !== userId && !localStorage.getItem(`ref_bonus_${referrerId}_${userId}`)) {
        localStorage.setItem(`ref_bonus_${referrerId}_${userId}`, 'claimed');
        coins += 500;
        showMessage('🎉 +500 монет за приглашение!');
        saveGame(); syncToServer();
    }
    updateUI();
}

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
    updateUI(); saveGame(); syncToServer(); updateTaskButtons();
}
function upgradeClick() {
    if (coins >= clickUpgradeCost && clickUpgradeLevel < 100) {
        coins -= clickUpgradeCost; clickPower++; clickUpgradeLevel++;
        clickUpgradeCost = Math.floor(clickUpgradeCost * 1.3);
        updateUI(); saveGame(); syncToServer();
        showMessage('✅ Сила клика +1');
    } else if (clickUpgradeLevel >= 100) showMessage('⚠️ Максимальный уровень!', true);
    else showMessage('❌ Не хватает монет!', true);
}
function upgradeEnergy() {
    if (coins >= energyUpgradeCost && energyUpgradeLevel < 100) {
        coins -= energyUpgradeCost; maxEnergy += 50; energy += 50; energyUpgradeLevel++;
        energyUpgradeCost = Math.floor(energyUpgradeCost * 1.25);
        updateUI(); saveGame(); syncToServer();
        showMessage('✅ Энергия +50');
    } else if (energyUpgradeLevel >= 100) showMessage('⚠️ Максимальный уровень!', true);
    else showMessage('❌ Не хватает монет!', true);
}
function upgradePassive() {
    if (coins >= passiveIncomeUpgradeCost && passiveIncomeLevel < 100) {
        coins -= passiveIncomeUpgradeCost; passiveIncomeLevel++;
        passiveIncomeUpgradeCost = Math.floor(passiveIncomeUpgradeCost * 1.25);
        updateUI(); saveGame(); syncToServer();
        showMessage('✅ Пассивный доход +5/мин');
    } else if (passiveIncomeLevel >= 100) showMessage('⚠️ Максимальный уровень!', true);
    else showMessage('❌ Не хватает монет!', true);
}
function applyPassiveIncome() { if (passiveIncomeRate > 0) { coins += passiveIncomeRate; updateUI(); saveGame(); syncToServer(); } }
function rechargeEnergy() { if (energy < maxEnergy) { energy = Math.min(energy + 3, maxEnergy); updateUI(); } }
function showMessage(text, isError = false) { const msg = document.getElementById('message'); msg.textContent = text; msg.style.color = isError ? '#ff6b6b' : '#ffd700'; msg.classList.add('show'); setTimeout(() => msg.classList.remove('show'), 2000); }

// ==================== РЕЙТИНГ И ДРУЗЬЯ ====================
function loadLeaderboardFromAPI() {
    const container = document.getElementById('leaderboardList');
    if (!container) return;
    const demoPlayers = [
        { name: displayName, coins: coins, level: getLevel(), isCurrent: true },
        { name: "⭐ Александр", coins: 1250000, level: 5 },
        { name: "🌙 Екатерина", coins: 850000, level: 4 },
        { name: "🚀 Дмитрий", coins: 420000, level: 3 },
        { name: "🪐 Сергей", coins: 210000, level: 2 }
    ];
    const sorted = demoPlayers.sort((a,b) => b.coins - a.coins);
    container.innerHTML = sorted.map((p, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
        const isCurrent = p.isCurrent;
        return `<div class="leaderboard-item" style="${isCurrent ? 'border:1px solid #ffd700;background:rgba(255,215,0,0.1);' : ''}"><div class="leaderboard-rank ${i<3?`top-${i+1}`:''}">${medal}</div><div class="leaderboard-name">${p.name} ${isCurrent ? '👤' : ''}</div><div class="leaderboard-coins">${p.coins.toLocaleString()} 🪙</div><div class="leaderboard-level">Ур.${p.level}</div></div>`;
    }).join('');
}

function loadFriendsFromAPI() {
    const container = document.getElementById('level1List');
    if (!container) return;
    container.innerHTML = `<div class="level-item"><span>👥 Пригласите друзей через реферальную ссылку</span><span></span></div>`;
    document.getElementById('referralCount').textContent = '0';
    document.getElementById('referralBonus').textContent = '0';
    document.getElementById('profileReferrals').textContent = '0';
}

function setupTabs() {
    const panels = { game: document.getElementById('gameArea'), tasks: document.getElementById('tasksPanel'), friends: document.getElementById('friendsPanel'), profile: document.getElementById('profilePanel'), leaderboard: document.getElementById('leaderboardPanel'), airdrop: document.getElementById('airdropPanel') };
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            Object.values(panels).forEach(p => { if(p) p.style.display = 'none'; });
            if (panels[tab]) panels[tab].style.display = 'block';
            if (tab === 'game') panels.game.style.display = 'flex';
            if (tab === 'leaderboard') loadLeaderboardFromAPI();
            if (tab === 'friends') { loadFriendsFromAPI(); updateReferralLink(); }
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
    if(input && tg.openTelegramLink) {
        tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(input.value)}&text=⭐ Star to Planet ⭐ Присоединяйся и получай бонусы!`);
    } else if(input) {
        window.open(`https://t.me/share/url?url=${encodeURIComponent(input.value)}&text=⭐ Star to Planet ⭐ Присоединяйся и получай бонусы!`, '_blank');
    }
}

function init() {
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
    const boostBtn = document.getElementById('boostBtn'); const boostModal = document.getElementById('boostModal'); const closeBoost = document.getElementById('closeBoostModal');
    if(boostBtn) boostBtn.onclick = () => boostModal.classList.add('active');
    if(closeBoost) closeBoost.onclick = () => boostModal.classList.remove('active');
    if(boostModal) boostModal.onclick = (e) => { if(e.target === boostModal) boostModal.classList.remove('active'); };
    setInterval(applyPassiveIncome, 60000);
    setInterval(rechargeEnergy, 1000);
    const raysContainer = document.getElementById('raysContainer');
    if(raysContainer) for(let i=0;i<12;i++) { const ray = document.createElement('div'); ray.className = 'ray'; raysContainer.appendChild(ray); }
    document.getElementById('gameArea').style.display = 'flex';
    console.log('✅ Игра загружена! Белая звезда активна');
    if(!document.querySelector('#popup-animation')) { const style = document.createElement('style'); style.id = 'popup-animation'; style.textContent = `@keyframes popup {0%{opacity:1;transform:translateY(0) scale(0.8);}100%{opacity:0;transform:translateY(-50px) scale(1);}}.floating-number{animation:popup 0.5s ease-out forwards !important;}`; document.head.appendChild(style); }
    setTimeout(() => { loadLeaderboardFromAPI(); loadFriendsFromAPI(); }, 1000);
}
init();