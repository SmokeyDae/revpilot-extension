// =============================================================================
// BACKGROUND.JS - REVPILOT AI CHROME EXTENSION
// =============================================================================
// This script handles authentication, API requests, and sheet generation for 
// the RevPilot AI Account Plan Builder Chrome extension.
// =============================================================================

// =============================================================================
// CONSTANTS AND GLOBAL VARIABLES
// =============================================================================
let authToken = null;
const SHEET_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const SECONDS_TO_CACHE_TOKEN = 3600; // 1 hour
const MASTER_SHEET_TITLE = "Current Year Account Plan"; // Title for the master spreadsheet
const STORAGE_KEY_MASTER_SHEET = 'revpilot_masterSheetId'; // Key for storing master sheet ID

// =============================================================================
// INITIALIZATION
// =============================================================================
// Setup token refresh scheduler on load
setupTokenRefreshScheduler();

/**
 * Setup a token refresh scheduler to refresh the auth token periodically
 */
function setupTokenRefreshScheduler() {
    // Check for token expiry every 15 minutes
    setInterval(() => {
        chrome.storage.local.get(['revpilot_authToken', 'revpilot_authTokenExpiry'], (result) => {
            const now = Date.now();
            
            // If token exists and will expire in the next 30 minutes, refresh it
            if (result.revpilot_authToken && result.revpilot_authTokenExpiry && 
                (result.revpilot_authTokenExpiry - now < 1800000)) {
                console.log("Token expiring soon, refreshing...");
                
                // Use a semaphore approach to prevent multiple refreshes
                chrome.storage.local.get(['revpilot_tokenRefreshInProgress'], (refreshStatus) => {
                    if (refreshStatus.revpilot_tokenRefreshInProgress) {
                        console.log("Token refresh already in progress, skipping");
                        return;
                    }
                    
                    // Mark refresh as in progress
                    chrome.storage.local.set({ 'revpilot_tokenRefreshInProgress': true }, () => {
                        getAuthToken()
                            .then(token => {
                                console.log("Token refreshed successfully");
                                chrome.storage.local.set({ 'revpilot_tokenRefreshInProgress': false });
                            })
                            .catch(error => {
                                console.error("Failed to refresh token:", error);
                                chrome.storage.local.set({ 'revpilot_tokenRefreshInProgress': false });
                            });
                    });
                });
            }
        });
    }, 900000); // 15 minutes
}
// =============================================================================
// MESSAGE HANDLERS
// =============================================================================
// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getAuthToken") {
    getAuthToken()
      .then(token => {
        sendResponse({ token: token });
      })
      .catch(error => {
        console.error("Authentication error:", error);
        sendResponse({ error: error.message });
      });
    return true; // Required for async sendResponse
  }
  
  else if (request.action === "createSheet") {
    createAccountPlanSheet(request.accountName, request.currentTab)
      .then(response => {
        sendResponse({ 
          success: true, 
          spreadsheetId: response.spreadsheetId, 
          spreadsheetUrl: response.spreadsheetUrl,
          sheetGid: response.sheetGid,
          isInlineNavigation: response.isInlineNavigation
        });
      })
      .catch(error => {
        console.error("Error in createSheet:", error);
        sendResponse({ 
          success: false, 
          error: error.message || "Failed to create sheet. Please try again." 
        });
      });
    return true; // Required for async sendResponse
  }
  
  else if (request.action === "populateSheet") {
    populateAccountPlanTemplate(request.sheetId, request.accountData)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error("Error in populateSheet:", error);
        sendResponse({ 
          success: false, 
          error: error.message || "Failed to populate sheet. Please try again." 
        });
      });
    return true; // Required for async sendResponse
  }

  else if (request.action === "deleteSheet") {
    console.log("Delete sheet request received:", request.sheetId, request.accountName);
    deleteAccountPlanSheet(request.sheetId, request.accountName)
      .then((response) => {
        console.log("Sheet deletion successful, sending response:", response);
        sendResponse({ 
          success: true,
          overviewUpdated: response.overviewUpdated
        });
      })
      .catch(error => {
        console.error("Error in deleteSheet:", error);
        sendResponse({ 
          success: false, 
          error: error.message || "Failed to delete sheet. Please try again." 
        });
      });
    return true; // Required for async sendResponse
  }
  
  else if (request.action === "getSheetDetails") {
    console.log("Getting sheet details for:", request.spreadsheetId);
    getSheetDetails(request.spreadsheetId)
      .then(details => {
        console.log("Sheet details retrieved successfully");
        sendResponse({ success: true, sheets: details.sheets });
      })
      .catch(error => {
        console.error("Error getting sheet details:", error);
        sendResponse({ 
          success: false, 
          error: error.message || "Failed to get sheet details. Please try again." 
        });
      });
    return true; // Required for async sendResponse
  }
  
  else if (request.action === "checkCurrentSheet") {
    // Check if the current tab is a Google Sheet and if it's our master sheet
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (!tabs || tabs.length === 0) {
        sendResponse({ isMasterSheet: false });
        return;
      }
      
      const currentTabUrl = tabs[0].url;
      const sheetIdMatch = currentTabUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      
      if (!sheetIdMatch) {
        sendResponse({ isMasterSheet: false });
        return;
      }
      
      const sheetId = sheetIdMatch[1];
      
      // Get the master sheet ID from storage
      chrome.storage.local.get([STORAGE_KEY_MASTER_SHEET], (result) => {
        const isMasterSheet = result[STORAGE_KEY_MASTER_SHEET] === sheetId;
        sendResponse({ 
          isMasterSheet: isMasterSheet,
          sheetId: sheetId,
          tabUrl: currentTabUrl,
          tabId: tabs[0].id
        });
      });
    });
    return true; // Required for async sendResponse
  }
  
  // Handler to refresh the overview sheet in Google Sheets
  else if (request.action === "refreshOverviewSheet") {
    console.log("Refresh overview sheet request received");
    chrome.storage.local.get([STORAGE_KEY_MASTER_SHEET], (result) => {
      if (result[STORAGE_KEY_MASTER_SHEET]) {
        refreshOverviewContent(result[STORAGE_KEY_MASTER_SHEET])
          .then(() => {
            console.log("Overview sheet refreshed successfully");
            sendResponse({ success: true });
          })
          .catch(error => {
            console.error("Error refreshing overview:", error);
            sendResponse({ success: false, error: error.message });
          });
      } else {
        console.log("No master sheet found to refresh");
        sendResponse({ success: false, error: "No master sheet found" });
      }
    });
    return true; // Required for async sendResponse
  }
});
// =============================================================================
// AUTHENTICATION FUNCTIONS
// =============================================================================

