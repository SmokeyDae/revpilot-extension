// config.js - Centralized Configuration Module
const RevPilotConfig = (() => {
    // API Endpoints
    const API = {
        SHEETS_BASE_URL: 'https://sheets.googleapis.com/v4/spreadsheets'
    };
    
    // Storage Keys
    const STORAGE = {
        KEYS: {
            MASTER_SHEET: 'masterSheetId',
            RECENT_PLANS: 'recentPlans',
            AUTH_TOKEN: 'authToken',
            AUTH_TOKEN_EXPIRY: 'authTokenExpiry',
            DARK_MODE: 'darkMode'
        },
        PREFIX: 'revpilot_'
    };
    
    // App Configuration
    const APP = {
        VERSION: '1.2.1',
        NAME: 'RevPilot AI',
        MAX_RECENT_PLANS: 20,
        DEFAULT_MASTER_SHEET_TITLE: "Account Plan",
        TEMPLATE_SECTIONS: [
            'Account Overview',
            'Key Contacts',
            'Goals & KPIs',
            'Product Strategy',
            'Competitive Analysis',
            'Action Items & Next Steps',
            'Meeting Notes',
            'Resources & Links'
        ]
    };
    
    // Network Configuration
    const NETWORK = {
        MAX_RETRY_ATTEMPTS: 3,
        INITIAL_RETRY_DELAY: 1000,
        BACKGROUND_REFRESH_INTERVAL: 900000, // 15 minutes
        TOKEN_EXPIRE_THRESHOLD: 1800000 // 30 minutes
    };
    
    // Auth Configuration
    const AUTH = {
        TOKEN_CACHE_DURATION: 3600,  // 1 hour in seconds
        SCOPES: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive'
        ]
    };
    
    // Feature Flags
    const FEATURES = {
        ENHANCED_FORMATTING: true,
        OFFLINE_SUPPORT: true,
        DARK_MODE: true
    };
    
    // Public API
    return {
        API,
        STORAGE,
        APP,
        NETWORK,
        AUTH,
        FEATURES,
        getFullStorageKey: (key) => `${STORAGE.PREFIX}${key}`,
        isFeatureEnabled: (featureName) => FEATURES[featureName] === true
    };
})();
