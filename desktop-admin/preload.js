const { contextBridge, ipcRenderer } = require('electron');

function formatError(err, fallbackMessage) {
  if (err?.message) return err.message;
  return fallbackMessage;
}

async function apiFetch(creds, endpoint, options = {}) {
  const baseUrl = String(creds?.baseUrl || '').trim().replace(/\/+$/, '');
  const adminToken = String(creds?.adminToken || '').trim();
  const adminTelegramId = String(creds?.adminTelegramId || '').trim();

  if (!baseUrl || !adminToken || !adminTelegramId) {
    throw new Error('Заполните BASE_URL, ADMIN_TOKEN и ADMIN_TELEGRAM_ID');
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-admin-token': adminToken,
    'x-admin-user-id': adminTelegramId,
    ...(options.headers || {})
  };

  const res = await fetch(`${baseUrl}${endpoint}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || `HTTP ${res.status}`);
  }
  return data;
}

const api = {
  saveCreds: (creds) => ipcRenderer.invoke('creds:save', creds),
  readCreds: () => ipcRenderer.invoke('creds:read'),
  clearCreds: () => ipcRenderer.invoke('creds:clear'),

  verifyAccess: async (creds) => apiFetch(creds, '/api/admin/users?q=&limit=1'),
  loadUsers: async (creds, query) => apiFetch(creds, `/api/admin/users?q=${encodeURIComponent(query || '')}`),
  loadReferrals: async (creds, telegramId, depth = 4) =>
    apiFetch(creds, `/api/admin/referrals/${encodeURIComponent(telegramId)}?depth=${encodeURIComponent(depth)}`),
  loadPayments: async (creds, limit = 100) =>
    apiFetch(creds, `/api/admin/payments?limit=${encodeURIComponent(String(limit))}`),
  loadEconomy: async (creds) => apiFetch(creds, '/api/admin/economy'),
  saveEconomy: async (creds, patch) => apiFetch(creds, '/api/admin/economy', { method: 'POST', body: JSON.stringify(patch || {}) }),
  adjustUser: async (creds, telegramId, patch) =>
    apiFetch(creds, '/api/admin/adjust-user', {
      method: 'POST',
      body: JSON.stringify({ telegramId: Number(telegramId), patch: patch || {} })
    }),
  deleteUser: async (creds, telegramId) =>
    apiFetch(creds, '/api/admin/delete-user', {
      method: 'POST',
      body: JSON.stringify({ telegramId: Number(telegramId) })
    })
};

contextBridge.exposeInMainWorld('desktopAdmin', {
  ...api,
  formatError
});