/**
* Request authorization token from Chrome
* @returns {Promise<string>} Auth token
*/
async function getAuthToken() {
  return new Promise((resolve, reject) => {
    // First check if we have a cached token
    chrome.storage.local.get(['revpilot_authToken', 'revpilot_authTokenExpiry'], (result) => {
      const now = Date.now();
      
      // If token exists and is not expired, use it
      if (result.revpilot_authToken && result.revpilot_authTokenExpiry && now < result.revpilot_authTokenExpiry) {
        authToken = result.revpilot_authToken;
        
        // If token will expire in the next 15 minutes, refresh in background
        if (result.revpilot_authTokenExpiry - now < 900000) {
          // Refresh token in background but return current valid token
          setTimeout(() => {
            chrome.identity.getAuthToken({ interactive: false }, (token) => {
              if (chrome.runtime.lastError) {
                console.warn("Background token refresh failed:", chrome.runtime.lastError.message);
                return;
              }
              
              if (token) {
                authToken = token;
                
                // Cache the token with expiry
                const expiry = Date.now() + (SECONDS_TO_CACHE_TOKEN * 1000);
                chrome.storage.local.set({ 
                  revpilot_authToken: token, 
                  revpilot_authTokenExpiry: expiry 
                });
                
                console.log('Token refreshed in background');
              }
            });
          }, 0);
        }
        
        resolve(authToken);
        return;
      }
      
      // Otherwise, request a new token
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          console.error("Authentication error:", chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (!token) {
          reject(new Error("Authentication failed: No token received"));
          return;
        }
        
        authToken = token;
        
        // Cache the token with expiry
        const expiry = Date.now() + (SECONDS_TO_CACHE_TOKEN * 1000);
        chrome.storage.local.set({ 
          revpilot_authToken: token, 
          revpilot_authTokenExpiry: expiry 
        });
        
        resolve(token);
      });
    });
  });
}
// =============================================================================
// NETWORK AND API UTILITY FUNCTIONS
// =============================================================================
/**
* Makes a fetch request with exponential backoff for rate limiting 
* @param {string} url - URL to fetch
* @param {Object} options - Fetch options
* @param {number} maxRetries - Maximum number of retries
* @param {number} initialDelay - Initial delay in ms
* @returns {Promise<Object>} - Response data
*/
async function fetchWithRetry(url, options, maxRetries = 3, initialDelay = 1000) {
  let delay = initialDelay;
  let retries = 0;
  
  while (true) {
    try {
      console.log(`Attempt ${retries + 1}/${maxRetries + 1} for URL: ${url}`);
      
      const response = await fetch(url, options);
      
      // Log response status
      console.log(`Response status: ${response.status}`);
      
      // If rate limited, retry with backoff
      if (response.status === 429) {
        if (retries >= maxRetries) {
          throw new Error(`Rate limit exceeded after ${maxRetries} retries`);
        }
        
        // Get retry time from header or use default
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delay;
        
        console.log(`Rate limited. Retrying in ${waitTime}ms...`);
        
        // Wait for the specified delay before retrying
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Exponential backoff
        delay *= 2;
        retries++;
        continue;
      }
      
      // Handle unauthorized (token expired) - retry with fresh token
      if (response.status === 401) {
        console.log("Token expired, refreshing...");
        
        // Invalidate current token
        await new Promise(resolve => {
          chrome.identity.removeCachedAuthToken({ token: authToken }, resolve);
        });
        
        // Get fresh token
        authToken = null; // Clear the token first
        authToken = await getAuthToken();
        
        console.log("Got new auth token, retrying request");
        
        // Update options with new token
        if (!options.headers) options.headers = {};
        options.headers['Authorization'] = `Bearer ${authToken}`;
        
        if (retries < maxRetries) {
          retries++;
          continue;
        } else {
          throw new Error(`Authentication failed after ${maxRetries} retries`);
        }
      }
      
      // Handle other error cases
      if (!response.ok) {
        let errorMessage = `HTTP error ${response.status}: ${response.statusText}`;
        
        try {
          const errorData = await response.json();
          console.error("API error response:", errorData);
          if (errorData.error && errorData.error.message) {
            errorMessage = errorData.error.message;
          }
        } catch (jsonError) {
          // If we can't parse the error as JSON, just use the status text
          console.error("Could not parse error response as JSON");
        }
        
        throw new Error(errorMessage);
      }
      
      // Success - return data
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          console.log("Successful response data received");
          return data;
        } else {
          // For non-JSON responses
          const text = await response.text();
          console.log("Successful non-JSON response received");
          try {
            // Try to parse as JSON anyway in case content-type is wrong
            return JSON.parse(text);
          } catch (e) {
            // Return as text if not JSON
            return text;
          }
        }
      } catch (jsonError) {
        console.error("Error parsing response:", jsonError);
        throw new Error("Failed to parse response data");
      }
    } catch (error) {
      console.error(`Network error (attempt ${retries + 1}/${maxRetries + 1}):`, error);
      
      // For network errors, also retry
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        if (retries >= maxRetries) {
          throw new Error(`Network error after ${maxRetries} retries: ${error.message}`);
        }
        
        console.log(`Network error. Retrying in ${delay}ms...`);
        
        // Wait for the specified delay before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Exponential backoff
        delay *= 2;
        retries++;
        continue;
      }
      
      // For other errors, just throw
      throw error;
    }
  }
}

/**
 * Update data in a specific sheet
 * @param {string} spreadsheetId - ID of the spreadsheet
 * @param {string} sheetName - Name of the sheet to update
 * @param {Array} data - 2D array of data to write
 * @returns {Promise<Object>} Response data
 */
