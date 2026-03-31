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

// Премиум-флаги (покупки)
let hasMoon = false;
let hasEarth = false;
let hasSun = false;

// ==================== ЗАДАНИЯ ====================
let dailyClickCount = 0, dailyCoinsEarned = 0, dailyTasksClaimed = { click: false, coins: false };
let weeklyClickCount = 0, weeklyCoinsEarned = 0, weeklyTasksClaimed = { click: false, coins: false };

// ==================== 3D ПЕРЕМЕННЫЕ ====================
let scene, camera, renderer, planet3d;
let planetElement = null;

// ==================== СОЗДАНИЕ БЕЛОЙ ЗВЕЗДЫ (КАК НА ФОТО) ====================
function createStarTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 1024, 1024);
    const gradient = ctx.createRadialGradient(512, 512, 0, 512, 512, 512);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.95)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 240, 0.85)');
    gradient.addColorStop(0.6, 'rgba(230, 240, 255, 0.7)');
    gradient.addColorStop(0.8, 'rgba(200, 220, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(150, 180, 255, 0.2)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(512, 512, 480, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 12; i++) {
        const angle = (i * 30) * Math.PI / 180;
        const length = 380 + Math.sin(i) * 50;
        const x1 = 512 + Math.cos(angle) * 320;
        const y1 = 512 + Math.sin(angle) * 320;
        const x2 = 512 + Math.cos(angle) * length;
        const y2 = 512 + Math.sin(angle) * length;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = 28;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + Math.sin(angle) * 0.2})`;
        ctx.stroke();
        const x3 = 512 + Math.cos(angle + 0.2) * 340;
        const y3 = 512 + Math.sin(angle + 0.2) * 340;
        const x4 = 512 + Math.cos(angle + 0.2) * 400;
        const y4 = 512 + Math.sin(angle + 0.2) * 400;
        ctx.beginPath();
        ctx.moveTo(x3, y3);
        ctx.lineTo(x4, y4);
        ctx.lineWidth = 16;
        ctx.strokeStyle = `rgba(255, 255, 255, 0.3)`;
        ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

// ==================== 3D ПЛАНЕТА (РЕАЛИСТИЧНЫЕ ТЕКСТУРЫ) ====================
function getPlanetTexture(level) {
    const textures = {
        1: 'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
        2: 'https://threejs.org/examples/textures/planets/mars.jpg',
        3: 'https://threejs.org/examples/textures/planets/venus_surface.jpg',
        4: 'https://threejs.org/examples/textures/planets/neptune.jpg',
        5: 'https://threejs.org/examples/textures/planets/uranus.jpg',
        6: 'https://threejs.org/examples/textures/planets/saturn.jpg',
        7: 'https://threejs.org/examples/textures/planets/jupiter.jpg'
    };
    return textures[level] || 'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg';
}

function init3D() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    const width = 280, height = 280;
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    import('https://unpkg.com/three@0.128.0/build/three.module.js').then(THREE => {
        scene = new THREE.Scene();
        scene.background = null;
        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.set(0, 0, 3.2);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        container.appendChild(renderer.domElement);
        const starTexture = createStarTexture();
        const geometry = new THREE.SphereGeometry(1, 128, 128);
        const material = new THREE.MeshPhongMaterial({ map: starTexture, emissive: 0x88aaff, emissiveIntensity: 0.4, shininess: 80 });
        planet3d = new THREE.Mesh(geometry, material);
        scene.add(planet3d);
        const starLight = new THREE.PointLight(0xaaccff, 0.8);
        starLight.position.set(0, 0, 0);
        scene.add(starLight);
        const ambientLight = new THREE.AmbientLight(0x404060);
        scene.add(ambientLight);
        const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
        mainLight.position.set(2, 2, 2);
        scene.add(mainLight);
        let time = 0;
        function animate() {
            requestAnimationFrame(animate);
            time += 0.02;
            if (planet3d) {
                planet3d.rotation.y += 0.002;
                if (getLevel() === 0) {
                    const scale = 1 + Math.sin(time * 4) * 0.03;
                    planet3d.scale.set(scale, scale, scale);
                    starLight.intensity = 0.7 + Math.sin(time * 5) * 0.3;
                } else {
                    starLight.intensity = 0.3;
                }
            }
            renderer.render(scene, camera);
        }
        animate();
        planetElement = container;
        container.style.cursor = 'pointer';
        container.style.touchAction = 'manipulation';
        setupTouchHandlers(container);
        console.log('✅ 3D загружена');
    }).catch(err => { console.error('Three.js error:', err); createFallbackStar(); });
}

function createFallbackStar() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.background = 'radial-gradient(circle at 30% 30%, #ffffff, #aaccff)';
    container.style.borderRadius = '50%';
    container.style.boxShadow = '0 0 50px rgba(100,150,255,0.8)';
    container.style.cursor = 'pointer';
    container.style.animation = 'starPulse 2s ease-in-out infinite';
    const star = document.createElement('div');
    star.textContent = '⭐';
    star.style.fontSize = '100px';
    star.style.color = 'white';
    star.style.textShadow = '0 0 30px rgba(100,150,255,0.9)';
    star.style.pointerEvents = 'none';
    container.appendChild(star);
    planetElement = container;
    setupTouchHandlers(container);
}

async function syncToServer() {
    if (!userId || userId.toString().startsWith('guest')) return;
    try { await fetch(`https://startoplanet.onrender.com/api/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegramId: userId, coins: Math.floor(coins), clickPower, maxEnergy }) }); } catch(e) {}
}

