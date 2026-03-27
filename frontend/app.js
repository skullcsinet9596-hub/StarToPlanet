// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Игровые переменные
let coins = 0;
let energy = 1000;
let maxEnergy = 1000;
let clickPower = 1;
let clickUpgradeCost = 100;
let clickUpgradeLevel = 1;
let energyUpgradeCost = 200;
let energyUpgradeLevel = 1;

// Реферальные переменные
let referralCount = 0;
let referralBonus = 0;
let leaderboardPosition = 1;
let referralLink = '';

// Элементы интерфейса
const planet = document.getElementById('planet');
const planetCore = document.getElementById('planetCore');
const coinsSpan = document.getElementById('coins');
const energySpan = document.getElementById('energyValue');
const energyFill = document.getElementById('energyFill');
const clickPowerSpan = document.getElementById('clickPower');
const upgradeBtn = document.getElementById('upgradeBtn');
const userNameSpan = document.getElementById('userName');
const userLevelSpan = document.getElementById('userLevel');
const upgradeLevelSpan = document.getElementById('upgradeLevel');
const energyUpgradeLevelSpan = document.getElementById('energyUpgradeLevel');
const messageDiv = document.getElementById('message');

// Функция показа сообщения
function showMessage(text, isError = false) {
    messageDiv.textContent = text;
    messageDiv.style.color = isError ? '#ff6b6b' : '#ffd700';
    messageDiv.classList.add('show');
    setTimeout(() => {
        messageDiv.classList.remove('show');
    }, 2000);
}

// Форматирование чисел
function formatNumber(num) {
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toString();
}

// Обновление UI
function updateUI() {
    if (coinsSpan) coinsSpan.textContent = formatNumber(Math.floor(coins));
    if (energySpan) energySpan.textContent = `${Math.floor(energy)}/${maxEnergy}`;
    if (energyFill) energyFill.style.width = (energy / maxEnergy) *