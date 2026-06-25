// ═══════════════════════════════════════════════════════════
//  APP — state, navigation, and all screen logic
// ═══════════════════════════════════════════════════════════

const State = {
  products: [],
  recipients: [],
  businessInfo: {},
  invoices: [],
  draft: {
    recipient: { name: '', address: '', phone: '' },
    items: [], // { code, name, price, qty }
  },
  currentStep: 1,
};

// ───────────────────────── Utilities ─────────────────────────

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = 'toast'; }, 2600);
}

function showLoading(text = 'Loading…') {
  document.getElementById('loadingText').textContent = text;
  document.getElementById('loadingOverlay').classList.add('show');
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show');
}

function formatRupee(n) {
  const num = Number(n) || 0;
  return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// Resizes/compresses an image file to a small square JPEG thumbnail,
// returned as a data URL. Keeps product photos well under the Google
// Sheets per-cell character limit (these are in-app only, never printed).
function compressImageToThumbnail(file, maxDim = 160, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load image'));
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; }
        } else {
          if (height > maxDim) { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ───────────────────────── Navigation ─────────────────────────

const SCREEN_TITLES = {
  generate: 'Generate Invoice',
  history: 'Invoice History',
  products: 'Products',
  recipients: 'Recipients',
  business: 'Business Info',
  settings: 'Settings',
};

function openDrawer() {
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
}
function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}

function goToScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  document.querySelectorAll('.drawer-item').forEach(li => {
    li.classList.toggle('active', li.dataset.screen === name);
  });
  document.getElementById('screenTitle').textContent = SCREEN_TITLES[name] || 'Dr. Shroom';
  closeDrawer();

  if (name === 'history') loadAndRenderHistory();
  if (name === 'products') renderProductsList();
  if (name === 'recipients') renderRecipientsList();
  if (name === 'business') fillBusinessForm();
}

// ───────────────────────── Step navigation (Generate Invoice) ─────────────────────────

function goToStep(step) {
  State.currentStep = step;
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('step-' + step).classList.add('active');

  document.querySelectorAll('.step').forEach(s => {
    const n = Number(s.dataset.step);
    s.classList.remove('active', 'done');
    if (n < step) s.classList.add('done');
    if (n === step) s.classList.add('active');
  });

  if (step === 2) renderProductPicker();
  if (step === 3) renderInvoicePreview();
}

// ───────────────────────── Loading remote data ─────────────────────────

async function loadAllData() {
  if (!Api.getScriptUrl()) {
    goToScreen('settings');
    toast('Set up your Script URL to get started', 'error');
    return;
  }
  showLoading('Loading your data…');
  try {
    const [prodRes, recRes, bizRes] = await Promise.all([
      Api.getProducts(),
      Api.getRecipients(),
      Api.getBusinessInfo(),
    ]);
    State.products = prodRes.products || [];
    State.recipients = recRes.recipients || [];
    State.businessInfo = bizRes.info || {};
    populateSavedRecipients();
    setConnStatus('ok');
  } catch (err) {
    toast('Could not load data: ' + err.message, 'error');
    setConnStatus('fail');
  } finally {
    hideLoading();
  }
}

function setConnStatus(state) {
  const el = document.getElementById('connStatus');
  if (state === 'ok') el.innerHTML = '<span class="status-dot status-ok"></span> Connected';
  else if (state === 'fail') el.innerHTML = '<span class="status-dot status-fail"></span> Connection failed';
  else el.innerHTML = '<span class="status-dot status-checking"></span> Checking…';
}

// ───────────────────────── STEP 1: Recipient ─────────────────────────

