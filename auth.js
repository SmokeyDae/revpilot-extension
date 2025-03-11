// Handle Google OAuth Authentication
const AUTH_TOKEN_KEY = 'revpilot_auth_token';

// Check if chrome.runtime is available (prevents disconnected context errors)
function isChromeAvailable() {
  return typeof chrome !== 'undefined' && chrome.runtime && !chrome.runtime.lastError;
}

// Get authentication token, either from storage or by authenticating
function getAuthToken() {
  return new Promise((resolve, reject) => {
    if (!isChromeAvailable()) {
      reject(new Error('Chrome API not available'));
      return;
    }
    
    // Check if we already have a token
    chrome.storage.local.get([AUTH_TOKEN_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(`Storage error: ${chrome.runtime.lastError.message}`));
        return;
      }
      
      if (result && result[AUTH_TOKEN_KEY]) {
        // We have a token, but let's verify it's still valid
        validateToken(result[AUTH_TOKEN_KEY])
          .then(() => {
            resolve(result[AUTH_TOKEN_KEY]);
          })
          .catch((error) => {
            console.log('Stored token is invalid:', error.message);
            // Token is invalid, remove it and get a new one
            chrome.storage.local.remove([AUTH_TOKEN_KEY], () => {
              requestNewToken(resolve, reject);
            });
          });
      } else {
        // No token in storage, request a new one
        requestNewToken(resolve, reject);
      }
    });
  });
}

// Validate if a token is valid and has the correct scopes
function validateToken(token) {
  // First check if token is valid via tokeninfo endpoint
  return fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Token validation failed: Invalid token');
      }
      return response.json();
    })
    .then(data => {
      // Check for token expiration
      if (data.error) {
        throw new Error(`Token error: ${data.error_description || data.error}`);
      }
      
      // Check if token has required scopes
      const requiredScopes = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ];
      
      if (!data.scope) {
        throw new Error('Token has no scopes');
      }
      
      const tokenScopes = data.scope.split(' ');
      const hasAllScopes = requiredScopes.every(scope => 
        tokenScopes.includes(scope)
      );
      
      if (!hasAllScopes) {
        console.warn('Token scopes:', tokenScopes);
        console.warn('Required scopes:', requiredScopes);
        throw new Error('Token missing required scopes');
      }
      
      // Also test token with a simple API call
      return testToken(token);
    })
    .catch(error => {
      console.error('Token validation error:', error);
      throw error; // Re-throw to be handled by the caller
    });
}

// Test if a token works with the API
function testToken(token) {
  return fetch('https://sheets.googleapis.com/v4/spreadsheets?pageSize=1', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }).then(response => {
    if (!response.ok) {
      const status = response.status;
      // Handle different error codes appropriately
      if (status === 401) {
        throw new Error('Token unauthorized');
      } else if (status === 403) {
        throw new Error('Token lacks permission');
      } else {
        throw new Error(`API request failed with status: ${status}`);
      }
    }
    return token; // Return the token if everything is valid
  });
}

// Request a new token from Chrome identity API
function requestNewToken(resolve, reject) {
  if (!isChromeAvailable() || !chrome.identity) {
    reject(new Error('Chrome identity API not available'));
    return;
  }

  chrome.identity.getAuthToken({ 
    interactive: true,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive"
    ]
  }, (token) => {
    if (chrome.runtime.lastError) {
      console.error('Auth error:', chrome.runtime.lastError);
      reject(new Error(chrome.runtime.lastError.message || 'Authentication failed'));
      return;
    }
    
    if (!token) {
      reject(new Error('No token returned from authentication'));
      return;
    }
    
    // Save the token immediately as we know it's fresh from Google
    chrome.storage.local.set({ [AUTH_TOKEN_KEY]: token }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving token:', chrome.runtime.lastError);
      }
      // Return the token as we know it's valid coming directly from Chrome Identity API
      resolve(token);
    });
  });
}

// Clear authentication token (for logout or expired tokens)
function clearAuthToken() {
  return new Promise((resolve, reject) => {
    if (!isChromeAvailable()) {
      reject(new Error('Chrome API not available'));
      return;
    }
    
    chrome.storage.local.get([AUTH_TOKEN_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(`Storage error: ${chrome.runtime.lastError.message}`));
        return;
      }
      
      const token = result[AUTH_TOKEN_KEY];
      if (token) {
        // Also remove from Chrome's cache
        chrome.identity.removeCachedAuthToken({ token }, () => {
          if (chrome.runtime.lastError) {
            console.warn('Error removing cached token:', chrome.runtime.lastError);
          }
          
          chrome.storage.local.remove([AUTH_TOKEN_KEY], () => {
            if (chrome.runtime.lastError) {
              reject(new Error(`Storage error: ${chrome.runtime.lastError.message}`));
              return;
            }
            resolve();
          });
        });
      } else {
        resolve();
      }
    });
  });
}

// Refresh token if it's expired
async function refreshAuthToken() {
  try {
    await clearAuthToken();
    return await getAuthToken();
  } catch (error) {
    console.error('Failed to refresh auth token:', error);
    throw error;
  }
}