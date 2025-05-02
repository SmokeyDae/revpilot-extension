// =============================================================================
// BACKGROUND.JS - REVPILOT AI CHROME EXTENSION
// =============================================================================
// This script handles authentication, API requests, and sheet generation for 
// the RevPilot AI Account Plan Builder Chrome extension.
// =============================================================================

// =============================================================================
// SECTION 1: CONSTANTS AND GLOBAL VARIABLES
// =============================================================================
let authToken = null;
const SHEET_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const SECONDS_TO_CACHE_TOKEN = 3600; // 1 hour
const MASTER_SHEET_TITLE = "Current Year Account Plan"; // Title for the master spreadsheet
const STORAGE_KEY_MASTER_SHEET = 'revpilot_masterSheetId'; // Key for storing master sheet ID
// =============================================================================
// SECTION 2: INITIALIZATION
// =============================================================================
// Setup token refresh scheduler on load
setupTokenRefreshScheduler();

/**
 * Setup a token refresh scheduler to refresh the auth token periodically
 * Includes improved error handling and race condition prevention
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
                      // Set a timeout to clear the flag in case of hanging operations
                      const timeoutId = setTimeout(() => {
                          console.warn("Token refresh timed out, clearing refresh flag");
                          chrome.storage.local.set({ 'revpilot_tokenRefreshInProgress': false });
                      }, 60000); // 1 minute timeout
                      
                      getAuthToken()
                          .then(token => {
                              console.log("Token refreshed successfully");
                              clearTimeout(timeoutId);
                              chrome.storage.local.set({ 'revpilot_tokenRefreshInProgress': false });
                          })
                          .catch(error => {
                              console.error("Failed to refresh token:", error);
                              clearTimeout(timeoutId);
                              chrome.storage.local.set({ 'revpilot_tokenRefreshInProgress': false });
                          });
                  });
              });
          }
      });
  }, 900000); // 15 minutes
}
// =============================================================================
// SECTION 3: MESSAGE HANDLERS
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
    populateAccountPlanTemplate(request.sheetId, {
      accountName: request.accountData.accountName,
      companyName: request.companyName || 'Your Company' // Include company name
    })
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
    deleteAccountPlanSheet(request.sheetId, request.accountName, request.sheetGid)
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
// SECTION 4: AUTHENTICATION FUNCTIONS
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
// SECTION 5: NETWORK AND API UTILITY FUNCTIONS
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
          console.error("API error response:", JSON.stringify(errorData));
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
    
    // Validate inputs
    if (!spreadsheetId || !sheetName || !Array.isArray(data)) {
      throw new Error("Invalid parameters for updateSheetData");
    }
    
    // Sanitize data to prevent API errors
    const sanitizedData = data.map(row => 
      Array.isArray(row) ? row.map(cell => cell !== null && cell !== undefined ? cell : '') : [String(row)]
    );
    
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
        values: sanitizedData
      })
    });
  } catch (error) {
    // Use centralized error handler if available
    if (typeof RevPilotErrorHandler !== 'undefined') {
      RevPilotErrorHandler.handleApiError(error, 'updateSheetData');
    } else {
      console.error("Error updating sheet data:", error);
    }
    
    // Provide context about what failed
    const enhancedError = new Error(`Failed to update sheet "${sheetName}": ${error.message}`);
    enhancedError.originalError = error;
    throw enhancedError;
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
// SECTION 6: MASTER SPREADSHEET MANAGEMENT
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
      chrome.storage.local.get([STORAGE_KEY_MASTER_SHEET, 'revpilot_companyName'], async (result) => {
        const masterSheetId = result[STORAGE_KEY_MASTER_SHEET];
        const companyName = result['revpilot_companyName'] || 'Your Company'; // Default if no company name
        
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
                title: `${companyName} ${year} Account Plan`
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
          try {
            await createEnhancedOverviewSheet(data.spreadsheetId);
            console.log("Created enhanced overview sheet successfully");
            
            // Also explicitly apply formatting to ensure it's done properly
            await applyEnhancedOverviewFormatting(data.spreadsheetId);
            console.log("Applied enhanced overview formatting successfully");
          } catch (overviewError) {
            console.error("Error creating or formatting overview sheet:", overviewError);
            
            // If enhanced formatting fails, try simplified formatting as fallback
            try {
              await applySimplifiedOverviewFormatting(data.spreadsheetId);
              console.log("Applied simplified overview formatting as fallback");
            } catch (fallbackError) {
              console.error("Even simplified formatting failed:", fallbackError);
            }
          }
          
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
    
    // Get the company name from storage
    const companyData = await new Promise(resolve => {
      chrome.storage.local.get(['revpilot_companyName'], (result) => {
        resolve(result);
      });
    });
    
    const companyName = companyData.revpilot_companyName || 'Your Company';
    const year = new Date().getFullYear();
    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
    
    // Create a professionally designed overview page - UPDATED to match screenshots
    const overviewData = [
      [`${companyName} ${year} Account Plan`], // A1: Title
      [''], // A2: Empty row
      ['Created: ' + currentDate], // A3: Creation date
      ['Last Updated: ' + currentDate], // A4: Last updated
      [''], // A5: Empty row
      ['Welcome to your account management dashboard'], // A6: Welcome message
      ['Track, manage, and optimize your strategic account relationships in one place'], // A7: Instruction
      [''], // A8: Empty row
      ['DASHBOARD METRICS'], // A9: Metrics header
      [''], // A10: Empty row
      ['Total Accounts'], // A11: Only Total Accounts metric is kept
      ['=COUNTA(A19:A100)'], // A12: Formula updated to match new row positioning
      [''], // A13: Empty row
      [''], // A14: Empty row
      ['ACCOUNT OVERVIEW:'], // A15: Accounts header
      [''], // A16: Empty row
      // Table headers in row 17
      ['Account Name', 'Last Activity', 'Status', 'SFDC Link', 'Owner', 'Annual Value', 'Next Action'],
      ['Strategic Accounts (Top 20)'] // A18: Strategic accounts header
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
    
    // Try with simplified formatting as fallback
    try {
      await applySimplifiedOverviewFormatting(spreadsheetId);
      console.log("Applied simplified overview formatting as fallback");
    } catch (fallbackError) {
      console.error("Even simplified formatting failed:", fallbackError);
    }
  }
}


// =============================================================================
// SECTION 7: ACCOUNT PLAN TEMPLATE DATA
// =============================================================================

/**
 * Create enhanced template data for an account plan with professional structure
 * Updated to implement the requested changes to the sheet structure
 * 
 * @param {string} accountName - Name of the account
 * @param {string} companyName - Name of the user's company
 * @returns {Array} Template data as a 2D array
 */
 function createEnhancedAccountPlanTemplateData(accountName, companyName = "Your Company") {
  console.log("Creating template data with new structure for:", accountName, "Company:", companyName);

  // Get current date
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  // Create template with updated layout based on requirements
  const templateData = [
    // Header section - blue background with company name and creation date
    [`${accountName} - Strategic Account Plan`],
    [`Created: ${currentDate}`],
    [''],
    
    // Account Profile section - with adjusted columns for tech stack and added assessment column
    ['Account Name:', '', '', 'Tech Stack:', '', 'Partner Rep:'],
    ['Industry:', '', '', 'SAP', '', ''],
    ['Annual Revenue ($):', '', '', 'Oracle', '', ''],
    ['Company Size:', '', '', 'AWS', '', ''],
    ['Website:', '', '', 'Azure', '', ''],
    ['LinkedIn:', '', '', 'SQL', '', ''],
    ['Account Status:', 'Active', '', 'GCP', '', ''],
    ['Account Owner:', '', '', 'Snowflake', '', ''],
    ['HQ Location:', '', '', 'Databricks', '', ''],
    ['Last Updated:', currentDate],
    [''],
    
    // Add the new "What Does {Account Name} Do:" section here
    [`What Does ${accountName} Do:`],

    // Overview section in the blue-filled cell at A16
    ['Overview'], // This will be moved to a blue-filled cell
    
    
    // Row 17 - Simple text values instead of complex objects
    ['Current Situation:', '', 'Business Challenges:', '', 'Closed/Lost Opportunities:', '', 'Recent Funding / Quarterly Report:'],
    
    // Additional overview sections
    ['Key Pain Points:', '', `${accountName}'s Strategic Goals:`, '', 'Competitors/ Incumbent:'],
    ['Value Proposition:', '', `Why ${companyName}:`, '', 'Research Articles/ News:'],
    ['Success Metrics:', '', `Why ${companyName} Now:`],
    [''],
    [''],
    // Contact table headers
    [''], // Empty row where headers were
    ['Name', 'Persona / Title', 'Notes', 'LinkedIn Profile', 'Phone Number', 'Email Address', 'Location', 'Engagement Status'],
     // Empty row 23 (keep this empty line)



    // C Level Execs row will be at row 25 (index 24) in the array
    ['C Level Execs / Leadership'],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    [''],

    // Managers/Directors row will be at row 32 (index 31) in the array
    ['Managers/ Directors'],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    // Add 5 more rows for Managers/Directors section
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    [''],

    // Individual Contributors row will be at row 38 (index 37) in the array (now shifted down)
    ['Individual Contributors'],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    // Add 17 more rows for Individual Contributors section
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '']
  ];
  
  return templateData;
}