function populateSavedRecipients() {
  const sel = document.getElementById('savedRecipients');
  sel.innerHTML = '<option value="">— New recipient —</option>';
  State.recipients.forEach((r, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = r.name + (r.phone ? ' · ' + r.phone : '');
    sel.appendChild(opt);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('savedRecipients').addEventListener('change', (e) => {
    const idx = e.target.value;
    if (idx === '') {
      document.getElementById('recName').value = '';
      document.getElementById('recAddress').value = '';
      document.getElementById('recPhone').value = '';
      return;
    }
    const r = State.recipients[idx];
    document.getElementById('recName').value = r.name || '';
    document.getElementById('recAddress').value = r.address || '';
    document.getElementById('recPhone').value = r.phone || '';
  });

  document.getElementById('toStep2').addEventListener('click', () => {
    const name = document.getElementById('recName').value.trim();
    if (!name) { toast('Recipient name is required', 'error'); return; }
    State.draft.recipient = {
      name,
      address: document.getElementById('recAddress').value.trim(),
      phone: document.getElementById('recPhone').value.trim(),
    };
    goToStep(2);
  });

  document.getElementById('backToStep1').addEventListener('click', () => goToStep(1));
  document.getElementById('backToStep2').addEventListener('click', () => goToStep(2));

  document.getElementById('toStep3').addEventListener('click', () => {
    if (State.draft.items.length === 0) { toast('Add at least one item', 'error'); return; }
    goToStep(3);
  });

  document.getElementById('confirmInvoiceBtn').addEventListener('click', handleConfirmInvoice);

  document.getElementById('addCustomItemBtn').addEventListener('click', openCustomItemModal);

  // Menu
  document.getElementById('menuBtn').addEventListener('click', openDrawer);
  document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);
  document.querySelectorAll('.drawer-item').forEach(li => {
    li.addEventListener('click', () => goToScreen(li.dataset.screen));
  });

  // Products screen
  document.getElementById('addProductBtn').addEventListener('click', () => openProductModal(null));

  // Recipients screen
  document.getElementById('addRecipientBtn').addEventListener('click', () => openRecipientModal(null));

  // Business info screen
  document.getElementById('saveBizBtn').addEventListener('click', handleSaveBusinessInfo);

  // Settings screen
  document.getElementById('scriptUrl').value = Api.getScriptUrl();
  document.getElementById('createdByName').value = Api.getCreatedBy();
  document.getElementById('saveSettingsBtn').addEventListener('click', handleSaveSettings);
  document.getElementById('testConnBtn').addEventListener('click', handleTestConnection);

  // History search
  document.getElementById('historySearch').addEventListener('input', renderHistory);

  // Modal close
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });

  loadAllData();
});

// ───────────────────────── STEP 2: Product picker ─────────────────────────

function renderProductPicker() {
  const wrap = document.getElementById('productPicker');
  const active = State.products.filter(p => p.active);

  if (active.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-emoji">📦</div><div class="empty-title">No products yet</div><div class="empty-sub">Add products from the menu first.</div></div>';
  } else {
    wrap.innerHTML = active.map(p => {
      const draftItem = State.draft.items.find(i => i.code === p.code);
      const qty = draftItem ? draftItem.qty : 0;
      const lowStock = Number(p.stock) <= 5;
      return `
        <div class="product-pick-row ${qty > 0 ? 'selected' : ''}" data-code="${escapeHtml(p.code)}">
          <div class="product-thumb">${p.image ? `<img src="${escapeHtml(p.image)}" alt="">` : '🍄'}</div>
          <div class="product-pick-info">
            <div class="product-pick-name">${escapeHtml(p.name)}</div>
            <div class="product-pick-meta">${formatRupee(p.price)} · <span class="${lowStock ? 'stock-low' : ''}">${p.stock} in stock</span></div>
          </div>
          <div class="qty-stepper">
            <button class="qty-btn" data-action="dec" ${qty <= 0 ? 'disabled' : ''}>−</button>
            <span class="qty-val">${qty}</span>
            <button class="qty-btn" data-action="inc">+</button>
          </div>
        </div>`;
    }).join('');
  }

  renderLineItems();

  wrap.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.product-pick-row');
      const code = row.dataset.code;
      const product = State.products.find(p => p.code === code);
      const action = btn.dataset.action;
      adjustDraftItemQty(product, action === 'inc' ? 1 : -1);
      renderProductPicker();
    });
  });
}

function adjustDraftItemQty(product, delta) {
  let item = State.draft.items.find(i => i.code === product.code);
  if (!item) {
    if (delta < 0) return;
    item = { code: product.code, name: product.name, price: product.price, qty: 0 };
    State.draft.items.push(item);
  }
  const nextQty = item.qty + delta;
  if (delta > 0 && Number(product.stock) > 0 && nextQty > Number(product.stock)) {
    toast(`Only ${product.stock} in stock`, 'error');
    return;
  }
  item.qty = nextQty;
  if (item.qty <= 0) {
    State.draft.items = State.draft.items.filter(i => i.code !== product.code);
  }
}

