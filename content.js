// This script runs on matching pages (Google Sheets and LinkedIn)

// Prevent duplicate initialization by checking if we've already set up
if (typeof window.revPilotInitialized === 'undefined') {
  // Set a flag to prevent multiple initializations
  window.revPilotInitialized = true;
  
  // Helper function to safely extract spreadsheet ID
  function extractSpreadsheetId(url) {
    try {
      const urlParams = new URL(url);
      const pathSegments = urlParams.pathname.split('/');
      const spreadsheetIdIndex = pathSegments.indexOf('d') + 1;
      
      if (spreadsheetIdIndex > 0 && spreadsheetIdIndex < pathSegments.length) {
        return pathSegments[spreadsheetIdIndex];
      }
    } catch (e) {
      console.error('Error extracting spreadsheet ID:', e);
    }
    return null;
  }
  
  // Check if chrome.runtime is available (prevents disconnected context errors)
  function isChromeRuntimeAvailable() {
    return typeof chrome !== 'undefined' && chrome.runtime && !chrome.runtime.lastError;
  }
  
  // Initialize the content script
  function initializeContentScript() {
    console.log('RevPilot content script initialized on:', window.location.href);
    
    // For Google Sheets
    if (window.location.href.includes('docs.google.com/spreadsheets')) {
      console.log('RevPilot activated on Google Sheets');
      
      // Extract the spreadsheet ID from the URL
      const currentSpreadsheetId = extractSpreadsheetId(window.location.href);
      
      if (currentSpreadsheetId) {
        console.log('Current spreadsheet ID:', currentSpreadsheetId);
        
        if (isChromeRuntimeAvailable()) {
          // Store the current spreadsheet ID in chrome.storage.local
          chrome.storage.local.set({ currentSpreadsheetId: currentSpreadsheetId }, function() {
            if (chrome.runtime.lastError) {
              console.error('Error storing spreadsheet ID:', chrome.runtime.lastError);
            } else {
              console.log('Current spreadsheet ID stored successfully');
            }
          });
        }
      } else {
        console.error('Could not extract spreadsheet ID from URL');
      }
    }
  
    // Set up message listeners that stay consistent during page transitions
    setupMessageListeners();
  }
  
  // Set up message listeners
  function setupMessageListeners() {
    // Remove any existing listeners to prevent duplicates
    if (isChromeRuntimeAvailable() && chrome.runtime.onMessage.hasListeners()) {
      chrome.runtime.onMessage.removeListener(messageHandler);
    }
    
    // Add our message handler
    if (isChromeRuntimeAvailable()) {
      chrome.runtime.onMessage.addListener(messageHandler);
    }
  }
  
  // Handle messages from popup or background
  function messageHandler(message, sender, sendResponse) {
    console.log('Content script received message:', message);
    
    if (message.action === 'getCurrentSpreadsheetInfo') {
      console.log('Responding with spreadsheet info');
      
      try {
        // Get the title of the spreadsheet
        const title = document.title.replace(' - Google Sheets', '');
        const currentSpreadsheetId = extractSpreadsheetId(window.location.href);
        
        const response = {
          id: currentSpreadsheetId,
          title: title,
          url: window.location.href
        };
        
        console.log('Sending response:', response);
        sendResponse(response);
      } catch (error) {
        console.error('Error preparing spreadsheet info:', error);
        sendResponse({ error: 'Failed to get spreadsheet info' });
      }
    } else if (message.action === 'ping') {
      // Quick ping to check if content script is loaded
      sendResponse({ status: 'ready' });
    }
    
    return true; // Needed for async sendResponse
  }
  
  // Run the initialization
  initializeContentScript();
  
  // Store the current URL and set up observer to detect changes
  window.revPilotLastUrl = window.location.href;
  
  // Set up a single observer instance
  window.revPilotObserver = new MutationObserver(() => {
    if (window.revPilotLastUrl !== window.location.href) {
      window.revPilotLastUrl = window.location.href;
      
      // Small delay to ensure the page has properly updated
      setTimeout(() => {
        initializeContentScript();
      }, 100);
    }
  });
  
  // Start observing
  window.revPilotObserver.observe(document, { subtree: true, childList: true });
  
  // Ensure proper cleanup when the script is unloaded
  window.addEventListener('unload', () => {
    if (window.revPilotObserver) {
      window.revPilotObserver.disconnect();
    }
    
    // Clean up message listeners
    if (isChromeRuntimeAvailable() && chrome.runtime.onMessage.hasListeners()) {
      chrome.runtime.onMessage.removeListener(messageHandler);
    }
  });
}