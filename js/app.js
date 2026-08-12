/**
 * Order Management System - Main Application Orchestrator
 */

import { ConfigManager } from './config.js';
import { ApiService } from './api.js';
import { LoggerManager } from './logger.js';
import { UI } from './ui.js';

const ORDER_FIELD_MAP = [
  { key: '訂購人姓名', label: '訂購人姓名', payloadKey: 'OrderName' },
  { key: '電話', label: '電話', payloadKey: 'Phone' },
  { key: 'Email', label: 'Email', payloadKey: 'Email' },
  { key: '訂購日期', label: '訂購日期', payloadKey: 'OrderDate' },
  { key: '商品分類', label: '商品分類', payloadKey: 'ProductType' },
  { key: '商品名稱', label: '商品名稱', payloadKey: 'ProductName' },
  { key: '購買金額', label: '購買金額', payloadKey: 'Price' },
  { key: '審核', label: '審核狀態', payloadKey: 'verify' }
];

class App {
  constructor() {
    this.searchDebounceTimer = null;
    this.lastSearchQuery = null;
    this.lastFetchTime = 0;
    this.productTypesCache = null; // fetched once per page load, reused for every modal open
    this.productTypesPromise = null; // in-flight guard so concurrent callers single-flight the request
    this.isSubmittingOrderForm = false;
  }

  async init() {
    console.log('[App] Initializing Order Management System...');

    // 1. Load config.json
    await ConfigManager.loadConfig();
    const envInfo = ConfigManager.getEnvInfo();
    UI.renderEnvBadge(envInfo);

    // 2. Setup Event Listeners
    this.bindEvents();

    // 3. Initial Data Fetch (orders + product categories in parallel)
    await Promise.all([this.fetchOrders('', false), this.ensureProductTypesLoaded()]);
    UI.setProductTypes(this.productTypesCache || []);
    this.refreshDashboardStats();

    // 4. Initial Log Render
    UI.renderLogs();
  }

  bindEvents() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetTab = e.currentTarget.dataset.tab;

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        e.currentTarget.classList.add('active');
        document.getElementById(targetTab)?.classList.add('active');

