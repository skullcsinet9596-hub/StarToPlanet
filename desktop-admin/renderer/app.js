const statusLine = document.getElementById('statusLine');

const elems = {
  baseUrl: document.getElementById('baseUrl'),
  adminToken: document.getElementById('adminToken'),
  adminTelegramId: document.getElementById('adminTelegramId'),
  saveCredsBtn: document.getElementById('saveCredsBtn'),
  verifyBtn: document.getElementById('verifyBtn'),
  clearCredsBtn: document.getElementById('clearCredsBtn'),

  playerTelegramId: document.getElementById('playerTelegramId'),
  loadPlayerBtn: document.getElementById('loadPlayerBtn'),
  coinsInput: document.getElementById('coinsInput'),
  levelInput: document.getElementById('levelInput'),
  moonInput: document.getElementById('moonInput'),
  earthInput: document.getElementById('earthInput'),
  sunInput: document.getElementById('sunInput'),
  savePlayerBtn: document.getElementById('savePlayerBtn'),
  deletePlayerBtn: document.getElementById('deletePlayerBtn'),
  playerOut: document.getElementById('playerOut'),

  referralTelegramId: document.getElementById('referralTelegramId'),
  referralDepth: document.getElementById('referralDepth'),
  loadReferralsBtn: document.getElementById('loadReferralsBtn'),
  referralsOut: document.getElementById('referralsOut'),

  paymentsLimit: document.getElementById('paymentsLimit'),
  loadPaymentsBtn: document.getElementById('loadPaymentsBtn'),
  paymentsOut: document.getElementById('paymentsOut'),

  loadEconomyBtn: document.getElementById('loadEconomyBtn'),
  saveEconomyBtn: document.getElementById('saveEconomyBtn'),
  economyPatch: document.getElementById('economyPatch'),
  economyOut: document.getElementById('economyOut')
};

let loadedPlayer = null;

function setStatus(text, isError = false) {
  statusLine.textContent = text;
  statusLine.style.color = isError ? '#f08484' : '#9fb0c3';
}

function toBool(value) {
  return String(value) === 'true';
}

function getCreds() {
  return {
    baseUrl: elems.baseUrl.value.trim(),
    adminToken: elems.adminToken.value.trim(),
    adminTelegramId: elems.adminTelegramId.value.trim()
  };
}

function jsonOut(el, data) {
  el.textContent = JSON.stringify(data, null, 2);
}

function bindTabs() {
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tabPanel');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      panels.forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById(tab.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });
}

async function initCreds() {
  const res = await window.desktopAdmin.readCreds();
  if (!res.ok) {
    setStatus(res.message || 'Ошибка чтения сохраненных ключей', true);
    return;
  }
  if (!res.creds) return;
  elems.baseUrl.value = res.creds.baseUrl || '';
  elems.adminToken.value = res.creds.adminToken || '';
  elems.adminTelegramId.value = res.creds.adminTelegramId || '';
  setStatus(`Credentials загружены (${res.source || 'local'})`);
}

async function onSaveCreds() {
  try {
    const result = await window.desktopAdmin.saveCreds(getCreds());
    if (!result.ok) throw new Error(result.message || 'Ошибка сохранения');
    if (result.fallback) {
      setStatus(result.message || 'Сохранено в fallback хранилище');
      return;
    }
    setStatus('Credentials сохранены');
  } catch (err) {
    setStatus(window.desktopAdmin.formatError(err, 'Ошибка сохранения'), true);
  }
}

async function onVerify() {
  elems.verifyBtn.disabled = true;
  try {
    const data = await window.desktopAdmin.verifyAccess(getCreds());
    setStatus('Доступ подтвержден');
    jsonOut(elems.playerOut, data);
  } catch (err) {
    setStatus(window.desktopAdmin.formatError(err, 'Доступ не подтвержден'), true);
  } finally {
    elems.verifyBtn.disabled = false;
  }
}

async function onClearCreds() {
  await window.desktopAdmin.clearCreds();
  elems.baseUrl.value = '';
  elems.adminToken.value = '';
  elems.adminTelegramId.value = '';
  setStatus('Credentials очищены');
}

async function onLoadPlayer() {
  elems.loadPlayerBtn.disabled = true;
  try {
    const query = elems.playerTelegramId.value.trim();
    if (!query) throw new Error('Введите Telegram ID игрока');
    const data = await window.desktopAdmin.loadUsers(getCreds(), query);
    const user = Array.isArray(data.users) ? data.users.find((u) => String(u.telegram_id) === query) || data.users[0] : null;
    if (!user) throw new Error('Игрок не найден');
    loadedPlayer = user;
    elems.playerTelegramId.value = String(user.telegram_id);
    elems.coinsInput.value = Number(user.coins || 0);
    elems.levelInput.value = Number(user.level || 1);
    elems.moonInput.value = String(Boolean(user.has_moon));
    elems.earthInput.value = String(Boolean(user.has_earth));
    elems.sunInput.value = String(Boolean(user.has_sun));
    jsonOut(elems.playerOut, user);
    setStatus(`Игрок ${user.telegram_id} загружен`);
  } catch (err) {
    setStatus(window.desktopAdmin.formatError(err, 'Ошибка загрузки игрока'), true);
  } finally {
    elems.loadPlayerBtn.disabled = false;
  }
}

