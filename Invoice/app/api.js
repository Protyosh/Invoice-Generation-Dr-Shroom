// ═══════════════════════════════════════════════════════════
//  API — wraps fetch calls to the Apps Script Web App
// ═══════════════════════════════════════════════════════════

const Api = {

  getScriptUrl() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.scriptUrl) || CONFIG.DEFAULT_SCRIPT_URL || '';
  },

  setScriptUrl(url) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.scriptUrl, url.trim());
  },

  getCreatedBy() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.createdBy) || '';
  },

  setCreatedBy(name) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.createdBy, name.trim());
  },

  async _get(action, params = {}) {
    const base = this.getScriptUrl();
    if (!base) throw new Error('No Script URL configured. Go to Settings first.');
    const url = new URL(base);
    url.searchParams.set('action', action);
    Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));

    const res = await fetch(url.toString(), { method: 'GET' });
    if (!res.ok) throw new Error('Network error: ' + res.status);
    const json = await res.json();
    if (json.success === false) throw new Error(json.error || 'Request failed');
    return json;
  },

  async _post(payload) {
    const base = this.getScriptUrl();
    if (!base) throw new Error('No Script URL configured. Go to Settings first.');

    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight on Apps Script
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Network error: ' + res.status);
    const json = await res.json();
    if (json.success === false) throw new Error(json.error || 'Request failed');
    return json;
  },

  // ── Products ──
  getProducts()              { return this._get('getProducts'); },
  saveProduct(product)       { return this._post({ action: 'saveProduct', product }); },
  deleteProduct(code)        { return this._post({ action: 'deleteProduct', code }); },

  // ── Recipients ──
  getRecipients()            { return this._get('getRecipients'); },
  saveRecipient(recipient)   { return this._post({ action: 'saveRecipient', recipient }); },
  deleteRecipient(name, phone) { return this._post({ action: 'deleteRecipient', name, phone }); },

  // ── Business Info ──
  getBusinessInfo()          { return this._get('getBusinessInfo'); },
  saveBusinessInfo(info)     { return this._post({ action: 'saveBusinessInfo', info }); },

  // ── Invoices ──
  createInvoice(data)        { return this._post({ action: 'createInvoice', ...data, createdBy: this.getCreatedBy() }); },
  getInvoices()              { return this._get('getInvoices'); },
  getInvoice(invoiceNo)      { return this._get('getInvoice', { invoiceNo }); },

  // ── Connection test ──
  async testConnection() {
    try {
      await this.getBusinessInfo();
      return true;
    } catch (e) {
      return false;
    }
  },
};