function renderLineItems() {
  const card = document.getElementById('lineItemsCard');
  const wrap = document.getElementById('lineItems');

  if (State.draft.items.length === 0) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';

  wrap.innerHTML = State.draft.items.map((item, idx) => {
    const subtotal = item.qty * item.price;
    return `
      <div class="line-item-row">
        <div>
          <div class="line-item-name">${escapeHtml(item.name)}</div>
          <div class="line-item-sub">${item.qty} × ${formatRupee(item.price)}</div>
        </div>
        <div style="display:flex; align-items:center;">
          <span class="line-item-amt">${formatRupee(subtotal)}</span>
          <span class="line-item-remove" data-idx="${idx}">Remove</span>
        </div>
      </div>`;
  }).join('');

  const total = State.draft.items.reduce((s, i) => s + i.qty * i.price, 0);
  document.getElementById('runningTotal').textContent = formatRupee(total);

  wrap.querySelectorAll('.line-item-remove').forEach(el => {
    el.addEventListener('click', () => {
      State.draft.items.splice(Number(el.dataset.idx), 1);
      renderProductPicker();
    });
  });
}

function openCustomItemModal() {
  openModal('Add Custom Item', `
    <div class="field">
      <label>Item name <span class="req">*</span></label>
      <input type="text" id="customItemName" class="input" placeholder="e.g. Special bulk packaging">
    </div>
    <div class="field">
      <label>Quantity <span class="req">*</span></label>
      <input type="number" id="customItemQty" class="input" value="1" min="0.01" step="0.01">
    </div>
    <div class="field">
      <label>Unit price (₹) <span class="req">*</span></label>
      <input type="number" id="customItemPrice" class="input" placeholder="0.00" min="0" step="0.01">
    </div>
    <button class="btn btn-primary btn-block" id="saveCustomItemBtn">Add Item</button>
  `);

  document.getElementById('saveCustomItemBtn').addEventListener('click', () => {
    const name = document.getElementById('customItemName').value.trim();
    const qty = Number(document.getElementById('customItemQty').value);
    const price = Number(document.getElementById('customItemPrice').value);
    if (!name || !qty || price < 0 || isNaN(price)) {
      toast('Fill in all fields correctly', 'error'); return;
    }
    State.draft.items.push({ code: '', name, price, qty });
    closeModal();
    renderProductPicker();
  });
}

// ───────────────────────── STEP 3: Preview ─────────────────────────

function renderInvoicePreview() {
  const biz = State.businessInfo;
  const rec = State.draft.recipient;
  const total = State.draft.items.reduce((s, i) => s + i.qty * i.price, 0);

  const itemRows = State.draft.items.map(i => `
    <tr>
      <td>${escapeHtml(i.name)}</td>
      <td>${i.qty}</td>
      <td>${formatRupee(i.price)}</td>
    </tr>`).join('');

  document.getElementById('invoicePreview').innerHTML = `
    <div class="inv-prev-header">
      <div class="inv-prev-logo">🍄</div>
      <div class="inv-prev-brand">${escapeHtml(biz.businessName || 'Dr. Shroom Snacks')}</div>
      <div class="inv-prev-tag">${escapeHtml(biz.address || '')}</div>
    </div>

    <div class="inv-prev-number">Next number: INV/${getProjectedFinYear()}/DS••</div>

    <div class="inv-prev-section">
      <div class="inv-prev-label">Bill To</div>
      <div class="inv-prev-value">
        <strong>${escapeHtml(rec.name)}</strong><br>
        ${escapeHtml(rec.address || '')}${rec.address ? '<br>' : ''}
        ${rec.phone ? '+91 ' + escapeHtml(rec.phone) : ''}
      </div>
    </div>

    <table class="inv-prev-table">
      <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>

    <table class="inv-prev-table">
      <tr class="inv-prev-total-row"><td>Total</td><td></td><td>${formatRupee(total)}</td></tr>
    </table>
  `;
}

function getProjectedFinYear() {
  const d = new Date();
  const month = d.getMonth();
  const year = d.getFullYear();
  const startYear = month >= 3 ? year : year - 1;
  const fmt = y => String(y).slice(-2);
  return fmt(startYear) + '-' + fmt(startYear + 1);
}

