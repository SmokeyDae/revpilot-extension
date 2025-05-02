// errorHandler.js - Centralized Error Handling
const RevPilotErrorHandler = (() => {
    // Error types for classification
    const ERROR_TYPES = {
        NETWORK: 'network',
        AUTH: 'authentication',
        API: 'api',
        VALIDATION: 'validation',
        STORAGE: 'storage',
        UNKNOWN: 'unknown'
    };
    
    // Map common error patterns to error types
    function classifyError(error) {
        if (!error) return ERROR_TYPES.UNKNOWN;
        
        const errorMessage = typeof error === 'string' ? error : error.message || '';
        
        if (navigator && !navigator.onLine) {
            return ERROR_TYPES.NETWORK;
        }
        
        if (errorMessage.includes('Failed to fetch') || 
            errorMessage.includes('NetworkError') ||
            errorMessage.includes('Network request failed')) {
            return ERROR_TYPES.NETWORK;
        }
        
        if (errorMessage.includes('Authentication') || 
            errorMessage.includes('token') ||
            errorMessage.includes('auth') ||
            errorMessage.includes('login') ||
            errorMessage.includes('permission')) {
            return ERROR_TYPES.AUTH;
        }
        
        if (errorMessage.includes('API') || 
            errorMessage.includes('rate limit') ||
            errorMessage.includes('quota')) {
            return ERROR_TYPES.API;
        }
        
        if (errorMessage.includes('storage') ||
            errorMessage.includes('database')) {
            return ERROR_TYPES.STORAGE;
        }
        
        return ERROR_TYPES.UNKNOWN;
    }
    
    // Generic error handler
    function handleError(error, context = '') {
        const errorType = classifyError(error);
        const errorMessage = typeof error === 'string' ? error : error.message || 'An unknown error occurred';
        
        // Log the error with context for debugging
        console.error(`[RevPilot ${errorType.toUpperCase()} Error]${context ? ' in ' + context : ''}:`, error);
        
        // Return formatted error object
        return {
            type: errorType,
            message: errorMessage,
            context: context,
            timestamp: new Date().toISOString()
        };
    }
    
    // Specialized handlers for different error types
    function handleApiError(error, context = '') {
        const formattedError = handleError(error, context);
        
        // Special handling for API errors
        if (formattedError.message.includes('rate limit') || formattedError.message.includes('quota')) {
            if (typeof RevPilotUI !== 'undefined' && RevPilotUI.showToast) {
                RevPilotUI.showToast('API rate limit exceeded. Please try again later.', 'error');
            }
        } else {
            if (typeof RevPilotUI !== 'undefined' && RevPilotUI.showToast) {
                RevPilotUI.showToast(`Error: ${formattedError.message}`, 'error');
            }
        }
        
        return formattedError;
    }
    
    function handleAuthError(error, context = '') {
        const formattedError = handleError(error, context);
        
        // Special handling for auth errors
        if (formattedError.message.includes('token expired')) {
            // Try to refresh token silently
            setTimeout(() => {
                RevPilotAuth.getAuthToken(false)
                    .catch(e => console.warn('Failed to refresh token:', e));
            }, 0);
        }
        
        if (typeof RevPilotUI !== 'undefined' && RevPilotUI.showToast) {
            RevPilotUI.showToast('Authentication error. Please try logging in again.', 'error');
        }
        
        return formattedError;
    }
    
    function handleNetworkError(error, context = '') {
        const formattedError = handleError(error, context);
        
        // Special handling for network errors
        if (!navigator.onLine) {
            if (typeof RevPilotUI !== 'undefined' && RevPilotUI.showToast) {
                RevPilotUI.showToast('You\'re offline. Some features may not be available.', 'error');
            }
        } else {
            if (typeof RevPilotUI !== 'undefined' && RevPilotUI.showToast) {
                RevPilotUI.showToast('Network error. Please check your connection.', 'error');
            }
        }
        
        return formattedError;
    }
    
    function handleStorageError(error, context = '') {
        const formattedError = handleError(error, context);
        
        if (typeof RevPilotUI !== 'undefined' && RevPilotUI.showToast) {
            RevPilotUI.showToast('Error accessing local storage. Some data may not be saved.', 'error');
        }
        
        return formattedError;
    }
    
    // Public API
    return {
        ERROR_TYPES,
        handleError,
        handleApiError,
        handleAuthError,
        handleNetworkError,
        handleStorageError,
        classifyError
    };
})();