function setupTouchHandlers(element) {
    if (!element) return;
    element.removeEventListener('touchstart', touchHandler);
    element.removeEventListener('mousedown', mouseHandler);
    element.addEventListener('touchstart', touchHandler, { passive: false });
    element.addEventListener('mousedown', mouseHandler);
}
function touchHandler(e) { e.preventDefault(); for (let i = 0; i < e.touches.length; i++) processClick({ clientX: e.touches[i].clientX, clientY: e.touches[i].clientY }); }
function mouseHandler(e) { e.preventDefault(); processClick({ clientX: e.clientX, clientY: e.clientY }); }
function processClick(eventData) {
    if (energy < clickPower) { showMessage('❌ Нет энергии!', true); return; }
    energy -= clickPower;
    coins += clickPower;
    dailyClickCount++; weeklyClickCount++;
    dailyCoinsEarned += clickPower; weeklyCoinsEarned += clickPower;
    updateUI(); saveGame(); syncToServer();
    if (planetElement) { planetElement.style.transform = 'scale(0.95)'; setTimeout(() => { if (planetElement) planetElement.style.transform = 'scale(1)'; }, 100); }
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
    popup.style.animation = 'popup 0.5s ease-out forwards';
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 500);
}

function getLevel() {
    if (coins >= 10000000000) return 7;      // Юпитер
    if (coins >= 1000000000) return 6;       // Сатурн
    if (coins >= 100000000) return 5;        // Уран
    if (coins >= 10000000) return 4;         // Нептун
    if (coins >= 1000000) return 3;          // Венера
    if (coins >= 100000) return 2;           // Марс
    if (coins >= 10000) return 1;            // Меркурий
    return 0;                                 // Белая звезда
}