async function updateSheetData(spreadsheetId, sheetName, data) {
  try {
    if (!authToken) {
      authToken = await getAuthToken();
    }
    
    return await fetchWithRetry(
      `${SHEET_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        range: sheetName,
        majorDimension: 'ROWS',
        values: data
      })
    });
  } catch (error) {
    console.error("Error updating sheet data:", error);
    throw error;
  }
}

/**
 * Get details about a spreadsheet, including sheets and their properties
 * @param {string} spreadsheetId - ID of the spreadsheet
 * @param {boolean} forceRefresh - Whether to force cache refresh
 * @returns {Promise<Object>} Response data
 */
async function getSheetDetails(spreadsheetId, forceRefresh = false) {
  try {
    console.log(`Getting sheet details for: ${spreadsheetId}, force refresh: ${forceRefresh}`);
    
    if (!authToken) {
      authToken = await getAuthToken();
    }
    
    // Enhanced logging
    console.log(`Using auth token: ${authToken ? 'Valid token present' : 'No token'}`);
    
    // Create a unique URL with cache busting if force refresh
    const cacheParam = forceRefresh ? `&_=${Date.now()}` : '';
    const url = `${SHEET_API_BASE}/${spreadsheetId}?fields=sheets.properties${cacheParam}`;
    
    // Detailed request options
    const options = {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Accept': 'application/json'
      }
    };
    
    console.log(`Fetching from URL: ${url}`);
    const data = await fetchWithRetry(url, options);
    console.log("Sheet details retrieved successfully:", data);
    
    return data;
  } catch (error) {
    console.error("Error getting sheet details:", error);
    throw error;
  }
}

// =============================================================================
// MASTER SPREADSHEET MANAGEMENT
// =============================================================================
/**
 * Get or create the master spreadsheet with enhanced professional design
 * @returns {Promise<Object>} Master spreadsheet data
 */
 async function getMasterSpreadsheet() {
  try {
    if (!authToken) {
      authToken = await getAuthToken();
    }
    
    // Check if we already have the master sheet ID stored
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([STORAGE_KEY_MASTER_SHEET], async (result) => {
        const masterSheetId = result[STORAGE_KEY_MASTER_SHEET];
        
        if (masterSheetId) {
          try {
            // Verify that the sheet still exists and we have access
            const data = await fetchWithRetry(`${SHEET_API_BASE}/${masterSheetId}?fields=spreadsheetId,spreadsheetUrl,properties.title`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${authToken}`
              }
            });
            
            console.log("Master sheet verified with ID:", masterSheetId);
            resolve({
              spreadsheetId: data.spreadsheetId,
              spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}`
            });
            return;
          } catch (error) {
            console.warn("Error verifying existing master sheet, will create a new one:", error);
            // We'll continue to create a new one below
          }
        } else {
          console.log("No master sheet ID found in storage, will create a new one");
        }
        
        // Create a new master spreadsheet if we don't have one or verification failed
        try {
          console.log("Creating new master spreadsheet...");
          const year = new Date().getFullYear();
          
          const data = await fetchWithRetry(SHEET_API_BASE, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              properties: {
                title: `${MASTER_SHEET_TITLE} ${year}`
              },
              sheets: [
                {
                  properties: {
                    title: 'Overview',
                    gridProperties: {
                      rowCount: 100,
                      columnCount: 15
                    },
                    tabColor: {
                      red: 0.0,
                      green: 0.47, 
                      blue: 0.84
                    }
                  }
                }
              ]
            })
          });
          
          if (!data || !data.spreadsheetId) {
            console.error("Failed to create master spreadsheet - no valid response received");
            reject(new Error("Failed to create master spreadsheet: Invalid API response"));
            return;
          }
          
          console.log("Successfully created master spreadsheet, now creating overview sheet");
          
          // Add enhanced overview content to the first sheet
          await createEnhancedOverviewSheet(data.spreadsheetId);
          
          // Save the master sheet ID for future use
          chrome.storage.local.set({ [STORAGE_KEY_MASTER_SHEET]: data.spreadsheetId }, () => {
            if (chrome.runtime.lastError) {
              console.warn("Warning: Failed to save master sheet ID to storage:", chrome.runtime.lastError);
            } else {
              console.log("Saved master spreadsheet ID to storage:", data.spreadsheetId);
            }
          });
          
          console.log("New master spreadsheet created with ID:", data.spreadsheetId);
          resolve({
            spreadsheetId: data.spreadsheetId,
            spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}`
          });
        } catch (error) {
          console.error("Failed to create master spreadsheet:", error);
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error("Error in getMasterSpreadsheet:", error);
    throw error;
  }
}

/**
 * Create enhanced overview sheet in the master spreadsheet with professional design
 * 
 * This function creates a professional dashboard-like overview sheet with
 * metrics, styling, and proper structure. It includes formula-based metrics
 * that update automatically.
 * 
 * @param {string} spreadsheetId - ID of the master spreadsheet
 * @returns {Promise<void>}
 */
 async function createEnhancedOverviewSheet(spreadsheetId) {
  try {
    if (!authToken) {
      authToken = await getAuthToken();
    }
    
    const year = new Date().getFullYear();
    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
    
    // Create a professionally designed overview page
    const overviewData = [
      [`Account Plan Dashboard ${year}`], // A1: Title
      [''], // A2: Empty row
      ['Created: ' + currentDate], // A3: Creation date
      ['Last Updated: ' + currentDate], // A4: Last updated
      [''], // A5: Empty row
      ['Welcome to your account management dashboard'], // A6: Welcome message
      ['Track, manage, and optimize your strategic account relationships in one place'], // A7: Instruction
      [''], // A8: Empty row
      ['DASHBOARD METRICS'], // A9: Metrics header
      [''], // A10: Empty row
      ['Total Accounts', 'High Priority', 'Medium Priority', 'Low Priority', 'Total Value'],
      ['=COUNTA(A18:A100)', '=COUNTIF(D18:D100,"High")', '=COUNTIF(D18:D100,"Medium")', '=COUNTIF(D18:D100,"Low")', '=SUM(F18:F100)'],
      [''], // A13: Empty row
      [''], // A14: Empty row
      ['ACCOUNT OVERVIEW:'], // A15: Accounts header
      [''], // A16: Empty row
      // Table headers in row 17
      ['Account Name', 'Last Activity', 'Status', 'Priority', 'Owner', 'Annual Value', 'Next Action']
      // Account data will be added here dynamically
    ];
    
    // Update the Overview sheet with the enhanced overview data
    await updateSheetData(spreadsheetId, 'Overview', overviewData);
    
    // Apply enhanced formatting to the sheet
    await applyEnhancedOverviewFormatting(spreadsheetId);
    
    return;
  } catch (error) {
    console.error("Error creating enhanced overview sheet:", error);
    // Make this non-critical - don't throw the error
    // but ensure basic functionality works even if formatting fails
  }
}

// =============================================================================
// ENHANCED SHEET FORMATTING FUNCTIONS
// =============================================================================

