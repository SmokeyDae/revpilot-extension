// Helper function to safely get DOM elements
function $(id) {
  return document.getElementById(id);
}

// Check if content script is loaded
function checkContentScriptLoaded(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { action: 'ping' }, response => {
      if (chrome.runtime.lastError) {
        console.log('Content script not ready:', chrome.runtime.lastError);
        reject(new Error('Content script not ready'));
      } else if (response && response.status === 'ready') {
        resolve(true);
      } else {
        reject(new Error('Invalid response from content script'));
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', function() {
  // Initialize components
  initToast();
  loadAccountPlans();
  initSearchFilter();
  
  // Add some subtle entrance animation delay
  const contentEl = $('.content');
  if (contentEl) {
    setTimeout(() => {
      contentEl.style.opacity = '1';
    }, 50);
  }
  
  // Settings button event handler
  const settingsBtn = $('#settings-button');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', function() {
      showToast('Settings will be available in the next update!', 'info');
    });
  }
  
  // Company name input enhancement
  const companyInput = $('#company-name');
  if (companyInput) {
    companyInput.addEventListener('focus', function() {
      this.parentElement.classList.add('focused');
    });
    
    companyInput.addEventListener('blur', function() {
      this.parentElement.classList.remove('focused');
    });
    
    companyInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        const generateBtn = $('#generate-plan');
        if (generateBtn) {
          generateBtn.click();
        }
      }
    });
  }
  
  // Generate plan button event handler
  const generateBtn = $('#generate-plan');
  if (generateBtn) {
    generateBtn.addEventListener('click', function() {
      const companyName = $('#company-name').value.trim();
      
      if (!companyName) {
        // Apply shake animation to the input
        const inputWrapper = document.querySelector('.input-wrapper');
        if (inputWrapper) {
          inputWrapper.classList.add('shake');
          setTimeout(() => inputWrapper.classList.remove('shake'), 600);
        }
        
        showToast('Please enter a company name', 'error');
        $('#company-name').focus();
        return;
      }
      
      // Show loading state with animation
      const companyInputDiv = $('#company-input');
      const loadingElement = $('#loading');
      
      if (companyInputDiv) {
        companyInputDiv.classList.add('hidden');
      }
      
      if (loadingElement) {
        loadingElement.classList.remove('hidden');
        loadingElement.style.opacity = '0';
        
        setTimeout(() => {
          loadingElement.style.opacity = '1';
        }, 50);
      }
      
      // Button loading state
      setButtonLoading(this, true);
      
      console.log('Creating account plan for:', companyName);
      
      // First check if we're on a Google Sheet and can use the current spreadsheet
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const currentTab = tabs[0];
        console.log('Current tab URL:', currentTab.url);
        
        // Check if the current tab is a Google Sheet
        const isGoogleSheet = currentTab.url.includes('docs.google.com/spreadsheets');
        console.log('Is Google Sheet?', isGoogleSheet);
        
        if (isGoogleSheet) {
          // Update the loading message to indicate we're using the current sheet
          const loadingMessage = $('#loading-message');
          if (loadingMessage) {
            loadingMessage.textContent = 'Updating current sheet with your account plan...';
          }
          
          // First check if content script is ready
          checkContentScriptLoaded(currentTab.id)
            .then(() => {
              console.log('Content script is ready, getting spreadsheet info...');
              // Get the current spreadsheet ID from the content script
              chrome.tabs.sendMessage(currentTab.id, {action: 'getCurrentSpreadsheetInfo'}, function(response) {
                if (chrome.runtime.lastError) {
                  console.error('Error messaging content script:', chrome.runtime.lastError);
                  console.log('Attempting fallback to storage...');
                  // Try getting the spreadsheet ID from storage
                  tryStorageSpreadsheetId(companyName);
                  return;
                }
                
                console.log('Received response from content script:', response);
                
                if (response && response.id) {
                  console.log('Using existing spreadsheet:', response.id);
                  
                  // Success message will be different for updating
                  const successText = $('#success-text');
                  if (successText) {
                    successText.textContent = 'Current sheet successfully updated with account plan!';
                  }
                  
                  // Update the existing spreadsheet
                  console.log('Calling updateExistingSheet with ID:', response.id);
                  updateExistingSheet(response.id, response.url, companyName)
                    .then(spreadsheet => {
                      console.log('Sheet update success:', spreadsheet);
                      handleSuccess(spreadsheet);
                    })
                    .catch(error => {
                      console.error('Sheet update error:', error);
                      handleError(error);
                    });
                } else {
                  // No valid response, fall back to creating a new spreadsheet
                  console.log('No valid spreadsheet ID in response, creating new spreadsheet');
                  resetLoadingMessage();
                  createNewAccountPlan();
                }
              });
            })
            .catch(error => {
              console.log('Content script not ready:', error);
              console.log('Attempting fallback to storage...');
              // Try getting the spreadsheet ID from storage
              tryStorageSpreadsheetId(companyName);
            });
        } else {
          // Not on a Google Sheet, create a new spreadsheet
          console.log('Not on a Google Sheet, creating new spreadsheet');
          createNewAccountPlan();
        }
      });
      
      // Helper function to try getting spreadsheet ID from storage
      function tryStorageSpreadsheetId(companyName) {
        chrome.storage.local.get(['currentSpreadsheetId'], function(result) {
          if (chrome.runtime.lastError || !result.currentSpreadsheetId) {
            console.log('No spreadsheet ID in storage, creating new spreadsheet');
            resetLoadingMessage();
            createNewAccountPlan();
            return;
          }
          
          const spreadsheetId = result.currentSpreadsheetId;
          console.log('Found spreadsheet ID in storage:', spreadsheetId);
          
          // Get the current URL as the spreadsheet URL
          const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
          
          // Success message for updating
          const successText = $('#success-text');
          if (successText) {
            successText.textContent = 'Current sheet successfully updated with account plan!';
          }
          
          // Update the existing spreadsheet
          updateExistingSheet(spreadsheetId, spreadsheetUrl, companyName)
            .then(spreadsheet => {
              console.log('Sheet update success:', spreadsheet);
              handleSuccess(spreadsheet);
            })
            .catch(error => {
              console.error('Sheet update error:', error);
              // If update fails, create a new sheet
              console.log('Fallback to creating new spreadsheet');
              resetLoadingMessage();
              createNewAccountPlan();
            });
        });
      }
      
      // Helper function to reset loading message
      function resetLoadingMessage() {
        const loadingMessage = $('#loading-message');
        if (loadingMessage) {
          loadingMessage.textContent = 'Generating your account plan...';
        }
      }
      
      // Create a new account plan spreadsheet
      function createNewAccountPlan() {
        createAccountPlanSheet(companyName)
          .then(handleSuccess)
          .catch(handleError);
      }
      
      // Handle successful operation (either create or update)
      function handleSuccess(spreadsheet) {
        console.log('Account plan operation successful:', spreadsheet);
        console.log('Spreadsheet URL:', spreadsheet.url);
        
        // Hide loading with fade-out effect
        if (loadingElement) {
          loadingElement.style.opacity = '0';
          setTimeout(() => {
            loadingElement.classList.add('hidden');
            
            // Show success message with animation
            const successMessage = $('#success-message');
            if (successMessage) {
              successMessage.classList.remove('hidden');
              successMessage.style.opacity = '0';
              
              setTimeout(() => {
                successMessage.style.opacity = '1';
              }, 50);
            }
            
          }, 300);
        }
        
        // Reset button loading state
        setButtonLoading(generateBtn, false);
        
        // Store the spreadsheet URL in chrome.storage.local for "View Plan" button
        chrome.storage.local.get(['companies', 'accountPlans'], function(result) {
          const companies = result.companies || [];
          if (!companies.includes(companyName)) {
            companies.push(companyName);
            chrome.storage.local.set({companies: companies});
          }
          
          // Make sure the accountPlans is properly set with the URL
          const accountPlans = result.accountPlans || {};
          if (!accountPlans[companyName] || !accountPlans[companyName].url) {
            accountPlans[companyName] = {
              id: spreadsheet.spreadsheetId,
              url: spreadsheet.url,
              created: new Date().toISOString()
            };
            chrome.storage.local.set({accountPlans: accountPlans});
          }
          
          // Show toast notification with slight delay for better UX
          setTimeout(() => {
            // Check if this was an update or create operation
            const isUpdate = $('#success-text').textContent.includes('updated');
            const message = isUpdate 
              ? `Account plan for ${companyName} updated successfully!`
              : `Account plan for ${companyName} created successfully!`;
            showToast(message);
          }, 1000);
          
          // Refresh the account plans list with animation
          setTimeout(() => {
            loadAccountPlans();
          }, 500);
        });
      }
      
      // Handle errors
      function handleError(error) {
        console.error('Error with account plan operation:', error);
        
        // Hide loading with fade-out effect
        if (loadingElement) {
          loadingElement.style.opacity = '0';
          setTimeout(() => {
            loadingElement.classList.add('hidden');
            if (companyInputDiv) {
              companyInputDiv.classList.remove('hidden');
            }
          }, 300);
        }
        
        // Reset button loading state
        setButtonLoading(generateBtn, false);
        
        // Show error toast
        showToast(`Error: ${error.message || 'Unknown error'}`, 'error');
        
        // Focus back on input
        if (companyInput) {
          companyInput.focus();
        }
      }
    });
  }
  
  // Add direct update function as fallback
  function attemptDirectUpdate(companyName) {
    console.log('Attempting direct update for company:', companyName);
    
    // This calls our debug function to try a direct update
    debugDirectUpdateSheet(companyName)
      .then(spreadsheet => {
        console.log('Direct update successful:', spreadsheet);
        // Show success message
        const successMessage = $('#success-message');
        const successText = $('#success-text');
        const loadingElement = $('#loading');
        
        if (successText) {
          successText.textContent = 'Account plan successfully applied to current sheet!';
        }
        
        if (loadingElement) {
          loadingElement.style.opacity = '0';
          setTimeout(() => {
            loadingElement.classList.add('hidden');
            
            if (successMessage) {
              successMessage.classList.remove('hidden');
              successMessage.style.opacity = '0';
              
              setTimeout(() => {
                successMessage.style.opacity = '1';
              }, 50);
            }
          }, 300);
        }
        
        // Reset button loading state
        const generateBtn = $('#generate-plan');
        if (generateBtn) {
          setButtonLoading(generateBtn, false);
        }
        
        // Show toast
        showToast(`Account plan for ${companyName} applied to current sheet!`);
      })
      .catch(error => {
        console.error('Direct update failed:', error);
        // Show error message
        const loadingElement = $('#loading');
        const companyInputDiv = $('#company-input');
        
        if (loadingElement) {
          loadingElement.style.opacity = '0';
          setTimeout(() => {
            loadingElement.classList.add('hidden');
            if (companyInputDiv) {
              companyInputDiv.classList.remove('hidden');
            }
          }, 300);
        }
        
        // Reset button loading state
        const generateBtn = $('#generate-plan');
        if (generateBtn) {
          setButtonLoading(generateBtn, false);
        }
        
        // Show error toast
        showToast(`Error: ${error.message || 'Failed to update sheet'}`, 'error');
      });
  }

