/**
 * Order Management System - Fluent 2 UI Rendering & Card Grid Manager
 */

import { LoggerManager } from './logger.js';

export const UI = {
  // Dynamic element getter to ensure DOM elements are always retrieved lazily at runtime
  get elements() {
    return {
      envBadge: document.getElementById('envBadge'),
      ordersCardsGrid: document.getElementById('ordersCardsGrid'),
      tableLoading: document.getElementById('tableLoading'),
      tableEmpty: document.getElementById('tableEmpty'),
      searchInput: document.getElementById('searchInput'),
      clearSearchBtn: document.getElementById('clearSearchBtn'),
      
      // Stats
      statTotalOrders: document.getElementById('statTotalOrders'),
      statTotalAmount: document.getElementById('statTotalAmount'),
      statApprovedCount: document.getElementById('statApprovedCount'),

      // Edit Modal
      editModal: document.getElementById('editModal'),
      editForm: document.getElementById('editForm'),
      editOrderId: document.getElementById('editOrderId'),
      editName: document.getElementById('editName'),
      editPhone: document.getElementById('editPhone'),
      editEmail: document.getElementById('editEmail'),

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
    selectedOrderForEdit: null,
    selectedOrderForDelete: null,
    lastToastMsg: '',
    lastToastTime: 0
  },

  /**
   * Render Environment Badge in Header
   */
  renderEnvBadge(envInfo) {
    const badge = this.elements.envBadge;
    if (!badge) return;

    badge.className = `env-badge ${envInfo.key === 'production' ? 'production' : 'test'}`;
    const icon = envInfo.key === 'production' ? '🚀' : '⚡';
    badge.innerHTML = `<span class="status-dot"></span> ${icon} ${envInfo.name}`;
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
      const status = order['審核'] || order.status || '';
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
   * Render Orders as Fluent 2 Cards Grid
   */
  renderOrdersTable(orders) {
    this.state.currentOrders = orders || [];
    const els = this.elements;
    const cardsGrid = els.ordersCardsGrid;
    const loading = els.tableLoading;
    const empty = els.tableEmpty;

    if (loading) loading.style.display = 'none';

    if (!orders || orders.length === 0) {
      if (cardsGrid) cardsGrid.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }

    if (empty) empty.style.display = 'none';
    
    if (cardsGrid) {
      cardsGrid.innerHTML = orders.map(order => {
        const orderId = order['訂單編號'] || order.OrderID || order.orderId || '-';
        const orderDate = order['訂購日期'] || order.date || '-';
        const name = order['訂購人姓名'] || order.Name || order.name || '客戶';
        const phone = order['電話'] || order.Phone || order.phone || '-';
        const email = order['Email'] || order.email || '-';
        const prodName = order['商品名稱'] || order.product || '-';
        const category = order['商品分類'] || order.category || '一般商品';
        const amount = order['購買金額'] || order.amount || 0;
        const reviewStatus = order['審核'] || order.review || '待審核';

        let badgeClass = 'badge-warning';
        let badgeIcon = '⏳';
        if (reviewStatus.includes('通') || reviewStatus.includes('已審核') || reviewStatus === 'OK') {
          badgeClass = 'badge-success';
          badgeIcon = '✅';
        } else if (reviewStatus.includes('駁回') || reviewStatus.includes('失敗')) {
          badgeClass = 'badge-danger';
          badgeIcon = '❌';
        }

        const initial = name.charAt(0);

        return `
          <div class="order-card" data-order-id="${orderId}">
            <!-- Header: Order ID & Status Badge -->
            <div class="card-header-row">
              <span class="order-id-badge">#${orderId}</span>
              <span class="badge ${badgeClass}">${badgeIcon} ${reviewStatus}</span>
            </div>

            <!-- Customer Info -->
            <div class="card-customer-row">
              <div class="customer-avatar">${initial}</div>
              <div>
                <div class="customer-name">${name}</div>
                <div class="customer-contacts">
                  <span class="contact-pill" title="電話">📞 ${phone}</span>
                  <span class="contact-pill" title="Email">✉️ ${email}</span>
                </div>
              </div>
            </div>

            <!-- Product Box -->
            <div class="card-product-box">
              <span class="category-tag">🏷️ ${category}</span>
              <div class="product-name">${prodName}</div>
              <div class="price-row">
                <span class="price-label">購買金額</span>
                <span class="price-gradient">$${Number(amount).toLocaleString()}</span>
              </div>
            </div>

            <!-- Footer: Date & Action Buttons -->
            <div class="card-footer-row">
              <div class="order-date-text">⏱️ ${orderDate}</div>
              <div class="table-actions">
                <button class="btn btn-secondary btn-icon btn-edit" data-id="${orderId}" title="編輯訂單">
                  ✏️ 編輯
                </button>
                <button class="btn btn-danger btn-icon btn-delete" data-id="${orderId}" title="刪除訂單">
                  🗑️ 刪除
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    this.renderStats(orders);
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
   * Open Edit Order Modal
   */
  openEditModal(orderId) {
    const order = this.state.currentOrders.find(o => 
      (o['訂單編號'] || o.OrderID || o.orderId) === orderId
    );

    if (!order) {
      this.showToast('找不到選取的訂單資料', 'error');
      return;
    }

    this.state.selectedOrderForEdit = order;
    const els = this.elements;
    if (els.editOrderId) els.editOrderId.value = orderId;
    if (els.editName) els.editName.value = order['訂購人姓名'] || order.Name || order.name || '';
    if (els.editPhone) els.editPhone.value = order['電話'] || order.Phone || order.phone || '';
    if (els.editEmail) els.editEmail.value = order['Email'] || order.email || '';

    if (els.editModal) els.editModal.classList.add('active');
  },

  closeEditModal() {
    const els = this.elements;
    if (els.editModal) els.editModal.classList.remove('active');
    this.state.selectedOrderForEdit = null;
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
        const isUpdate = log.type === 'UPDATE';
        const typeClass = isUpdate ? 'log-type-update' : 'log-type-delete';
        const icon = isUpdate ? '📝 變更' : '🗑️ 刪除';

        let detailsHtml = '';
        if (isUpdate) {
          detailsHtml = `
            <div class="log-details">
              <div><strong>異動欄位：</strong> ${log.fieldLabel} (${log.fieldKey})</div>
              <div class="diff-box">
                <div class="diff-col diff-old">
                  <div style="font-size:0.75rem; color:var(--color-danger);">原始數值 (Old)</div>
                  <div>${log.oldValue}</div>
                </div>
                <div class="diff-col diff-new">
                  <div style="font-size:0.75rem; color:var(--color-success);">新設定值 (New)</div>
                  <div>${log.newValue}</div>
                </div>
              </div>
            </div>
          `;
        } else {
          const snapshotStr = JSON.stringify(log.snapshot, null, 2);
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
                <span class="log-type-tag ${typeClass}">${icon}</span>
                <span class="order-id">#${log.orderId}</span>
              </div>
              <span class="log-timestamp">⏱️ ${log.timestamp}</span>
            </div>
            <div>${log.details}</div>
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

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    
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
