/**
 * Order Management System - Webhook API Client
 * Interacts with n8n Webhook Endpoints with robust response handling
 */

import { ConfigManager } from './config.js';

export const ApiService = {
  /**
   * Fetch all orders or full-text search orders
   * @param {string} searchQuery Optional search keyword
   * @returns {Promise<Array>} List of order objects
   */
  async getAllOrders(searchQuery = '') {
    const baseUrl = ConfigManager.getBaseUrl();
    let url = `${baseUrl}/Order/All`;
    
    if (searchQuery && searchQuery.trim() !== '') {
      url += `?q=${encodeURIComponent(searchQuery.trim())}`;
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

      // Read response as text first to handle n8n empty body (0 search results) safely!
      const text = await response.text();

      if (!text || text.trim() === '') {
        // n8n returns empty body when search query matches 0 items
        return [];
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (jsonErr) {
        console.warn('[API Warning] Response body is not valid JSON:', text);
        return [];
      }
      
      // Handle array or wrapped response formats
      if (Array.isArray(data)) {
        return data;
      } else if (data && typeof data === 'object') {
        // If single item or wrapped object
        return data.orders || [data];
      }
      return [];
    } catch (error) {
      console.error('[API Error] getAllOrders:', error);
      throw error;
    }
  },

  /**
   * Read single order details by OrderID
   * @param {string} orderId 
   */
  async getOrderById(orderId) {
    const baseUrl = ConfigManager.getBaseUrl();
    const url = `${baseUrl}/order/read?OrderID=${encodeURIComponent(orderId)}`;

    try {
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const text = await response.text();
      if (!text || text.trim() === '') {
        return null;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return null;
      }

      return Array.isArray(data) ? data[0] : data;
    } catch (error) {
      console.error('[API Error] getOrderById:', error);
      throw error;
    }
  },

  /**
   * Delete order by OrderId
   * @param {string} orderId 
   */
  async deleteOrder(orderId) {
    const baseUrl = ConfigManager.getBaseUrl();
    const url = `${baseUrl}/Order/del?OrderId=${encodeURIComponent(orderId)}`;

    try {
      const response = await fetch(url, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const text = await response.text();
      if (!text || text.trim() === '') {
        return { success: true };
      }

      try {
        const json = JSON.parse(text);
        return json;
      } catch {
        return { success: true, message: text };
      }
    } catch (error) {
      console.error('[API Error] deleteOrder:', error);
      throw error;
    }
  },

  /**
   * Update single order field via PUT /Order/Update
   * @param {string} orderId 
   * @param {string} key 'name' | 'phone' | 'email'
   * @param {string} value 
   */
  async updateOrderField(orderId, key, value) {
    const baseUrl = ConfigManager.getBaseUrl();
    const url = `${baseUrl}/Order/Update?OrderId=${encodeURIComponent(orderId)}&key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}`;

    try {
      const response = await fetch(url, {
        method: 'PUT'
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const resultText = await response.text();
      
      // Check error messages returned by n8n
      if (resultText.includes('訂單編號不存在') || resultText.includes('更新條件有誤')) {
        throw new Error(resultText.trim());
      }

      return resultText;
    } catch (error) {
      console.error('[API Error] updateOrderField:', error);
      throw error;
    }
  }
};