/**
 * Apply enhanced formatting to the overview sheet for a professional dashboard look
 * 
 * This function applies professional formatting to the overview sheet,
 * including metrics dashboard, account table, and conditional formatting
 * for priority levels to provide at-a-glance status visibility.
 * 
 * @param {string} spreadsheetId - ID of the spreadsheet
 * @returns {Promise<boolean>} Success status
 */
 async function applyEnhancedOverviewFormatting(spreadsheetId) {
  try {
    // Get sheet IDs first to ensure we reference the right sheets
    const sheetInfo = await getSheetDetails(spreadsheetId);
    
    // Find the Overview sheet ID
    let overviewSheetId = null;
    if (sheetInfo.sheets) {
      for (const sheet of sheetInfo.sheets) {
        if (sheet.properties && sheet.properties.title === 'Overview') {
          overviewSheetId = sheet.properties.sheetId;
          break;
        }
      }
    }
    
    if (!overviewSheetId) {
      console.log("Overview sheet not found, skipping formatting");
      return false;
    }
    
    // Apply enhanced formatting with full features
    await fetchWithRetry(`${SHEET_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          // Format title row with professional blue header
          {
            repeatCell: {
              range: {
                sheetId: overviewSheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: 8
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.0,
                    green: 0.47,
                    blue: 0.84
                  },
                  textFormat: {
                    foregroundColor: {
                      red: 1.0,
                      green: 1.0,
                      blue: 1.0
                    },
                    fontSize: 18,
                    bold: true
                  },
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
          },
          
          // Format the creation date with light blue background
          {
            repeatCell: {
              range: {
                sheetId: overviewSheetId,
                startRowIndex: 2,
                endRowIndex: 4,
                startColumnIndex: 0,
                endColumnIndex: 8
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.95,
                    green: 0.95,
                    blue: 1.0
                  },
                  textFormat: {
                    italic: true
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          
          // Format welcome message
          {
            repeatCell: {
              range: {
                sheetId: overviewSheetId,
                startRowIndex: 5,
                endRowIndex: 6,
                startColumnIndex: 0,
                endColumnIndex: 8
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    bold: true,
                    fontSize: 14
                  },
                  horizontalAlignment: 'LEFT'
                }
              },
              fields: 'userEnteredFormat(textFormat,horizontalAlignment)'
            }
          },
          
          // Format dashboard metrics header
          {
            repeatCell: {
              range: {
                sheetId: overviewSheetId,
                startRowIndex: 8,
                endRowIndex: 9,
                startColumnIndex: 0,
                endColumnIndex: 8
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.9,
                    green: 0.9,
                    blue: 0.9
                  },
                  textFormat: {
                    bold: true
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          
          // Format metrics table headers
          {
            repeatCell: {
              range: {
                sheetId: overviewSheetId,
                startRowIndex: 10,
                endRowIndex: 11,
                startColumnIndex: 0,
                endColumnIndex: 5
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.95,
                    green: 0.95,
                    blue: 0.95
                  },
                  textFormat: {
                    bold: true
                  },
                  horizontalAlignment: 'CENTER'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
            }
          },
          
          // Format metrics table values
          {
            repeatCell: {
              range: {
                sheetId: overviewSheetId,
                startRowIndex: 11,
                endRowIndex: 12,
                startColumnIndex: 0,
                endColumnIndex: 5
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 1.0,
                    green: 1.0,
                    blue: 0.95
                  },
                  textFormat: {
                    bold: true
                  },
                  horizontalAlignment: 'CENTER'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
            }
          },
          
          // Format account overview header
          {
            repeatCell: {
              range: {
                sheetId: overviewSheetId,
                startRowIndex: 14,
                endRowIndex: 15,
                startColumnIndex: 0,
                endColumnIndex: 8
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.9,
                    green: 0.9,
                    blue: 0.9
                  },
                  textFormat: {
                    bold: true
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          
          // Format account table headers
          {
            repeatCell: {
              range: {
                sheetId: overviewSheetId,
                startRowIndex: 16,
                endRowIndex: 17,
                startColumnIndex: 0,
                endColumnIndex: 7
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.0,
                    green: 0.47,
                    blue: 0.84
                  },
                  textFormat: {
                    foregroundColor: {
                      red: 1.0,
                      green: 1.0,
                      blue: 1.0
                    },
                    bold: true
                  },
                  horizontalAlignment: 'CENTER',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
          },
          
          // Add borders to the account table
          {
            updateBorders: {
              range: {
                sheetId: overviewSheetId,
                startRowIndex: 16,
                endRowIndex: 17,
                startColumnIndex: 0,
                endColumnIndex: 7
              },
              top: {
                style: 'SOLID',
                width: 2,
                color: { red: 0.0, green: 0.0, blue: 0.0 }
              },
              bottom: {
                style: 'SOLID',
                width: 2,
                color: { red: 0.0, green: 0.0, blue: 0.0 }
              }
            }
          },
          
          // Format column widths for better readability
          {
            updateDimensionProperties: {
              range: {
                sheetId: overviewSheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: 1
              },
              properties: {
                pixelSize: 200
              },
              fields: 'pixelSize'
            }
          },
          
          // Format second column (Last Activity)
          {
            updateDimensionProperties: {
              range: {
                sheetId: overviewSheetId,
                dimension: 'COLUMNS',
                startIndex: 1,
                endIndex: 2
              },
              properties: {
                pixelSize: 120
              },
              fields: 'pixelSize'
            }
          },
          
          // Auto-resize other columns
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId: overviewSheetId,
                dimension: 'COLUMNS',
                startIndex: 2,
                endIndex: 7
              }
            }
          }
        ]
      })
    });
    
    // Add conditional formatting for priority cells
    await fetchWithRetry(`${SHEET_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          // High priority - red background
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 17,
                    endRowIndex: 100,
                    startColumnIndex: 3,
                    endColumnIndex: 4
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'High' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.95,
                      green: 0.8,
                      blue: 0.8
                    }
                  }
                }
              },
              index: 0
            }
          },
          
          // Medium priority - yellow background
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 17,
                    endRowIndex: 100,
                    startColumnIndex: 3,
                    endColumnIndex: 4
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Medium' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 1.0,
                      green: 0.95,
                      blue: 0.8
                    }
                  }
                }
              },
              index: 1
            }
          },
          
          // Low priority - green background
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 17,
                    endRowIndex: 100,
                    startColumnIndex: 3,
                    endColumnIndex: 4
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Low' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.85,
                      green: 0.95,
                      blue: 0.85
                    }
                  }
                }
              },
              index: 2
            }
          }
        ]
      })
    });
    
    return true;
  } catch (error) {
    console.error("Error applying enhanced overview formatting:", error);
    // Don't throw - treat formatting as non-critical
    return false;
  }
}