function updatePlanetVisuals() {
    if (!planet3d) return;
    const level = getLevel();
    if (level === 0) {
        const starTexture = createStarTexture();
        planet3d.material.map = starTexture;
        planet3d.material.emissiveIntensity = 0.4;
        planet3d.material.needsUpdate = true;
    } else {
        const textureUrl = getPlanetTexture(level);
        new THREE.TextureLoader().load(textureUrl, (texture) => {
            planet3d.material.map = texture;
            planet3d.material.emissiveIntensity = 0.1;
            planet3d.material.needsUpdate = true;
        });
    }
    const scale = 1 + level * 0.07;
    planet3d.scale.set(scale, scale, scale);
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
    updatePlanetVisuals();
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
        moonCard.classList.remove('premium-locked');
        moonBtn.disabled = false;
        moonBtn.classList.remove('disabled');
        moonBtn.textContent = 'Купить за 50 ₽';
        document.getElementById('moonCondition').innerHTML = '🎉 Доступно для покупки!';
    } else if (hasMoon) {
        moonBtn.disabled = true;
        moonBtn.classList.add('disabled');
        moonBtn.textContent = '✅ КУПЛЕНО';
        document.getElementById('moonCondition').innerHTML = '✅ Луна куплена';
    }
    if (hasMoon && !hasEarth) {
        earthCard.classList.remove('premium-locked');
        earthBtn.disabled = false;
        earthBtn.classList.remove('disabled');
        earthBtn.textContent = 'Купить за 100 ₽';
        document.getElementById('earthCondition').innerHTML = '🎉 Доступно для покупки!';
    } else if (hasEarth) {
        earthBtn.disabled = true;
        earthBtn.classList.add('disabled');
        earthBtn.textContent = '✅ КУПЛЕНО';
        document.getElementById('earthCondition').innerHTML = '✅ Земля куплена';
    }
    if (hasEarth && !hasSun) {
        sunCard.classList.remove('premium-locked');
        sunBtn.disabled = false;
        sunBtn.classList.remove('disabled');
        sunBtn.textContent = 'Купить за 200 ₽';
        document.getElementById('sunCondition').innerHTML = '🎉 Доступно для покупки!';
    } else if (hasSun) {
        sunBtn.disabled = true;
        sunBtn.classList.add('disabled');
        sunBtn.textContent = '✅ КУПЛЕНО';
        document.getElementById('sunCondition').innerHTML = '✅ Солнце куплено';
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

const DEMO_PLAYERS = [{ name: displayName, coins: 0, level: 1, isCurrent: true }, { name: "⭐ Космический_воин", coins: 1250000, level: 8 }, { name: "🌙 Звездный_странник", coins: 850000, level: 7 }];
const DEMO_FRIENDS = [{ name: "@friend1", coins: 25000, date: "15.03.2026" }, { name: "@friend2", coins: 12000, date: "16.03.2026" }];
function updateLeaderboardUI() { const container = document.getElementById('leaderboardList'); if (!container) return; DEMO_PLAYERS[0].coins = coins; const sorted = [...DEMO_PLAYERS].sort((a,b)=>b.coins - a.coins); container.innerHTML = sorted.slice(0,10).map((p,i)=>{ const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}`; const isCurrent = p.isCurrent; return `<div class="leaderboard-item" style="${isCurrent ? 'border:1px solid #ffd700;background:rgba(255,215,0,0.1);' : ''}"><div class="leaderboard-rank ${i<3?`top-${i+1}`:''}">${medal}</div><div class="leaderboard-name">${p.name} ${isCurrent ? '👤' : ''}</div><div class="leaderboard-coins">${p.coins.toLocaleString()} 🪙</div><div class="leaderboard-level">Ур.${p.level}</div></div>`; }).join(''); }
function updateFriendsUI() { const container = document.getElementById('level1List'); if (!container) return; container.innerHTML = DEMO_FRIENDS.map(f=>`<div class="level-item"><span>${f.name}</span><span>${f.coins.toLocaleString()} 🪙</span><span style="font-size:10px;">${f.date}</span></div>`).join(''); document.getElementById('referralCount').textContent = DEMO_FRIENDS.length; document.getElementById('referralBonus').textContent = (DEMO_FRIENDS.length * 1000).toLocaleString(); document.getElementById('profileReferrals').textContent = DEMO_FRIENDS.length; }
async function loadLeaderboardFromAPI() { try { const response = await fetch(`https://startoplanet.onrender.com/api/leaderboard?limit=20`); if(response.ok){ const players = await response.json(); if(players.length>0){ const allPlayers = [...players]; const currentExists = allPlayers.some(p=>p.telegram_id==userId); if(!currentExists && coins>0) allPlayers.push({ telegram_id: userId, first_name: displayName, coins: coins, level: Math.floor(Math.log10(coins+1)/3)+1 }); const sorted = allPlayers.sort((a,b)=>b.coins - a.coins); const container = document.getElementById('leaderboardList'); if(container){ container.innerHTML = sorted.slice(0,10).map((p,i)=>{ const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}`; const name = p.first_name || p.username || `Игрок ${p.telegram_id}`; const isCurrent = p.telegram_id == userId; return `<div class="leaderboard-item" style="${isCurrent ? 'border:1px solid #ffd700;background:rgba(255,215,0,0.1);' : ''}"><div class="leaderboard-rank ${i<3?`top-${i+1}`:''}">${medal}</div><div class="leaderboard-name">${name} ${isCurrent ? '👤' : ''}</div><div class="leaderboard-coins">${(p.coins || 0).toLocaleString()} 🪙</div><div class="leaderboard-level">Ур.${p.level || 1}</div></div>`; }).join(''); return; } } } } catch(e){} updateLeaderboardUI(); }
async function loadFriendsFromAPI() { try { const response = await fetch(`https://startoplanet.onrender.com/api/friends/${userId}`); if(response.ok){ const friends = await response.json(); if(friends.length>0){ const container = document.getElementById('level1List'); if(container){ container.innerHTML = friends.slice(0,5).map(f=>`<div class="level-item"><span>${f.first_name || f.username}</span><span>${(f.coins || 0).toLocaleString()} 🪙</span><span style="font-size:10px;">${new Date(f.created_at).toLocaleDateString()}</span></div>`).join(''); document.getElementById('referralCount').textContent = friends.length; document.getElementById('referralBonus').textContent = (friends.length * 1000).toLocaleString(); document.getElementById('profileReferrals').textContent = friends.length; return; } } } } catch(e){} updateFriendsUI(); }
function setupTabs() { const panels = { game: document.getElementById('gameArea'), tasks: document.getElementById('tasksPanel'), friends: document.getElementById('friendsPanel'), profile: document.getElementById('profilePanel'), leaderboard: document.getElementById('leaderboardPanel'), airdrop: document.getElementById('airdropPanel') }; document.querySelectorAll('.nav-btn').forEach(btn=>{ btn.addEventListener('click',()=>{ const tab = btn.dataset.tab; document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); Object.values(panels).forEach(p=>{ if(p) p.style.display = 'none'; }); if(panels[tab]) panels[tab].style.display = 'block'; if(tab === 'game') panels.game.style.display = 'flex'; if(tab === 'leaderboard') loadLeaderboardFromAPI(); if(tab === 'friends') { loadFriendsFromAPI(); updateReferralLink(); } }); }); }
function setupTasksTabs() { const tabs = document.querySelectorAll('.tasks-tab'); const contents = { daily: document.getElementById('dailyTasks'), weekly: document.getElementById('weeklyTasks'), premium: document.getElementById('premiumTasks') }; tabs.forEach(t=>{ t.addEventListener('click',()=>{ const target = t.dataset.tasksTab; tabs.forEach(tt=>tt.classList.remove('active')); t.classList.add('active'); Object.values(contents).forEach(c=>c?.classList.remove('active')); if(contents[target]) contents[target].classList.add('active'); }); }); }
function updateReferralLink() { const linkInput = document.getElementById('referralLink'); if(linkInput && userId) linkInput.value = `https://t.me/startoplanet_bot?start=ref_${userId}`; }
function copyReferralLink() { const input = document.getElementById('referralLink'); if(input) { input.select(); document.execCommand('copy'); showMessage('✅ Ссылка скопирована'); } }
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
    console.log('✅ Игра загружена! Белая звезда, 3D планеты, премиум-замки активны');
    if(!document.querySelector('#popup-animation')) { const style = document.createElement('style'); style.id = 'popup-animation'; style.textContent = `@keyframes popup {0%{opacity:1;transform:translateY(0) scale(0.8);}100%{opacity:0;transform:translateY(-50px) scale(1);}}.floating-number{animation:popup 0.5s ease-out forwards !important;}`; document.head.appendChild(style); }
    setTimeout(() => { loadLeaderboardFromAPI(); loadFriendsFromAPI(); }, 1000);
}
init();