async function onSavePlayer() {
  elems.savePlayerBtn.disabled = true;
  try {
    const telegramId = elems.playerTelegramId.value.trim();
    if (!telegramId) throw new Error('Введите Telegram ID игрока');
    const patch = {
      coins: Number(elems.coinsInput.value || 0),
      level: Number(elems.levelInput.value || 1),
      has_moon: toBool(elems.moonInput.value),
      has_earth: toBool(elems.earthInput.value),
      has_sun: toBool(elems.sunInput.value)
    };
    const data = await window.desktopAdmin.adjustUser(getCreds(), telegramId, patch);
    loadedPlayer = data.user || loadedPlayer;
    jsonOut(elems.playerOut, data);
    setStatus(`Игрок ${telegramId} обновлен`);
  } catch (err) {
    setStatus(window.desktopAdmin.formatError(err, 'Ошибка изменения игрока'), true);
  } finally {
    elems.savePlayerBtn.disabled = false;
  }
}

async function onDeletePlayer() {
  elems.deletePlayerBtn.disabled = true;
  try {
    const telegramId = elems.playerTelegramId.value.trim();
    if (!telegramId) throw new Error('Введите Telegram ID игрока');
    const approved = window.confirm(`Удалить профиль ${telegramId}? Это действие необратимо.`);
    if (!approved) {
      setStatus('Удаление отменено');
      return;
    }
    const data = await window.desktopAdmin.deleteUser(getCreds(), telegramId);
    loadedPlayer = null;
    elems.playerTelegramId.value = '';
    elems.coinsInput.value = '';
    elems.levelInput.value = '';
    elems.moonInput.value = 'false';
    elems.earthInput.value = 'false';
    elems.sunInput.value = 'false';
    jsonOut(elems.playerOut, data);
    setStatus(`Профиль ${telegramId} удален`);
  } catch (err) {
    setStatus(window.desktopAdmin.formatError(err, 'Ошибка удаления профиля'), true);
  } finally {
    elems.deletePlayerBtn.disabled = false;
  }
}

async function onLoadReferrals() {
  elems.loadReferralsBtn.disabled = true;
  try {
    const id = elems.referralTelegramId.value.trim();
    const depth = Number(elems.referralDepth.value || 4);
    if (!id) throw new Error('Введите Telegram ID');
    const data = await window.desktopAdmin.loadReferrals(getCreds(), id, depth);
    jsonOut(elems.referralsOut, data);
    setStatus('Referrals загружены');
  } catch (err) {
    setStatus(window.desktopAdmin.formatError(err, 'Ошибка загрузки referrals'), true);
  } finally {
    elems.loadReferralsBtn.disabled = false;
  }
}

async function onLoadPayments() {
  elems.loadPaymentsBtn.disabled = true;
  try {
    const limit = Number(elems.paymentsLimit.value || 100);
    const data = await window.desktopAdmin.loadPayments(getCreds(), limit);
    jsonOut(elems.paymentsOut, data);
    setStatus('Payments загружены');
  } catch (err) {
    setStatus(window.desktopAdmin.formatError(err, 'Ошибка загрузки payments'), true);
  } finally {
    elems.loadPaymentsBtn.disabled = false;
  }
}

async function onLoadEconomy() {
  elems.loadEconomyBtn.disabled = true;
  try {
    const data = await window.desktopAdmin.loadEconomy(getCreds());
    jsonOut(elems.economyOut, data);
    elems.economyPatch.value = JSON.stringify(data.config || {}, null, 2);
    setStatus('Economy загружена');
  } catch (err) {
    setStatus(window.desktopAdmin.formatError(err, 'Ошибка загрузки economy'), true);
  } finally {
    elems.loadEconomyBtn.disabled = false;
  }
}

async function onSaveEconomy() {
  elems.saveEconomyBtn.disabled = true;
  try {
    const patch = JSON.parse(elems.economyPatch.value || '{}');
    const data = await window.desktopAdmin.saveEconomy(getCreds(), patch);
    jsonOut(elems.economyOut, data);
    setStatus('Economy обновлена');
  } catch (err) {
    setStatus(window.desktopAdmin.formatError(err, 'Ошибка сохранения economy'), true);
  } finally {
    elems.saveEconomyBtn.disabled = false;
  }
}

function bindEvents() {
  elems.saveCredsBtn.addEventListener('click', onSaveCreds);
  elems.verifyBtn.addEventListener('click', onVerify);
  elems.clearCredsBtn.addEventListener('click', onClearCreds);
  elems.loadPlayerBtn.addEventListener('click', onLoadPlayer);
  elems.savePlayerBtn.addEventListener('click', onSavePlayer);
  elems.deletePlayerBtn.addEventListener('click', onDeletePlayer);
  elems.loadReferralsBtn.addEventListener('click', onLoadReferrals);
  elems.loadPaymentsBtn.addEventListener('click', onLoadPayments);
  elems.loadEconomyBtn.addEventListener('click', onLoadEconomy);
  elems.saveEconomyBtn.addEventListener('click', onSaveEconomy);
}

(async function init() {
  bindTabs();
  bindEvents();
  await initCreds();
})();