/**
 * Apply enhanced account plan formatting with professional styling
 * 
 * This function applies professional formatting to individual account plan sheets
 * including section headers, text styling, column widths, and conditional formatting
 * to improve readability and visual hierarchy.
 * 
 * @param {string} spreadsheetId - ID of the spreadsheet
 * @param {string} sheetName - Name of the sheet to format
 * @returns {Promise<boolean>} Success status
 */
 async function applyEnhancedAccountPlanFormatting(spreadsheetId, sheetName) {
  try {
    if (!authToken) {
      authToken = await getAuthToken();
    }
    
    // Get the sheet ID by name
    const sheetInfo = await getSheetDetails(spreadsheetId);
    
    // Find the sheet ID
    let sheetId = null;
    if (sheetInfo.sheets) {
      for (const sheet of sheetInfo.sheets) {
        if (sheet.properties && sheet.properties.title === sheetName) {
          sheetId = sheet.properties.sheetId;
          break;
        }
      }
    }
    
    if (!sheetId) {
      console.warn(`Sheet "${sheetName}" not found`);
      return false;
    }
    
    // Apply enhanced formatting to match your template exactly
    await fetchWithRetry(`${SHEET_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          // Set tab color
          {
            updateSheetProperties: {
              properties: {
                sheetId: sheetId,
                tabColor: {
                  red: 0.0,
                  green: 0.47,
                  blue: 0.84
                }
              },
              fields: "tabColor"
            }
          },
          
          // Format title section with professional blue header
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 0,
                endRowIndex: 2,
                startColumnIndex: 0,
                endColumnIndex: 8
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.0,
                    green: 0.47,
                    blue: 0.84
                  },
                  textFormat: {
                    foregroundColor: {
                      red: 1.0,
                      green: 1.0,
                      blue: 1.0
                    },
                    fontSize: 14,
                    bold: true
                  },
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
          },
          
          // Format section headers (ACCOUNT PROFILE, EXECUTIVE SUMMARY, etc.)
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 4,
                endRowIndex: 5,
                startColumnIndex: 0,
                endColumnIndex: 8
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.9,
                    green: 0.9,
                    blue: 0.95
                  },
                  textFormat: {
                    bold: true
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          
          // Format the EXECUTIVE SUMMARY section header
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 17,
                endRowIndex: 18,
                startColumnIndex: 0,
                endColumnIndex: 8
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.9,
                    green: 0.9,
                    blue: 0.95
                  },
                  textFormat: {
                    bold: true
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          
          // Format the STRATEGIC OVERVIEW section header
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 24,
                endRowIndex: 25,
                startColumnIndex: 0,
                endColumnIndex: 8
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.9,
                    green: 0.9,
                    blue: 0.95
                  },
                  textFormat: {
                    bold: true
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          
          // Format the KEY CONTACTS section header
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 33,
                endRowIndex: 34,
                startColumnIndex: 0,
                endColumnIndex: 8
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.9,
                    green: 0.9,
                    blue: 0.95
                  },
                  textFormat: {
                    bold: true
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          
          // Format the KEY CONTACTS table headers
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 35,
                endRowIndex: 36,
                startColumnIndex: 0,
                endColumnIndex: 6
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.95,
                    green: 0.95,
                    blue: 0.95
                  },
                  textFormat: {
                    bold: true
                  },
                  horizontalAlignment: 'CENTER'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
            }
          },
          
          // Format field labels (left column) with bold text
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 6,
                endRowIndex: 16,
                startColumnIndex: 0,
                endColumnIndex: 1
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    bold: true
                  }
                }
              },
              fields: 'userEnteredFormat.textFormat'
            }
          },
          
          // Format field labels for Executive Summary with bold text
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 19,
                endRowIndex: 23,
                startColumnIndex: 0,
                endColumnIndex: 1
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    bold: true
                  }
                }
              },
              fields: 'userEnteredFormat.textFormat'
            }
          },
          
          // Format field labels for Strategic Overview with bold text
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 26,
                endRowIndex: 32,
                startColumnIndex: 0,
                endColumnIndex: 1
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    bold: true
                  }
                }
              },
              fields: 'userEnteredFormat.textFormat'
            }
          },
          
          // Add borders to the key contacts table
          {
            updateBorders: {
              range: {
                sheetId: sheetId,
                startRowIndex: 35,
                endRowIndex: 39,
                startColumnIndex: 0,
                endColumnIndex: 6
              },
              top: {
                style: 'SOLID',
                width: 1,
                color: { red: 0.5, green: 0.5, blue: 0.5 }
              },
              bottom: {
                style: 'SOLID',
                width: 1,
                color: { red: 0.5, green: 0.5, blue: 0.5 }
              },
              left: {
                style: 'SOLID',
                width: 1,
                color: { red: 0.5, green: 0.5, blue: 0.5 }
              },
              right: {
                style: 'SOLID',
                width: 1,
                color: { red: 0.5, green: 0.5, blue: 0.5 }
              },
              innerHorizontal: {
                style: 'SOLID',
                width: 1,
                color: { red: 0.5, green: 0.5, blue: 0.5 }
              },
              innerVertical: {
                style: 'SOLID',
                width: 1,
                color: { red: 0.5, green: 0.5, blue: 0.5 }
              }
            }
          },
          
          // Set column width for first column (labels)
          {
            updateDimensionProperties: {
              range: {
                sheetId: sheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: 1
              },
              properties: {
                pixelSize: 180 // Width for the first column with labels
              },
              fields: 'pixelSize'
            }
          },
          
          // Set column width for content column
          {
            updateDimensionProperties: {
              range: {
                sheetId: sheetId,
                dimension: 'COLUMNS',
                startIndex: 1,
                endIndex: 2
              },
              properties: {
                pixelSize: 400 // Width for content column
              },
              fields: 'pixelSize'
            }
          },
          
          // Enable text wrapping for content cells
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 6,
                endRowIndex: 39,
                startColumnIndex: 1,
                endColumnIndex: 8
              },
              cell: {
                userEnteredFormat: {
                  wrapStrategy: 'WRAP'
                }
              },
              fields: 'userEnteredFormat.wrapStrategy'
            }
          }
        ]
      })
    });
    
    // Add data validation (dropdowns)
    await fetchWithRetry(`${SHEET_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          // Account Status dropdown (Active, On Hold, Churned)
          {
            setDataValidation: {
              range: {
                sheetId: sheetId,
                startRowIndex: 11,
                endRowIndex: 12,
                startColumnIndex: 1,
                endColumnIndex: 2
              },
              rule: {
                condition: {
                  type: 'ONE_OF_LIST',
                  values: [
                    { userEnteredValue: 'Active' },
                    { userEnteredValue: 'On Hold' },
                    { userEnteredValue: 'Churned' }
                  ]
                },
                strict: true,
                showCustomUi: true
              }
            }
          },
          
          // Region dropdown
          {
            setDataValidation: {
              range: {
                sheetId: sheetId,
                startRowIndex: 14,
                endRowIndex: 15,
                startColumnIndex: 1,
                endColumnIndex: 2
              },
              rule: {
                condition: {
                  type: 'ONE_OF_LIST',
                  values: [
                    { userEnteredValue: 'North America' },
                    { userEnteredValue: 'EMEA' },
                    { userEnteredValue: 'APAC' },
                    { userEnteredValue: 'LATAM' }
                  ]
                },
                strict: false,
                showCustomUi: true
              }
            }
          },
          
          // Role dropdown for Key Contacts
          {
            setDataValidation: {
              range: {
                sheetId: sheetId,
                startRowIndex: 36,
                endRowIndex: 39,
                startColumnIndex: 4,
                endColumnIndex: 5
              },
              rule: {
                condition: {
                  type: 'ONE_OF_LIST',
                  values: [
                    { userEnteredValue: 'Decision Maker' },
                    { userEnteredValue: 'Influencer' },
                    { userEnteredValue: 'Champion' },
                    { userEnteredValue: 'User' },
                    { userEnteredValue: 'Technical Contact' }
                  ]
                },
                strict: false,
                showCustomUi: true
              }
            }
          }
        ]
      })
    });
    
    return true;
  } catch (error) {
    console.error("Error applying enhanced account plan formatting:", error);
    return false;
  }
}

