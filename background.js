// Background script for handling events across the extension

// Add this function to log any chrome errors
function logChromeError() {
  if (chrome.runtime.lastError) {
    console.error('Chrome error:', chrome.runtime.lastError);
    return true;
  }
  return false;
}

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('RevPilot extension installed');
  
  // Initialize storage with example companies
  const initialCompanies = ['Acme Inc.', 'Globex Corporation', 'Initech'];
  chrome.storage.local.set({ companies: initialCompanies }, () => {
    if (logChromeError()) return;
    console.log('Initialized example companies');
  });
  
  // Ensure we have an empty accountPlans object
  chrome.storage.local.set({ accountPlans: {} }, () => {
    if (logChromeError()) return;
    console.log('Initialized empty accountPlans');
  });
});

// Inject content script when navigating to supported pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only run when the page is fully loaded
  if (changeInfo.status !== 'complete') return;
  
  // Only match URLs we care about
  const url = tab.url || '';
  const isGoogleSheets = url.includes('docs.google.com/spreadsheets');
  const isLinkedIn = url.includes('linkedin.com');
  
  if (isGoogleSheets || isLinkedIn) {
    console.log(`Tab ${tabId} updated with URL: ${url}`);
    
    // We need to inject the content script to ensure it's running
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }, () => {
      if (logChromeError()) {
        console.error(`Failed to inject content script into tab ${tabId}`);
        return;
      }
      console.log(`Content script injected into tab ${tabId}`);
    });
  }
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  if (message.action === 'createAccountPlan') {
    console.log('Creating account plan for:', message.company);
    
    // We'll pass this to our API functions eventually
    sendResponse({ success: true, message: 'Request received' });
    return true;
  }
  
  if (message.action === 'addContact') {
    console.log('Adding contact to account plan:', message.contact, 'Account:', message.account);
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'saveArticle') {
    console.log('Saving article to account plan:', message.article, 'Account:', message.account);
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'checkContentScript') {
    // Ping the content script to see if it's loaded
    try {
      chrome.tabs.sendMessage(message.tabId, { action: 'ping' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Content script not ready in tab', message.tabId);
          sendResponse({ loaded: false, error: chrome.runtime.lastError.message });
          return;
        }
        
        console.log('Content script response:', response);
        sendResponse({ loaded: true, response });
      });
    } catch (error) {
      console.error('Error checking content script:', error);
      sendResponse({ loaded: false, error: error.message });
    }
    return true;
  }
  
  return false;
});

// Handle authentication events
chrome.identity.onSignInChanged.addListener((account, signedIn) => {
  console.log('Sign in state changed for account:', account, 'Signed in:', signedIn);
  
  if (!signedIn) {
    // Clear our stored token since the user signed out
    chrome.storage.local.remove(['revpilot_auth_token'], () => {
      if (logChromeError()) return;
      console.log('Auth token removed due to sign out');
    });
  }
});