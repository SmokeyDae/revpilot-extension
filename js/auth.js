// auth.js - Enhanced Authentication Module
const RevPilotAuth = (() => {
    // Private variables
    let authToken = null;
    let refreshPromise = null;
    let lastTokenRefresh = 0;
    const TOKEN_REFRESH_COOLDOWN = 5000; // 5 seconds between refresh attempts
    
    // Storage keys
    const STORAGE_KEY_TOKEN = 'revpilot_authToken';
    const STORAGE_KEY_EXPIRY = 'revpilot_authTokenExpiry';
    const STORAGE_KEY_REFRESH = 'revpilot_tokenRefreshInProgress';
    
    // Event listeners
    document.addEventListener('DOMContentLoaded', function() {
        const loginButton = document.getElementById('login-button');
        if (loginButton) {
            // Ensure we don't add duplicate event listeners
            loginButton.removeEventListener('click', handleLogin);
            loginButton.addEventListener('click', handleLogin);
        }
    });
  
    /**
     * Handle the login button click with improved error handling
     * @returns {Promise<void>}
     */
    async function handleLogin() {
        const loginButton = document.getElementById('login-button');
        
        // Visual feedback when clicking login
        if (loginButton) {
            loginButton.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Signing in...';
            loginButton.disabled = true;
            loginButton.setAttribute('aria-busy', 'true');
        }
        
        try {
            const token = await getAuthToken(true); // true for interactive
            if (token) {
                // Auth successful, proceed to main view
                if (typeof RevPilotUI !== 'undefined' && RevPilotUI.hideAllSections) {
                    RevPilotUI.hideAllSections();
                    RevPilotUI.showSection('main-section');
                    
                    // Trigger a welcome message
                    RevPilotUI.showToast('Welcome to RevPilot AI!', 'success');
                } else {
                    // Fallback if UI module not available
                    const mainSection = document.getElementById('main-section');
                    const loginSection = document.getElementById('login-section');
                    
                    if (loginSection) loginSection.classList.add('hidden');
                    if (mainSection) mainSection.classList.remove('hidden');
                    
                    // Show a simple alert as fallback
                    alert('Welcome to RevPilot AI!');
                }
            } else {
                // Auth failed, show error message
                showAuthError('Authentication failed. Please try again.');
            }
        } catch (error) {
            console.error("Login error:", error);
            showAuthError(`Authentication failed: ${error.message || 'Unknown error'}`);
        } finally {
            // Reset button state regardless
            if (loginButton) {
                loginButton.innerHTML = '<i class="fas fa-sign-in-alt" aria-hidden="true"></i> Sign in with Google';
                loginButton.disabled = false;
                loginButton.setAttribute('aria-busy', 'false');
            }
        }
    }
    
    /**
     * Show an authentication error with improved display
     * @param {string} message - Error message to display
     */
    function showAuthError(message) {
        // Try to use the UI module if available
        if (typeof RevPilotUI !== 'undefined' && RevPilotUI.showToast) {
            RevPilotUI.showToast(message, 'error', 5000);
        } else if (typeof RevPilotUtils !== 'undefined' && RevPilotUtils.showToast) {
            RevPilotUtils.showToast(message, 'error', 5000);
        } else {
            // Fallback to alert
            alert(`Error: ${message}`);
            console.error(message);
        }
    }
  /**
 * Gets the OAuth token for API requests
 * @returns {Promise<string>} - The auth token
 */
async function getAuthToken() {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(token);
        }
      });
    });
  }
    /**
     * Request authorization token from Chrome with enhanced security, caching and error handling
     * @param {boolean} interactive - Whether to show interactive login
     * @returns {Promise<string|null>} Auth token or null on failure
     */
    async function getAuthToken(interactive = false) {
        // If we're already refreshing the token, wait for that to complete
        if (refreshPromise) {
            try {
                return await refreshPromise;
            } catch (error) {
                console.warn("Token refresh failed, continuing with new request:", error);
                // If the refresh failed, continue to get a new token
                refreshPromise = null;
            }
        }
        
        // Throttle token refresh attempts
        const now = Date.now();
        if (!interactive && (now - lastTokenRefresh < TOKEN_REFRESH_COOLDOWN)) {
            console.log("Token refresh throttled. Using existing token.");
            return authToken;
        }
        
        // First check if we have a cached token
        try {
            const cachedTokenData = await getCachedToken();
            
            // If token exists and is not expired, use it
            if (cachedTokenData && cachedTokenData.token && 
                cachedTokenData.expiry && now < cachedTokenData.expiry) {
                
                authToken = cachedTokenData.token;
                
                // If token will expire in the next 30 minutes, refresh in background
                if (cachedTokenData.expiry - now < 1800000) {
                    // Schedule a background refresh
                    setTimeout(() => refreshTokenInBackground(), 0);
                }
                
                return authToken;
            }
        } catch (error) {
            console.warn("Error checking cached token:", error);
            // Continue to request a new token
        }
        
        // If we need a new token, create a promise for it
        refreshPromise = new Promise((resolve, reject) => {
            // Set a timeout for the identity request
            const timeoutId = setTimeout(() => {
                reject(new Error("Authentication request timed out"));
            }, 30000); // 30 second timeout
            
            chrome.identity.getAuthToken({ interactive: interactive }, (token) => {
                clearTimeout(timeoutId);
                
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                
                if (!token) {
                    reject(new Error("Authentication failed: No token received"));
                    return;
                }
                
                authToken = token;
                lastTokenRefresh = Date.now();
                
                // Cache the token with expiry
                const expiry = Date.now() + (3600 * 1000); // 1 hour
                chrome.storage.local.set({ 
                    [STORAGE_KEY_TOKEN]: token, 
                    [STORAGE_KEY_EXPIRY]: expiry 
                }).catch(error => {
                    console.warn('Error saving auth token:', error);
                });
                
                resolve(token);
            });
        });
        
        try {
            const token = await refreshPromise;
            return token;
        } catch (error) {
            console.error("Failed to get auth token:", error);
            return null;
        } finally {
            // Clear the promise regardless of success or failure
            refreshPromise = null;
        }
    }
    
    /**
     * Get cached token from storage with improved error handling
     * @returns {Promise<{token: string, expiry: number}|null>} Token data or null
     */
    async function getCachedToken() {
        try {
            return new Promise((resolve) => {
                chrome.storage.local.get([
                    STORAGE_KEY_TOKEN, 
                    STORAGE_KEY_EXPIRY
                ], (result) => {
                    if (chrome.runtime.lastError) {
                        console.warn('Error accessing storage:', chrome.runtime.lastError);
                        resolve(null);
                        return;
                    }
                    
                    const token = result[STORAGE_KEY_TOKEN];
                    const expiry = result[STORAGE_KEY_EXPIRY];
                    
                    if (token && expiry) {
                        resolve({ token, expiry });
                    } else {
                        resolve(null);
                    }
                });
            });
        } catch (error) {
            console.error("Error getting cached token:", error);
            return null;
        }
    }
  
    /**
     * Refresh the token in the background with improved error handling
     * @returns {Promise<string|null>} New token or null on failure
     */
    async function refreshTokenInBackground() {
        // Check if a refresh is already in progress
        const isRefreshInProgress = await new Promise(resolve => {
            chrome.storage.local.get([STORAGE_KEY_REFRESH], (result) => {
                resolve(!!result[STORAGE_KEY_REFRESH]);
            });
        });
        
        if (isRefreshInProgress || refreshPromise) {
            console.log("Token refresh already in progress, skipping");
            return refreshPromise ? await refreshPromise : authToken;
        }
        
        // Set a flag to indicate refresh in progress
        await new Promise(resolve => {
            chrome.storage.local.set({ [STORAGE_KEY_REFRESH]: true }, resolve);
        });
        
        refreshPromise = new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error("Background token refresh timed out"));
            }, 30000); // 30 second timeout
            
            chrome.identity.getAuthToken({ interactive: false }, (token) => {
                clearTimeout(timeoutId);
                
                if (chrome.runtime.lastError) {
                    console.warn("Background token refresh failed:", chrome.runtime.lastError.message);
                    reject(chrome.runtime.lastError);
                    return;
                }
                
                if (token) {
                    authToken = token;
                    lastTokenRefresh = Date.now();
                    
                    // Cache the token with expiry
                    const expiry = Date.now() + (3600 * 1000); // 1 hour
                    chrome.storage.local.set({ 
                        [STORAGE_KEY_TOKEN]: token, 
                        [STORAGE_KEY_EXPIRY]: expiry,
                        [STORAGE_KEY_REFRESH]: false
                    }).catch(error => {
                        console.warn('Error saving refreshed auth token:', error);
                    });
                    
                    console.log('Token refreshed in background');
                    resolve(token);
                } else {
                    chrome.storage.local.set({ [STORAGE_KEY_REFRESH]: false });
                    reject(new Error('No token received during background refresh'));
                }
            });
        });
        
        try {
            const token = await refreshPromise;
            return token;
        } catch (error) {
            console.warn('Background token refresh failed:', error);
            // Clear refresh flag on failure
            chrome.storage.local.set({ [STORAGE_KEY_REFRESH]: false });
            return null;
        } finally {
            refreshPromise = null;
        }
    }
  
    /**
     * Check if the user is currently authenticated with improved validation
     * @returns {Promise<boolean>} Whether user is authenticated
     */
    async function isAuthenticated() {
        try {
            const token = await getAuthToken(false); // non-interactive
            return !!token && validateToken(token);
        } catch (error) {
            console.warn('Authentication check failed:', error);
            return false;
        }
    }
  
    /**
     * Invalidate the current token (sign out) with improved cleanup
     * @returns {Promise<boolean>} Success status
     */
    async function signOut() {
        if (!authToken) return true;
        
        try {
            return new Promise((resolve, reject) => {
                chrome.identity.removeCachedAuthToken({ token: authToken }, () => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    
                    authToken = null;
                    lastTokenRefresh = 0;
                    
                    // Clear storage items
                    chrome.storage.local.remove([
                        STORAGE_KEY_TOKEN,
                        STORAGE_KEY_EXPIRY,
                        STORAGE_KEY_REFRESH
                    ], () => {
                        if (chrome.runtime.lastError) {
                            console.warn("Error clearing auth data:", chrome.runtime.lastError);
                        }
                        resolve(true);
                    });
                });
            });
        } catch (error) {
            console.error("Error during sign out:", error);
            return false;
        }
    }
    
    /**
     * Validate token structure with improved checks
     * @param {string} token - Auth token to validate
     * @returns {boolean} Whether token is valid
     */
    function validateToken(token) {
        if (!token || typeof token !== 'string') {
            return false;
        }
        
        // Basic validation - tokens are usually quite long
        if (token.length < 20) {
            return false;
        }
        
        // Check token format - Google OAuth tokens typically follow a specific pattern
        // Note: This is a simplified check - real validation would check JWT
        return /^[a-zA-Z0-9_-]+$/.test(token);
    }
  
    // Public API
    return {
        getAuthToken,
        isAuthenticated,
        signOut,
        handleLogin,
        validateToken,
        refreshTokenInBackground
    };
})();
