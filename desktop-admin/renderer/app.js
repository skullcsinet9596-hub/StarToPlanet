const statusLine = document.getElementById('statusLine');

const elems = {
  baseUrl: document.getElementById('baseUrl'),
  adminToken: document.getElementById('adminToken'),
  adminTelegramId: document.getElementById('adminTelegramId'),
  saveCredsBtn: document.getElementById('saveCredsBtn'),
  verifyBtn: document.getElementById('verifyBtn'),
  clearCredsBtn: document.getElementById('clearCredsBtn'),

  playerListLimit: document.getElementById('playerListLimit'),
  playerSearchInput: document.getElementById('playerSearchInput'),
  refreshPlayerListBtn: document.getElementById('refreshPlayerListBtn'),
  playerListSelect: document.getElementById('playerListSelect'),
  playerTelegramId: document.getElementById('playerTelegramId'),
  loadPlayerBtn: document.getElementById('loadPlayerBtn'),
  coinsInput: document.getElementById('coinsInput'),
  levelInput: document.getElementById('levelInput'),
  moonInput: document.getElementById('moonInput'),
  earthInput: document.getElementById('earthInput'),
  sunInput: document.getElementById('sunInput'),
  referrerIdInput: document.getElementById('referrerIdInput'),
  saveReferrerBtn: document.getElementById('saveReferrerBtn'),
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

function formatPlayerListLabel(u) {
  const id = u.telegram_id;
  const name = (u.first_name || '').trim() || '—';
  const un = u.username ? `@${u.username}` : '';
  const coins = Number(u.coins || 0);
  return `${id} · ${name} ${un} · ${coins} 🪙`;
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

function applyLoadedUser(user) {
  if (!user) return;
  loadedPlayer = user;
  const tid = String(user.telegram_id);
  elems.playerTelegramId.value = tid;
  elems.referralTelegramId.value = tid;
  elems.coinsInput.value = Number(user.coins || 0);
  elems.levelInput.value = Number(user.level || 1);
  elems.moonInput.value = String(Boolean(user.has_moon));
  elems.earthInput.value = String(Boolean(user.has_earth));
  elems.sunInput.value = String(Boolean(user.has_sun));
  const ref = user.referrer_id;
  elems.referrerIdInput.value = ref != null && ref !== '' ? String(ref) : '';
  jsonOut(elems.playerOut, user);
  setStatus(`Игрок ${tid} загружен`);
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
  elems.playerListSelect.innerHTML = '';
  setStatus('Credentials очищены');
}

async function onRefreshPlayerList() {
  elems.refreshPlayerListBtn.disabled = true;
  try {
    const q = elems.playerSearchInput.value.trim();
    const limit = Number(elems.playerListLimit.value || 200);
    const data = await window.desktopAdmin.loadUsers(getCreds(), q, limit);
    const users = Array.isArray(data.users) ? data.users : [];
    const sel = elems.playerListSelect;
    const prev = sel.value;
    sel.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = `— Игроков: ${users.length} —`;
    sel.appendChild(opt0);
    for (const u of users) {
      const o = document.createElement('option');
      o.value = String(u.telegram_id);
      o.textContent = formatPlayerListLabel(u);
      sel.appendChild(o);
    }
    if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
    setStatus(`Список обновлён (${users.length})`);
  } catch (err) {
    setStatus(window.desktopAdmin.formatError(err, 'Ошибка списка игроков'), true);
  } finally {
    elems.refreshPlayerListBtn.disabled = false;
  }
}

async function onPlayerListSelectChange() {
  const id = elems.playerListSelect.value.trim();
  if (!id) return;
  elems.playerListSelect.disabled = true;
  try {
    const data = await window.desktopAdmin.loadUserById(getCreds(), id);
    const user = data.user;
    if (!user) throw new Error('Пустой ответ');
    applyLoadedUser(user);
  } catch (err) {
    setStatus(window.desktopAdmin.formatError(err, 'Ошибка загрузки профиля'), true);
  } finally {
    elems.playerListSelect.disabled = false;
  }
}

async function onLoadPlayer() {
  elems.loadPlayerBtn.disabled = true;
  try {
    const query = elems.playerTelegramId.value.trim();
    if (!query) throw new Error('Введите Telegram ID игрока');
    const data = await window.desktopAdmin.loadUserById(getCreds(), query);
    const user = data.user;
    if (!user) throw new Error('Игрок не найден');
    applyLoadedUser(user);
    const sel = elems.playerListSelect;
    if ([...sel.options].some((o) => o.value === String(user.telegram_id))) {
      sel.value = String(user.telegram_id);
    }
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
    if (!telegramId) throw new Error('Нет выбранного игрока');
    const patch = {
      coins: Number(elems.coinsInput.value || 0),
      level: Number(elems.levelInput.value || 1),
      has_moon: toBool(elems.moonInput.value),
      has_earth: toBool(elems.earthInput.value),
      has_sun: toBool(elems.sunInput.value)
    };
    const data = await window.desktopAdmin.adjustUser(getCreds(), telegramId, patch);
    if (data.user) applyLoadedUser(data.user);
    else jsonOut(elems.playerOut, data);
    setStatus(`Игрок ${telegramId} обновлён`);
  } catch (err) {
    setStatus(window.desktopAdmin.formatError(err, 'Ошибка изменения игрока'), true);
  } finally {
    elems.savePlayerBtn.disabled = false;
  }
}

async function onSaveReferrer() {
  elems.saveReferrerBtn.disabled = true;
  try {
    const telegramId = elems.playerTelegramId.value.trim();
    if (!telegramId) throw new Error('Нет выбранного игрока');
    const raw = elems.referrerIdInput.value.trim();
    const data = await window.desktopAdmin.setReferrer(getCreds(), telegramId, raw === '' ? null : raw);
    if (data.user) applyLoadedUser(data.user);
    else jsonOut(elems.playerOut, data);
    setStatus(`Реферер для ${telegramId} обновлён`);
  } catch (err) {
    setStatus(window.desktopAdmin.formatError(err, 'Ошибка смены реферера'), true);
  } finally {
    elems.saveReferrerBtn.disabled = false;
  }
}

async function onDeletePlayer() {
  elems.deletePlayerBtn.disabled = true;
  try {
    const telegramId = elems.playerTelegramId.value.trim();
    if (!telegramId) throw new Error('Нет выбранного игрока');
    const approved = window.confirm(`Удалить профиль ${telegramId}? Это действие необратимо.`);
    if (!approved) {
      setStatus('Удаление отменено');
      return;
    }
    const data = await window.desktopAdmin.deleteUser(getCreds(), telegramId);
    loadedPlayer = null;
    elems.playerTelegramId.value = '';
    elems.referralTelegramId.value = '';
    elems.coinsInput.value = '';
    elems.levelInput.value = '';
    elems.moonInput.value = 'false';
    elems.earthInput.value = 'false';
    elems.sunInput.value = 'false';
    elems.referrerIdInput.value = '';
    elems.playerListSelect.value = '';
    jsonOut(elems.playerOut, data);
    setStatus(`Профиль ${telegramId} удален`);
    await onRefreshPlayerList();
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
  elems.refreshPlayerListBtn.addEventListener('click', onRefreshPlayerList);
  elems.playerListSelect.addEventListener('change', onPlayerListSelectChange);
  elems.loadPlayerBtn.addEventListener('click', onLoadPlayer);
  elems.savePlayerBtn.addEventListener('click', onSavePlayer);
  elems.saveReferrerBtn.addEventListener('click', onSaveReferrer);
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
