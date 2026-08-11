/**
 * Order Management System - Main Application Orchestrator
 */

import { ConfigManager } from './config.js';
import { ApiService } from './api.js';
import { LoggerManager } from './logger.js';
import { UI } from './ui.js';

class App {
  constructor() {
    this.searchDebounceTimer = null;
    this.lastSearchQuery = null;
    this.lastFetchTime = 0;
  }

  async init() {
    console.log('[App] Initializing Order Management System...');
    
    // 1. Load config.json
    await ConfigManager.loadConfig();
    const envInfo = ConfigManager.getEnvInfo();
    UI.renderEnvBadge(envInfo);

    // 2. Setup Event Listeners
    this.bindEvents();

    // 3. Initial Data Fetch
    await this.fetchOrders('', false);

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
          UI.openEditModal(orderId);
        } else if (deleteBtn) {
          const orderId = deleteBtn.dataset.id;
          UI.openDeleteModal(orderId);
        }
      });
    }

    // Edit Modal Form Submit & Direct Save Button Click
    const editForm = UI.elements.editForm;
    if (editForm) {
      editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleEditSubmit();
      });
    }

    document.getElementById('saveEditBtn')?.addEventListener('click', async (e) => {
      e.preventDefault();
      await this.handleEditSubmit();
    });

    // Edit Modal Close
    document.getElementById('cancelEditBtn')?.addEventListener('click', () => UI.closeEditModal());
    document.getElementById('closeEditModalBtn')?.addEventListener('click', () => UI.closeEditModal());

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

      if (showResultToast && trimmedQuery !== '') {
        UI.showToast(`已查出 ${orders.length} 筆關鍵字 「${trimmedQuery}」 的訂單`, 'info');
      }
    } catch (error) {
      UI.renderOrdersTable([]);
      UI.showToast(`讀取訂單列表失敗: ${error.message}`, 'error');
    }
  }

  /**
   * Handle Edit Order Form Submission
   */
  async handleEditSubmit() {
    const els = UI.elements;
    const originalOrder = UI.state.selectedOrderForEdit;
    
    if (!originalOrder) {
      console.warn('[App] No order selected for edit');
      UI.showToast('無法存取編輯資料，請重新點擊編輯按鈕', 'error');
      return;
    }

    const orderId = els.editOrderId ? els.editOrderId.value : '';
    const newName = els.editName ? els.editName.value.trim() : '';
    const newPhone = els.editPhone ? els.editPhone.value.trim() : '';
    const newEmail = els.editEmail ? els.editEmail.value.trim() : '';

    if (!newName && !newPhone) {
      UI.showToast('請填寫姓名與電話號碼', 'warning');
      return;
    }

    const oldName = String(originalOrder['訂購人姓名'] || originalOrder.Name || originalOrder.name || '').trim();
    const oldPhone = String(originalOrder['電話'] || originalOrder.Phone || originalOrder.phone || '').trim();
    const oldEmail = String(originalOrder['Email'] || originalOrder.email || '').trim();

    // Check updates needed
    const updates = [];
    if (newName !== oldName) updates.push({ key: 'name', label: '訂購人姓名', oldVal: oldName, newVal: newName });
    if (newPhone !== oldPhone) updates.push({ key: 'phone', label: '電話', oldVal: oldPhone, newVal: newPhone });
    if (newEmail !== oldEmail) updates.push({ key: 'email', label: 'Email', oldVal: oldEmail, newVal: newEmail });

    if (updates.length === 0) {
      UI.showToast('未修改任何欄位數據', 'warning');
      UI.closeEditModal();
      return;
    }

    const saveBtn = document.getElementById('saveEditBtn');
    if (saveBtn && saveBtn.disabled) return;

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '更新中...';
    }

    let successCount = 0;
    try {
      for (const item of updates) {
        await ApiService.updateOrderField(orderId, item.key, item.newVal);
        
        // Record Activity Log with Old and New Values
        LoggerManager.logUpdate(orderId, item.key, item.label, item.oldVal, item.newVal);
        successCount++;
      }

      UI.showToast(`成功更新 訂單 #${orderId} 的 ${successCount} 項欄位資料`, 'success');
      UI.closeEditModal();
      
      // Refresh list
      const currentQuery = els.searchInput ? els.searchInput.value : '';
      await this.fetchOrders(currentQuery, false);
    } catch (error) {
      console.error('[Update Error]', error);
      UI.showToast(`更新失敗: ${error.message}`, 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '儲存變更';
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