// View plan button event handler
const viewPlanBtn = $('#view-plan');
if (viewPlanBtn) {
  viewPlanBtn.addEventListener('click', function() {
    const companyName = $('#company-name').value.trim();
    
    if (!companyName) {
      showToast('Company name is missing', 'error');
      return;
    }
    
    // Add a small animation to show the click
    const btn = $('#view-plan');
    if (btn) {
      btn.classList.add('btn-pulse');
      setTimeout(() => btn.classList.remove('btn-pulse'), 300);
    }
    
    // Get the spreadsheet URL from storage
    chrome.storage.local.get(['accountPlans'], function(result) {
      const accountPlans = result.accountPlans || {};
      
      console.log('All account plans:', accountPlans);
      console.log('Looking for company:', companyName);
      
      if (accountPlans[companyName] && accountPlans[companyName].url) {
        const url = accountPlans[companyName].url;
        console.log('Opening spreadsheet URL:', url);
        
        // Open the spreadsheet in a new tab
        chrome.tabs.create({ url: url });
        
        // Reset UI for creating another plan after a short delay
        setTimeout(() => {
          const successMsg = $('#success-message');
          const companyInputDiv = $('#company-input');
          
          if (successMsg) {
            successMsg.classList.add('hidden');
          }
          
          if (companyInputDiv) {
            companyInputDiv.classList.remove('hidden');
            companyInputDiv.style.opacity = '0';
            
            setTimeout(() => {
              companyInputDiv.style.opacity = '1';
            }, 50);
          }
          
          const companyInput = $('#company-name');
          if (companyInput) {
            companyInput.value = '';
          }
        }, 300);
      } else {
        console.error('Account plan not found:', companyName);
        console.error('Available plans:', Object.keys(accountPlans));
        showToast(`Could not find the account plan for ${companyName}`, 'error');
      }
    });
  });
}

  // Create another button event handler
  const createAnotherBtn = $('#create-another');
  if (createAnotherBtn) {
    createAnotherBtn.addEventListener('click', function() {
      // Animate hiding success message
      const successMessage = $('#success-message');
      if (successMessage) {
        successMessage.style.opacity = '0';
        
        setTimeout(() => {
          successMessage.classList.add('hidden');
          
          // Show input form with animation
          const companyInputDiv = $('#company-input');
          if (companyInputDiv) {
            companyInputDiv.classList.remove('hidden');
            companyInputDiv.style.opacity = '0';
            
            setTimeout(() => {
              companyInputDiv.style.opacity = '1';
              
              const companyInput = $('#company-name');
              if (companyInput) {
                companyInput.value = '';
                companyInput.focus();
              }
            }, 50);
          }
        }, 300);
      }
    });
  }
  
  // Initialize search filter
  function initSearchFilter() {
    const searchInput = $('#search-plans');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', function() {
      const query = this.value.toLowerCase().trim();
      filterPlans(query);
    });
    
    searchInput.addEventListener('focus', function() {
      this.parentElement.classList.add('focused');
    });
    
    searchInput.addEventListener('blur', function() {
      this.parentElement.classList.remove('focused');
    });
  }
  
  // Filter plans based on search query
  function filterPlans(query) {
    const planItems = document.querySelectorAll('.plan-item');
    let visible = 0;
    
    planItems.forEach(item => {
      const planNameEl = item.querySelector('.plan-name');
      if (!planNameEl) return;
      
      const planName = planNameEl.textContent.toLowerCase();
      
      if (planName.includes(query)) {
        item.style.display = '';
        
        // Subtle highlight animation if there's a query
        if (query && !item.classList.contains('highlight')) {
          item.classList.add('highlight');
          setTimeout(() => item.classList.remove('highlight'), 1000);
        }
        
        visible++;
      } else {
        item.style.display = 'none';
      }
    });
    
    // Show/hide empty state based on search results
    const emptyState = $('#empty-plans-state');
    const accountPlansList = $('#account-plans-list');
    const hasPlans = planItems.length > 0;
    
    if ((!hasPlans || visible === 0) && emptyState && accountPlansList) {
      if (!emptyState.parentNode) {
        accountPlansList.appendChild(emptyState);
      }
      emptyState.style.display = '';
      
      // Update message if it's due to filtering
      const msgEl = emptyState.querySelector('.empty-state-message');
      if (msgEl) {
        if (hasPlans && visible === 0) {
          msgEl.textContent = `No plans matching "${query}". Try another search.`;
        } else {
          msgEl.textContent = 'No account plans yet. Create your first one above!';
        }
      }
    } else if (emptyState) {
      emptyState.style.display = 'none';
    }
  }
  
  // Load account plans and populate the list
  function loadAccountPlans() {
    chrome.storage.local.get(['accountPlans'], function(result) {
      const accountPlans = result.accountPlans || {};
      const plansList = $('#account-plans-list');
      const emptyState = $('#empty-plans-state');
      const plansCountBadge = $('#plans-count');
      
      if (!plansList) return;
      
      // Clear existing plans
      plansList.innerHTML = '';
      
      // Get companies and sort by creation date (newest first)
      const companies = Object.keys(accountPlans);
      
      // Update plan count badge
      if (plansCountBadge) {
        plansCountBadge.textContent = companies.length;
      }
      
      if (companies.length === 0 && emptyState) {
        plansList.appendChild(emptyState);
        return;
      }
      
      companies.sort((a, b) => {
        const dateA = new Date(accountPlans[a].created || 0);
        const dateB = new Date(accountPlans[b].created || 0);
        return dateB - dateA;
      });
      
      // Create plan items with staggered animation
      companies.forEach((company, index) => {
        const plan = accountPlans[company];
        const planItem = document.createElement('div');
        planItem.className = 'plan-item';
        planItem.style.opacity = '0';
        planItem.style.transform = 'translateY(10px)';
        
        // Get company initial for icon
        const initial = company.charAt(0).toUpperCase();
        
        // Set a random pastel background color for the icon based on company name
        const hue = getStringHash(company) % 360;
        const iconBgColor = `hsl(${hue}, 70%, 90%)`;
        const iconTextColor = `hsl(${hue}, 70%, 30%)`;
        
        planItem.innerHTML = `
          <div class="plan-icon" style="background-color: ${iconBgColor}; color: ${iconTextColor}">${initial}</div>
          <div class="plan-details">
            <p class="plan-name">${company}</p>
            <p class="plan-date">Created: ${formatDate(plan.created)}</p>
          </div>
          <div class="plan-actions">
            <button class="open-plan" data-company="${company}" title="Open plan">→</button>
          </div>
        `;
        
        plansList.appendChild(planItem);
        
        // Add click event to open the plan
        const openPlanBtn = planItem.querySelector('.open-plan');
        if (openPlanBtn) {
          openPlanBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            
            // Button click animation
            this.classList.add('clicked');
            setTimeout(() => this.classList.remove('clicked'), 300);
            
            const company = this.getAttribute('data-company');
            openAccountPlan(company);
          });
        }
        
        // Make the entire item clickable
        planItem.addEventListener('click', function() {
          const openBtn = this.querySelector('.open-plan');
          if (openBtn) {
            const company = openBtn.getAttribute('data-company');
            
            // Item click animation
            this.classList.add('clicked');
            setTimeout(() => this.classList.remove('clicked'), 300);
            
            openAccountPlan(company);
          }
        });
        
        // Staggered fade-in animation
        setTimeout(() => {
          planItem.style.opacity = '1';
          planItem.style.transform = 'translateY(0)';
          planItem.style.transition = 'all 0.3s ease-out';
        }, 50 + (index * 50));
      });
      
      // Apply any active search filter
      const searchQuery = $('#search-plans');
      if (searchQuery && searchQuery.value.trim()) {
        filterPlans(searchQuery.value.trim().toLowerCase());
      }
    });
  }
  
  // Open an account plan
  function openAccountPlan(company) {
    chrome.storage.local.get(['accountPlans'], function(result) {
      const accountPlans = result.accountPlans || {};
      
      if (accountPlans[company] && accountPlans[company].url) {
        // Open the spreadsheet in a new tab
        chrome.tabs.create({ url: accountPlans[company].url });
      } else {
        showToast(`Could not find the account plan for ${company}`, 'error');
      }
    });
  }
  
  // Initialize toast functionality
  function initToast() {
    const toast = $('#toast');
    if (!toast) return;
    
    const closeBtn = toast.querySelector('.toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        toast.classList.remove('show');
      });
    }
  }
  
  // Show toast notification
  function showToast(message, type = 'success') {
    const toast = $('#toast');
    if (!toast) return;
    
    const toastMessage = toast.querySelector('.toast-message');
    const toastIcon = toast.querySelector('.toast-icon');
    
    if (!toastMessage || !toastIcon) return;
    
    // Clear any existing timeout
    if (toast.timeoutId) {
      clearTimeout(toast.timeoutId);
    }
    
    // Set toast type (changes background color)
    toast.className = 'toast';
    toast.classList.add(type);
    
    // Set appropriate icon
    switch(type) {
      case 'success':
        toastIcon.innerHTML = '✓';
        break;
      case 'error':
        toastIcon.innerHTML = '✕';
        break;
      case 'info':
        toastIcon.innerHTML = 'ℹ';
        break;
      case 'warning':
        toastIcon.innerHTML = '⚠';
        break;
      default:
        toastIcon.innerHTML = '✓';
    }
    
    // Set message
    toastMessage.textContent = message;
    
    // Show toast with animation
    toast.classList.add('show');
    
    // Auto-hide after 3 seconds
    toast.timeoutId = setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }
  
  // Handle button loading state
  function setButtonLoading(button, isLoading) {
    if (!button) return;
    
    if (isLoading) {
      button.disabled = true;
      button.classList.add('button-loading');
      button.dataset.originalText = button.textContent;
      button.textContent = '';
    } else {
      button.disabled = false;
      button.classList.remove('button-loading');
      button.textContent = button.dataset.originalText || 'Submit';
    }
  }
  
  // Format date for display
  function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    const now = new Date();
    
    // If today, show as "Today"
    if (date.toDateString() === now.toDateString()) {
      return 'Today';
    }
    
    // If yesterday
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    
    // If this year, show Month Day (e.g., Mar 15)
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    
    // Otherwise show full date
    return date.toLocaleDateString();
  }
  
  // Get a consistent hash value from a string
  function getStringHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
  
  // Run debug functions
  debugExtensionState();
  debugAccountPlans();
});