async function handleConfirmInvoice() {
  const btn = document.getElementById('confirmInvoiceBtn');
  btn.disabled = true;
  showLoading('Creating invoice…');

  try {
    const payload = {
      recipient: State.draft.recipient,
      items: State.draft.items.map(i => ({ code: i.code, name: i.name, price: i.price, qty: i.qty })),
    };
    const result = await Api.createInvoice(payload);

    showLoading('Generating PDF…');

    const invoiceForPdf = {
      invoiceNo: result.invoiceNo,
      date: result.date,
      recipient: State.draft.recipient,
      items: State.draft.items,
      total: result.total,
      business: {
        name: State.businessInfo.businessName,
        address: State.businessInfo.address,
        fssai: State.businessInfo.fssai,
        phone: State.businessInfo.phone,
        email: State.businessInfo.email,
      },
    };
    await PdfGen.generateAndDownload(invoiceForPdf);

    toast('Invoice ' + result.invoiceNo + ' created!', 'success');

    // Refresh local state: stock changed, recipient may have been saved, invoice list grew
    await loadAllData();

    // Reset draft and go back to step 1
    State.draft = { recipient: { name: '', address: '', phone: '' }, items: [] };
    document.getElementById('recName').value = '';
    document.getElementById('recAddress').value = '';
    document.getElementById('recPhone').value = '';
    document.getElementById('savedRecipients').value = '';
    goToStep(1);

  } catch (err) {
    toast('Failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    hideLoading();
  }
}

// ───────────────────────── HISTORY ─────────────────────────

async function loadAndRenderHistory() {
  try {
    showLoading('Loading history…');
    const res = await Api.getInvoices();
    State.invoices = res.invoices || [];
  } catch (err) {
    toast('Could not load history: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
  renderHistory();
}

function renderHistory() {
  const wrap = document.getElementById('historyList');
  const query = (document.getElementById('historySearch').value || '').toLowerCase();

  const filtered = State.invoices.filter(inv =>
    !query || inv.invoiceNo.toLowerCase().includes(query) || (inv.recName || '').toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-emoji">📜</div><div class="empty-title">No invoices found</div><div class="empty-sub">Try a different search, or generate your first invoice.</div></div>';
    return;
  }

  wrap.innerHTML = filtered.map(inv => `
    <div class="history-row" data-num="${escapeHtml(inv.invoiceNo)}">
      <div>
        <div class="history-num">${escapeHtml(inv.invoiceNo)}</div>
        <div class="history-name">${escapeHtml(inv.recName)}</div>
      </div>
      <div style="text-align:right">
        <div class="history-amt">${formatRupee(inv.total)}</div>
        <div class="history-date">${escapeHtml(inv.date)}</div>
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('.history-row').forEach(row => {
    row.addEventListener('click', () => reprintInvoice(row.dataset.num));
  });
}

async function reprintInvoice(invoiceNo) {
  showLoading('Fetching invoice…');
  try {
    const res = await Api.getInvoice(invoiceNo);
    const inv = res.invoice;
    const invoiceForPdf = {
      invoiceNo: inv.invoiceNo,
      date: inv.date,
      recipient: inv.recipient,
      items: inv.items,
      total: inv.total,
      business: {
        name: State.businessInfo.businessName,
        address: State.businessInfo.address,
        fssai: State.businessInfo.fssai,
        phone: State.businessInfo.phone,
        email: State.businessInfo.email,
      },
    };
    await PdfGen.generateAndDownload(invoiceForPdf);
    toast('PDF re-generated for ' + invoiceNo, 'success');
  } catch (err) {
    toast('Could not fetch invoice: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ───────────────────────── PRODUCTS SCREEN ─────────────────────────

function renderProductsList() {
  const wrap = document.getElementById('productsList');
  if (State.products.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-emoji">📦</div><div class="empty-title">No products yet</div><div class="empty-sub">Tap "Add Product" to create your first one.</div></div>';
    return;
  }
  wrap.innerHTML = State.products.map(p => `
    <div class="list-row">
      <div class="product-thumb">${p.image ? `<img src="${escapeHtml(p.image)}" alt="">` : '🍄'}</div>
      <div class="list-row-info">
        <div class="list-row-title">${escapeHtml(p.name)} ${!p.active ? '<span style="color:var(--ink-faint);font-weight:400;">(hidden)</span>' : ''}</div>
        <div class="list-row-sub">${escapeHtml(p.code)} · ${formatRupee(p.price)} · ${p.stock} in stock</div>
      </div>
      <div class="list-row-actions">
        <button class="icon-btn" data-action="edit" data-code="${escapeHtml(p.code)}">✏️</button>
        <button class="icon-btn" data-action="delete" data-code="${escapeHtml(p.code)}">🗑️</button>
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openProductModal(State.products.find(p => p.code === btn.dataset.code)));
  });
  wrap.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteProduct(btn.dataset.code));
  });
}

