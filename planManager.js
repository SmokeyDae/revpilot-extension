// planManager.js - Plan Creation and Management
const RevPilotPlanManager = (() => {
  // Constants
  const STORAGE_KEY_RECENT_PLANS = 'recentPlans';
  const MAX_RECENT_PLANS = 20; // Increased from 10

/**
* Creates a new plan with a duplicated spreadsheet
* @param {string} planName - The name of the new plan
* @returns {Promise<Object>} - The new plan object
*/
async function createNewPlan(planName) {
  try {
    // Your template ID (from the URL of your template spreadsheet)
    const TEMPLATE_ID = '1nERwgA7HcDasCKOY9wPM8VcaCJAj4h7DM7PvTwOmw-I';
    
    // Create a copy of the template
    const newSheetId = await duplicateTemplate(TEMPLATE_ID, `${planName} - Plan`);
    
    // Get the URL of the new sheet
    const newSheetUrl = `https://docs.google.com/spreadsheets/d/${newSheetId}`;
    
    // Create plan object
    const newPlan = {
      id: generateUniqueId(),
      name: planName,
      createdAt: new Date().toISOString(),
      sheetId: newSheetId,
      sheetUrl: newSheetUrl
    };
    
    // Save the new plan to storage
    await savePlan(newPlan);
    
    return newPlan;
  } catch (error) {
    console.error('Error creating new plan:', error);
    throw error;
  }
}

/**
 * Saves a plan to storage
 * @param {Object} plan - The plan object to save
 * @returns {Promise<void>}
 */
async function savePlan(plan) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(['plans'], (result) => {
      const plans = result.plans || [];
      plans.push(plan);
      
      chrome.storage.sync.set({ plans }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  });
}

  /**
   * Create a new account plan sheet
   * @param {string} accountName - Name of the account
   * @param {Object} currentTab - Information about the current tab
   * @returns {Promise<Object>} Sheet data with ID and URL
   */
  async function createAccountPlan(accountName, currentTab = null) {
    try {
      if (!accountName) {
        throw new Error("Account name is required");
      }
      
      // Get or create the master spreadsheet
      const masterSheet = await RevPilotSheets.getMasterSpreadsheet();
      
      // Sanitize the account name for use as a sheet title (max 100 chars, no special chars)
      const safeAccountName = accountName.replace(/[\\/?*[\]]/g, '').substring(0, 100);
      
      // Check if a sheet with this name already exists
      const sheetInfo = await RevPilotSheets.fetchWithRetry(
        `${RevPilotSheets.SHEET_API_BASE}/${masterSheet.spreadsheetId}?fields=sheets.properties`, 
        { method: 'GET' }
      );
      
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
      const addSheetResponse = await RevPilotSheets.fetchWithRetry(
        `${RevPilotSheets.SHEET_API_BASE}/${masterSheet.spreadsheetId}:batchUpdate`, 
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
      
      // Add this account to the Overview sheet's list
      await updateOverviewSheet(masterSheet.spreadsheetId, safeAccountName);
      
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
      
      // Save to recent plans
      await saveRecentPlan(accountName, masterSheet.spreadsheetId, returnUrl, newSheetId);
      
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
 * Save a recent plan to local storage with enhanced GID tracking
 * @param {string} name - Account name
 * @param {string} id - Spreadsheet ID
 * @param {string} url - Spreadsheet URL
 * @param {string|number} gid - Sheet GID
 */
async function saveRecentPlan(name, id, url, gid = null) {
  console.log("Saving new plan to local storage:", name, id, "GID:", gid);
  
  chrome.storage.local.get([STORAGE_KEY_RECENT_PLANS], (result) => {
    const plans = result[STORAGE_KEY_RECENT_PLANS] || [];
    
    // Add new plan to the beginning of the array
    plans.unshift({
      name: name,
      id: id,
      url: url,
      gid: gid, // Make sure to always store the GID
      date: new Date().toISOString(),
      type: 'Account Plan'
    });
    
    // Remove duplicates (in case of updates) with enhanced GID-based checking
    const uniquePlans = plans.filter((plan, index, self) => 
      index === self.findIndex((p) => {
        // First check by GID if available (most reliable)
        if (p.gid && plan.gid && p.gid === plan.gid) {
          return true;
        }
        // Fall back to name and ID comparison
        return (p.name === plan.name && p.id === plan.id);
      })
    );
    
    // Keep only the most recent MAX_RECENT_PLANS plans
    if (uniquePlans.length > 20) {
      uniquePlans.splice(20);
    }
    
    // Save updated plans
    chrome.storage.local.set({ [STORAGE_KEY_RECENT_PLANS]: uniquePlans });
  });
}

  /**
   * Get all recent plans from storage
   * @returns {Promise<Array>} List of recent plans
   */
  async function getRecentPlans() {
    try {
      return await RevPilotStorage.getItem(STORAGE_KEY_RECENT_PLANS) || [];
    } catch (error) {
      console.error("Error getting recent plans:", error);
      return [];
    }
  }

  /**
   * Delete an account plan
   * @param {string} sheetId - Spreadsheet ID
   * @param {string} accountName - Account name
   * @param {string} sheetGid - Sheet ID
   * @returns {Promise<Object>} Result object
   */
  async function deleteAccountPlan(sheetId, accountName, sheetGid) {
    try {
      if (!sheetId || !accountName) {
        throw new Error("Sheet ID and account name are required");
      }
      
      // First update local storage to remove the plan
      const plans = await RevPilotStorage.getItem(STORAGE_KEY_RECENT_PLANS) || [];
      const updatedPlans = plans.filter(plan => 
        !(plan.name === accountName && plan.id === sheetId)
      );
      
      await RevPilotStorage.setItem(STORAGE_KEY_RECENT_PLANS, updatedPlans);
      
      // Then delete the sheet from Google Sheets
      await RevPilotSheets.fetchWithRetry(
        `${RevPilotSheets.SHEET_API_BASE}/${sheetId}:batchUpdate`, 
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            requests: [
              {
                deleteSheet: {
                  sheetId: parseInt(sheetGid)
                }
              }
            ]
          })
        }
      );
      
      // Update the overview sheet to remove this account
      await removeFromOverviewSheet(sheetId, accountName);
      
      // Refresh the UI
      await RevPilotUI.loadRecentPlans();
      
      return { 
        success: true, 
        message: `Account plan for "${accountName}" deleted successfully` 
      };
    } catch (error) {
      console.error("Error deleting account plan:", error);
      throw error;
    }
  }

  /**
   * Search for plans matching a query
   * @param {string} query - Search query
   * @returns {Promise<Array>} Matching plans
   */
  async function searchPlans(query) {
    if (!query) return await getRecentPlans();
    
    const plans = await getRecentPlans();
    const lowercaseQuery = query.toLowerCase().trim();
    
    return plans.filter(plan => {
      return plan.name.toLowerCase().includes(lowercaseQuery);
    });
  }

  // Public API
  return {
    createAccountPlan,
    getRecentPlans,
    deleteAccountPlan,
    searchPlans,
    saveRecentPlan
  };
})();