// Update the existing function to use the new template
function createAccountPlanTemplateData(accountName, companyName = "Your Company") {
  return createEnhancedAccountPlanTemplateData(accountName, companyName);
}
// =============================================================================
// SECTION 8: ENHANCED SHEET FORMATTING FUNCTIONS
// =============================================================================
// This section has been updated to change all blue fill colors to #1e40af,
// adjust text color to white for specific cells, and implement other formatting changes

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
    // Find the Overview sheet ID
    for (const sheet of sheetInfo.sheets) {
      if (sheet.properties && sheet.properties.title === 'Overview') {
        overviewSheetId = sheet.properties.sheetId;
        break;
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
                endColumnIndex: 1
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
                endColumnIndex: 1
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
          
          // Format Strategic Accounts header
          {
            repeatCell: {
              range: {
                sheetId: overviewSheetId,
                startRowIndex: 17,
                endRowIndex: 18,
                startColumnIndex: 0,
                endColumnIndex: 7
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.0,
                    green: 0.0,
                    blue: 0.0
                  },
                  textFormat: {
                    foregroundColor: {
                      red: 1.0,
                      green: 1.0,
                      blue: 1.0
                    },
                    bold: true
                  },
                  horizontalAlignment: 'LEFT',
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
          
          // Setting all columns to 230 pixels width for consistent layout
          {
            updateDimensionProperties: {
              range: {
                sheetId: overviewSheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: 7
              },
              properties: {
                pixelSize: 230
              },
              fields: 'pixelSize'          
            }
          }
        ]
      })
    });
    

    
    // Add status dropdown and conditional formatting
    await fetchWithRetry(`${SHEET_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          // Status dropdown for all account rows
          {
            setDataValidation: {
              range: {
                sheetId: overviewSheetId,
                startRowIndex: 18, // Start after headers
                endRowIndex: 100,
                startColumnIndex: 2, // Status column
                endColumnIndex: 3
              },
              rule: {
                condition: {
                  type: 'ONE_OF_LIST',
                  values: [
                    { userEnteredValue: 'PG' },
                    { userEnteredValue: 'Discovery' },
                    { userEnteredValue: 'Scoping' },
                    { userEnteredValue: 'POC' },
                    { userEnteredValue: 'Validation Planning' },
                    { userEnteredValue: 'Technical Validation' },
                    { userEnteredValue: 'Negotiation' },
                    { userEnteredValue: 'Submit for Order Processing' },
                    { userEnteredValue: 'Closed' },
                    { userEnteredValue: 'Hot Prospect - Strategic PG' },
                    { userEnteredValue: 'Channel Engagement' },
                    { userEnteredValue: 'Nurture' },
                    { userEnteredValue: 'Research' },
                    { userEnteredValue: 'Moved From Patch' },
                    { userEnteredValue: 'Disqualified' },
                    { userEnteredValue: 'Customer' },
                    { userEnteredValue: 'Past Customer' }
                  ]
                },
                strict: true,
                showCustomUi: true
              }
            }
          },
          
          // Conditional formatting for PG status (orange)
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 18,
                    endRowIndex: 100,
                    startColumnIndex: 2,
                    endColumnIndex: 3
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'PG' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.9,
                      green: 0.6,
                      blue: 0.2
                    }
                  }
                }
              },
              index: 0
            }
          },
          
          // Conditional formatting for Discovery status (green)
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 18,
                    endRowIndex: 100,
                    startColumnIndex: 2,
                    endColumnIndex: 3
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Discovery' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.2,
                      green: 0.7,
                      blue: 0.4
                    }
                  }
                }
              },
              index: 1
            }
          },
          
          // Conditional formatting for Scoping status (green)
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 18,
                    endRowIndex: 100,
                    startColumnIndex: 2,
                    endColumnIndex: 3
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Scoping' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.2,
                      green: 0.7,
                      blue: 0.4
                    }
                  }
                }
              },
              index: 2
            }
          },
          
          // Conditional formatting for POC status (green)
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 18,
                    endRowIndex: 100,
                    startColumnIndex: 2,
                    endColumnIndex: 3
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'POC' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.2,
                      green: 0.7,
                      blue: 0.4
                    }
                  }
                }
              },
              index: 3
            }
          }
        ]
      })
    });
    
    // Add the rest of the conditional formatting for status values
    await fetchWithRetry(`${SHEET_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          // Validation Planning (green)
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 18,
                    endRowIndex: 100,
                    startColumnIndex: 2,
                    endColumnIndex: 3
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Validation Planning' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.2,
                      green: 0.7,
                      blue: 0.4
                    }
                  }
                }
              },
              index: 4
            }
          },
          
          // Technical Validation (green)
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 18,
                    endRowIndex: 100,
                    startColumnIndex: 2,
                    endColumnIndex: 3
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Technical Validation' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.2,
                      green: 0.7,
                      blue: 0.4
                    }
                  }
                }
              },
              index: 5
            }
          },
          
          // Negotiation (green)
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 18,
                    endRowIndex: 100,
                    startColumnIndex: 2,
                    endColumnIndex: 3
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Negotiation' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.2,
                      green: 0.7,
                      blue: 0.4
                    }
                  }
                }
              },
              index: 6
            }
          },
          
          // Submit for Order Processing (green)
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 18,
                    endRowIndex: 100,
                    startColumnIndex: 2,
                    endColumnIndex: 3
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Submit for Order Processing' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.2,
                      green: 0.7,
                      blue: 0.4
                    }
                  }
                }
              },
              index: 7
            }
          }
        ]
      })
    });
    
    // Finish the remaining status conditional formatting
    await fetchWithRetry(`${SHEET_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          // Closed (green)
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 18,
                    endRowIndex: 100,
                    startColumnIndex: 2,
                    endColumnIndex: 3
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Closed' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.2,
                      green: 0.7,
                      blue: 0.4
                    }
                  }
                }
              },
              index: 8
            }
          },
          
          // Hot Prospect - Strategic PG (red)
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 18,
                    endRowIndex: 100,
                    startColumnIndex: 2,
                    endColumnIndex: 3
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Hot Prospect - Strategic PG' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.8,
                      green: 0.2,
                      blue: 0.2
                    }
                  }
                }
              },
              index: 9
            }
          },
          
          // Channel Engagement (purple)
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 18,
                    endRowIndex: 100,
                    startColumnIndex: 2,
                    endColumnIndex: 3
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Channel Engagement' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.4,
                      green: 0.2,
                      blue: 0.6
                    }
                  }
                }
              },
              index: 10
            }
          },
          
          // Nurture (blue)
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 18,
                    endRowIndex: 100,
                    startColumnIndex: 2,
                    endColumnIndex: 3
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Nurture' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.2,
                      green: 0.4,
                      blue: 0.8
                    }
                  }
                }
              },
              index: 11
            }
          }
        ]
      })
    });
    
    // Final batch of status conditional formatting
    await fetchWithRetry(`${SHEET_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          // Research (blue)
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 18,
                    endRowIndex: 100,
                    startColumnIndex: 2,
                    endColumnIndex: 3
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Research' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.2,
                      green: 0.4,
                      blue: 0.8
                    }
                  }
                }
              },
              index: 12
            }
          },
          
          // Moved From Patch (dark gray)
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 18,
                    endRowIndex: 100,
                    startColumnIndex: 2,
                    endColumnIndex: 3
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Moved From Patch' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.3,
                      green: 0.3,
                      blue: 0.3
                    }
                  }
                }
              },
              index: 13
            }
          },
          
          // Disqualified (dark gray)
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 18,
                    endRowIndex: 100,
                    startColumnIndex: 2,
                    endColumnIndex: 3
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Disqualified' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.3,
                      green: 0.3,
                      blue: 0.3
                    }
                  }
                }
              },
              index: 14
            }
          },
          
          // Customer (purple)
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 18,
                    endRowIndex: 100,
                    startColumnIndex: 2,
                    endColumnIndex: 3
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Customer' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.5,
                      green: 0.3,
                      blue: 0.7
                    }
                  }
                }
              },
              index: 15
            }
          },
          
          // Past Customer (dark orange)
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: overviewSheetId,
                    startRowIndex: 18,
                    endRowIndex: 100,
                    startColumnIndex: 2,
                    endColumnIndex: 3
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Past Customer' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.7,
                      green: 0.4,
                      blue: 0.2
                    }
                  }
                }
              },
              index: 16
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
 * This function has been updated to:
 * 1. Change all blue fill colors to #1e40af
 * 2. Format cell A16 with "Overview" text in white/bold/size 14
 * 3. Adjust row structure for contacts section
 * 4. Apply white text and bold formatting to row headers
 * 5. Make text in row 17 bold
 * 
 * @param {string} spreadsheetId - ID of the spreadsheet
 * @param {string} sheetName - Name of the sheet to format
 * @returns {Promise<boolean>} Success status
 */
 async function applyEnhancedAccountPlanFormatting(spreadsheetId, sheetName) {
  try {
    console.log("Applying enhanced formatting with new structure to sheet:", sheetName);
    if (!spreadsheetId || !sheetName) {
      console.error("Missing spreadsheetId or sheetName in applyEnhancedAccountPlanFormatting");
      return false;
    }

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
    
    console.log("Found sheet ID for formatting:", sheetId);

    // Apply enhanced formatting to match the updated requirements
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
          
          // Format title section with royal blue header - Updated to #1e40af
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 0,
                endRowIndex: 2,
                startColumnIndex: 0,
                endColumnIndex: 10
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.0, // Updated to match #0077d6
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
          
          // Format account profile field labels with bold text (first column)
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 3,
                endRowIndex: 13,
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
          
          // Format tech stack field labels (fourth column per updated requirement)
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 3,
                endRowIndex: 4,
                startColumnIndex: 3,
                endColumnIndex: 4
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

          // Format "Assessment:" label
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 3,
                endRowIndex: 4,
                startColumnIndex: 4,
                endColumnIndex: 5
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
          
          // Format "Partner Rep:" label
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 3,
                endRowIndex: 4,
                startColumnIndex: 5,
                endColumnIndex: 6
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
          
          // Format cell A16 ("Overview") in blue (#1e40af) with white text, bold, size 14
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 15,
                endRowIndex: 16,
                startColumnIndex: 0,
                endColumnIndex: 10
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.0, // Updated to match #0077d6
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
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          
          // Make all text in row 17 bold (Current Situation, Business Challenges, etc.)
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 17,
                endRowIndex: 18,
                startColumnIndex: 0,
                endColumnIndex: 10
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
                    // Add specific formatting for "Current Situation:" cell to ensure it's bold
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 17,
                endRowIndex: 18,
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

          // Make all other overview field labels bold
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 18,
                endRowIndex: 21,
                startColumnIndex: 0,
                endColumnIndex: 5
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
          
          // Format contacts table headers row
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 23,
                endRowIndex: 24,
                startColumnIndex: 0,
                endColumnIndex: 8
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
          
          // Format C-Level section row with blue background (#1e40af) and white text
          // Now at row 25 (index 24)
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
                    red: 0.0, // Updated to match #0077d6
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
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          
          // Format Managers/Directors section row with blue background (#1e40af) and white text
          // Now at row 32 (index 31)
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 31,
                endRowIndex: 32,
                startColumnIndex: 0,
                endColumnIndex: 8
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.0, // Updated to match #0077d6
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
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          
          // Format Individual Contributors section row with blue background and white text
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 42, // Updated from 37 to 42 to match new position
                endRowIndex: 43,   // Updated from 38 to 43
                startColumnIndex: 0,
                endColumnIndex: 8  // Make sure this is 8 instead of 6
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
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          
          // Set all column widths to 230 pixels for consistent layout
          {
            updateDimensionProperties: {
              range: {
                sheetId: sheetId, // Use the correct variable
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: 10
              },
              properties: {
                pixelSize: 230
              },
              fields: 'pixelSize'
            }
          },
          
          // Add light gray background to tech stack items
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 4,
                endRowIndex: 12,
                startColumnIndex: 3,
                endColumnIndex: 4
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.95,
                    green: 0.95,
                    blue: 0.95
                  }
                }
              },
              fields: 'userEnteredFormat.backgroundColor'
            }
          },
          
          // NEW BORDER AROUND TECH STACK AND PARTNER REP SECTION
          {
            updateBorders: {
              range: {
                sheetId: sheetId,
                startRowIndex: 3,  // Row 4 (0-indexed)
                endRowIndex: 12,   // Row 14 (0-indexed)
                startColumnIndex: 3, // Column D (0-indexed)
                endColumnIndex: 6   // Column G (0-indexed)
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
          
          // Enable text wrapping for content cells
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 3,
                endRowIndex: 40,
                startColumnIndex: 0,
                endColumnIndex: 10
              },
              cell: {
                userEnteredFormat: {
                  wrapStrategy: 'WRAP'
                }
              },
              fields: 'userEnteredFormat.wrapStrategy'
            }
          },
          
          // Format text in Column A, Row 15 as bold
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 14,  // 0-indexed, so row 15 is index 14
                endRowIndex: 15,    // end is exclusive, so 15 to include only row 15
                startColumnIndex: 0, // Column A is index 0
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
          
          // Ensure Column B, Row 15 is NOT bold
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 14,  // 0-indexed, so row 15 is index 14
                endRowIndex: 15,    // end is exclusive, so 15 to include only row 15
                startColumnIndex: 1, // Column B is index 1
                endColumnIndex: 2
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    bold: false
                  }
                }
              },
              fields: 'userEnteredFormat.textFormat'
            }
          },
          
          // Format text in Column A, Rows 17-20 as bold
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 16,  // 0-indexed, so row 17 is index 16
                endRowIndex: 20,    // end is exclusive, so 20 to include rows 17-20
                startColumnIndex: 0, // Column A is index 0
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
          
          // Format text in Column C, Rows 17-20 as bold
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 16,
                endRowIndex: 20,
                startColumnIndex: 2, // Column C is index 2
                endColumnIndex: 3
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
          
          // Format text in Column E, Rows 17-20 as bold
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 16,
                endRowIndex: 20,
                startColumnIndex: 4, // Column E is index 4
                endColumnIndex: 5
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
          
          // Format text in Column G, Rows 17-18 as bold
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 16,
                endRowIndex: 18, // Only rows 17-18 for column G
                startColumnIndex: 6, // Column G is index 6
                endColumnIndex: 7
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
          
          // Ensure Columns B, D, F, H Rows 17-20 are NOT bold 
          // This ensures they have normal formatting even if previously bold
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 16,
                endRowIndex: 20,
                startColumnIndex: 1, // Column B is index 1
                endColumnIndex: 2
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    bold: false
                  }
                }
              },
              fields: 'userEnteredFormat.textFormat'
            }
          },
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 16,
                endRowIndex: 20,
                startColumnIndex: 3, // Column D is index 3
                endColumnIndex: 4
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    bold: false
                  }
                }
              },
              fields: 'userEnteredFormat.textFormat'
            }
          },
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 16,
                endRowIndex: 20,
                startColumnIndex: 5, // Column F is index 5
                endColumnIndex: 6
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    bold: false
                  }
                }
              },
              fields: 'userEnteredFormat.textFormat'
            }
          },
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 16,
                endRowIndex: 18, // Only rows 17-18 for column H
                startColumnIndex: 7, // Column H is index 7
                endColumnIndex: 8
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    bold: false
                  }
                }
              },
              fields: 'userEnteredFormat.textFormat'
            }
          }
        ]
      })
    });
    
    // Add data validation for dropdowns
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
                startRowIndex: 9,
                endRowIndex: 10,
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
          
          // NEW: Add "Yes", "No", "Unknown" dropdown for the Tech Stack Assessment column
          {
            setDataValidation: {
              range: {
                sheetId: sheetId,
                startRowIndex: 4,
                endRowIndex: 12,
                startColumnIndex: 4,
                endColumnIndex: 5
              },
              rule: {
                condition: {
                  type: 'ONE_OF_LIST',
                  values: [
                    { userEnteredValue: 'Yes' },
                    { userEnteredValue: 'No' },
                    { userEnteredValue: 'Unknown' }
                  ]
                },
                strict: true,
                showCustomUi: true
              }
            }
          },
          
          // Add "Unaware", "Aware", "Engaged" dropdown for the Engagement Status column
          {
            setDataValidation: {
              range: {
                sheetId: sheetId,
                startRowIndex: 25,
                endRowIndex: 30, // Stopping before rows 31-32
                startColumnIndex: 7, // Engagement Status column (8th column, 0-indexed)
                endColumnIndex: 8
              },
              rule: {
                condition: {
                  type: 'ONE_OF_LIST',
                  values: [
                    { userEnteredValue: 'Unaware' },
                    { userEnteredValue: 'Aware' },
                    { userEnteredValue: 'Engaged' }
                  ]
                },
                strict: true,
                showCustomUi: true
              }
            }
          },
          // Second rule: Add "Unaware", "Aware", "Engaged" dropdown for rows 33-41 (Managers/Directors, excluding rows 31-32)
          {
            setDataValidation: {
              range: {
                sheetId: sheetId,
                startRowIndex: 32, // Start after rows 31-32
                endRowIndex: 41,
                startColumnIndex: 7, // Engagement Status column (8th column, 0-indexed)
                endColumnIndex: 8
              },
              rule: {
                condition: {
                  type: 'ONE_OF_LIST',
                  values: [
                    { userEnteredValue: 'Unaware' },
                    { userEnteredValue: 'Aware' },
                    { userEnteredValue: 'Engaged' }
                  ]
                },
                strict: true,
                showCustomUi: true
              }
            }
          }  
        ]        
      })
    });
    
    // NEW: Add conditional formatting for Tech Stack Assessment dropdown values
    await fetchWithRetry(`${SHEET_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          // For "Yes" values - Green background
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: sheetId,
                    startRowIndex: 4,  // Row 5 (0-indexed)
                    endRowIndex: 12,   // Row 13 (0-indexed)
                    startColumnIndex: 4, // Column E (0-indexed)
                    endColumnIndex: 5   // Column F (0-indexed)
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Yes' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.82,
                      green: 0.95,
                      blue: 0.82
                    }
                  }
                }
              },
              index: 0
            }
          },
          // For "No" values - Red background
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: sheetId,
                    startRowIndex: 4,  // Row 5 (0-indexed)
                    endRowIndex: 12,   // Row 13 (0-indexed)
                    startColumnIndex: 4, // Column E (0-indexed)
                    endColumnIndex: 5   // Column F (0-indexed)
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'No' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.95,
                      green: 0.82,
                      blue: 0.82
                    }
                  }
                }
              },
              index: 1
            }
          },
          // For "Unknown" values - Yellow background
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: sheetId,
                    startRowIndex: 4,  // Row 5 (0-indexed)
                    endRowIndex: 12,   // Row 13 (0-indexed)
                    startColumnIndex: 4, // Column E (0-indexed)
                    endColumnIndex: 5   // Column F (0-indexed)
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: 'Unknown' }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.98,
                      green: 0.91,
                      blue: 0.71
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
    console.error("Error applying enhanced account plan formatting:", error);
    return false;
  }
}


/**
 * Apply simple formatting to account plan sheets - a fallback when advanced formatting fails
 * This simplified version still maintains the key visual elements from the screenshot
 * 
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
    
    // Apply simplified formatting that still captures key elements of the screenshot
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
          
          // Format title section with blue header - Updated to #1e40af
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 0,
                endRowIndex: 2,
                startColumnIndex: 0,
                endColumnIndex: 9
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.0, // Updated to match #0077d6
                    green: 0.47,
                    blue: 0.84
                  },
                  textFormat: {
                    foregroundColor: {
                      red: 1.0,
                      green: 1.0,
                      blue: 1.0
                    },
                    fontSize: 12,
                    bold: true
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          
          // Format Overview section header - Updated to #1e40af
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 15,
                endRowIndex: 16,
                startColumnIndex: 0,
                endColumnIndex: 9
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.0, // Updated to match #0077d6
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
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          
          // Format section labels with bold text
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 3,
                endRowIndex: 13,
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
          
          // Format contact section headers - Updated to #1e40af
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 24,
                endRowIndex: 25,
                startColumnIndex: 0,
                endColumnIndex: 6
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.0, // Updated to match #0077d6
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
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          
          // Format managers section header - Updated to #1e40af
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 31,
                endRowIndex: 32,
                startColumnIndex: 0,
                endColumnIndex: 6
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.0, // Updated to match #0077d6
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
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          
          // Format individual contributors section header - Updated to #1e40af
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 42, // Updated from 37 to 42 to match new row position
                endRowIndex: 43,   // Updated from 38 to 43
                startColumnIndex: 0,
                endColumnIndex: 8  // Make sure this is 8 to match other headers
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.0, // Updated to match #0077d6
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
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },

          
          // Set all column widths to 266 pixels (per requirement)
          {
            updateDimensionProperties: {
              range: {
                sheetId: sheetId, // Use the correct variable
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: 10
              },
              properties: {
                pixelSize: 230
              },
              fields: 'pixelSize'          
            }
          },
          
          // Format tech stack labels with gray background
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 4,
                endRowIndex: 12,
                startColumnIndex: 3,
                endColumnIndex: 4
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.95,
                    green: 0.95,
                    blue: 0.95
                  }
                }
              },
              fields: 'userEnteredFormat.backgroundColor'
            }
          },
          
          // Delete row 23
          {
            deleteRange: {
              range: {
                sheetId: sheetId,
                startRowIndex: 23,
                endRowIndex: 24,
                startColumnIndex: 0,
                endColumnIndex: 10
              },
              shiftDimension: "ROWS"
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
                  horizontalAlignment: 'LEFT',
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
                  horizontalAlignment: 'CENTER'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
            }
          },
          // Format Strategic Accounts header
          {
            repeatCell: {
              range: {
                sheetId: overviewSheetId,
                startRowIndex: 17,
                endRowIndex: 18,
                startColumnIndex: 0,
                endColumnIndex: 7
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.0,
                    green: 0.0,
                    blue: 0.0
                  },
                  textFormat: {
                    foregroundColor: {
                      red: 1.0,
                      green: 1.0,
                      blue: 1.0
                    },
                    bold: true
                  },
                  horizontalAlignment: 'LEFT'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
            }
          },
          // Set all column widths to 230 pixels
          {
            updateDimensionProperties: {
              range: {
                sheetId: overviewSheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: 7
              },
              properties: {
                pixelSize: 230
              },
              fields: 'pixelSize'          
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
// SECTION 9: ADDITIONAL FORMATTING AND FORMULAS
// =============================================================================

/**
 * Add formulas and conditional formatting to the account plan sheet
 * 
 * This function adds conditional formatting for status fields and role fields,
 * providing visual cues for different values to improve data interpretation.
 * Updated to work with the new template structure based on requirements.
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
                    startRowIndex: 9,
                    endRowIndex: 10,
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
                    startRowIndex: 9,
                    endRowIndex: 10,
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
                    startRowIndex: 9,
                    endRowIndex: 10,
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
          
          // Add borders to the contacts tables
          {
            updateBorders: {
              range: {
                sheetId: sheetId,
                startRowIndex: 23,
                endRowIndex: 30,
                startColumnIndex: 0,
                endColumnIndex: 8  // Updated from 6 to 8
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
          
          
          // Add borders to the managers contacts table
          {
            updateBorders: {
              range: {
                sheetId: sheetId,
                startRowIndex: 31,
                endRowIndex: 41, // Updated from 36 to 41
                startColumnIndex: 0,
                endColumnIndex: 8
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
          
          
          // Add borders to the individual contributors contacts table
          {
            updateBorders: {
              range: {
                sheetId: sheetId,
                startRowIndex: 42, // Updated from 37 to 42
                endRowIndex: 60, // Updated from 41 to 60
                startColumnIndex: 0,
                endColumnIndex: 8
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
          
          // Add alternating row colors to contacts sections for better readability
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: sheetId,
                    startRowIndex: 25,
                    endRowIndex: 30,
                    startColumnIndex: 0,
                    endColumnIndex: 8  // Updated from 6 to 8
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'CUSTOM_FORMULA',
                    values: [{ userEnteredValue: "=ISEVEN(ROW())" }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.95,
                      green: 0.95,
                      blue: 0.98
                    }
                  }
                }
              },
              index: 3
            }
          },

          // Add alternating row colors to managers section
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: sheetId,
                    startRowIndex: 32,
                    endRowIndex: 41, // Updated from 36 to 41 to include 5 more rows
                    startColumnIndex: 0,
                    endColumnIndex: 8
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'CUSTOM_FORMULA',
                    values: [{ userEnteredValue: "=ISEVEN(ROW())" }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.95,
                      green: 0.95,
                      blue: 0.98
                    }
                  }
                }
              },
              index: 4
            }
          },

          // Add alternating row colors to individual contributors section
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [
                  {
                    sheetId: sheetId,
                    startRowIndex: 42, // Updated from 38 to 42 due to shifted position
                    endRowIndex: 60, // Updated from 41 to 60 to include 17 more rows
                    startColumnIndex: 0,
                    endColumnIndex: 8
                  }
                ],
                booleanRule: {
                  condition: {
                    type: 'CUSTOM_FORMULA',
                    values: [{ userEnteredValue: "=ISEVEN(ROW())" }]
                  },
                  format: {
                    backgroundColor: {
                      red: 0.95,
                      green: 0.95,
                      blue: 0.98
                    }
                  }
                }
              },
              index: 5
            }
          },
          
          // Add "Yes", "No", "Unknown" dropdown for the Assessment column
          {
            setDataValidation: {
              range: {
                sheetId: sheetId,
                startRowIndex: 4,
                endRowIndex: 12,
                startColumnIndex: 4,
                endColumnIndex: 5
              },
              rule: {
                condition: {
                  type: 'ONE_OF_LIST',
                  values: [
                    { userEnteredValue: 'Yes' },
                    { userEnteredValue: 'No' },
                    { userEnteredValue: 'Unknown' }
                  ]
                },
                strict: true,
                showCustomUi: true
              }
            }
          },
          
          // Add "Unaware", "Aware", "Engaged" dropdown for the Engagement Status column
          {
            setDataValidation: {
              range: {
                sheetId: sheetId,
                startRowIndex: 25,
                endRowIndex: 30,
                startColumnIndex: 7, // Engagement Status column (8th column, 0-indexed)
                endColumnIndex: 8
              },
              rule: {
                condition: {
                  type: 'ONE_OF_LIST',
                  values: [
                    { userEnteredValue: 'Unaware' },
                    { userEnteredValue: 'Aware' },
                    { userEnteredValue: 'Engaged' }
                  ]
                },
                strict: true,
                showCustomUi: true
              }
            }
          },
          
          // Add "Unaware", "Aware", "Engaged" dropdown for the Individual Contributors section
          {
            setDataValidation: {
              range: {
                sheetId: sheetId,
                startRowIndex: 43, // First row after the "Individual Contributors" header
                endRowIndex: 60,   // End of Individual Contributors section
                startColumnIndex: 7, // Engagement Status column (8th column, 0-indexed)
                endColumnIndex: 8
              },
              rule: {
                condition: {
                  type: 'ONE_OF_LIST',
                  values: [
                    { userEnteredValue: 'Unaware' },
                    { userEnteredValue: 'Aware' },
                    { userEnteredValue: 'Engaged' }
                  ]
                },
                strict: true,
                showCustomUi: true
              }
            }
          }
        ]
      })
    });
    
    return true;
  } catch (error) {
    console.error("Error adding formulas and conditional formatting:", error);
    return false;
  }
}
// =============================================================================
// SECTION 10: TEMPLATE POPULATION
// =============================================================================

/**
 * Populate an account plan with an enhanced template
 * 
 * This function takes a new account plan and populates it with the template data,
 * then applies all necessary formatting and conditional formatting.
 * 
 * @param {string} spreadsheetId - ID of the spreadsheet
 * @param {Object} accountData - Account data with name and company
 * @returns {Promise<boolean>} Success status
 */
 async function populateEnhancedAccountPlanTemplate(spreadsheetId, accountData) {
  try {
    console.log(`Starting template population for: ${accountData.accountName}, Company: ${accountData.companyName || 'Your Company'}`);
    
    if (!spreadsheetId || !accountData || !accountData.accountName) {
      throw new Error("Spreadsheet ID and account name are required");
    }
    
    if (!authToken) {
      authToken = await getAuthToken();
    }
    
    // Create enhanced template data for the sheet, passing the company name
    const templateData = createEnhancedAccountPlanTemplateData(
      accountData.accountName,
      accountData.companyName || 'Your Company'
    );
    
    // Update the sheet with the enhanced template data
    await updateSheetData(spreadsheetId, accountData.accountName, templateData);
console.log("Template data applied successfully");

// Apply enhanced formatting to match your template
try {
  const formattingSuccess = await applyEnhancedAccountPlanFormatting(spreadsheetId, accountData.accountName);
  console.log(`Enhanced formatting applied with result: ${formattingSuccess}`);
  
  // Apply any additional formulas or conditional formatting
  await addFormulasAndConditionalFormatting(spreadsheetId, accountData.accountName);
} catch (formattingError) {
  console.error("Error applying enhanced formatting:", formattingError);
  
  // Try with simplified formatting as fallback
  try {
    await applySimplifiedAccountPlanFormatting(spreadsheetId, accountData.accountName);
    console.log("Applied simplified account plan formatting as fallback");
  } catch (fallbackError) {
    console.error("Even simplified formatting failed:", fallbackError);
  }
}

    
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

// =============================================================================
// SECTION 11: OVERVIEW SHEET MANAGEMENT
// =============================================================================

/**
 * Function to refresh the overview sheet content with improved design
 * 
 * This function updates the overview sheet content with all account data
 * and refreshes formatting. It's called when new accounts are created or
 * after account deletion to keep the overview current.
 /**
 * Function to refresh the overview sheet content with improved design
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
      
      // Get the company name from storage
      const companyData = await new Promise(resolve => {
        chrome.storage.local.get(['revpilot_companyName'], (result) => {
          resolve(result);
        });
      });
      
      const companyName = companyData.revpilot_companyName || 'Your Company';
      
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
        [`${companyName} ${year} Account Plan`], // A1: Title
        [''], // A2: Empty row
        ['Created: ' + currentDate], // A3: Creation date
        ['Last Updated: ' + currentDate], // A4: Last updated
        [''], // A5: Empty row
        ['Welcome to your account management dashboard'], // A6: Welcome message
        ['Track, manage, and optimize your strategic account relationships in one place'], // A7: Instruction
        [''], // A8: Empty row
        ['DASHBOARD METRICS'], // A9: Metrics header
        [''], // A10: Empty row
        ['Total Accounts'], // A11: Only Total Accounts metric
        ['=COUNTA(A19:A100)'], // A12: Formula updated to match new row positioning
        [''], // A13: Empty row
        [''], // A14: Empty row
        ['ACCOUNT OVERVIEW:'], // A15: Accounts header
        [''], // A16: Empty row
        // Table headers in row 17
        ['Account Name', 'Last Activity', 'Status', 'SFDC Link', 'Owner', 'Annual Value', 'Next Action'],
        ['Strategic Accounts (Top 20)'] // A18: Strategic accounts header
      ];
      
      // Limit to first 20 accounts for Strategic section
      const strategicAccounts = accountSheets.slice(0, 20);
      
      // Add Strategic accounts to the overview
      strategicAccounts.forEach(sheet => {
        overviewData.push([
          sheet.properties.title,
          currentDate,
          'PG', // Default status - use PG as default based on screenshots
          '',    // Empty SFDC Link
          '',    // Empty Owner
          0,     // Default Annual Value
          'Review account plan' // Default Next Action
        ]);
      });
      
      // Add "Tiered Accounts" header after Strategic accounts
      if (accountSheets.length > 20) {
        overviewData.push(['🔺 Tiered Accounts (Top 21-50)']);
        
        // Add remaining accounts (limit to next 30 for Tiered section)
        const tieredAccounts = accountSheets.slice(20, 50);
        tieredAccounts.forEach(sheet => {
          overviewData.push([
            sheet.properties.title,
            currentDate,
            'PG', // Default status
            '',    // Empty SFDC Link
            '',    // Empty Owner
            0,     // Default Annual Value
            'Review account plan' // Default Next Action
          ]);
        });
      }
      
      // Update the Overview sheet with the refreshed data
      await updateSheetData(spreadsheetId, 'Overview', overviewData);
  
      // Apply formatting to ensure the overview looks consistent
      try {
        await applyEnhancedOverviewFormatting(spreadsheetId);
        console.log("Applied enhanced formatting to refreshed overview sheet");
      } catch (formattingError) {
        console.error("Error applying enhanced formatting to overview:", formattingError);
        
        // Try simplified formatting as fallback
        try {
          await applySimplifiedOverviewFormatting(spreadsheetId);
          console.log("Applied simplified formatting to overview as fallback");
        } catch (fallbackError) {
          console.error("Even simplified formatting failed for overview:", fallbackError);
        }
      }
      
      return true;
    } catch (error) {
      console.error("Error refreshing overview content:", error);
      throw error;
    }
  }
  

/**
 * Remove an account from the overview sheet using Sheet GID as primary identifier
 * @param {string} spreadsheetId - ID of the master spreadsheet
 * @param {string} accountName - Name of the account to remove
 * @param {string|number} sheetGid - Sheet GID (unique identifier)
 * @returns {Promise<boolean>} Success status
 */
 async function removeFromOverviewSheet(spreadsheetId, accountName, sheetGid) {
  try {
    console.log(`Removing account "${accountName}" (GID: ${sheetGid}) from overview sheet`);
    
    if (!authToken) {
      authToken = await getAuthToken();
    }
    
    // First check if the sheet exists with this GID
    const sheetInfo = await getSheetDetails(spreadsheetId);
    let targetSheetExists = false;
    let targetSheetTitle = accountName; // Default to provided name
    
    if (sheetInfo && sheetInfo.sheets) {
      for (const sheet of sheetInfo.sheets) {
        if (sheet.properties && sheet.properties.sheetId === parseInt(sheetGid)) {
          targetSheetExists = true;
          targetSheetTitle = sheet.properties.title;
          break;
        }
      }
    }
    
    // Get the overview sheet data
    const response = await fetchWithRetry(
      `${SHEET_API_BASE}/${spreadsheetId}/values/Overview?valueRenderOption=FORMATTED_VALUE`, 
      { 
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );
    
    if (!response || !response.values) {
      console.warn(`No values found in overview sheet for ${spreadsheetId}`);
      return false;
    }
    
    const values = response.values;
    
    // Find the overview sheet ID
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
      console.warn("Could not find Overview sheet ID");
      return false;
    }
    
    // Find the row with the account name (starting from row 19, after Strategic header)
    let accountRowIndex = -1;
    for (let i = 18; i < values.length; i++) {
      if (values[i].length > 0 && values[i][0] === targetSheetTitle) {
        accountRowIndex = i;
        break;
      }
    }
    
    if (accountRowIndex === -1) {
      console.warn(`Account "${targetSheetTitle}" not found in overview sheet`);
      return false;
    }
    
    // Use batchUpdate to delete the specific row
    await fetchWithRetry(`${SHEET_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: overviewSheetId,
                dimension: "ROWS",
                startIndex: accountRowIndex,
                endIndex: accountRowIndex + 1
              }
            }
          }
        ]
      })
    });
    
    console.log(`Successfully removed account "${targetSheetTitle}" from overview sheet`);
    return true;
  } catch (error) {
    console.error(`Error removing account "${accountName}" from overview sheet:`, error);
    return false;
  }
}




