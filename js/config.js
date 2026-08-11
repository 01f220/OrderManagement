/**
 * Order Management System - Config Loader Module
 * Loads environment configurations from config.json
 */

export const ConfigManager = {
  config: null,
  activeEnvName: '測試環境',
  activeEnvKey: 'test',
  baseUrl: '',

  async loadConfig() {
    try {
      const response = await fetch('./config.json', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to load config.json: ${response.status}`);
      }
      this.config = await response.json();
      
      const activeKey = this.config.activeEnv || 'test';
      const envObj = this.config.environments?.[activeKey];

      if (!envObj) {
        throw new Error(`Environment config for "${activeKey}" not found in config.json`);
      }

      this.activeEnvKey = activeKey;
      this.activeEnvName = envObj.name || activeKey;
      this.baseUrl = envObj.baseUrl || '';

      console.log(`[Config] Active Environment: ${this.activeEnvName} (${this.activeEnvKey}) -> Base URL: ${this.baseUrl}`);
      return this.config;
    } catch (error) {
      console.error('[Config Error]', error);
      // Fallback default config
      this.activeEnvKey = 'test';
      this.activeEnvName = '測試環境 (Fallback)';
      this.baseUrl = 'https://n8n-lpv5iwl5.roamerhost.com/webhook-test';
      return null;
    }
  },

  getBaseUrl() {
    return this.baseUrl;
  },

  getEnvInfo() {
    return {
      key: this.activeEnvKey,
      name: this.activeEnvName,
      baseUrl: this.baseUrl
    };
  }
};
