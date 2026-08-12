/**
 * Order Management System - Fluent 2 UI Rendering & Card Grid Manager
 */

import { LoggerManager } from './logger.js';

/**
 * Escape HTML special characters so order data can never be interpreted as markup.
 * @param {*} value
 */
const VERIFY_BASE_OPTIONS_HTML = '<option value="">待審核</option><option value="已審核">已審核</option><option value="駁回">駁回</option>';

// Validated categorical palette (fixed order, never cycled — see dataviz skill).
// Light-mode steps; assigned by each category's authoritative index so identity
// stays stable even if a category temporarily has zero orders.
const CATEGORY_PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const CATEGORY_OTHER_COLOR = '#94a3b8';

function escapeHtml(value) {
  const str = value === null || value === undefined ? '' : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const UI = {
  escapeHtml,

  // Dynamic element getter to ensure DOM elements are always retrieved lazily at runtime
  get elements() {
    return {
      envBadge: document.getElementById('envBadge'),
      ordersCardsGrid: document.getElementById('ordersCardsGrid'),
      tableLoading: document.getElementById('tableLoading'),
      tableEmpty: document.getElementById('tableEmpty'),
      searchInput: document.getElementById('searchInput'),
      clearSearchBtn: document.getElementById('clearSearchBtn'),
      fabAddBtn: document.getElementById('fabAddBtn'),

      // Stats
      statTotalOrders: document.getElementById('statTotalOrders'),
      statTotalAmount: document.getElementById('statTotalAmount'),
      statApprovedCount: document.getElementById('statApprovedCount'),

      // Dashboard Tab
      dashStatTotalOrders: document.getElementById('dashStatTotalOrders'),
      dashStatTotalAmount: document.getElementById('dashStatTotalAmount'),
      dashStatCategoryCount: document.getElementById('dashStatCategoryCount'),
      dashboardEmpty: document.getElementById('dashboardEmpty'),
      dashboardContent: document.getElementById('dashboardContent'),
      dashboardCategoryGrid: document.getElementById('dashboardCategoryGrid'),
      dashboardBarChart: document.getElementById('dashboardBarChart'),

      // Order Form Modal (shared Add / Edit)
      orderFormModal: document.getElementById('orderFormModal'),
      orderForm: document.getElementById('orderForm'),
      orderFormTitle: document.getElementById('orderFormTitle'),
      overwriteNotice: document.getElementById('overwriteNotice'),
      overwriteConfirmCheckbox: document.getElementById('overwriteConfirmCheckbox'),
      editModeNotice: document.getElementById('editModeNotice'),
      saveOrderFormBtn: document.getElementById('saveOrderFormBtn'),

      ofOrderNo: document.getElementById('ofOrderNo'),
      ofOrderDate: document.getElementById('ofOrderDate'),
      ofOrderName: document.getElementById('ofOrderName'),
      ofPhone: document.getElementById('ofPhone'),
      ofEmail: document.getElementById('ofEmail'),
      ofProductType: document.getElementById('ofProductType'),
      ofProductName: document.getElementById('ofProductName'),
      ofPrice: document.getElementById('ofPrice'),
      ofVerify: document.getElementById('ofVerify'),

      // Delete Modal
      deleteModal: document.getElementById('deleteModal'),
      deleteOrderIdDisplay: document.getElementById('deleteOrderIdDisplay'),
      confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),

      // Log Container
      logTimeline: document.getElementById('logTimeline'),
      emptyLogState: document.getElementById('emptyLogState'),

      // Toast Container
      toastContainer: document.getElementById('toastContainer')
    };
  },

  // Active state
  state: {
    currentOrders: [],
    viewMode: 'date', // 'date' | 'category' | 'amount'
    productTypes: [], // authoritative category order from GET /Order/ProductType
    formMode: 'add', // 'add' | 'edit'
    selectedOrderForEdit: null,
    selectedOrderForDelete: null,
    lastDashboardStats: null,
    chartMetric: 'total', // 'total' | 'count'
    lastToastMsg: '',
    lastToastTime: 0
  },

  /**
   * Set the authoritative product-category order (used by the "類型分區" view
   * and the dashboard). Called once by app.js after the categories load.
   * @param {Array<string>} types
   */
  setProductTypes(types) {
    this.state.productTypes = Array.isArray(types) ? types : [];
  },

  /**
   * Render Environment Badge in Header
   */
  renderEnvBadge(envInfo) {
    const badge = this.elements.envBadge;
    if (!badge) return;

    badge.className = `env-badge ${envInfo.key === 'production' ? 'production' : 'test'}`;
    const icon = envInfo.key === 'production' ? '🚀' : '⚡';
    badge.innerHTML = `<span class="status-dot"></span> ${icon} ${escapeHtml(envInfo.name)}`;
    badge.title = `API Base URL: ${envInfo.baseUrl}`;
  },

  /**
   * Render Data Summary Cards
   */
  renderStats(orders) {
    if (!Array.isArray(orders)) return;

    const totalOrders = orders.length;
    let totalAmount = 0;
    let approvedCount = 0;

    orders.forEach(order => {
      // Parse amount
      const rawAmount = order['購買金額'] || order.amount || 0;
      const numAmount = parseFloat(String(rawAmount).replace(/[^0-9.-]+/g, '')) || 0;
      totalAmount += numAmount;

      // Check status
      const status = String(order['審核'] || order.status || '');
      if (status.includes('通') || status.includes('是') || status.includes('已') || status === 'OK') {
        approvedCount++;
      }
    });

    const els = this.elements;
    if (els.statTotalOrders) els.statTotalOrders.textContent = totalOrders.toLocaleString();
    if (els.statTotalAmount) els.statTotalAmount.textContent = `$${totalAmount.toLocaleString()}`;
    if (els.statApprovedCount) els.statApprovedCount.textContent = `${approvedCount} / ${totalOrders}`;
  },

  /**
   * Parse an order's amount field (may carry thousands-separator commas) into a number.
   */
  _parseAmount(order) {
    const raw = order['購買金額'] || order.amount || 0;
    return parseFloat(String(raw).replace(/[^0-9.-]+/g, '')) || 0;
  },

  /**
   * Parse an order's date field into a Date object (invalid/missing -> epoch 0,
   * so unparseable dates sort to the oldest position rather than throwing).
   */
  _parseOrderDate(order) {
    const raw = order['訂購日期'] || order.date || '';
    const d = new Date(String(raw).trim().replace(' ', 'T'));
    return isNaN(d.getTime()) ? 0 : d.getTime();
  },

  /**
   * Build a single order card's HTML (escaped). Pure — no state reads/writes.
   */
  _cardHtml(order) {
    const orderId = order['訂單編號'] || order.OrderID || order.orderId || '-';
    const orderDate = order['訂購日期'] || order.date || '-';
    const name = order['訂購人姓名'] || order.Name || order.name || '客戶';
    const phone = order['電話'] || order.Phone || order.phone || '-';
    const email = order['Email'] || order.email || '-';
    const prodName = order['商品名稱'] || order.product || '-';
    const category = order['商品分類'] || order.category || '一般商品';
    const reviewStatus = String(order['審核'] || order.review || '待審核');

    let badgeClass = 'badge-warning';
    let badgeIcon = '⏳';
    if (reviewStatus.includes('通') || reviewStatus.includes('已審核') || reviewStatus === 'OK') {
      badgeClass = 'badge-success';
      badgeIcon = '✅';
    } else if (reviewStatus.includes('駁回') || reviewStatus.includes('失敗')) {
      badgeClass = 'badge-danger';
      badgeIcon = '❌';
    }

    const initial = escapeHtml(String(name).charAt(0));
    const numAmount = this._parseAmount(order);

    return `
      <div class="order-card" data-order-id="${escapeHtml(orderId)}">
        <!-- Header: Order ID & Status Badge -->
        <div class="card-header-row">
          <span class="order-id-badge">#${escapeHtml(orderId)}</span>
          <span class="badge ${badgeClass}">${badgeIcon} ${escapeHtml(reviewStatus)}</span>
        </div>

        <!-- Customer Info -->
        <div class="card-customer-row">
          <div class="customer-avatar">${initial}</div>
          <div>
            <div class="customer-name">${escapeHtml(name)}</div>
            <div class="customer-contacts">
              <span class="contact-pill" title="電話">📞 ${escapeHtml(phone)}</span>
              <span class="contact-pill" title="Email">✉️ ${escapeHtml(email)}</span>
            </div>
          </div>
        </div>

        <!-- Product Box -->
        <div class="card-product-box">
          <span class="category-tag">🏷️ ${escapeHtml(category)}</span>
          <div class="product-name">${escapeHtml(prodName)}</div>
          <div class="price-row">
            <span class="price-label">購買金額</span>
            <span class="price-gradient">$${numAmount.toLocaleString()}</span>
          </div>
        </div>

        <!-- Footer: Date & Action Buttons -->
        <div class="card-footer-row">
          <div class="order-date-text">⏱️ ${escapeHtml(orderDate)}</div>
          <div class="table-actions">
            <button class="btn btn-secondary btn-icon btn-edit" data-id="${escapeHtml(orderId)}" title="編輯訂單">
              ✏️ 編輯
            </button>
            <button class="btn btn-danger btn-icon btn-delete" data-id="${escapeHtml(orderId)}" title="刪除訂單">
              🗑️ 刪除
            </button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Change how the order cards are sorted/grouped, and re-render from the
   * already-fetched order list — no network request.
   * @param {'date'|'category'|'amount'} mode
   */
  setViewMode(mode) {
    this.state.viewMode = mode;
    this._renderCardsGrid();
  },

  /**
   * Render Orders as Fluent 2 Cards Grid
   */
  renderOrdersTable(orders) {
    this.state.currentOrders = orders || [];
    this._renderCardsGrid();
  },

  /**
   * Render the orders cards grid from state.currentOrders, sorted/grouped
   * according to state.viewMode.
   */
  _renderCardsGrid() {
    const orders = this.state.currentOrders;
    const els = this.elements;
    const cardsGrid = els.ordersCardsGrid;
    const loading = els.tableLoading;
    const empty = els.tableEmpty;

    if (loading) loading.style.display = 'none';

    if (!orders || orders.length === 0) {
      if (cardsGrid) cardsGrid.innerHTML = '';
      if (empty) empty.style.display = 'block';
      this.renderStats([]);
      return;
    }

    if (empty) empty.style.display = 'none';

    if (cardsGrid) {
      if (this.state.viewMode === 'category') {
        const knownCategories = this.state.productTypes || [];
        const OTHER_LABEL = '其他';
        const buckets = new Map();
        knownCategories.forEach(cat => buckets.set(cat, []));
        buckets.set(OTHER_LABEL, []);

        orders.forEach(order => {
          const cat = String(order['商品分類'] || order.category || '').trim();
          if (cat && buckets.has(cat)) {
            buckets.get(cat).push(order);
          } else {
            buckets.get(OTHER_LABEL).push(order);
          }
        });

        let html = '';
        buckets.forEach((bucketOrders, category) => {
          if (bucketOrders.length === 0) return;
          const sorted = [...bucketOrders].sort((a, b) => this._parseOrderDate(b) - this._parseOrderDate(a));
          html += `
            <div class="category-group">
              <div class="category-group-header">
                <span>🏷️ ${escapeHtml(category)}</span>
                <span class="category-group-count">${sorted.length} 筆</span>
              </div>
              <div class="orders-cards-grid">
                ${sorted.map(o => this._cardHtml(o)).join('')}
              </div>
            </div>
          `;
        });
        cardsGrid.innerHTML = html;
      } else {
        const sorted = [...orders].sort((a, b) => {
          return this.state.viewMode === 'amount'
            ? this._parseAmount(b) - this._parseAmount(a)
            : this._parseOrderDate(b) - this._parseOrderDate(a);
        });
        cardsGrid.innerHTML = sorted.map(o => this._cardHtml(o)).join('');
      }
    }

    this.renderStats(orders);
  },

  /**
   * Resolve a category's fixed identity color. Index is taken from the
   * authoritative product-type order (not display order) so a category's
   * color never shifts just because another category temporarily has 0 orders.
   */
  _colorForCategory(category) {
    const idx = this.state.productTypes.indexOf(category);
    if (category === '其他' || idx === -1) return CATEGORY_OTHER_COLOR;
    return CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length] || CATEGORY_OTHER_COLOR;
  },

  /**
   * Render the per-category dashboard tab: KPI tiles, category cards, bar chart.
   * @param {{overall: Object, byCategory: Array}} stats
   */
  renderDashboard(stats) {
    this.state.lastDashboardStats = stats;
    const els = this.elements;
    const overall = stats?.overall || { totalOrders: 0, totalAmount: 0, categoryCount: 0 };
    const byCategory = stats?.byCategory || [];

    if (els.dashStatTotalOrders) els.dashStatTotalOrders.textContent = overall.totalOrders.toLocaleString();
    if (els.dashStatTotalAmount) els.dashStatTotalAmount.textContent = `$${Math.round(overall.totalAmount).toLocaleString()}`;
    if (els.dashStatCategoryCount) els.dashStatCategoryCount.textContent = overall.categoryCount.toLocaleString();

    if (byCategory.length === 0) {
      if (els.dashboardEmpty) els.dashboardEmpty.style.display = 'block';
      if (els.dashboardContent) els.dashboardContent.style.display = 'none';
      return;
    }
    if (els.dashboardEmpty) els.dashboardEmpty.style.display = 'none';
    if (els.dashboardContent) els.dashboardContent.style.display = 'block';

    this._renderCategoryDashCards(byCategory);
    this._renderDashboardChart(byCategory);
  },

  _renderCategoryDashCards(byCategory) {
    const grid = this.elements.dashboardCategoryGrid;
    if (!grid) return;

    grid.innerHTML = byCategory.map(c => {
      const color = this._colorForCategory(c.category);
      const ratePct = Math.round(c.approvedRate * 100);
      return `
        <div class="category-dash-card">
          <div class="dash-card-header">
            <span class="dash-color-dot" style="background:${color}"></span>
            <span class="dash-card-title">${escapeHtml(c.category)}</span>
          </div>
          <div class="dash-card-metrics">
            <div class="dash-metric">
              <span class="dash-metric-label">訂單數</span>
              <span class="dash-metric-value">${c.count.toLocaleString()}</span>
            </div>
            <div class="dash-metric">
              <span class="dash-metric-label">總金額</span>
              <span class="dash-metric-value">$${Math.round(c.total).toLocaleString()}</span>
            </div>
            <div class="dash-metric">
              <span class="dash-metric-label">平均金額</span>
              <span class="dash-metric-value">$${Math.round(c.avg).toLocaleString()}</span>
            </div>
          </div>
          <div class="dash-approval-row">
            <span class="dash-metric-label">已審核比例</span>
            <span class="dash-metric-value">${c.approvedCount} / ${c.count}（${ratePct}%）</span>
          </div>
          <div class="dash-progress-bar">
            <div class="dash-progress-fill" style="width:${ratePct}%; background:${color}"></div>
          </div>
        </div>
      `;
    }).join('');
  },

  _renderDashboardChart(byCategory) {
    const container = this.elements.dashboardBarChart;
    if (!container) return;

    const metric = this.state.chartMetric; // 'total' | 'count'
    const getValue = c => (metric === 'count' ? c.count : c.total);
    const maxValue = Math.max(...byCategory.map(getValue), 1);

    container.innerHTML = byCategory.map(c => {
      const color = this._colorForCategory(c.category);
      const value = getValue(c);
      const pct = Math.max((value / maxValue) * 100, 2); // keep a visible sliver for very small values
      const valueText = metric === 'count'
        ? `${value.toLocaleString()} 筆`
        : `$${Math.round(value).toLocaleString()}`;
      return `
        <div class="bar-chart-row">
          <span class="bar-chart-label">
            <span class="dash-color-dot" style="background:${color}"></span>${escapeHtml(c.category)}
          </span>
          <div class="bar-chart-track">
            <div class="bar-chart-fill" style="width:${pct}%; background:${color}"></div>
          </div>
          <span class="bar-chart-value">${valueText}</span>
        </div>
      `;
    }).join('');
  },

  /**
   * Switch the bar chart's compared metric (訂單數 / 總金額) and redraw the
   * bars from the last-computed stats — no recomputation, no network.
   * @param {'total'|'count'} metric
   */
  setChartMetric(metric) {
    this.state.chartMetric = metric;
    const stats = this.state.lastDashboardStats;
    if (stats && stats.byCategory && stats.byCategory.length) {
      this._renderDashboardChart(stats.byCategory);
    }
  },

  /**
   * Set loading state for cards container
   */
  showTableLoading() {
    const els = this.elements;
    if (els.tableLoading) els.tableLoading.style.display = 'block';
    if (els.tableEmpty) els.tableEmpty.style.display = 'none';
    if (els.ordersCardsGrid) els.ordersCardsGrid.innerHTML = '';
  },

  /**
   * Populate the Product Type <select> from cached options.
   * @param {Array<string>} types
   * @param {string} selectedValue
   */
  populateProductTypeSelect(types, selectedValue = '') {
    const select = this.elements.ofProductType;
    if (!select) return;

    const options = ['<option value="">請選擇分類</option>']
      .concat((types || []).map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`));
    select.innerHTML = options.join('');

    if (selectedValue) {
      const exists = (types || []).includes(selectedValue);
      if (!exists) {
        // Preserve an existing order's category even if it's no longer in the master list
        select.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(selectedValue)}">${escapeHtml(selectedValue)}</option>`);
      }
      select.value = selectedValue;
    }
  },

  /**
   * Clear all field error messages / invalid styling in the order form.
   */
  clearFormErrors() {
    document.querySelectorAll('#orderForm .field-error').forEach(el => { el.textContent = ''; });
    document.querySelectorAll('#orderForm .form-control').forEach(el => el.classList.remove('input-invalid'));
  },

  /**
   * Show a single field's validation error message.
   * @param {string} fieldId - element id of the input (e.g. 'ofOrderNo')
   * @param {string} message
   */
  setFieldError(fieldId, message) {
    const errEl = document.getElementById('err-' + fieldId);
    const inputEl = document.getElementById(fieldId);
    if (errEl) errEl.textContent = message || '';
    if (inputEl) {
      if (message) inputEl.classList.add('input-invalid');
      else inputEl.classList.remove('input-invalid');
    }
  },

  /**
   * Convert a Date-ish value into the `datetime-local` input format (YYYY-MM-DDTHH:mm).
   */
  toDateTimeLocalValue(rawDate) {
    if (!rawDate) return '';
    const normalized = String(rawDate).trim().replace(' ', 'T');
    // Already in YYYY-MM-DDTHH:mm(:ss)? form
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(normalized)) {
      return normalized.slice(0, 16);
    }
    const d = new Date(String(rawDate).trim());
    if (isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  /**
   * Open the shared Order Form Modal in 'add' or 'edit' mode.
   * @param {'add'|'edit'} mode
   * @param {Object|null} order - existing order data when editing
   */
  openOrderFormModal(mode, order = null) {
    const els = this.elements;
    this.state.formMode = mode;
    this.state.selectedOrderForEdit = mode === 'edit' ? order : null;
    this.clearFormErrors();

    if (els.overwriteConfirmCheckbox) els.overwriteConfirmCheckbox.checked = false;
    if (els.overwriteNotice) els.overwriteNotice.style.display = 'none';

    if (mode === 'edit' && order) {
      if (els.orderFormTitle) els.orderFormTitle.textContent = '✏️ 編輯訂單';
      if (els.editModeNotice) els.editModeNotice.style.display = 'block';
      if (els.ofOrderNo) {
        els.ofOrderNo.value = order['訂單編號'] || order.OrderID || order.orderId || '';
        els.ofOrderNo.readOnly = true;
      }
      if (els.ofOrderDate) els.ofOrderDate.value = this.toDateTimeLocalValue(order['訂購日期'] || order.date);
      if (els.ofOrderName) els.ofOrderName.value = order['訂購人姓名'] || order.Name || order.name || '';
      if (els.ofPhone) els.ofPhone.value = order['電話'] || order.Phone || order.phone || '';
      if (els.ofEmail) els.ofEmail.value = order['Email'] || order.email || '';
      if (els.ofProductName) els.ofProductName.value = order['商品名稱'] || order.product || '';
      if (els.ofPrice) {
        const rawAmount = order['購買金額'] || order.amount || '';
        els.ofPrice.value = String(rawAmount).replace(/[^0-9.-]+/g, '');
      }
      if (els.ofVerify) {
        const verifyValue = order['審核'] || order.review || '';
        els.ofVerify.innerHTML = VERIFY_BASE_OPTIONS_HTML;
        const hasOption = Array.from(els.ofVerify.options).some(o => o.value === verifyValue);
        if (verifyValue && !hasOption) {
          els.ofVerify.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(verifyValue)}">${escapeHtml(verifyValue)}</option>`);
        }
        els.ofVerify.value = verifyValue;
      }
    } else {
      if (els.orderFormTitle) els.orderFormTitle.textContent = '🆕 新增訂單';
      if (els.editModeNotice) els.editModeNotice.style.display = 'none';
      if (els.orderForm) els.orderForm.reset();
      if (els.ofOrderNo) els.ofOrderNo.readOnly = false;
      if (els.ofOrderDate) {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        els.ofOrderDate.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
      }
      if (els.ofVerify) {
        els.ofVerify.innerHTML = VERIFY_BASE_OPTIONS_HTML;
        els.ofVerify.value = '';
      }
    }

    // Re-select product type after populateProductTypeSelect has been called by app.js
    if (els.orderFormModal) els.orderFormModal.classList.add('active');
  },

  closeOrderFormModal() {
    const els = this.elements;
    if (els.orderFormModal) els.orderFormModal.classList.remove('active');
    this.state.selectedOrderForEdit = null;
    this.clearFormErrors();
  },

  /**
   * Open Delete Confirmation Modal
   */
  openDeleteModal(orderId) {
    const order = this.state.currentOrders.find(o =>
      (o['訂單編號'] || o.OrderID || o.orderId) === orderId
    );

    if (!order) {
      this.showToast('找不到選取的訂單資料', 'error');
      return;
    }

    this.state.selectedOrderForDelete = order;
    const els = this.elements;
    if (els.deleteOrderIdDisplay) els.deleteOrderIdDisplay.textContent = orderId;
    if (els.deleteModal) els.deleteModal.classList.add('active');
  },

  closeDeleteModal() {
    const els = this.elements;
    if (els.deleteModal) els.deleteModal.classList.remove('active');
    this.state.selectedOrderForDelete = null;
  },

  /**
   * Render Activity Logs Tab
   */
  renderLogs() {
    const logs = LoggerManager.getLogs();
    const els = this.elements;
    const container = els.logTimeline;
    const emptyState = els.emptyLogState;

    if (!logs || logs.length === 0) {
      if (container) container.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    if (container) {
      container.innerHTML = logs.map(log => {
        const typeMeta = {
          INSERT: { cls: 'log-type-update', icon: '🆕 新增' },
          UPDATE: { cls: 'log-type-update', icon: '📝 變更' },
          DELETE: { cls: 'log-type-delete', icon: '🗑️ 刪除' }
        }[log.type] || { cls: 'log-type-update', icon: log.type };

        let detailsHtml = '';
        if (log.type === 'UPDATE') {
          const rows = (log.diffs || []).map(d => `
            <div class="diff-box">
              <div style="grid-column: 1 / -1; font-size:0.8rem; font-weight:700; margin-bottom:-4px;">${escapeHtml(d.label)}</div>
              <div class="diff-col diff-old">
                <div style="font-size:0.75rem; color:var(--color-danger);">原始數值 (Old)</div>
                <div>${escapeHtml(d.oldValue)}</div>
              </div>
              <div class="diff-col diff-new">
                <div style="font-size:0.75rem; color:var(--color-success);">新設定值 (New)</div>
                <div>${escapeHtml(d.newValue)}</div>
              </div>
            </div>
          `).join('');
          detailsHtml = `<div class="log-details">${rows || '(無欄位變動)'}</div>`;
        } else if (log.type === 'INSERT') {
          const snapshotStr = escapeHtml(JSON.stringify(log.snapshot, null, 2));
          detailsHtml = `
            <div class="log-details">
              <div style="margin-bottom:6px;"><strong>新增資料內容 (Payload):</strong></div>
              <pre class="snapshot-json">${snapshotStr}</pre>
            </div>
          `;
        } else {
          const snapshotStr = escapeHtml(JSON.stringify(log.snapshot, null, 2));
          detailsHtml = `
            <div class="log-details">
              <div style="margin-bottom:6px;"><strong>備份快照資料 (Snapshot):</strong></div>
              <pre class="snapshot-json">${snapshotStr}</pre>
            </div>
          `;
        }

        return `
          <div class="log-item">
            <div class="log-item-header">
              <div style="display:flex; align-items:center; gap:10px;">
                <span class="log-type-tag ${typeMeta.cls}">${typeMeta.icon}</span>
                <span class="order-id">#${escapeHtml(log.orderId)}</span>
              </div>
              <span class="log-timestamp">⏱️ ${escapeHtml(log.timestamp)}</span>
            </div>
            <div>${escapeHtml(log.details)}</div>
            ${detailsHtml}
          </div>
        `;
      }).join('');
    }
  },

  /**
   * Display Toast Notification (With Deduplication Defense)
   */
  showToast(message, type = 'info') {
    const now = Date.now();
    if (this.state.lastToastMsg === message && (now - this.state.lastToastTime) < 1500) {
      return;
    }

    this.state.lastToastMsg = message;
    this.state.lastToastTime = now;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    const iconSpan = document.createElement('span');
    iconSpan.textContent = icon;
    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    toast.appendChild(iconSpan);
    toast.appendChild(msgSpan);

    const container = this.elements.toastContainer || document.body;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
};
