// sheets.js - Enhanced Google Sheets API Module
const RevPilotSheets = (() => {
    // Private cache storage with TTL-based expiration
    const requestCache = new Map();
    const pendingRequests = new Map();
    
    // Constants
    const API_BASE_URL = (typeof RevPilotConfig !== 'undefined' && RevPilotConfig.API) 
        ? RevPilotConfig.API.SHEETS_BASE_URL 
        : 'https://sheets.googleapis.com/v4/spreadsheets';
    
    const DEFAULT_CACHE_TTL = 300000; // 5 minutes
    const MAX_BATCH_SIZE = 1000; // Maximum cells per update request
    
    /**
     * Makes a fetch request with exponential backoff, caching, and improved error handling
     * @param {string} url - URL to fetch
     * @param {Object} options - Fetch options
     * @param {number} maxRetries - Maximum number of retries
     * @param {number} initialDelay - Initial delay in ms
     * @returns {Promise<Object>} - Response data
     */
    async function fetchWithRetry(url, options, maxRetries = 3, initialDelay = 1000) {
        // Generate cache key
        const cacheKey = generateCacheKey(url, options);
        
        // Add custom option for caching control
        const forceRefresh = options.forceRefresh;
        delete options.forceRefresh; // Remove non-standard option
        
        // Check if this exact request is already in progress
        if (pendingRequests.has(cacheKey)) {
            return pendingRequests.get(cacheKey);
        }
        
        // Check cache for GET requests if not forcing refresh
        if (options.method === 'GET' && !forceRefresh && requestCache.has(cacheKey)) {
            const cachedData = requestCache.get(cacheKey);
            
            if (cachedData.expiry > Date.now()) {
                return cachedData.data;
            } else {
                requestCache.delete(cacheKey);
            }
        }
        
        // Prepare request with retry logic
        let delay = initialDelay;
        let retries = 0;
        let lastError = null;
        
        const fetchPromise = (async () => {
            while (retries <= maxRetries) {
                try {
                    // Get a fresh token for each request
                    const token = await RevPilotAuth.getAuthToken();
                    
                    if (!token) {
                        throw new Error("Failed to get authentication token");
                    }
                    
                    // Ensure headers include the auth token
                    if (!options.headers) options.headers = {};
                    options.headers['Authorization'] = `Bearer ${token}`;
                    
                    // Set timeout to avoid hanging requests
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
                    
                    // Only set signal if it's not already set
                    if (!options.signal) {
                        options.signal = controller.signal;
                    }
                    
                    // Attempt the fetch
                    const response = await fetch(url, options);
                    clearTimeout(timeoutId);
                    
                    // Handle rate limiting with exponential backoff
                    if (response.status === 429) {
                        if (retries >= maxRetries) {
                            throw new Error(`Rate limit exceeded after ${maxRetries} retries`);
                        }
                        
                        // Get retry time from header or use exponential backoff
                        const retryAfter = response.headers.get('Retry-After');
                        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delay;
                        
                        console.log(`Rate limited. Retrying in ${waitTime}ms...`);
                        
                        // Wait for the specified delay before retrying
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        
                        // Exponential backoff with jitter
                        delay = Math.min(delay * 2 * (0.9 + 0.2 * Math.random()), 60000);
                        retries++;
                        continue;
                    }
                    
                    // Handle unauthorized (token expired) - try to refresh token once
                    if (response.status === 401) {
                        if (retries === 0) {
                            console.log('Token expired. Refreshing...');
                            
                            // Force token refresh
                            await RevPilotAuth.refreshTokenInBackground();
                            
                            // Increment retries and continue
                            retries++;
                            continue;
                        } else {
                            throw new Error('Authentication failed after token refresh attempt');
                        }
                    }
                    
                    // Handle server errors with retry
                    if (response.status >= 500 && response.status < 600) {
                        if (retries >= maxRetries) {
                            throw new Error(`Server error (${response.status}) after ${maxRetries} retries`);
                        }
                        
                        console.log(`Server error (${response.status}). Retrying in ${delay}ms...`);
                        
                        // Wait for the specified delay before retrying
                        await new Promise(resolve => setTimeout(resolve, delay));
                        
                        // Exponential backoff
                        delay *= 2;
                        retries++;
                        continue;
                    }
                    
                    // Handle other error cases
                    if (!response.ok) {
                        // Try to get error details from response
                        const errorData = await response.json().catch(() => ({ 
                            error: { message: response.statusText } 
                        }));
                        
                        throw new Error(
                            errorData.error?.message || 
                            `HTTP error ${response.status}: ${response.statusText}`
                        );
                    }
                    
                    // Success - parse response
                    let data;
                    
                    // Handle empty responses
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        data = await response.json();
                    } else {
                        data = await response.text();
                        try {
                            // Try to parse as JSON anyway
                            data = JSON.parse(data);
                        } catch (e) {
                            // Keep as text if not valid JSON
                        }
                    }
                    
                    // Cache the response for GET requests
                    if (options.method === 'GET') {
                        // Cache the response with custom TTL or default
                        const ttl = options.cacheTtl || DEFAULT_CACHE_TTL;
                        requestCache.set(cacheKey, {
                            data,
                            expiry: Date.now() + ttl
                        });
                    }
                    
                    return data;
                } catch (error) {
                    lastError = error;
                    
                    // Handle request timeout
                    if (error.name === 'AbortError') {
                        throw new Error('Request timed out after 30 seconds');
                    }
                    
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
                    
                    // Handle offline mode
                    if (!navigator.onLine) {
                        // For GET requests, try to return cached data even if expired
                        if (options.method === 'GET' && requestCache.has(cacheKey)) {
                            console.log('Offline mode: returning cached data');
                            return requestCache.get(cacheKey).data;
                        }
                        
                        throw new Error('You are offline. Please connect to the internet and try again.');
                    }
                    
                    // If we've exhausted retries or it's not a retryable error, rethrow
                    if (retries >= maxRetries) {
                        throw error;
                    }
                    
                    // For other errors, retry with backoff
                    console.log(`Request error: ${error.message}. Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2;
                    retries++;
                }
            }
            
            // If we've exhausted all retries, throw the last error
            throw lastError || new Error('Request failed after multiple attempts');
        })();
        
        // Track this request while it's in progress
        pendingRequests.set(cacheKey, fetchPromise);
        
        try {
            const result = await fetchPromise;
            pendingRequests.delete(cacheKey);
            return result;
        } catch (error) {
            pendingRequests.delete(cacheKey);
            
            // Use the error handler module if available
            if (typeof RevPilotErrorHandler !== 'undefined') {
                RevPilotErrorHandler.handleApiError(error, 'fetchWithRetry');
            } else {
                console.error("Error in fetchWithRetry:", error);
            }
            
            throw error;
        }
    }
    
    /**
     * Generate a consistent cache key for request caching
     * @param {string} url - Request URL
     * @param {Object} options - Request options
     * @returns {string} Cache key
     */
    function generateCacheKey(url, options) {
        // Create a copy of options without the headers and signal to avoid token changes affecting the cache key
        const keyOptions = { ...options };
        delete keyOptions.headers;
        delete keyOptions.signal;
        
        // For POST/PUT/PATCH requests, include body in cache key
        const bodyKey = ['POST', 'PUT', 'PATCH'].includes(options.method) && options.body
            ? options.body.toString().substring(0, 100) // Limit body size in key
            : '';
            
        return `${url}:${JSON.stringify(keyOptions)}:${bodyKey}`;
    }
    
/**
 * Creates a copy of a template spreadsheet
 * @param {string} templateId - The ID of the template spreadsheet
 * @param {string} newSheetName - The name for the new sheet
 * @returns {Promise<string>} - The ID of the newly created spreadsheet
 */
 async function duplicateTemplate(templateId, newSheetName) {
    try {
      // Get auth token
      const token = await getAuthToken();
      
      // API request to create a copy
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${templateId}/copy`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newSheetName
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to duplicate template');
      }
      
      const data = await response.json();
      return data.id; // Return the new file ID
    } catch (error) {
      console.error('Error duplicating template:', error);
      throw error;
    }
  }

    /**
     * Get or create the master spreadsheet with improved error handling
     * @returns {Promise<Object>} Master spreadsheet data
     */
    async function getMasterSpreadsheet() {
        try {
            // Check if we already have the master sheet ID stored
            return new Promise((resolve, reject) => {
                chrome.storage.local.get(['revpilot_masterSheetId'], async (result) => {
                    const masterSheetId = result['revpilot_masterSheetId'];
                    
                    if (masterSheetId) {
                        try {
                            // Verify that the sheet still exists and we have access
                            const data = await fetchWithRetry(`${API_BASE_URL}/${masterSheetId}?fields=spreadsheetId,spreadsheetUrl,properties.title`, {
                                method: 'GET'
                            });
                            
                            resolve({
                                spreadsheetId: data.spreadsheetId,
                                spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}`
                            });
                            return;
                        } catch (error) {
                            console.warn("Error verifying existing master sheet:", error);
                            // Continue to create a new one if verification fails
                        }
                    }
                    
                    // Create a new master spreadsheet if we don't have one
                    try {
                        const year = new Date().getFullYear();
                        const defaultMasterSheetTitle = typeof RevPilotConfig !== 'undefined' ? 
                            RevPilotConfig.APP.DEFAULT_MASTER_SHEET_TITLE : "Account Plan";
                            
                        const data = await fetchWithRetry(API_BASE_URL, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                properties: {
                                    title: `${defaultMasterSheetTitle} ${year}`
                                },
                                sheets: [
                                    {
                                        properties: {
                                            title: 'Overview',
                                            gridProperties: {
                                                rowCount: 50,
                                                columnCount: 15
                                            }
                                        }
                                    }
                                ]
                            })
                        });
                        
                        // Add overview content to the first sheet
                        await createOverviewSheet(data.spreadsheetId);
                        
                        // Save the master sheet ID for future use
                        chrome.storage.local.set({ 'revpilot_masterSheetId': data.spreadsheetId });
                        
                        resolve({
                            spreadsheetId: data.spreadsheetId,
                            spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}`
                        });
                    } catch (error) {
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
     * Create overview sheet in the master spreadsheet with improved formatting
     * @param {string} spreadsheetId - ID of the master spreadsheet
     * @returns {Promise<void>}
     */
    async function createOverviewSheet(spreadsheetId) {
        try {
            const year = new Date().getFullYear();
            const defaultMasterSheetTitle = typeof RevPilotConfig !== 'undefined' ? 
                RevPilotConfig.APP.DEFAULT_MASTER_SHEET_TITLE : "Account Plan";
            
            // Create a more informative overview page
            const overviewData = [
                [`${defaultMasterSheetTitle} ${year}`],
                [''],
                ['Use this spreadsheet to organize and track all your account plans in one place.'],
                ['Each account has its own sheet with a structured template for effective account management.'],
                [''],
                ['Account Plans:'],
                [''],
                ['Sheet Name', 'Creation Date', 'Last Updated', 'Status', 'Priority'],
                // The list of accounts will go here, but starts empty
            ];
            
            // Update the Overview sheet with the overview data
            await updateSheetData(spreadsheetId, 'Overview', overviewData);
            
            // Apply formatting to the overview sheet
            await applyOverviewFormatting(spreadsheetId);
        } catch (error) {
            console.error("Error creating overview sheet:", error);
            // Don't throw - treat as non-critical operation
        }
    }
    
    /**
     * Update data in a specific sheet with chunking for large datasets
     * @param {string} spreadsheetId - ID of the spreadsheet
     * @param {string} sheetName - Name of the sheet to update
     * @param {Array} data - 2D array of data to write
     * @returns {Promise<Object>} Response data
     */
    async function updateSheetData(spreadsheetId, sheetName, data) {
        try {
            // Sanitize data to ensure it's compatible with Google Sheets API
            const sanitizedData = data.map(row => {
                if (!Array.isArray(row)) return [String(row)];
                return row.map(cell => {
                    if (cell === null || cell === undefined) return '';
                    return cell;
                });
            });
            
            // If data is large, split into chunks to avoid API limits
            if (sanitizedData.length * (sanitizedData[0]?.length || 1) > MAX_BATCH_SIZE) {
                const results = [];
                const totalRows = sanitizedData.length;
                
                // Calculate optimal chunk size based on row size
                const avgCellsPerRow = sanitizedData[0]?.length || 1;
                const rowsPerBatch = Math.max(1, Math.floor(MAX_BATCH_SIZE / avgCellsPerRow));
                
                // Process in batches
                for (let startRow = 0; startRow < totalRows; startRow += rowsPerBatch) {
                    const endRow = Math.min(startRow + rowsPerBatch, totalRows);
                    const batchData = sanitizedData.slice(startRow, endRow);
                    
                    // Update range with proper A1 notation
                    const range = `${sheetName}!A${startRow + 1}`;
                    
                    const result = await fetchWithRetry(
                        `${API_BASE_URL}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, 
                        {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                range: range,
                                majorDimension: 'ROWS',
                                values: batchData
                            })
                        }
                    );
                    
                    results.push(result);
                }
                
                // Return the combined results
                return results[results.length - 1]; // Return the last result
            } else {
                // For smaller datasets, use a single request
                return await fetchWithRetry(
                    `${API_BASE_URL}/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?valueInputOption=USER_ENTERED`, 
                    {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            range: sheetName,
                            majorDimension: 'ROWS',
                            values: sanitizedData
                        })
                    }
                );
            }
        } catch (error) {
            console.error("Error updating sheet data:", error);
            throw error;
        }
    }
    
    /**
     * Apply formatting to the overview sheet
     * @param {string} spreadsheetId - ID of the spreadsheet
     * @returns {Promise<void>}
     */
    async function applyOverviewFormatting(spreadsheetId) {
        try {
            // Apply formatting to make the overview sheet more readable
            await fetchWithRetry(`${API_BASE_URL}/${spreadsheetId}:batchUpdate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    requests: [
                        // Format header row
                        {
                            repeatCell: {
                                range: {
                                    sheetId: 0, // Overview sheet (first sheet)
                                    startRowIndex: 0,
                                    endRowIndex: 1,
                                    startColumnIndex: 0,
                                    endColumnIndex: 5
                                },
                                cell: {
                                    userEnteredFormat: {
                                        backgroundColor: {
                                            red: 0.23,
                                            green: 0.51,
                                            blue: 0.73
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
                                    sheetId: 0,
                                    startRowIndex: 7,
                                    endRowIndex: 8,
                                    startColumnIndex: 0,
                                    endColumnIndex: 5
                                },
                                cell: {
                                    userEnteredFormat: {
                                        backgroundColor: {
                                            red: 0.85,
                                            green: 0.9,
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
                        // Auto-resize columns
                        {
                            autoResizeDimensions: {
                                dimensions: {
                                    sheetId: 0,
                                    dimension: 'COLUMNS',
                                    startIndex: 0,
                                    endIndex: 5
                                }
                            }
                        }
                    ]
                })
            });
            
            return;
        } catch (error) {
            console.error("Error applying overview formatting:", error);
            // Don't throw - treat formatting as non-critical
        }
    }
    
    /**
     * Get details about a spreadsheet, including sheets and their properties
     * @param {string} spreadsheetId - ID of the spreadsheet
     * @returns {Promise<Object>} Response data
     */
    async function getSheetDetails(spreadsheetId) {
        try {
            return await fetchWithRetry(`${API_BASE_URL}/${spreadsheetId}?fields=sheets.properties`, {
                method: 'GET'
            });
        } catch (error) {
            console.error("Error getting sheet details:", error);
            throw error;
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
                `${API_BASE_URL}/${masterSheet.spreadsheetId}:batchUpdate`, 
                {
                    method: 'POST',
                    headers: {
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
     * Function to refresh the overview sheet content
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
                month: 'short', 
                day: 'numeric'
            });
            
            // Prepare data for the overview sheet
            const year = new Date().getFullYear();
            const defaultMasterSheetTitle = typeof RevPilotConfig !== 'undefined' ? 
                RevPilotConfig.APP.DEFAULT_MASTER_SHEET_TITLE : "Account Plan";
                
            const overviewData = [
                [`${defaultMasterSheetTitle} ${year}`],
                [''],
                ['Use this spreadsheet to organize and track all your account plans in one place.'],
                ['Each account has its own sheet with a structured template for effective account management.'],
                [''],
                ['Account Plans:'],
                [''],
                ['Sheet Name', 'Creation Date', 'Last Updated', 'Status', 'Priority'],
            ];
            
            // Add all account sheets to the overview with default placeholder values for Status and Priority
            accountSheets.forEach(sheet => {
                overviewData.push([
                    sheet.properties.title, 
                    currentDate, 
                    currentDate, 
                    'Active', // Default status
                    'Medium'  // Default priority
                ]);
            });
            
            // Update the Overview sheet with the refreshed data
            await updateSheetData(spreadsheetId, 'Overview', overviewData);
            
            // Apply formatting to ensure the overview looks consistent
            await applyOverviewFormatting(spreadsheetId);
            
            return true;
        } catch (error) {
            console.error("Error refreshing overview content:", error);
            return false;
        }
    }
    
    /**
     * Delete an account plan sheet with improved error handling
     * @param {string} spreadsheetId - ID of the spreadsheet
     * @param {string} accountName - Name of the account to delete
     * @returns {Promise<Object>} Success status
     */
    async function deleteAccountPlanSheet(spreadsheetId, accountName) {
        try {
            if (!spreadsheetId || !accountName) {
                throw new Error("Spreadsheet ID and account name are required");
            }
            
            // Get the sheet ID by name
            const sheetInfo = await getSheetDetails(spreadsheetId);
            
            // Find the sheet ID
            let sheetId = null;
            if (sheetInfo.sheets) {
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
            await fetchWithRetry(`${API_BASE_URL}/${spreadsheetId}:batchUpdate`, {
                method: 'POST',
                headers: {
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
    
    /**
     * Clean up cache and resources
     */
    function cleanup() {
        requestCache.clear();
        pendingRequests.clear();
        console.log('Sheets module cleanup complete');
    }
    
    // Set up automatic cache cleanup
    const cacheCleanupInterval = setInterval(() => {
        const now = Date.now();
        // Clean up expired cache entries
        for (const [key, entry] of requestCache.entries()) {
            if (entry.expiry <= now) {
                requestCache.delete(key);
            }
        }
    }, 60000); // Clean up every minute
    
    // Ensure cleanup on unload
    window.addEventListener('unload', () => {
        clearInterval(cacheCleanupInterval);
        cleanup();
    });
    
    // Public API
    return {
        fetchWithRetry,
        getMasterSpreadsheet,
        getSheetDetails,
        createAccountPlanSheet,
        deleteAccountPlanSheet,
        refreshOverviewContent,
        updateSheetData,
        cleanup,
        // Constants for external use
        API_BASE_URL
    };
})();