/**
 * Apply simple formatting to account plan sheets - a fallback when advanced formatting fails
 * @param {string} spreadsheetId - ID of the spreadsheet
 * @param {string} sheetName - Name of the sheet
 * @returns {Promise<boolean>} Success status
 */
 async function applySimplifiedAccountPlanFormatting(spreadsheetId, sheetName) {
  try {
    if (!authToken) {
      authToken = await getAuthToken();
    }
    
    // Get the sheet ID by name
    const sheetInfo = await getSheetDetails(spreadsheetId);
    
    // Find the sheet ID
    let sheetId = null;
    if (sheetInfo.sheets) {
      for (const sheet of sheetInfo.sheets) {
        if (sheet.properties && sheet.properties.title === sheetName) {
          sheetId = sheet.properties.sheetId;
          break;
        }
      }
    }
    
    if (!sheetId) {
      console.warn(`Sheet "${sheetName}" not found`);
      return false;
    }
    
    // Apply simplified formatting without conditional formatting
    await fetchWithRetry(`${SHEET_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          // Set sheet background to white for clean look
          {
            updateSheetProperties: {
              properties: {
                sheetId: sheetId,
                gridProperties: {
                  hideGridlines: false
                },
                tabColor: {
                  red: 0.0,
                  green: 0.47,
                  blue: 0.84
                }
              },
              fields: "gridProperties.hideGridlines,tabColor"
            }
          },
          
          // Format title and date (rows 0-1) - professional blue header
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 0,
                endRowIndex: 2,
                startColumnIndex: 0,
                endColumnIndex: 15
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.0,
                    green: 0.47,
                    blue: 0.84
                  },
                  textFormat: {
                    foregroundColor: {
                      red: 1.0,
                      green: 1.0,
                      blue: 1.0
                    },
                    fontSize: 14,
                    bold: true
                  },
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
          },
          
          // Format section labels with bold text
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 4,
                endRowIndex: 100,
                startColumnIndex: 0,
                endColumnIndex: 1
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    bold: true
                  }
                }
              },
              fields: 'userEnteredFormat.textFormat'
            }
          },
          
          // Auto-resize columns for better readability
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId: sheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: 15
              }
            }
          }
        ]
      })
    });
    
    return true;
  } catch (error) {
    console.error("Error applying simplified account plan formatting:", error);
    // Don't throw - treat formatting as non-critical
    return false;
  }
}

/**
 * Apply simplified formatting to the overview sheet to avoid conditional formatting errors
 * @param {string} spreadsheetId - ID of the spreadsheet
 * @returns {Promise<boolean>} Success status
 */
async function applySimplifiedOverviewFormatting(spreadsheetId) {
  try {
    if (!authToken) {
      authToken = await getAuthToken();
    }
    
    // Get sheet IDs first to ensure we reference the right sheets
    const sheetInfo = await getSheetDetails(spreadsheetId);
    
    // Find the Overview sheet ID
    let overviewSheetId = null;
    if (sheetInfo.sheets) {
      for (const sheet of sheetInfo.sheets) {
        if (sheet.properties && sheet.properties.title === 'Overview') {
          overviewSheetId = sheet.properties.sheetId;
          break;
        }
      }
    }
    
    if (!overviewSheetId) {
      console.log("Overview sheet not found, skipping formatting");
      return false;
    }
    
    // Apply simplified formatting with only supported features
    await fetchWithRetry(`${SHEET_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          // Format header row
          {
            repeatCell: {
              range: {
                sheetId: overviewSheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: 7
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.0,
                    green: 0.47,
                    blue: 0.84
                  },
                  textFormat: {
                    foregroundColor: {
                      red: 1.0,
                      green: 1.0,
                      blue: 1.0
                    },
                    fontSize: 18,
                    bold: true
                  },
                  horizontalAlignment: 'CENTER',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
          },
          // Format the column headers row
          {
            repeatCell: {
              range: {
                sheetId: overviewSheetId,
                startRowIndex: 16,
                endRowIndex: 17,
                startColumnIndex: 0,
                endColumnIndex: 7
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.93,
                    green: 0.95,
                    blue: 0.98
                  },
                  textFormat: {
                    bold: true
                  },
                  horizontalAlignment: 'CENTER'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
            }
          },
          // Auto-resize columns
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId: overviewSheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: 7
              }
            }
          }
        ]
      })
    });
    
    return true;
  } catch (error) {
    console.error("Error applying simplified overview formatting:", error);
    // Don't throw - treat formatting as non-critical
    return false;
  }
}
// =============================================================================
// ACCOUNT PLAN SHEET MANAGEMENT
// =============================================================================