// Debug function to check account plans storage
function debugAccountPlans() {
  chrome.storage.local.get(['accountPlans'], function(result) {
    const accountPlans = result.accountPlans || {};
    console.log('%c===== ACCOUNT PLANS DEBUG INFO =====', 'background: #004aad; color: white; padding: 4px; font-weight: bold;');
    console.log('Number of plans:', Object.keys(accountPlans).length);
    
    if (Object.keys(accountPlans).length === 0) {
      console.log('No account plans found in storage');
    } else {
      console.log('Plans by company name:');
      Object.keys(accountPlans).forEach(company => {
        const plan = accountPlans[company];
        console.log(
          `%c${company}`, 
          'font-weight: bold; color: #004aad;', 
          '\n  ID:', plan.id, 
          '\n  URL:', plan.url, 
          '\n  Created:', plan.created
        );
      });
    }
    console.log('%c===== END DEBUG INFO =====', 'background: #004aad; color: white; padding: 4px; font-weight: bold;');
  });
}

// Extension state debug function
function debugExtensionState() {
  console.group('RevPilot Extension Debug Info');
  
  // Check auth token
  chrome.storage.local.get(['revpilot_auth_token'], function(result) {
    console.log('Auth token exists:', !!result.revpilot_auth_token);
    if (result.revpilot_auth_token) {
      console.log('Token length:', result.revpilot_auth_token.length);
    }
  });
  
  // Check account plans
  chrome.storage.local.get(['accountPlans'], function(result) {
    const plans = result.accountPlans || {};
    console.log('Number of account plans:', Object.keys(plans).length);
    console.log('Account plans:', plans);
  });
  
  // Check current spreadsheet ID
  chrome.storage.local.get(['currentSpreadsheetId'], function(result) {
    console.log('Current spreadsheet ID:', result.currentSpreadsheetId || 'None');
  });
  
  // Check if we're on Google Sheets
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0]) {
      const url = tabs[0].url;
      console.log('Current tab URL:', url);
      console.log('Is Google Sheets?', url.includes('docs.google.com/spreadsheets'));
      
      // Check if content script is loaded
      if (url.includes('docs.google.com/spreadsheets')) {
        chrome.tabs.sendMessage(tabs[0].id, {action: 'ping'}, function(response) {
          console.log('Content script response:', response || 'No response');
          console.log('Content script error:', chrome.runtime.lastError || 'None');
        });
      }
    }
  });
  
  console.groupEnd();
}