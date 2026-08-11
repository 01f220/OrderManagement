# 訂單管理系統 (Order Management System)

本專案為一個高質感的單頁應用程式 (SPA)，專為串接 n8n Webhook API 所設計，支援訂單查詢、全文檢索、刪除訂單、更新基本資料（姓名/電話/Email）以及完整的操作異動 Log 紀錄追蹤。

---

## 🌟 系統特色

1. **環境設定檔驅動 (`config.json`)**：
   - 透過根目錄的 `config.json` 檔案控制 API Webhook 網址，無需於網頁介面上手動切換。
   - 支援 `test` (測試環境 `/webhook-test`) 與 `production` (正式環境 `/webhook`)。
2. **全文檢索 (Full-text Search)**：
   - 整合 `GET /Order/All?q=...` 介面，內建 Debounce 防抖搜尋，可對姓名、電話、Email、商品名稱、訂單編號發起全文檢索。
3. **資料更新與舊值對比 (Update & Diff)**：
   - 支援編輯「訂購人姓名 (name)」、「電話 (phone)」、「Email (email)」。
   - 自動發送相應的 `PUT /Order/Update` 請求。
4. **刪除與資料快照備份 (Delete & Snapshot Log)**：
   - 點擊刪除發送 `DELETE /Order/del` 請求。
   - 系統自動於操作日誌中保存被刪除訂單的 **完整 JSON 快照 (Full Snapshot)**，便於追溯與復原。
5. **操作與異動 Log 紀錄 (Activity Logger)**：
   - 專屬「📋 操作日誌」頁籤。
   - 詳細記錄「修改前後數據對比 (Old vs New)」與「刪除快照」。
   - 資料自動同步至瀏覽器 `localStorage` 保留歷程。

---

## ⚙️ 環境設定說明 (`config.json`)

請直接開啟專案根目錄下的 [config.json](file:///d:/1_Antigravity/訂單管理/config.json) 檔案來修改當前運行的環境：

```json
{
  "activeEnv": "test",
  "environments": {
    "test": {
      "name": "測試環境 (Test)",
      "baseUrl": "https://n8n-lpv5iwl5.roamerhost.com/webhook-test"
    },
    "production": {
      "name": "正式環境 (Production)",
      "baseUrl": "https://n8n-lpv5iwl5.roamerhost.com/webhook"
    }
  }
}
```

- 將 `"activeEnv"` 設定為 `"test"` 即代表呼叫測試環境 Webhook。
- 將 `"activeEnv"` 設定為 `"production"` 即代表呼叫正式環境 Webhook。

---

## 📡 串接之 n8n Webhook API 規格

| 功能 | HTTP 方法 | 端點 (Path) | Query 參數 | 說明 |
| :--- | :--- | :--- | :--- | :--- |
| **讀取全清單 / 檢索** | `GET` | `/Order/All` | `q` (可選) | 全文檢索關鍵字 |
| **讀取單筆訂單** | `GET` | `/order/read` | `OrderID` | 查詢單筆訂單詳細資訊 |
| **刪除訂單** | `DELETE` | `/Order/del` | `OrderId` | 刪除指定訂單 |
| **更新訂單** | `PUT` | `/Order/Update` | `OrderId`, `key`, `value` | `key` 支援 `name` \| `phone` \| `email` |

---

## 🚀 如何運行本專案

1. **直接開啟**：雙擊開啟 `index.html` 或使用任何 HTTP Static Server (如 Live Server, `npx serve`, 等) 啟動。
2. **測試功能**：
   - 點擊「重新整理列表」載入訂單。
   - 在搜尋列輸入文字體驗全文檢索。
   - 點擊「✏️ 編輯」修改姓名/電話/Email，檢查操作日誌中留存的變更前後歷史。
   - 點擊「🗑️ 刪除」，並於操作日誌檢視快照備份。
"# OrderManagement" 
"# OrderManagement" 
