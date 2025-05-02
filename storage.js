// storage.js - Enhanced Storage Module
const RevPilotStorage = (() => {
    // Cache storage for faster repeated access
    const memoryCache = new Map();
    
    // Storage prefix to avoid collisions
    const STORAGE_PREFIX = 'revpilot_';
    
    // Cache expiry time in milliseconds
    const CACHE_EXPIRY = 60000; // 1 minute
    
    /**
     * Get an item from storage with enhanced error handling
     * @param {string} key - Storage key
     * @param {boolean} bypassCache - Whether to bypass the memory cache
     * @returns {Promise<any>} Stored value
     */
    async function getItem(key, bypassCache = false) {
        if (!key) {
            console.warn('Storage key is required');
            return null;
        }
        
        const storageKey = ensurePrefixed(key);
        
        // Check memory cache first if not bypassing
        if (!bypassCache && memoryCache.has(storageKey)) {
            const cacheEntry = memoryCache.get(storageKey);
            if (cacheEntry && cacheEntry.expires > Date.now()) {
                return cacheEntry.value;
            } else {
                // Expired cache entry, remove it
                memoryCache.delete(storageKey);
            }
        }
        
        try {
            return new Promise((resolve) => {
                chrome.storage.local.get([storageKey], (result) => {
                    if (chrome.runtime.lastError) {
                        console.error("Storage error:", chrome.runtime.lastError);
                        resolve(null);
                        return;
                    }
                    
                    const value = result[storageKey];
                    
                    // Cache the result for future access
                    if (value !== undefined) {
                        memoryCache.set(storageKey, {
                            value,
                            expires: Date.now() + CACHE_EXPIRY
                        });
                    }
                    
                    resolve(value !== undefined ? value : null);
                });
            });
        } catch (error) {
            console.error("Error getting item from storage:", error);
            return null;
        }
    }
    
    /**
     * Set an item in storage with improved error handling
     * @param {string} key - Storage key
     * @param {any} value - Value to store
     * @returns {Promise<boolean>} Success status
     */
    async function setItem(key, value) {
        if (!key) {
            console.warn('Storage key is required');
            return false;
        }
        
        const storageKey = ensurePrefixed(key);
        
        try {
            // Update memory cache immediately
            memoryCache.set(storageKey, {
                value,
                expires: Date.now() + CACHE_EXPIRY
            });
            
            return new Promise((resolve) => {
                chrome.storage.local.set({ [storageKey]: value }, () => {
                    if (chrome.runtime.lastError) {
                        console.error("Storage error:", chrome.runtime.lastError);
                        memoryCache.delete(storageKey); // Revert cache on error
                        resolve(false);
                        return;
                    }
                    resolve(true);
                });
            });
        } catch (error) {
            console.error("Error setting item in storage:", error);
            memoryCache.delete(storageKey); // Revert cache on error
            return false;
        }
    }
    
    /**
     * Remove an item from storage with improved error handling
     * @param {string} key - Storage key to remove
     * @returns {Promise<boolean>} Success status
     */
    async function removeItem(key) {
        if (!key) {
            console.warn('Storage key is required');
            return false;
        }
        
        const storageKey = ensurePrefixed(key);
        
        try {
            // Remove from memory cache immediately
            memoryCache.delete(storageKey);
            
            return new Promise((resolve) => {
                chrome.storage.local.remove([storageKey], () => {
                    if (chrome.runtime.lastError) {
                        console.error("Storage error:", chrome.runtime.lastError);
                        resolve(false);
                        return;
                    }
                    resolve(true);
                });
            });
        } catch (error) {
            console.error("Error removing item from storage:", error);
            return false;
        }
    }
    
    /**
     * Clear all RevPilot storage data with improved error handling
     * @returns {Promise<boolean>} Success status
     */
    async function clearAllData() {
        try {
            // Clear memory cache first
            memoryCache.clear();
            
            return new Promise((resolve) => {
                chrome.storage.local.get(null, (items) => {
                    if (chrome.runtime.lastError) {
                        console.error("Storage error:", chrome.runtime.lastError);
                        resolve(false);
                        return;
                    }
                    
                    const keysToRemove = Object.keys(items).filter(
                        key => key.startsWith(STORAGE_PREFIX)
                    );
                    
                    if (keysToRemove.length > 0) {
                        chrome.storage.local.remove(keysToRemove, () => {
                            if (chrome.runtime.lastError) {
                                console.error("Storage error:", chrome.runtime.lastError);
                                resolve(false);
                                return;
                            }
                            resolve(true);
                        });
                    } else {
                        resolve(true);
                    }
                });
            });
        } catch (error) {
            console.error("Error clearing all data:", error);
            return false;
        }
    }
    
    /**
     * Get all RevPilot data with improved error handling
     * @returns {Promise<Object>} All stored data
     */
    async function getAllData() {
        try {
            return new Promise((resolve) => {
                chrome.storage.local.get(null, (items) => {
                    if (chrome.runtime.lastError) {
                        console.error("Storage error:", chrome.runtime.lastError);
                        resolve({});
                        return;
                    }
                    
                    const prefixedData = {};
                    
                    Object.keys(items).forEach(key => {
                        if (key.startsWith(STORAGE_PREFIX)) {
                            const unprefixedKey = key.slice(STORAGE_PREFIX.length);
                            prefixedData[unprefixedKey] = items[key];
                        }
                    });
                    
                    resolve(prefixedData);
                });
            });
        } catch (error) {
            console.error("Error getting all data:", error);
            return {}; // Return empty object as fallback
        }
    }
    
    /**
     * Export data to JSON file with improved error handling
     * @returns {Promise<string|null>} JSON data URL for download or null on error
     */
    async function exportData() {
        try {
            const data = await getAllData();
            const jsonData = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonData], { type: 'application/json' });
            return URL.createObjectURL(blob);
        } catch (error) {
            console.error("Error exporting data:", error);
            return null;
        }
    }
    
    /**
     * Import data from JSON with improved validation and error handling
     * @param {string} jsonData - JSON string to import
     * @returns {Promise<boolean>} Success status
     */
    async function importData(jsonData) {
        try {
            if (!jsonData) {
                throw new Error('Import data is required');
            }
            
            let data;
            try {
                data = JSON.parse(jsonData);
            } catch (e) {
                throw new Error('Invalid JSON format');
            }
            
            // Validate data format
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                throw new Error('Invalid import data format (must be an object)');
            }
            
            // Import each key with batch processing to improve performance
            const batchSize = 20;
            const keys = Object.keys(data);
            
            for (let i = 0; i < keys.length; i += batchSize) {
                const batch = keys.slice(i, i + batchSize);
                const batchData = {};
                
                batch.forEach(key => {
                    const storageKey = ensurePrefixed(key);
                    batchData[storageKey] = data[key];
                    
                    // Update memory cache
                    memoryCache.set(storageKey, {
                        value: data[key],
                        expires: Date.now() + CACHE_EXPIRY
                    });
                });
                
                // Store batch
                await new Promise((resolve, reject) => {
                    chrome.storage.local.set(batchData, () => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                            return;
                        }
                        resolve();
                    });
                });
            }
            
            return true;
        } catch (error) {
            console.error("Error importing data:", error);
            return false;
        }
    }
    
    /**
     * Ensure a key has the correct prefix with improved handling
     * @param {string} key - Key to check
     * @returns {string} Prefixed key
     */
    function ensurePrefixed(key) {
        if (!key) return STORAGE_PREFIX;
        return key.startsWith(STORAGE_PREFIX) ? key : `${STORAGE_PREFIX}${key}`;
    }
    
    /**
     * Initialize event listeners for cache invalidation and sync
     */
    function initializeEventListeners() {
        // Listen for storage changes from other contexts
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;
            
            // Update memory cache for changed items
            Object.keys(changes).forEach(key => {
                if (key.startsWith(STORAGE_PREFIX)) {
                    const { newValue, oldValue } = changes[key];
                    
                    if (newValue === undefined) {
                        // Item was removed
                        memoryCache.delete(key);
                    } else {
                        // Item was changed
                        memoryCache.set(key, {
                            value: newValue,
                            expires: Date.now() + CACHE_EXPIRY
                        });
                    }
                }
            });
        });
        
        // Check for and clear expired cache entries periodically
        setInterval(() => {
            const now = Date.now();
            for (const [key, entry] of memoryCache.entries()) {
                if (entry.expires <= now) {
                    memoryCache.delete(key);
                }
            }
        }, CACHE_EXPIRY);
    }
    
    // Cleanup function
    function cleanup() {
        memoryCache.clear();
        console.log('Storage module cleanup complete');
    }
    
    // Initialize event listeners
    initializeEventListeners();
    
    // Register cleanup
    window.addEventListener('unload', cleanup);
    
    // Public API
    return {
        getItem,
        setItem,
        removeItem,
        clearAllData,
        getAllData,
        exportData,
        importData,
        cleanup
    };
})();