// =============================================================================
// SECTION 12: SHEET CREATION AND DELETION
// =============================================================================

/**
 * Create an account plan sheet with enhanced validation
 * @param {string} accountName - Name of the account
 * @param {Object} currentTab - Information about current tab
 * @returns {Promise<Object>} Sheet data
 */
 async function createAccountPlanSheet(accountName, currentTab) {
  try {
    // Validate required parameters
    if (!accountName) {
      throw new Error("Account name is required");
    }
    
    // Validate account name format
    if (typeof accountName !== 'string' || accountName.trim().length === 0) {
      throw new Error("Account name must be a non-empty string");
    }
    
    // Validate account name length
    if (accountName.length > 100) {
      throw new Error("Account name must be 100 characters or less");
    }
    
    // Validate account name doesn't contain invalid characters
    const invalidChars = /[\\/?*[\]]/g;
    if (invalidChars.test(accountName)) {
      throw new Error("Account name contains invalid characters (\\, /, ?, *, [, or ])");
    }
    
    // Additional validation for currentTab if provided
    if (currentTab && typeof currentTab !== 'object') {
      throw new Error("If provided, currentTab must be an object");
    }
    
    // Get or create the master spreadsheet
    const masterSheet = await getMasterSpreadsheet();
    
    // Sanitize the account name for use as a sheet title
    const safeAccountName = accountName.replace(invalidChars, '').substring(0, 100);
    
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
    // Enhance error message with context
    const contextError = new Error(`Failed to create account plan: ${error.message}`);
    contextError.originalError = error;
    
    console.error("Error creating account plan sheet:", error);
    throw contextError;
  }
}