/**
 * Create enhanced template data for an account plan with professional structure
 * 
 * This function creates a well-structured template for each account plan
 * with sections for profile, executive summary, strategic overview, and contacts.
 * It includes default values for dropdown fields.
 * 
 * @param {string} accountName - Name of the account
 * @returns {Array} Template data as a 2D array
 */
 function createEnhancedAccountPlanTemplateData(accountName) {
  // Get current date
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  // Create template exactly matching your CSV format
  const templateData = [
    // Header section
    [`${accountName} - Strategic Account Plan`],
    [`Created: ${currentDate}`],
    [''],
    
    // Account Profile section
    ['ACCOUNT PROFILE'],
    [''],
    ['Account Name:', accountName],
    ['Industry:', ''],
    ['Annual Revenue ($):', ''],
    ['Company Size:', ''],
    ['Website:', ''],
    ['LinkedIn:', ''],
    ['Account Status:', 'Active'], // Default value for dropdown
    ['Account Owner:', ''],
    ['Region:', 'North America'], // Default value for dropdown
    ['Last Updated:', currentDate],
    [''],
    
    // Executive Summary section
    ['EXECUTIVE SUMMARY'],
    [''],
    ['Current Situation:', ''],
    ['Key Pain Points:', ''],
    ['Value Proposition:', ''],
    ['Success Metrics:', ''],
    [''],
    
    // Strategic Overview section
    ['STRATEGIC OVERVIEW'],
    [''],
    ['Business Challenges:', ''],
    ['Strategic Goals:', ''],
    ['Our Solution:', ''],
    ['Success Criteria:', ''],
    ['Risks/Concerns:', ''],
    ['Mitigation Strategy:', ''],
    [''],
    
    // Key Contacts section
    ['KEY CONTACTS'],
    [''],
    ['Name', 'Title', 'Email', 'Phone', 'Role', 'Notes'],
    ['', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['']
  ];
  
  return templateData;
}

/**
 * Update the existing createAccountPlanTemplateData function to use the enhanced version
 * This ensures backward compatibility with the extension
 */
function createAccountPlanTemplateData(accountName) {
  return createEnhancedAccountPlanTemplateData(accountName);
}

/**
 * Update formulas in a sheet to ensure they work correctly
 * @param {string} spreadsheetId - ID of the spreadsheet
 * @param {string} sheetName - Name of the sheet
 * @returns {Promise<boolean>} Success status
 */
async function updateSheetFormulas(spreadsheetId, sheetName) {
  try {
    if (!authToken) {
      authToken = await getAuthToken();
    }
    
    // Get the sheet ID
    const sheetInfo = await getSheetDetails(spreadsheetId);
    let sheetId = null;
    
    if (sheetInfo.sheets) {
      for (const sheet of sheetInfo.sheets) {
        if (sheet.properties && sheet.properties.title === sheetName) {
          sheetId = sheet.properties.sheetId;
          break;
        }
      }
    }
    
    if (!sheetId) {
      console.warn(`Sheet "${sheetName}" not found for formula update`);
      return false;
    }
    
    // No formulas needed for the simplified sheet structure
    return true;
  } catch (error) {
    console.error("Error updating sheet formulas:", error);
    return false;
  }
}
/**
 * Create an account plan sheet in the master spreadsheet
 * @param {string} accountName - Name of the account
 * @param {Object} currentTab - Information about the current tab
 * @returns {Promise<Object>} Response with sheet details
 */
 async function createAccountPlanSheet(accountName, currentTab) {
  try {
    if (!accountName) {
      throw new Error("Account name is required");
    }
    
    // Get or create the master spreadsheet
    const masterSheet = await getMasterSpreadsheet();
    
    // Sanitize the account name for use as a sheet title (max 100 chars, no special chars)
    const safeAccountName = accountName.replace(/[\\/?*[\]]/g, '').substring(0, 100);
    
    // Check if a sheet with this name already exists
    const sheetInfo = await getSheetDetails(masterSheet.spreadsheetId);
    
    // Check if a sheet with this account name already exists
    let sheetExists = false;
    let existingSheetId = null;
    
    if (sheetInfo.sheets) {
      for (const sheet of sheetInfo.sheets) {
        if (sheet.properties && sheet.properties.title === safeAccountName) {
          sheetExists = true;
          existingSheetId = sheet.properties.sheetId;
          break;
        }
      }
    }
    
    if (sheetExists) {
      // If the sheet exists, we could either return an error or update the existing sheet
      // For now, let's return an error to prevent accidental overwriting
      throw new Error(`An account plan for "${accountName}" already exists. Please use a different name.`);
    }
    
    // Add a new sheet to the master spreadsheet
    const addSheetResponse = await fetchWithRetry(
      `${SHEET_API_BASE}/${masterSheet.spreadsheetId}:batchUpdate`, 
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: safeAccountName,
                  gridProperties: {
                    rowCount: 200,
                    columnCount: 15
                  }
                }
              }
            }
          ]
        })
      }
    );
    
    // Get the new sheet's ID
    const newSheetId = addSheetResponse.replies[0].addSheet.properties.sheetId;
    
    // Check if we need to use inline navigation
    let isInlineNavigation = false;
    let returnUrl = `${masterSheet.spreadsheetUrl}#gid=${newSheetId}`;
    
    // Enhanced in-sheet navigation logic with improved error handling
    if (currentTab && currentTab.tabUrl) {
      const currentSpreadsheetMatch = currentTab.tabUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      
      if (currentSpreadsheetMatch && currentSpreadsheetMatch[1] === masterSheet.spreadsheetId) {
        isInlineNavigation = true;
        returnUrl = `https://docs.google.com/spreadsheets/d/${masterSheet.spreadsheetId}/edit#gid=${newSheetId}`;
      }
    }
    
    // Return the master spreadsheet ID and relevant information
    return {
      spreadsheetId: masterSheet.spreadsheetId,
      spreadsheetUrl: returnUrl,
      sheetGid: newSheetId,
      isInlineNavigation: isInlineNavigation
    };
  } catch (error) {
    console.error("Error creating account plan sheet:", error);
    throw error;
  }
}

/**
 * Populate an account plan with an enhanced template
 * 
 * This function takes a new account plan and populates it with the template data,
 * then applies all necessary formatting and conditional formatting.
 * 
 * @param {string} spreadsheetId - ID of the spreadsheet
 * @param {Object} accountData - Account data with name
 * @returns {Promise<boolean>} Success status
 */
 async function populateEnhancedAccountPlanTemplate(spreadsheetId, accountData) {
  try {
    console.log(`Starting template population for: ${accountData.accountName}`);
    
    if (!spreadsheetId || !accountData || !accountData.accountName) {
      throw new Error("Spreadsheet ID and account name are required");
    }
    
    if (!authToken) {
      authToken = await getAuthToken();
    }
    
    // Create enhanced template data for the sheet
    const templateData = createEnhancedAccountPlanTemplateData(accountData.accountName);
    
    // Update the sheet with the enhanced template data
    await updateSheetData(spreadsheetId, accountData.accountName, templateData);
    console.log("Template data applied successfully");
    
    // Apply enhanced formatting to match your template
    const formattingSuccess = await applyEnhancedAccountPlanFormatting(spreadsheetId, accountData.accountName);
    console.log(`Formatting applied with result: ${formattingSuccess}`);
    
    // Apply any additional formulas or conditional formatting
    await addFormulasAndConditionalFormatting(spreadsheetId, accountData.accountName);
    
    // Refresh the overview sheet to include this new sheet
    const overviewSuccess = await refreshOverviewContent(spreadsheetId);
    console.log(`Overview refreshed with result: ${overviewSuccess}`);
    
    return true;
  } catch (error) {
    console.error("Error populating enhanced account plan template:", error);
    throw error;
  }
}

/**
 * Update the existing populateAccountPlanTemplate function to use the enhanced version
 * This ensures backward compatibility with the extension
 */
