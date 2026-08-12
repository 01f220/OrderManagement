/**
 * Order Management System - Activity & Operation Logger
 * Handles recording and persistence of Update & Delete operations with full historical snapshots.
 */

const STORAGE_KEY = 'order_mgmt_activity_logs_v1';

export const LoggerManager = {
  logs: [],

  init() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to parse activity logs from localStorage', e);
      this.logs = [];
    }
  },

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
    } catch (e) {
      console.error('Failed to save activity logs to localStorage', e);
    }
  },

  /**
   * Record a new order creation
   * @param {string} orderId
   * @param {Object} orderData - Full submitted order payload
   */
  logInsert(orderId, orderData) {
    const entry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      type: 'INSERT',
      orderId: orderId,
      timestamp: new Date().toLocaleString('zh-TW', { hour12: false }),
      snapshot: orderData || {},
      details: `新增訂單 #${orderId} 成功`
    };

    this.logs.unshift(entry);
    this.save();
    return entry;
  },

  /**
   * Record a full-order update, including the diff of every changed field.
   * @param {string} orderId
   * @param {Array<{label: string, oldValue: *, newValue: *}>} diffs - Changed fields (before/after)
   */
  logUpdate(orderId, diffs) {
    const changedList = (diffs || []).map(d => d.label).join('、') || '(無欄位變動)';
    const entry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      type: 'UPDATE',
      orderId: orderId,
      timestamp: new Date().toLocaleString('zh-TW', { hour12: false }),
      diffs: diffs || [],
      details: `更新訂單 #${orderId}，異動欄位：${changedList}`
    };

    this.logs.unshift(entry);
    this.save();
    return entry;
  },

  /**
   * Record order deletion operation with full order snapshot
   * @param {string} orderId 
   * @param {Object} orderSnapshot - Complete original order object before deletion
   */
  logDelete(orderId, orderSnapshot) {
    const entry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      type: 'DELETE',
      orderId: orderId,
      timestamp: new Date().toLocaleString('zh-TW', { hour12: false }),
      snapshot: orderSnapshot || {},
      details: `刪除訂單 #${orderId} (完整資料備份已封存)`
    };

    this.logs.unshift(entry);
    this.save();
    return entry;
  },

  getLogs() {
    return this.logs;
  },

  clearLogs() {
    this.logs = [];
    this.save();
  }
};

// Auto-initialize logger
LoggerManager.init();