/**
 * Delete an account plan sheet
 * @param {string} spreadsheetId - ID of the spreadsheet
 * @param {string} accountName - Name of the account to delete
 * @param {string|number} sheetGid - Sheet GID
 * @returns {Promise<Object>} Result object
 */
 async function deleteAccountPlanSheet(spreadsheetId, accountName, sheetGid) {
  try {
    if (!spreadsheetId || (!accountName && !sheetGid)) {
      throw new Error("Spreadsheet ID and either account name or sheet GID are required");
    }
    
    // Get the sheet ID by name or GID
    const sheetInfo = await getSheetDetails(spreadsheetId);
    
    // Find the sheet by GID first (most reliable)
    let sheetId = sheetGid ? parseInt(sheetGid) : null;
    let actualSheetName = accountName;
    
    if (sheetId !== null && sheetInfo.sheets) {
      let sheetFound = false;
      for (const sheet of sheetInfo.sheets) {
        if (sheet.properties && sheet.properties.sheetId === sheetId) {
          sheetFound = true;
          actualSheetName = sheet.properties.title;
          break;
        }
      }
      
      if (!sheetFound) {
        // Fall back to name-based search if GID not found
        sheetId = null;
      }
    }
    
    // If GID wasn't provided or not found, find by name
    if (sheetId === null && sheetInfo.sheets) {
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
    
    console.log(`Deleting sheet with ID ${sheetId} for account "${actualSheetName}"`);
    
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
              sheetId: sheetId
            }
          }
        ]
      })
    });
    
    console.log(`Sheet for "${actualSheetName}" deleted successfully`);
    
    // Remove the account from the overview sheet
    let overviewUpdated = false;
    try {
      overviewUpdated = await removeFromOverviewSheet(spreadsheetId, actualSheetName, sheetId);
      console.log(`Account "${actualSheetName}" removal from overview: ${overviewUpdated ? 'successful' : 'failed'}`);
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