async function populateAccountPlanTemplate(spreadsheetId, accountData) {
  return populateEnhancedAccountPlanTemplate(spreadsheetId, accountData);
}
/**
 * Add formulas and conditional formatting to the account plan sheet
 * 
 * This function adds conditional formatting for status fields and role fields,
 * providing visual cues for different values to improve data interpretation.
 * 
 * @param {string} spreadsheetId - ID of the spreadsheet
 * @param {string} sheetName - Name of the sheet
 * @returns {Promise<boolean>} Success status
 */
 async function addFormulasAndConditionalFormatting(spreadsheetId, sheetName) {
  try {
    if (!authToken) {
      authToken = await getAuthToken();
    }
    
    // Get the sheet ID by name
    const sheetInfo = await getSheetDetails(spreadsheetId);
    
    // Find the sheet ID
    let sheetId = null;
    if (sheetInfo.sheets) {
      for (const sheet of sheetInfo.sheets) {
        if (sheet.properties && sheet.properties.title === sheetName) {
          sheetId = sheet.properties.sheetId;
          break;
        }
      }
    }
    
    if (!sheetId) {
      console.warn(`Sheet "${sheetName}" not found`);
      return false;
    }
    
    // Add conditional formatting for priority and status cells
    await fetchWithRetry(`${SHEET_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          // Conditional formatting for Account Status
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: sheetId,
                    startRowIndex: 11,
                    endRowIndex: 12,
                    startColumnIndex: 1,
                    endColumnIndex: 2
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Active' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.85,
                      green: 0.95,
                      blue: 0.85
                    }
                  }
                }
              },
              index: 0
            }
          },
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: sheetId,
                    startRowIndex: 11,
                    endRowIndex: 12,
                    startColumnIndex: 1,
                    endColumnIndex: 2
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'On Hold' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 1.0,
                      green: 0.95,
                      blue: 0.8
                    }
                  }
                }
              },
              index: 1
            }
          },
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: sheetId,
                    startRowIndex: 11,
                    endRowIndex: 12,
                    startColumnIndex: 1,
                    endColumnIndex: 2
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Churned' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.95,
                      green: 0.8,
                      blue: 0.8
                    }
                  }
                }
              },
              index: 2
            }
          },
          
          // Add conditional formatting for Role column in Key Contacts
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: sheetId,
                    startRowIndex: 36,
                    endRowIndex: 39,
                    startColumnIndex: 4,
                    endColumnIndex: 5
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Decision Maker' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.85,
                      green: 0.85,
                      blue: 0.95
                    },
                    textFormat: {
                      bold: true
                    }
                  }
                }
              },
              index: 3
            }
          },
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: sheetId,
                    startRowIndex: 36,
                    endRowIndex: 39,
                    startColumnIndex: 4,
                    endColumnIndex: 5
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Champion' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.85,
                      green: 0.95,
                      blue: 0.85
                    }
                  }
                }
              },
              index: 4
            }
          }
        ]
      })
    });
    
    return true;
  } catch (error) {
    console.error("Error adding formulas and conditional formatting:", error);
    return false; // Treat as non-critical - continue even if this fails
  }
}
/**
 * Update the existing populateAccountPlanTemplate function to use the enhanced version
 * This ensures backward compatibility with the extension
 */
 async function populateAccountPlanTemplate(spreadsheetId, accountData) {
  return populateEnhancedAccountPlanTemplate(spreadsheetId, accountData);
}
/**
 * Function to refresh the overview sheet content with improved design
 * 
 * This function updates the overview sheet content with all account data
 * and refreshes formatting. It's called when new accounts are created or
 * after account deletion to keep the overview current.
 * 
 * @param {string} spreadsheetId - ID of the master spreadsheet
 * @returns {Promise<boolean>} Success status
 */
 async function refreshOverviewContent(spreadsheetId) {
  try {
    // Get all sheets in the spreadsheet
    const sheetInfo = await getSheetDetails(spreadsheetId);
    
    if (!sheetInfo.sheets) {
      throw new Error("Could not retrieve sheet information");
    }
    
    // Filter out the Overview sheet and collect account sheets
    const accountSheets = sheetInfo.sheets.filter(sheet => 
      sheet.properties && sheet.properties.title !== 'Overview'
    );
    
    // Format the current date
    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
    
    // Prepare data for the overview sheet
    const year = new Date().getFullYear();
    
    // Create the base of the overview data - preserve the header formatting
    const overviewData = [
      [`Account Plan Dashboard ${year}`], // A1: Title
      [''], // A2: Empty row
      ['Created: ' + currentDate], // A3: Creation date
      ['Last Updated: ' + currentDate], // A4: Last updated
      [''], // A5: Empty row
      ['Welcome to your account management dashboard'], // A6: Welcome message
      ['Track, manage, and optimize your strategic account relationships in one place'], // A7: Instruction
      [''], // A8: Empty row
      ['DASHBOARD METRICS'], // A9: Metrics header
      [''], // A10: Empty row
      ['Total Accounts', 'High Priority', 'Medium Priority', 'Low Priority', 'Total Value'],
      ['=COUNTA(A18:A100)', '=COUNTIF(D18:D100,"High")', '=COUNTIF(D18:D100,"Medium")', '=COUNTIF(D18:D100,"Low")', '=SUM(F18:F100)'],
      [''], // A13: Empty row
      [''], // A14: Empty row
      ['ACCOUNT OVERVIEW:'], // A15: Accounts header
      [''], // A16: Empty row
      // Table headers in row 17
      ['Account Name', 'Last Activity', 'Status', 'Priority', 'Owner', 'Annual Value', 'Next Action']
    ];
    
    // Add all account sheets to the overview with default placeholder values
    accountSheets.forEach(sheet => {
      overviewData.push([
        sheet.properties.title,
        currentDate,
        'Active',
        'Medium',
        '',
        0,
        'Review account plan'
      ]);
    });
    
    // Update the Overview sheet with the refreshed data
    await updateSheetData(spreadsheetId, 'Overview', overviewData);
    
    // Apply formatting to ensure the overview looks consistent
    await applyEnhancedOverviewFormatting(spreadsheetId);
    
    return true;
  } catch (error) {
    console.error("Error refreshing overview content:", error);
    throw error;
  }
}
/**
 * Delete an account plan sheet
 * @param {string} spreadsheetId - ID of the spreadsheet
 * @param {string} accountName - Name of the account to delete
 * @param {string} sheetGid - Sheet GID
 * @returns {Promise<Object>} Success status
 */
 async function deleteAccountPlanSheet(spreadsheetId, accountName, sheetGid) {
  try {
    if (!spreadsheetId || !accountName) {
      throw new Error("Spreadsheet ID and account name are required");
    }
    
    // Make sure we have a valid auth token
    if (!authToken) {
      authToken = await getAuthToken();
    }
    
    // Get the sheet ID by name
    const sheetInfo = await getSheetDetails(spreadsheetId);
    
    // Find the sheet ID if not provided
    let sheetId = sheetGid;
    if (!sheetId && sheetInfo.sheets) {
      for (const sheet of sheetInfo.sheets) {
        if (sheet.properties && sheet.properties.title === accountName) {
          sheetId = sheet.properties.sheetId;
          break;
        }
      }
    }
    
    if (!sheetId) {
      throw new Error(`Sheet "${accountName}" not found`);
    }
    
    console.log(`Deleting sheet with ID ${sheetId} for account "${accountName}"`);
    
    // Delete the sheet
    await fetchWithRetry(`${SHEET_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            deleteSheet: {
              sheetId: parseInt(sheetId)
            }
          }
        ]
      })
    });
    
    console.log(`Sheet for "${accountName}" deleted successfully`);
    
    // Refresh the overview sheet to remove this sheet
    let overviewUpdated = false;
    try {
      await refreshOverviewContent(spreadsheetId);
      overviewUpdated = true;
      console.log("Overview sheet refreshed successfully");
    } catch (error) {
      console.warn("Error updating overview after deletion:", error);
      // Continue anyway, the sheet deletion was successful
    }
    
    return {
      success: true,
      overviewUpdated: overviewUpdated
    };
  } catch (error) {
    console.error("Error deleting account plan sheet:", error);
    throw error;
  }
}