        if (targetTab === 'logsTab') {
          UI.renderLogs();
        }
      });
    });

    // Refresh Orders button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        const query = UI.elements.searchInput?.value || '';
        this.fetchOrders(query, true);
      });
    }

    // Search input (Full-text search)
    const searchInput = UI.elements.searchInput;
    const clearSearchBtn = UI.elements.clearSearchBtn;

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        if (query.trim() !== '') {
          if (clearSearchBtn) clearSearchBtn.style.display = 'block';
        } else {
          if (clearSearchBtn) clearSearchBtn.style.display = 'none';
        }

        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = setTimeout(() => {
          this.fetchOrders(query, true);
        }, 350);
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          clearTimeout(this.searchDebounceTimer);
          this.fetchOrders(searchInput.value, true);
        }
      });
    }

    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        clearSearchBtn.style.display = 'none';
        this.fetchOrders('', true);
      });
    }

    // Card Action Buttons (Edit / Delete buttons using Event Delegation)
    const cardsGrid = UI.elements.ordersCardsGrid;
    if (cardsGrid) {
      cardsGrid.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.btn-edit');
        const deleteBtn = e.target.closest('.btn-delete');

        if (editBtn) {
          const orderId = editBtn.dataset.id;
          this.openEditOrderModal(orderId);
        } else if (deleteBtn) {
          const orderId = deleteBtn.dataset.id;
          UI.openDeleteModal(orderId);
        }
      });
    }

    // View-mode segmented control (date / category / amount) — pure client-side re-render
    document.querySelectorAll('.view-mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.currentTarget.dataset.viewMode;
        document.querySelectorAll('.view-mode-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        UI.setViewMode(mode);
      });
    });

    // Dashboard chart metric toggle (訂單數 / 總金額) — redraw only, no recompute
    document.querySelectorAll('.chart-metric-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const metric = e.currentTarget.dataset.metric;
        document.querySelectorAll('.chart-metric-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        UI.setChartMetric(metric);
      });
    });

    // Floating Add Button
    UI.elements.fabAddBtn?.addEventListener('click', () => this.openAddOrderModal());

    // Order Form Modal (shared Add / Edit)
    UI.elements.orderForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleOrderFormSubmit();
    });

    document.getElementById('cancelOrderFormBtn')?.addEventListener('click', () => UI.closeOrderFormModal());
    document.getElementById('closeOrderFormBtn')?.addEventListener('click', () => UI.closeOrderFormModal());

    // Live-check whether the typed OrderNo already exists (Add mode only)
    UI.elements.ofOrderNo?.addEventListener('input', (e) => {
      if (UI.state.formMode !== 'add') return;
      this.refreshOverwriteNotice(e.target.value.trim());
    });

    // Delete Modal Actions
    const confirmDeleteBtn = UI.elements.confirmDeleteBtn;
    if (confirmDeleteBtn) {
      confirmDeleteBtn.addEventListener('click', async () => {
        await this.handleDeleteConfirm();
      });
    }
    document.getElementById('cancelDeleteBtn')?.addEventListener('click', () => UI.closeDeleteModal());
    document.getElementById('closeDeleteModalBtn')?.addEventListener('click', () => UI.closeDeleteModal());

    // Clear logs button
    document.getElementById('clearLogsBtn')?.addEventListener('click', () => {
      if (confirm('確定要清空所有操作 Log 紀錄嗎？')) {
        LoggerManager.clearLogs();
        UI.renderLogs();
        UI.showToast('已清空 Log 紀錄', 'info');
      }
    });
  }

  /**
   * Fetch Orders from Webhook API
   * @param {string} searchQuery
   * @param {boolean} showResultToast
   */
  async fetchOrders(searchQuery = '', showResultToast = false) {
    const trimmedQuery = searchQuery.trim();
    const now = Date.now();

    // Prevent duplicate fetch requests for identical query within 800ms
    if (this.lastSearchQuery === trimmedQuery && (now - this.lastFetchTime) < 800) {
      return;
    }

    this.lastSearchQuery = trimmedQuery;
    this.lastFetchTime = now;

    UI.showTableLoading();
    try {
      const orders = await ApiService.getAllOrders(trimmedQuery);
      UI.renderOrdersTable(orders);
      this.refreshDashboardStats();

      if (showResultToast && trimmedQuery !== '') {
        UI.showToast(`已查出 ${orders.length} 筆關鍵字 「${trimmedQuery}」 的訂單`, 'info');
      }
    } catch (error) {
      UI.renderOrdersTable([]);
      this.refreshDashboardStats();
      UI.showToast(`讀取訂單列表失敗: ${error.message}`, 'error');
    }
  }

  /**
   * Fetch product categories once per page load and cache them in memory.
   * Caches the in-flight promise (not just the resolved value) so concurrent
   * callers during the initial load (e.g. the FAB clicked before init() settles)
   * never trigger a second concurrent request.
   * @returns {Promise<Array<string>>}
   */
  async ensureProductTypesLoaded() {
    if (this.productTypesCache) return this.productTypesCache;
    if (!this.productTypesPromise) {
      this.productTypesPromise = ApiService.getProductTypes()
        .catch(error => {
          UI.showToast(`讀取商品分類失敗: ${error.message}`, 'error');
          return [];
        })
        .then(types => {
          this.productTypesCache = types;
          return types;
        });
    }
    return this.productTypesPromise;
  }

  /**
   * Recompute the per-category dashboard stats from the currently loaded
   * order list and cached product types, then re-render the dashboard tab.
   */
  refreshDashboardStats() {
    const stats = this.computeCategoryStats(UI.state.currentOrders, this.productTypesCache || []);
    UI.renderDashboard(stats);
  }

  /**
   * Pure aggregation: bucket orders by product category (in the API's
   * category order, with a trailing "其他" bucket for unmatched/blank
   * categories), and compute count / total / average / approval rate per bucket.
   * @param {Array<Object>} orders
   * @param {Array<string>} categories
   */
  computeCategoryStats(orders, categories) {
    const list = Array.isArray(orders) ? orders : [];
    const knownCategories = Array.isArray(categories) ? categories : [];
    const OTHER_LABEL = '其他';

    const buckets = new Map();
    knownCategories.forEach(cat => buckets.set(cat, []));
    buckets.set(OTHER_LABEL, []);

    list.forEach(order => {
      const cat = String(order['商品分類'] || order.category || '').trim();
      if (cat && buckets.has(cat)) {
        buckets.get(cat).push(order);
      } else {
        buckets.get(OTHER_LABEL).push(order);
      }
    });

    let totalOrders = 0;
    let totalAmount = 0;

    const byCategory = [];
    buckets.forEach((bucketOrders, category) => {
      if (bucketOrders.length === 0) return;

      let sum = 0;
      let approvedCount = 0;
      bucketOrders.forEach(order => {
        const rawAmount = order['購買金額'] || order.amount || 0;
        sum += parseFloat(String(rawAmount).replace(/[^0-9.-]+/g, '')) || 0;

        const status = String(order['審核'] || order.review || '');
        if (status.includes('通') || status.includes('是') || status.includes('已') || status === 'OK') {
          approvedCount++;
        }
      });

      totalOrders += bucketOrders.length;
      totalAmount += sum;

      byCategory.push({
        category,
        count: bucketOrders.length,
        total: sum,
        avg: sum / bucketOrders.length,
        approvedCount,
        approvedRate: bucketOrders.length ? approvedCount / bucketOrders.length : 0
      });
    });

    return {
      overall: {
        totalOrders,
        totalAmount,
        categoryCount: byCategory.length
      },
      byCategory
    };
  }

  /**
   * Open the Order Form Modal in 'add' mode.
   */
  async openAddOrderModal() {
    const types = await this.ensureProductTypesLoaded();
    UI.openOrderFormModal('add', null);
    UI.populateProductTypeSelect(types, '');
    UI.elements.overwriteNotice.style.display = 'none';
  }

  /**
   * Open the Order Form Modal in 'edit' mode, pre-filled with the selected order.
   * @param {string} orderId
   */
  async openEditOrderModal(orderId) {
    const order = UI.state.currentOrders.find(o =>
      (o['訂單編號'] || o.OrderID || o.orderId) === orderId
    );

    if (!order) {
      UI.showToast('找不到選取的訂單資料', 'error');
      return;
    }

    const types = await this.ensureProductTypesLoaded();
    UI.openOrderFormModal('edit', order);
    UI.populateProductTypeSelect(types, order['商品分類'] || order.category || '');
  }

  /**
   * Show/hide the "OrderNo already exists" overwrite warning while typing (Add mode).
   * @param {string} orderNo
   */
  refreshOverwriteNotice(orderNo) {
    const notice = UI.elements.overwriteNotice;
    if (!notice) return;

    const exists = !!orderNo && UI.state.currentOrders.some(o =>
      String(o['訂單編號'] || o.OrderID || o.orderId || '').trim().toLowerCase() === orderNo.toLowerCase()
    );

    notice.style.display = exists ? 'flex' : 'none';
    if (!exists && UI.elements.overwriteConfirmCheckbox) {
      UI.elements.overwriteConfirmCheckbox.checked = false;
    }
  }

  /**
   * Validate the Order Form. Returns { valid, data } — data holds normalized field values.
   */
  validateOrderForm() {
    const els = UI.elements;
    UI.clearFormErrors();

    const orderNo = (els.ofOrderNo.value || '').trim();
    const orderDateRaw = els.ofOrderDate.value || '';
    const orderName = (els.ofOrderName.value || '').trim();
    const phone = (els.ofPhone.value || '').trim();
    const email = (els.ofEmail.value || '').trim();
    const productType = (els.ofProductType.value || '').trim();
    const productName = (els.ofProductName.value || '').trim();
    const priceRaw = (els.ofPrice.value || '').trim();
    const verify = (els.ofVerify.value || '').trim();

    let valid = true;
    const fail = (fieldId, message) => {
      UI.setFieldError(fieldId, message);
      valid = false;
    };

    if (!orderNo) fail('ofOrderNo', '請輸入訂單編號');
    else if (orderNo.length > 60) fail('ofOrderNo', '訂單編號長度過長');

    if (!orderDateRaw) {
      fail('ofOrderDate', '請選擇訂購日期');
    }
    const orderDateObj = orderDateRaw ? new Date(orderDateRaw) : null;
    if (orderDateRaw && isNaN(orderDateObj?.getTime())) {
      fail('ofOrderDate', '訂購日期格式無效');
    }

    if (!orderName) fail('ofOrderName', '請輸入訂購人姓名');
    else if (orderName.length > 50) fail('ofOrderName', '姓名長度過長');

    if (!phone) {
      fail('ofPhone', '請輸入聯絡電話');
    } else if (!/^[0-9\s\-]{6,20}$/.test(phone)) {
      fail('ofPhone', '電話格式僅限數字、空白與連字號');
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fail('ofEmail', 'Email 格式錯誤');
    }

    if (!productType) fail('ofProductType', '請選擇商品分類');

    if (!productName) fail('ofProductName', '請輸入商品名稱');
    else if (productName.length > 200) fail('ofProductName', '商品名稱長度過長');

    if (priceRaw === '') {
      fail('ofPrice', '請輸入購買金額');
    } else {
      const priceNum = Number(priceRaw);
      if (isNaN(priceNum) || priceNum < 0) {
        fail('ofPrice', '金額須為大於或等於零的有效數字');
      }
    }

    if (!valid) {
      return { valid: false, data: null };
    }

    const pad = n => String(n).padStart(2, '0');
    const formattedDate = `${orderDateObj.getFullYear()}-${pad(orderDateObj.getMonth() + 1)}-${pad(orderDateObj.getDate())} ${pad(orderDateObj.getHours())}:${pad(orderDateObj.getMinutes())}`;

    return {
      valid: true,
      data: {
        OrderNo: orderNo,
        OrderDate: formattedDate,
        OrderName: orderName,
        Phone: phone,
        Email: email,
        ProductName: productName,
        ProductType: productType,
        Price: String(Number(priceRaw)),
        verify: verify
      }
    };
  }

  /**
   * Handle Add / Edit Order Form Submission (both use POST /Order/Insert).
   */
  async handleOrderFormSubmit() {
    if (this.isSubmittingOrderForm) return;

    const mode = UI.state.formMode;
    const originalOrder = UI.state.selectedOrderForEdit;

    const { valid, data } = this.validateOrderForm();
    if (!valid) {
      UI.showToast('表單資料有誤，請檢查標示欄位', 'warning');
      return;
    }

    if (mode === 'add') {
      const isDuplicate = UI.state.currentOrders.some(o =>
        String(o['訂單編號'] || o.OrderID || o.orderId || '').trim().toLowerCase() === data.OrderNo.toLowerCase()
      );
      if (isDuplicate && !UI.elements.overwriteConfirmCheckbox?.checked) {
        UI.showToast('此訂單編號已存在，請勾選確認覆寫後再送出', 'warning');
        return;
      }
    }

    const saveBtn = UI.elements.saveOrderFormBtn;
    this.isSubmittingOrderForm = true;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = mode === 'edit' ? '更新中...' : '送出中...';
    }

    try {
      await ApiService.upsertOrder(data);

      if (mode === 'edit' && originalOrder) {
        const normalize = (key, value) => {
          const str = String(value ?? '').trim();
          // Ignore thousands-separator formatting differences (e.g. "2,640" vs "2640")
          return key === '購買金額' ? str.replace(/,/g, '') : str;
        };
        const diffs = ORDER_FIELD_MAP
          .map(f => {
            const oldValue = normalize(f.key, originalOrder[f.key]);
            const newValue = normalize(f.key, data[f.payloadKey]);
            return { label: f.label, oldValue, newValue };
          })
          .filter(d => d.oldValue !== d.newValue);

        LoggerManager.logUpdate(data.OrderNo, diffs);
        UI.showToast(`成功更新訂單 #${data.OrderNo}`, 'success');
      } else {
        LoggerManager.logInsert(data.OrderNo, data);
        UI.showToast(`成功新增訂單 #${data.OrderNo}`, 'success');
      }

      UI.closeOrderFormModal();

      // Refresh list & logs
      const currentQuery = UI.elements.searchInput ? UI.elements.searchInput.value : '';
      await this.fetchOrders(currentQuery, false);
      UI.renderLogs();
    } catch (error) {
      console.error('[Order Form Error]', error);
      UI.showToast(`送出失敗: ${error.message}`, 'error');
    } finally {
      this.isSubmittingOrderForm = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '確認送出';
      }
    }
  }

  /**
   * Handle Delete Confirmation
   */
  async handleDeleteConfirm() {
    const els = UI.elements;
    const order = UI.state.selectedOrderForDelete;
    if (!order) return;

    const orderId = order['訂單編號'] || order.OrderID || order.orderId;
    const confirmBtn = els.confirmDeleteBtn;
    if (confirmBtn && confirmBtn.disabled) return;

    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = '刪除中...';
    }

    try {
      await ApiService.deleteOrder(orderId);

      // Record Delete Log with Full Order Snapshot
      LoggerManager.logDelete(orderId, order);

      UI.showToast(`已成功刪除訂單 #${orderId}`, 'success');
      UI.closeDeleteModal();

      // Refresh list
      const currentQuery = els.searchInput ? els.searchInput.value : '';
      await this.fetchOrders(currentQuery, false);
      UI.renderLogs();
    } catch (error) {
      UI.showToast(`刪除訂單失敗: ${error.message}`, 'error');
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = '確認刪除';
      }
    }
  }
}

// Instantiate and launch application
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