function openProductModal(product) {
  const isEdit = !!product;
  openModal(isEdit ? 'Edit Product' : 'Add Product', `
    <div class="field">
      <label>Product code <span class="req">*</span></label>
      <input type="text" id="pCode" class="input" placeholder="e.g. PP" value="${product ? escapeHtml(product.code) : ''}" ${isEdit ? 'readonly style="opacity:0.6"' : ''}>
    </div>
    <div class="field">
      <label>Product name <span class="req">*</span></label>
      <input type="text" id="pName" class="input" placeholder="e.g. Peri Peri Flavour" value="${product ? escapeHtml(product.name) : ''}">
    </div>
    <div class="field">
      <label>Price (₹) <span class="req">*</span></label>
      <input type="number" id="pPrice" class="input" min="0" step="0.01" value="${product ? product.price : ''}">
    </div>
    <div class="field">
      <label>Stock quantity</label>
      <input type="number" id="pStock" class="input" min="0" step="1" value="${product ? product.stock : 0}">
    </div>
    <div class="field">
      <label>Product image</label>
      <input type="file" id="pImageFile" class="input" accept="image/*">
      <div id="pImagePreviewWrap" style="margin-top:10px;">
        ${product && product.image ? `<img id="pImagePreview" src="${escapeHtml(product.image)}" style="width:64px;height:64px;border-radius:8px;object-fit:cover;">` : ''}
      </div>
    </div>
    <div class="field" style="display:flex; align-items:center; gap:10px;">
      <input type="checkbox" id="pActive" ${!product || product.active ? 'checked' : ''} style="width:18px;height:18px;">
      <label style="margin:0;">Active (visible when generating invoices)</label>
    </div>
    <button class="btn btn-primary btn-block" id="saveProductBtn">Save Product</button>
  `);

  let imageDataUrl = product ? product.image || '' : '';
  document.getElementById('pImageFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    compressImageToThumbnail(file, 160, 0.7).then(dataUrl => {
      imageDataUrl = dataUrl;
      document.getElementById('pImagePreviewWrap').innerHTML =
        `<img id="pImagePreview" src="${imageDataUrl}" style="width:64px;height:64px;border-radius:8px;object-fit:cover;">`;
    }).catch(() => {
      toast('Could not process that image', 'error');
    });
  });

  document.getElementById('saveProductBtn').addEventListener('click', async () => {
    const code = document.getElementById('pCode').value.trim().toUpperCase();
    const name = document.getElementById('pName').value.trim();
    const price = Number(document.getElementById('pPrice').value);
    const stock = Number(document.getElementById('pStock').value) || 0;
    const active = document.getElementById('pActive').checked;

    if (!code || !name || isNaN(price) || price < 0) {
      toast('Fill in code, name, and a valid price', 'error'); return;
    }

    showLoading('Saving product…');
    try {
      await Api.saveProduct({ code, name, price, stock, active, image: imageDataUrl });
      closeModal();
      toast('Product saved', 'success');
      await loadAllData();
      renderProductsList();
    } catch (err) {
      toast('Failed: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  });
}

async function handleDeleteProduct(code) {
  if (!confirm('Delete this product? This cannot be undone.')) return;
  showLoading('Deleting…');
  try {
    await Api.deleteProduct(code);
    toast('Product deleted', 'success');
    await loadAllData();
    renderProductsList();
  } catch (err) {
    toast('Failed: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ───────────────────────── RECIPIENTS SCREEN ─────────────────────────

function renderRecipientsList() {
  const wrap = document.getElementById('recipientsList');
  if (State.recipients.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-emoji">🏬</div><div class="empty-title">No saved recipients</div><div class="empty-sub">Recipients are saved automatically when you generate an invoice, or add one manually.</div></div>';
    return;
  }
  wrap.innerHTML = State.recipients.map((r, idx) => `
    <div class="list-row">
      <div class="list-row-info">
        <div class="list-row-title">${escapeHtml(r.name)}</div>
        <div class="list-row-sub">${escapeHtml(r.phone || '')}${r.address ? ' · ' + escapeHtml(r.address) : ''}</div>
      </div>
      <div class="list-row-actions">
        <button class="icon-btn" data-action="edit" data-idx="${idx}">✏️</button>
        <button class="icon-btn" data-action="delete" data-idx="${idx}">🗑️</button>
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openRecipientModal(State.recipients[Number(btn.dataset.idx)]));
  });
  wrap.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteRecipient(State.recipients[Number(btn.dataset.idx)]));
  });
}

function openRecipientModal(recipient) {
  const isEdit = !!recipient;
  openModal(isEdit ? 'Edit Recipient' : 'Add Recipient', `
    <div class="field">
      <label>Name <span class="req">*</span></label>
      <input type="text" id="rName" class="input" value="${recipient ? escapeHtml(recipient.name) : ''}">
    </div>
    <div class="field">
      <label>Address</label>
      <textarea id="rAddress" class="input" rows="3">${recipient ? escapeHtml(recipient.address || '') : ''}</textarea>
    </div>
    <div class="field">
      <label>Phone</label>
      <input type="tel" id="rPhone" class="input" value="${recipient ? escapeHtml(recipient.phone || '') : ''}">
    </div>
    <button class="btn btn-primary btn-block" id="saveRecipientBtn">Save Recipient</button>
  `);

  document.getElementById('saveRecipientBtn').addEventListener('click', async () => {
    const name = document.getElementById('rName').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    const newRecipient = {
      name,
      address: document.getElementById('rAddress').value.trim(),
      phone: document.getElementById('rPhone').value.trim(),
    };
    showLoading('Saving recipient…');
    try {
      await Api.saveRecipient(newRecipient);
      closeModal();
      toast('Recipient saved', 'success');
      await loadAllData();
      renderRecipientsList();
    } catch (err) {
      toast('Failed: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  });
}

async function handleDeleteRecipient(recipient) {
  if (!confirm('Delete this recipient?')) return;
  showLoading('Deleting…');
  try {
    await Api.deleteRecipient(recipient.name, recipient.phone);
    toast('Recipient deleted', 'success');
    await loadAllData();
    renderRecipientsList();
  } catch (err) {
    toast('Failed: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ───────────────────────── BUSINESS INFO SCREEN ─────────────────────────

function fillBusinessForm() {
  const b = State.businessInfo;
  document.getElementById('bizName').value = b.businessName || '';
  document.getElementById('bizAddress').value = b.address || '';
  document.getElementById('bizFssai').value = b.fssai || '';
  document.getElementById('bizPhone').value = b.phone || '';
  document.getElementById('bizEmail').value = b.email || '';
}

async function handleSaveBusinessInfo() {
  const info = {
    businessName: document.getElementById('bizName').value.trim(),
    address: document.getElementById('bizAddress').value.trim(),
    fssai: document.getElementById('bizFssai').value.trim(),
    phone: document.getElementById('bizPhone').value.trim(),
    email: document.getElementById('bizEmail').value.trim(),
  };
  showLoading('Saving…');
  try {
    await Api.saveBusinessInfo(info);
    State.businessInfo = info;
    toast('Business info saved', 'success');
  } catch (err) {
    toast('Failed: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ───────────────────────── SETTINGS SCREEN ─────────────────────────

function handleSaveSettings() {
  const url = document.getElementById('scriptUrl').value.trim();
  const name = document.getElementById('createdByName').value.trim();
  if (!url) { toast('Script URL is required', 'error'); return; }
  Api.setScriptUrl(url);
  Api.setCreatedBy(name);
  toast('Settings saved', 'success');
  loadAllData();
}

async function handleTestConnection() {
  showLoading('Testing connection…');
  const ok = await Api.testConnection();
  hideLoading();
  setConnStatus(ok ? 'ok' : 'fail');
  toast(ok ? 'Connected successfully!' : 'Connection failed — check the URL', ok ? 'success' : 'error');
}

// ───────────────────────── MODAL ─────────────────────────

function openModal(title, bodyHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}
