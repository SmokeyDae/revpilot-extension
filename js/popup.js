// RevPilot AI - Popup Script
document.addEventListener('DOMContentLoaded', function() {
  // Apply compact styling to the create tab
  const createTabHeading = document.querySelector('#create-tab h2');
  if (createTabHeading) createTabHeading.classList.add('compact-heading');
  
  const createForm = document.querySelector('#create-plan-form');
  if (createForm) createForm.classList.add('compact-form');
  
  // Ensure main content has proper padding
  const mainContent = document.querySelector('.main-content');
  if (mainContent && !mainContent.classList.contains('compact-main')) {
    mainContent.classList.add('compact-main');
  }

  // Constants with fixed storage key prefixes
  const STORAGE_KEY_MASTER_SHEET = 'revpilot_masterSheetId';
  const STORAGE_KEY_RECENT_PLANS = 'revpilot_recentPlans';
  const STORAGE_KEY_DARK_MODE = 'revpilot_darkMode';
  const MAX_RETRY_ATTEMPTS = 3;
  const RETRY_DELAY = 1000; // ms
  const APP_VERSION = '1.1.0'; // Updated version tracking
  // DOM elements
  const loginSection = document.getElementById('login-section');
  const mainSection = document.getElementById('main-section');
  const successSection = document.getElementById('success-section');
  const errorSection = document.getElementById('error-section');
  const recentPlans = document.getElementById('recent-plans');

  const loginButton = document.getElementById('login-button');
  const createPlanForm = document.getElementById('create-plan-form');
  const openSheetLink = document.getElementById('open-sheet-link');
  const createAnotherButton = document.getElementById('create-another-button');
  const backButton = document.getElementById('back-button');
  const tryAgainButton = document.getElementById('try-again-button');
  const errorMessage = document.getElementById('error-message');
  const helpLink = document.getElementById('help-link');
  
  // Update version display in footer
  const versionElement = document.getElementById('version-number');
  if (versionElement) {
      versionElement.textContent = APP_VERSION;
  }

  // Tab elements
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  // Remove the loader once the DOM is ready
  const appLoader = document.getElementById('app-loader');
  if (appLoader && appLoader.parentNode) {
    setTimeout(() => {
      appLoader.classList.add('fade-out');
      setTimeout(() => {
        if (appLoader.parentNode) {
          appLoader.parentNode.removeChild(appLoader);
        }
      }, 300);
    }, 500);
  }
  // Initial check - hide all sections 
  const allSections = [loginSection, mainSection, successSection, errorSection];
  allSections.forEach(function(s) {
    if (s) {
      s.classList.add('hidden');
      s.setAttribute('aria-hidden', 'true');
    }
  });
  // Check if user is already authenticated
  checkAuthentication().then(isAuthenticated => {
    // Tab switching initialization should happen regardless of auth status
    enhanceTabSwitching();
    
    // Add features after tab initialization
    addSearchBox();
    addAccessibilityImprovements();
    initializeThemeSwitcher();
    
    // Set up the upgrade tab functionality
    setupUpgradeTabFunctionality();
    
    // Setup initialization for upgrade tab when needed
    initUpgradeTabWhenNeeded();
  });
  // Add refresh plans button event listener
  const refreshPlansButton = document.getElementById('refresh-plans');
  if (refreshPlansButton) {
    refreshPlansButton.addEventListener('click', function() {
      loadRecentPlans(true); // Force refresh
      
      // Enhanced toast notification for "Refreshing plans..."
      showEnhancedToast('Refreshing plans...', 'info');
      
      // Add a visual spinning effect to the icon
      const icon = refreshPlansButton.querySelector('i');
      if (icon) {
        icon.classList.add('fa-spin');
        setTimeout(() => {
          icon.classList.remove('fa-spin');
        }, 2000);
      }
    });
  }
  // Event listeners
  if (loginButton) {
    loginButton.addEventListener('click', function() {
        // Visual feedback when clicking login
        loginButton.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Signing in...';
        loginButton.disabled = true;
        
        // Try to get auth token to validate authentication
        chrome.runtime.sendMessage({action: 'getAuthToken'}, function(response) {
            if (chrome.runtime.lastError) {
                showEnhancedToast(chrome.runtime.lastError.message, 'error');
                resetLoginButton();
                return;
            }
            
            if (response && response.token) {
                // Auth successful, proceed to main view
                hideAllSections();
                showSection(mainSection);
                
                // Trigger a welcome message
                showEnhancedToast('Welcome to RevPilot AI!', 'success');
            } else {
                // Auth failed, show error message
                showEnhancedToast('Authentication failed. Please try again.', 'error');
                resetLoginButton();
                return;
            }
            
            // Reset button state regardless
            resetLoginButton();
        });
        
        function resetLoginButton() {
            loginButton.innerHTML = '<i class="fas fa-sign-in-alt" aria-hidden="true"></i> Sign in with Google';
            loginButton.disabled = false;
        }
    });
  }
  if (createPlanForm) {
    createPlanForm.addEventListener('submit', handleCreatePlan);
  }

  if (createAnotherButton) {
      createAnotherButton.addEventListener('click', resetToCreate);
  }

  if (backButton) {
      backButton.addEventListener('click', resetToCreate);
  }

  if (tryAgainButton) {
      tryAgainButton.addEventListener('click', resetToCreate);
  }

  if (helpLink) {
    helpLink.addEventListener('click', function(e) {
        e.preventDefault();
        showPopup('help-modal-overlay');
    });
  }
  // Function to handle tab switching in the profile popup
  function setupProfilePopupTabs() {
    const tabButtons = document.querySelectorAll('.popup-tab-button');
    const tabContents = document.querySelectorAll('.popup-tab-content');
    
    tabButtons.forEach(function(button) {
      button.addEventListener('click', function() {
        const tabName = button.getAttribute('data-tab');
        
        // Update active tab button
        tabButtons.forEach(function(btn) {
          btn.classList.remove('active');
        });
        button.classList.add('active');
        
        // Show corresponding tab content
        tabContents.forEach(function(content) {
          content.classList.remove('active');
        });
        
        const tabContent = document.getElementById(`${tabName}-tab`);
        if (tabContent) {
          tabContent.classList.add('active');
        }
      });
    });
  }
  // Standardized function to show popup
  function showPopup(popupId) {
    const popupOverlay = document.getElementById(popupId);
    if (!popupOverlay) return;
    
    // First make sure it's not hidden (for accessibility/display purposes)
    popupOverlay.classList.remove('hidden');
    
    // Show the popup with animation
    setTimeout(() => {
      popupOverlay.classList.add('show');
      const popupContainer = popupOverlay.querySelector('.popup-container');
      if (popupContainer) {
        popupContainer.classList.add('show');
      }
      
      // Announce to screen readers
      const notificationArea = document.getElementById('notification-area');
      if (notificationArea) {
        let popupTitle = popupOverlay.querySelector('.popup-header h3');
        let title = popupTitle ? popupTitle.textContent.trim() : 'Dialog';
        notificationArea.textContent = title + ' opened';
      }
      
      // Setup tabs if this is the profile popup
      if (popupId === 'profile-popup') {
        setupProfilePopupTabs();
      }
    }, 10);
  }
  /**
   * Sets up the upgrade tab functionality to switch between free and pro plan views
   * This consolidated function replaces multiple implementations to avoid conflicts
   */
   function setupUpgradeTabFunctionality() {
    console.log("Setting up upgrade tab functionality");
    
    // Get references to the buttons
    const showProPlanBtn = document.getElementById('show-pro-plan');
    const backToFreeBtn = document.getElementById('back-to-free');
    
    // Get references to the plan slides
    const freePlanView = document.getElementById('free-plan-view');
    const proPlanView = document.getElementById('pro-plan-view');
    
    // Guard clause: make sure all elements exist
    if (!showProPlanBtn || !backToFreeBtn || !freePlanView || !proPlanView) {
      console.error("Upgrade tab elements not found:", {
        showProPlanBtn: !!showProPlanBtn,
        backToFreeBtn: !!backToFreeBtn,
        freePlanView: !!freePlanView,
        proPlanView: !!proPlanView
      });
      return;
    }
    
    // Remove any existing click event listeners by cloning and replacing
    const newShowProPlanBtn = showProPlanBtn.cloneNode(true);
    const newBackToFreeBtn = backToFreeBtn.cloneNode(true);
    
    if (showProPlanBtn.parentNode) {
      showProPlanBtn.parentNode.replaceChild(newShowProPlanBtn, showProPlanBtn);
    }
    
    if (backToFreeBtn.parentNode) {
      backToFreeBtn.parentNode.replaceChild(newBackToFreeBtn, backToFreeBtn);
    }
    
    // Add event listener for "View Pro Plan" button
    newShowProPlanBtn.addEventListener('click', function() {
      console.log("View Pro Plan clicked");
      
      // Hide free plan view
      freePlanView.classList.remove('active');
      freePlanView.classList.add('slide-out');
      
      // Add a visual feedback when clicking the button
      this.classList.add('clicked');
      
      // Show pro plan view with slight delay for smoother transition
      setTimeout(() => {
        proPlanView.classList.add('active');
        
        // Ensure the pro plan view is scrolled to the top
        const popupTabContent = document.getElementById('upgrade-tab');
        if (popupTabContent) {
          popupTabContent.scrollTop = 0;
        }
        
        // Animate the features with staggered entrance
        const features = proPlanView.querySelectorAll('.plan-features li');
        features.forEach((feature, index) => {
          feature.style.animationDelay = `${0.05 * (index + 1)}s`;
          feature.style.opacity = '0';
          feature.style.animation = 'fadeInUp 0.3s forwards';
        });
      }, 50);
    });
    
    // Add event listener for "Back" button
    newBackToFreeBtn.addEventListener('click', function() {
      console.log("Back to Free clicked");
      
      // Hide pro plan view immediately
      proPlanView.classList.remove('active');
      
      // Show free plan view with slight delay
      setTimeout(() => {
        freePlanView.classList.remove('slide-out');
        freePlanView.classList.add('active');
        
        // Ensure the free plan view is scrolled to the top
        const popupTabContent = document.getElementById('upgrade-tab');
        if (popupTabContent) {
          popupTabContent.scrollTop = 0;
        }
      }, 50);
    });
    
    console.log("Upgrade tab functionality setup complete");
  }
  /**
   * Initializes the upgrade tab functionality when the tab is selected
   */
   function initUpgradeTabWhenNeeded() {
    // Get the upgrade tab button
    const upgradeTabBtn = document.querySelector('.popup-tab-button[data-tab="upgrade"]');
    
    if (upgradeTabBtn) {
      // Add a listener to initialize the upgrade tab when it's selected
      upgradeTabBtn.addEventListener('click', function() {
        console.log("Upgrade tab selected");
        
        // Ensure we're starting with the free plan view
        const freePlanView = document.getElementById('free-plan-view');
        const proPlanView = document.getElementById('pro-plan-view');
        
        if (freePlanView && proPlanView) {
          // Reset both views to their initial state
          freePlanView.classList.add('active');
          freePlanView.classList.remove('slide-out');
          proPlanView.classList.remove('active');
          
          // Ensure the upgrade tab content is scrolled to the top
          const popupTabContent = document.getElementById('upgrade-tab');
          if (popupTabContent) {
            popupTabContent.scrollTop = 0;
          }
        }
        
        // This ensures the functionality is set up when the tab is shown
        setupUpgradeTabFunctionality();
        
        // Also trigger animations for the plan features
        const features = document.querySelectorAll('#free-plan-view .plan-features li');
        features.forEach((feature, index) => {
          // Reset animation
          feature.style.animation = 'none';
          feature.offsetHeight; // Trigger reflow
          
          // Apply animation with calculated delay
          feature.style.animation = `fadeInUp 0.3s forwards ${index * 0.05}s`;
        });
      });
    }
  }
  // Standardized function to close popup
  function closePopup(popupId) {
    const popupOverlay = document.getElementById(popupId);
    if (!popupOverlay) return;
    
    popupOverlay.classList.remove('show');
    const popupContainer = popupOverlay.querySelector('.popup-container');
    if (popupContainer) {
      popupContainer.classList.remove('show');
    }
    
    setTimeout(() => {
      popupOverlay.classList.add('hidden');
    }, 300);
  }

  // Setup all popups with standardized behaviors
  function setupPopups() {
    console.log("Setting up popups - should only run once");
    
    // Setup popup triggers
    const popupTriggers = [
      { triggerId: 'plan-includes-btn', popupId: 'plan-includes-overlay' },
      { triggerId: 'help-link', popupId: 'help-modal-overlay' },
      { triggerId: 'profile-button', popupId: 'profile-popup' }
    ];
    popupTriggers.forEach(item => {
      const trigger = document.getElementById(item.triggerId);
      if (trigger) {
        // Remove any existing event listeners by cloning and replacing the element
        const newTrigger = trigger.cloneNode(true);
        if (trigger.parentNode) {
          trigger.parentNode.replaceChild(newTrigger, trigger);
        }
        
        newTrigger.addEventListener('click', function(e) {
          if (e.currentTarget.tagName === 'A') {
            e.preventDefault();
          }
          showPopup(item.popupId);
        });
      }
    });
    
    // Setup close buttons for all popups
    document.querySelectorAll('.popup-close').forEach(closeBtn => {
      closeBtn.addEventListener('click', function() {
        const popupOverlay = this.closest('.popup-overlay');
        if (popupOverlay) {
          closePopup(popupOverlay.id);
        }
      });
    });
    
    // Close popups when clicking outside
    document.querySelectorAll('.popup-overlay').forEach(overlay => {
      overlay.addEventListener('click', function(e) {
        if (e.target === this) {
          closePopup(this.id);
        }
      });
    });
    
    // Close popups with Escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.popup-overlay:not(.hidden)').forEach(popup => {
          closePopup(popup.id);
        });
      }
    });
    
    // Initialize profile popup tabs
    setupProfilePopupTabs();
    
    // Initialize upgrade tab functionality
    setupUpgradeTabFunctionality();
  }

  // Initialize popups only once
  setupPopups();
  /**
   * Enhance the upgrade button with a special animation and tooltip
   */
   function enhanceUpgradeButton() {
    const upgradeButton = document.getElementById('upgrade-button');
    
    if (upgradeButton) {
      // Add hover animation
      upgradeButton.addEventListener('mouseenter', function() {
        this.classList.add('pulse-animation');
      });
      
      upgradeButton.addEventListener('mouseleave', function() {
        this.classList.remove('pulse-animation');
      });
      
      // Add click handler to show a message
      upgradeButton.addEventListener('click', function() {
        // Show a toast notification
        showEnhancedToast('Coming soon! Upgrade feature will be available in the next release.', 'info', 3000);
      });
    }
  }
  
  // Call enhanceUpgradeButton after setup
  setTimeout(enhanceUpgradeButton, 500);
  
  // Export functions for use in other modules if needed
  if (typeof window !== 'undefined') {
    window.RevPilotPopups = {
      showPopup,
      closePopup,
      setupPopups
    };
  }
  document.addEventListener('DOMContentLoaded', function() {
    // Get reference to your button
    const createPlanButton = document.getElementById('create-plan-button');
    
    if (createPlanButton) {
      createPlanButton.addEventListener('click', async () => {
        try {
          const planName = document.getElementById('plan-name-input').value;
          
          if (!planName) {
            throw new Error('Plan name is required');
          }
          
          // Show loading state
          createPlanButton.disabled = true;
          createPlanButton.textContent = 'Creating...';
          
          // Create the plan
          const newPlan = await createNewPlan(planName);
          
          // Update UI with the new plan
          displayNewPlan(newPlan);
          
          // Reset form
          document.getElementById('plan-name-input').value = '';
        } catch (error) {
          console.error('Error creating plan:', error);
          showEnhancedToast(error.message, 'error');
        } finally {
          // Reset button state
          createPlanButton.disabled = false;
          createPlanButton.textContent = 'Create Plan';
        }
      });
    }
  });
  // ------- NEW HELPER FUNCTION: Find existing sheet tab -------
  // Helper function to find if a sheet is already open in any tab
  function findExistingSheetTab(spreadsheetUrl) {
    return new Promise((resolve) => {
      chrome.tabs.query({}, function(tabs) {
        // Check if any tab matches the spreadsheet URL (ignoring hash/fragment)
        const baseUrl = spreadsheetUrl.split('#')[0];
        const existingTab = tabs.find(tab => tab.url && tab.url.includes(baseUrl));
        resolve(existingTab);
      });
    });
  }
  // ------- UPDATED EVENT DELEGATION FOR PLAN ITEMS -------
  // Add event delegation for plan items
  if (recentPlans) {
    recentPlans.addEventListener('click', async function(event) {
      // Check if a delete button was clicked
      if (event.target.closest('.delete-button')) {
        const button = event.target.closest('.delete-button');
        const planId = button.getAttribute('data-plan-id');
        const accountName = button.getAttribute('data-account-name');
        const sheetGid = button.getAttribute('data-sheet-gid');
        
        if (planId && accountName) {
          handleDeletePlan(planId, accountName, sheetGid);
        }
        return;
      }
      
      // Check if an open button was clicked
      if (event.target.closest('.open-button')) {
        const button = event.target.closest('.open-button');
        const planUrl = button.getAttribute('data-plan-url');
        
        if (planUrl) {
          // Show a loading toast to indicate we're checking for existing tabs
          showEnhancedToast('Opening plan...', 'info', 1000);
          
          try {
            // Check if the sheet is already open in a tab
            const existingTab = await findExistingSheetTab(planUrl);
            
            if (existingTab) {
              // Switch to the existing tab instead of opening a new one
              chrome.tabs.update(existingTab.id, { 
                active: true,
                url: planUrl // Ensure we navigate to the correct sheet/gid
              });
              
              // If the tab is in a different window, focus that window too
              chrome.windows.update(existingTab.windowId, { focused: true });
            } else {
              // No existing tab found, open a new one
              chrome.tabs.create({ url: planUrl });
            }
          } catch (error) {
            console.error("Error checking for existing tabs:", error);
            // Fallback to just opening a new tab
            chrome.tabs.create({ url: planUrl });
          }
        }
      }
    });
  }
  // ------- UPDATED OPEN SHEET LINK HANDLER -------
  // Add event listener for the open sheet link in the success section
  if (openSheetLink) {
    openSheetLink.addEventListener('click', async function(event) {
      event.preventDefault();
      const planUrl = this.href;
      
      if (planUrl) {
        try {
          // Check if the sheet is already open in a tab
          const existingTab = await findExistingSheetTab(planUrl);
          
          if (existingTab) {
            // Switch to the existing tab
            chrome.tabs.update(existingTab.id, { 
              active: true,
              url: planUrl // Ensure we navigate to the correct sheet/gid
            });
            
            // If the tab is in a different window, focus that window too
            chrome.windows.update(existingTab.windowId, { focused: true });
          } else {
            // No existing tab found, open a new one
            chrome.tabs.create({ url: planUrl });
          }
        } catch (error) {
          console.error("Error checking for existing tabs:", error);
          // Fallback to just opening a new tab
          chrome.tabs.create({ url: planUrl });
        }
      }
    });
  }
  // Enhanced tab switching
  function enhanceTabSwitching() {
    tabButtons.forEach(function(button) {
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', button.classList.contains('active') ? 'true' : 'false');
        
        button.addEventListener('click', function() {
            const tabName = button.getAttribute('data-tab');
            console.log("Tab clicked:", tabName);
            
            // Update active tab button and ARIA states
            tabButtons.forEach(function(btn) {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
            });
            button.classList.add('active');
            button.setAttribute('aria-selected', 'true');
            
            // Show corresponding tab content
            tabContents.forEach(function(content) {
                content.classList.remove('active');
                content.setAttribute('aria-hidden', 'true');
            });
            
            const tabContent = document.getElementById(tabName + '-tab');
            if (tabContent) {
                tabContent.classList.add('active');
                tabContent.setAttribute('aria-hidden', 'false');
                
                // Force immediate load of plans when switching to manage tab
                if (tabName === 'manage') {
                    loadRecentPlans();
                }
            } else {
                console.error("Tab content not found:", tabName + '-tab');
            }
        });
    });
  }
  // Add search box to manage tab
  function addSearchBox() {
    const manageTab = document.getElementById('manage-tab');
    if (!manageTab) return;
    
    // Create search box if it doesn't exist
    if (!document.getElementById('search-plans')) {
        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container';
        searchContainer.innerHTML = `
            <div class="search-box">
                <i class="fas fa-search search-icon" aria-hidden="true"></i>
                <input type="text" id="search-plans" placeholder="Search plans..." aria-label="Search plans">
                <button type="button" id="clear-search" class="clear-search-btn hide-button" aria-label="Clear search">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        // Insert at the top of the manage tab
        manageTab.insertBefore(searchContainer, manageTab.querySelector('#recent-plans'));
        
        // Add event listener
        const searchInput = document.getElementById('search-plans');
        const clearSearchBtn = document.getElementById('clear-search');
        
        if (searchInput && clearSearchBtn) {
            // Show/hide clear button based on input content
            searchInput.addEventListener('input', function() {
                const searchTerm = this.value.toLowerCase().trim();
                
                // Toggle clear button visibility
                if (searchTerm.length > 0) {
                    clearSearchBtn.classList.remove('hide-button');
                } else {
                    clearSearchBtn.classList.add('hide-button');
                }
                
                // Filter plans
                handlePlanSearch(searchTerm);
            });
            
            // Clear search button functionality
            clearSearchBtn.addEventListener('click', function() {
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input'));
                searchInput.focus();
                this.classList.add('hide-button');
            });
        }
    }
  }
  // Initialize theme switcher
  function initializeThemeSwitcher() {
    // Add dark mode toggle button if it doesn't exist
    if (!document.getElementById('dark-mode-toggle')) {
      const darkModeToggle = document.createElement('button');
      darkModeToggle.id = 'dark-mode-toggle';
      darkModeToggle.className = 'icon-button';
      darkModeToggle.setAttribute('aria-label', 'Toggle dark mode');
      darkModeToggle.innerHTML = '<i class="fas fa-moon"></i>';
      
      // Add to header
      const appHeader = document.querySelector('.app-header');
      if (appHeader) {
        appHeader.appendChild(darkModeToggle);
      }
      
      // Check stored theme preference
      chrome.storage.local.get([STORAGE_KEY_DARK_MODE], (result) => {
        if (result[STORAGE_KEY_DARK_MODE]) {
          document.body.classList.add('dark-mode');
          darkModeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        }
      });
      
      // Add event listener
      darkModeToggle.addEventListener('click', function() {
        const isDarkMode = document.body.classList.toggle('dark-mode');
        
        // Update button icon
        darkModeToggle.innerHTML = isDarkMode ? 
          '<i class="fas fa-sun"></i>' : 
          '<i class="fas fa-moon"></i>';
        
        // Save preference
        chrome.storage.local.set({ [STORAGE_KEY_DARK_MODE]: isDarkMode });
        
        // Show a toast notification
        showEnhancedToast(isDarkMode ? 'Dark mode enabled' : 'Light mode enabled', 'info', 1500);
      });
    }
  }
  // Add accessibility improvements
  function addAccessibilityImprovements() {
    // Add role="tablist" to tabs container
    const tabsContainer = document.querySelector('.tabs');
    if (tabsContainer) {
      tabsContainer.setAttribute('role', 'tablist');
    }
    // Add proper ARIA attributes to tab buttons
    tabButtons.forEach(function(button, index) {
      const tabId = button.getAttribute('data-tab');
      button.setAttribute('id', `tab-${tabId}`);
      button.setAttribute('aria-controls', `${tabId}-tab`);
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', button.classList.contains('active') ? 'true' : 'false');
      button.setAttribute('tabindex', button.classList.contains('active') ? '0' : '-1');
    });
    
    // Add proper ARIA attributes to tab contents
    tabContents.forEach(function(content) {
      content.setAttribute('role', 'tabpanel');
      content.setAttribute('aria-hidden', !content.classList.contains('active'));
      
      // Find the corresponding tab button
      const tabId = content.id.replace('-tab', '');
      const tabButton = document.querySelector(`[data-tab="${tabId}"]`);
      
      if (tabButton) {
        content.setAttribute('aria-labelledby', `tab-${tabId}`);
      }
      
      // Add tabindex to make the panel focusable
      if (content.classList.contains('active')) {
        content.setAttribute('tabindex', '0');
      } else {
        content.setAttribute('tabindex', '-1');
      }
    });
    
    // Add notification area for screen readers if not present
    if (!document.getElementById('notification-area')) {
      const notificationArea = document.createElement('div');
      notificationArea.id = 'notification-area';
      notificationArea.className = 'visually-hidden';
      notificationArea.setAttribute('aria-live', 'polite');
      document.body.appendChild(notificationArea);
    }
  }
  // Check if user is already authenticated
  async function checkAuthentication() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({action: 'getAuthToken'}, function(response) {
        if (chrome.runtime.lastError) {
          console.warn("Auth check error:", chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        
        // Show relevant section based on authentication status
        const isAuthenticated = !!(response && response.token);
        if (isAuthenticated) {
          showSection(mainSection);
          
          // Check if manage tab is active on popup open
          const manageTabActive = document.querySelector('[data-tab="manage"].active');
          if (manageTabActive) {
            console.log("Manage tab is active on popup open, loading plans...");
            loadRecentPlans();
          }
        } else {
          showSection(loginSection);
        }
        
        resolve(isAuthenticated);
      });
    });
  }
  // Hide all sections
  function hideAllSections() {
    const allSections = [loginSection, mainSection, successSection, errorSection];
    
    allSections.forEach(function(s) {
      if (s) {
        s.classList.add('hidden');
        s.setAttribute('aria-hidden', 'true');
      }
    });
  }

  // Show a specific section
  function showSection(section) {
    // Hide all sections first
    hideAllSections();
    
    // Show requested section
    if (section) {
      section.classList.remove('hidden');
      section.setAttribute('aria-hidden', 'false');
    }
  }
// Enhanced showToast function for consistent notifications
function showEnhancedToast(message, type = 'info', duration = 3000) {
  // Remove existing toast if present
  const existingToast = document.getElementById('toast');
  if (existingToast) {
    existingToast.classList.add('hiding');
    setTimeout(() => {
      if (existingToast.parentNode) {
        existingToast.parentNode.removeChild(existingToast);
      }
    }, 300);
  }
  
  // Get appropriate icon based on type
  let icon = 'info-circle';
  if (type === 'success') {
    icon = 'check-circle';
  } else if (type === 'error') {
    icon = 'exclamation-circle';
  } else if (type === 'warning') {
    icon = 'exclamation-triangle';
  }

  // Create new toast with enhanced styling
  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = `toast ${type}`;
  
  toast.innerHTML = `
    <div class="toast-content">
      <i class="fas fa-${icon} toast-icon"></i>
      <span>${message}</span>
    </div>
    <button class="toast-close" aria-label="Dismiss notification">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  document.body.appendChild(toast);
  
  // Add close button functionality
  const closeBtn = toast.querySelector('.toast-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      toast.classList.add('hiding');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    });
  }
  
  // Announce to screen readers
  const notificationArea = document.getElementById('notification-area');
  if (notificationArea) {
    notificationArea.textContent = message;
  }
  
  // Auto-remove after delay
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add('hiding');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }
  }, duration);
}
  // Original showToast function - modified to use the enhanced version
  function showToast(message, type = 'info', duration = 3000) {
    // Redirect to enhanced version
    showEnhancedToast(message, type, duration);
  }
  // Load recent plans
  function loadRecentPlans(forceRefresh = false) {
    if (!recentPlans) {
      console.error("recentPlans element not found");
      return;
    }
    
    // Set loading state
    recentPlans.innerHTML = `
      <div class="skeleton-container" aria-hidden="true">
        <div class="skeleton-item"></div>
        <div class="skeleton-item"></div>
        <div class="skeleton-item"></div>
      </div>
      <p class="visually-hidden" aria-live="polite">Loading plans...</p>
    `;
    
    // Get plans from storage
    chrome.storage.local.get(['revpilot_masterSheetId', 'revpilot_recentPlans'], (result) => {
      const masterSheetId = result['revpilot_masterSheetId'];
      const plans = result['revpilot_recentPlans'] || [];
      
      if (plans.length > 0) {
        displayPlans(plans);
      } else {
        // Show empty state
        recentPlans.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">
              <i class="fas fa-clipboard-list"></i>
            </div>
            <h3>No plans yet</h3>
            <p>Create your first account plan to get started.</p>
            <button class="button primary create-first-plan-btn">
              <i class="fas fa-plus"></i> Create Plan
            </button>
          </div>
        `;
        
        // Add event listener to the button
        const createFirstBtn = recentPlans.querySelector('.create-first-plan-btn');
        if (createFirstBtn) {
          createFirstBtn.addEventListener('click', function() {
            // Switch to the create tab
            const createTabBtn = document.querySelector('[data-tab="create"]');
            if (createTabBtn) {
              createTabBtn.click();
            }
          });
        }
      }
    });
  }
  // Display plans in UI - FIXED VERSION
  function displayPlans(plans) {
    if (!recentPlans) return;
    
    if (plans.length === 0) {
      // Show empty state
      recentPlans.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <i class="fas fa-clipboard-list"></i>
          </div>
          <h3>No plans yet</h3>
          <p>Create your first account plan to get started.</p>
          <button class="button primary create-first-plan-btn">
            <i class="fas fa-plus"></i> Create Plan
          </button>
        </div>
      `;
      // Add event listener to the button
      const createFirstBtn = recentPlans.querySelector('.create-first-plan-btn');
      if (createFirstBtn) {
        createFirstBtn.addEventListener('click', function() {
          // Switch to the create tab
          const createTabBtn = document.querySelector('[data-tab="create"]');
          if (createTabBtn) {
            createTabBtn.click();
          }
        });
      }
      return;
    }
    
    // Clear the container
    recentPlans.innerHTML = '';
    
    // Add each plan
    plans.forEach(plan => {
      const planItem = document.createElement('div');
      planItem.className = 'plan-item';
      planItem.innerHTML = `
        <div class="plan-info">
          <div class="plan-name">${plan.name}</div>
          <div class="plan-date">
            <i class="fas fa-clock" aria-hidden="true"></i> 
            ${new Date(plan.date).toLocaleDateString()}
          </div>
        </div>
        <div class="plan-actions">
          <button class="button primary open-button" data-plan-url="${plan.url}">
            <i class="fas fa-external-link-alt" aria-hidden="true"></i> Open
          </button>
          <button class="button delete-button" data-plan-id="${plan.id}" data-account-name="${plan.name}" ${plan.gid ? `data-sheet-gid="${plan.gid}"` : ''}>
            <i class="fas fa-trash-alt" aria-hidden="true"></i> Delete
          </button>
        </div>
      `;
      recentPlans.appendChild(planItem);
    });
  }
  // Standardized function to show delete confirmation dialog
  function handleDeletePlan(planId, accountName, sheetGid) {
    if (!planId || !accountName) {
      showEnhancedToast('Invalid plan data for deletion', 'error');
      return;
    }
    // Remove any existing overlay first to prevent duplicates
    const existingOverlay = document.querySelector('.delete-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }
    
    // Create deletion confirmation dialog
    const overlay = document.createElement('div');
    overlay.className = 'delete-overlay';
    
    overlay.innerHTML = `
      <div class="delete-dialog">
        <div class="delete-dialog-header">
          <h3><i class="fas fa-exclamation-triangle"></i> Delete Confirmation</h3>
          <button class="delete-dialog-close" aria-label="Close dialog">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="delete-dialog-content">
          <div class="delete-warning-icon">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <div class="delete-plan-name">${accountName}</div>
          <p>Are you sure you want to delete this account plan?</p>
          <p>This action cannot be undone.</p>
          <div class="delete-note">
            This will delete the sheet from Google Sheets.
          </div>
        </div>
        <div class="delete-dialog-actions">
          <button class="button delete-cancel">Cancel</button>
          <button class="button primary delete-confirm">Delete</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Show the dialog with animation
    setTimeout(() => {
      const dialog = overlay.querySelector('.delete-dialog');
      if (dialog) {
        dialog.classList.add('show');
      }
    }, 10);
    
    // Create reusable close dialog function
    const closeDialog = () => {
      const dialog = overlay.querySelector('.delete-dialog');
      if (dialog) {
        dialog.classList.remove('show');
      }
      
      overlay.classList.add('fade-out');
      
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, 300);
    };
    // Add event listeners
    const closeBtn = overlay.querySelector('.delete-dialog-close');
    const cancelBtn = overlay.querySelector('.delete-cancel');
    const confirmBtn = overlay.querySelector('.delete-confirm');
    
    if (closeBtn) closeBtn.addEventListener('click', closeDialog);
    if (cancelBtn) cancelBtn.addEventListener('click', closeDialog);
    
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function() {
        // Disable button to prevent multiple clicks
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        
        // First update local storage
        chrome.storage.local.get(['revpilot_recentPlans'], (result) => {
          const plans = result['revpilot_recentPlans'] || [];
          
          // Filter out the plan to delete
          const updatedPlans = plans.filter(plan => 
            !(plan.name === accountName && plan.id === planId)
          );
          // Save the updated plans
          chrome.storage.local.set({ 'revpilot_recentPlans': updatedPlans }, () => {
            // Now delete from Google Sheets
            chrome.runtime.sendMessage({
              action: 'deleteSheet',
              sheetId: planId,
              accountName: accountName,
              sheetGid: sheetGid
            }, function(response) {
              // Close dialog regardless of result
              closeDialog();
              
              if (chrome.runtime.lastError) {
                console.error("Error in delete:", chrome.runtime.lastError);
                showEnhancedToast(`Error: ${chrome.runtime.lastError.message}`, 'error');
                return;
              }
              
              if (response && response.success) {
                showEnhancedToast(`Account plan "${accountName}" deleted successfully`, 'success');
                
                // FIX FOR BLURRED PLANS: Direct render of the updated plans
                // instead of relying on loadRecentPlans which may have issues
                displayPlans(updatedPlans);
                
                // Also trigger the normal refresh as a backup
                // Use a more reliable approach to refresh the plans list
                try {
                  // Try both UI approach (if UI module exists)
                  if (typeof RevPilotUI !== 'undefined' && RevPilotUI.loadRecentPlans) {
                    RevPilotUI.loadRecentPlans(true);
                  } else {
                    // Direct function call if it's in the global scope
                    loadRecentPlans(true);
                  }
                } catch (e) {
                  console.error("Error refreshing plans:", e);
                  // Even if refresh fails, we've already updated the UI with displayPlans
                }
                
                // Clear plans cache if it exists
                chrome.storage.local.remove(['revpilot_plansCache', 'revpilot_plansCacheExpiry']);
              } else {
                const errorMsg = response && response.error ? response.error : 'Unknown error';
                showEnhancedToast(`Error: ${errorMsg}`, 'error');
                
                // Still refresh to show local changes
                displayPlans(updatedPlans);
              }
            });
          });
        });
      });
    }
  }
  // Enhanced input validation patterns
  const validationPatterns = {
    accountName: {
      pattern: /^[a-zA-Z0-9\s\-&.,'()]+$/,
      minLength: 3,
      maxLength: 50
    }
  };
  // Handle form submission for creating a new plan
  function handleCreatePlan(event) {
    event.preventDefault();

    const accountNameInput = document.getElementById('account-name');

    if (!accountNameInput) {
      return;
    }

    // Use validation module if available, otherwise use local validation
    let validation;
    if (typeof RevPilotUtils !== 'undefined' && RevPilotUtils.validateInput) {
      validation = RevPilotUtils.validateInput(accountNameInput, {
        required: true,
        minLength: 3,
        maxLength: 50,
        pattern: /^[a-zA-Z0-9\s\-&.,'()]+$/
      });
    } else {
      validation = validateInput(accountNameInput, 'accountName');
    }

    if (!validation.valid) {
      // Use validation display utility if available, otherwise use local function
      if (typeof RevPilotUtils !== 'undefined' && RevPilotUtils.showValidationError) {
        RevPilotUtils.showValidationError(accountNameInput, validation.message);
      } else {
        showValidationError(accountNameInput, validation.message);
      }
      return;
    }

    // Clear any validation styling if valid
    if (typeof RevPilotUtils !== 'undefined' && RevPilotUtils.clearValidationError) {
      RevPilotUtils.clearValidationError(accountNameInput);
    } else {
      clearValidationError(accountNameInput);
    }

    const accountName = accountNameInput.value.trim();

    // Disable form to prevent multiple submissions
    const submitButton = createPlanForm.querySelector('button[type="submit"]');

    if (submitButton) {
      // Add visual feedback when the form is submitted
      createPlanForm.classList.add('submitting');
      createPlanForm.classList.add('transform-scale-98');
      
      // After a short delay, restore the form
      setTimeout(() => {
        createPlanForm.classList.remove('transform-scale-98');
        createPlanForm.classList.add('transform-scale-1');
      }, 200);
      
      submitButton.disabled = true;
      submitButton.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> <span>Creating...</span>';
      submitButton.setAttribute('aria-busy', 'true');
      
      // Add loading class to form for visual feedback
      createPlanForm.classList.add('loading');
      // Remove any existing progress containers
      const existingProgress = document.querySelector('.progress-container');
      if (existingProgress) {
        existingProgress.parentNode.removeChild(existingProgress);
      }
      // Add a progress container to the form
      const progressContainer = document.createElement('div');
      progressContainer.className = 'progress-container';
      progressContainer.innerHTML = `
        <div class="progress-steps">
          <div class="step active" data-step="1">
            <div class="step-circle">1</div>
            <div class="step-label">Preparing</div>
          </div>
          <div class="step" data-step="2">
            <div class="step-circle">2</div>
            <div class="step-label">Creating</div>
          </div>
          <div class="step" data-step="3">
            <div class="step-circle">3</div>
            <div class="step-label">Formatting</div>
          </div>
          <div class="step" data-step="4">
            <div class="step-circle">4</div>
            <div class="step-label">Finishing</div>
          </div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill"></div>
        </div>
        <div class="progress-status">Preparing to create plan...</div>
      `;
      
      createPlanForm.appendChild(progressContainer);
      // Track creation process state
      let isCreationInProgress = true;
      let errorOccurred = false;
      // First check if we're already in a Google Sheet that is our master sheet
      chrome.runtime.sendMessage({action: 'checkCurrentSheet'}, function(tabInfo) {
        if (chrome.runtime.lastError) {
          errorOccurred = true;
          handleCreateError(chrome.runtime.lastError.message, submitButton, progressContainer);
          return;
        }
        
        console.log("Current tab info:", tabInfo);
        
        // Update progress to show preparation step
        setTimeout(() => {
          updateProgressStatus(progressContainer, 1, 'Preparing to create your account plan...');
          
          // After a short delay, continue with the creation process
          setTimeout(() => {
            // First create a new sheet in the master spreadsheet for this account
            console.log("Sending createSheet message with accountName:", accountName);
            chrome.runtime.sendMessage(
              { 
                action: 'createSheet', 
                accountName: accountName,
                currentTab: tabInfo // Pass current tab info to background script
              }, 
              function(createResponse) {
                if (chrome.runtime.lastError) {
                  console.error("Runtime error:", chrome.runtime.lastError);
                  errorOccurred = true;
                  handleCreateError(chrome.runtime.lastError.message, submitButton, progressContainer);
                  return;
                }
                console.log("Create sheet response:", createResponse);
                // Update progress when sheet is created
                updateProgressStatus(progressContainer, 2, 'Sheet created successfully. Adding template...');
                
                if (!createResponse || !createResponse.success) {
                  errorOccurred = true;
                  handleCreateError(
                    createResponse && createResponse.error || 'Failed to create sheet', 
                    submitButton, 
                    progressContainer
                  );
                  return;
                }
                // Now populate the sheet with our template
                console.log("Sending populateSheet message with spreadsheetId:", createResponse.spreadsheetId);
                chrome.runtime.sendMessage(
                  {
                    action: 'populateSheet',
                    sheetId: createResponse.spreadsheetId,
                    accountData: {
                      accountName: accountName
                    }
                  },
                  function(populateResponse) {
                    if (chrome.runtime.lastError) {
                      console.error("Runtime error during populate:", chrome.runtime.lastError);
                      errorOccurred = true;
                      handleCreateError(chrome.runtime.lastError.message, submitButton, progressContainer);
                      return;
                    }
                    
                    console.log("Populate sheet response:", populateResponse);
                    
                    // Update progress to reflect the template being populated
                    updateProgressStatus(progressContainer, 3, 'Adding formatting and style to your plan...');
                    
                    if (!populateResponse || !populateResponse.success) {
                      errorOccurred = true;
                      handleCreateError(
                        populateResponse && populateResponse.error || 'Failed to populate sheet',
                        submitButton, progressContainer
                      );
                      return;
                    }
                    // Introduce a small delay before the final step for better UX
                    setTimeout(() => {
                      updateProgressStatus(progressContainer, 4, 'Finalizing your plan...');
                      
                      // Only proceed with success path if no errors have occurred
                      if (!errorOccurred) {
                        setTimeout(() => {
                          // Mark creation as complete
                          isCreationInProgress = false;
                          
                          // Re-enable form
                          if (submitButton) {
                            submitButton.disabled = false;
                            submitButton.innerHTML = '<i class="fas fa-file-alt" aria-hidden="true"></i> Create Plan';
                            submitButton.setAttribute('aria-busy', 'false');
                            createPlanForm.classList.remove('loading');
                          }
                          
                          // Save to recent plans
                          console.log("Saving recent plan:", accountName, createResponse.spreadsheetId, createResponse.spreadsheetUrl, createResponse.sheetGid);
                          saveRecentPlan(accountName, createResponse.spreadsheetId.toString(), createResponse.spreadsheetUrl, createResponse.sheetGid);
                          
                          // IMPORTANT: Refresh the overview sheet after creating a new sheet
                          chrome.runtime.sendMessage({ action: 'refreshOverviewSheet' });
                          // Check if we should navigate in the current tab instead of opening a new one
                          if (createResponse.isInlineNavigation && tabInfo && tabInfo.tabId) {
                            // If we're already in the master sheet, just update the URL hash to show the new sheet
                            chrome.tabs.update(tabInfo.tabId, {
                              url: createResponse.spreadsheetUrl
                            }, () => {
                              if (chrome.runtime.lastError) {
                                console.error("Error updating tab:", chrome.runtime.lastError);
                              }
                              showSuccessView(accountName, createResponse, true);
                            });
                          } else {
                            showSuccessView(accountName, createResponse, false);
                          }
                        }, 500);
                      }
                    }, 800);
                  }
                );
              }
            );
          }, 500);
        }, 200);
      });
    }
  }
  // Handle create error
  function handleCreateError(errorMsg, submitButton, progressContainer) {
    console.error("Create error:", errorMsg);
    
    // Format error message for display
    let displayError = errorMsg || "An unexpected error occurred. Please try again.";
    
    // Make HTTP error messages more user-friendly
    if (displayError.includes('HTTP error 400')) {
      displayError = "Cannot create account plan. There may be an issue with the master spreadsheet.";
    } else if (displayError.includes('HTTP error 401') || displayError.includes('Authentication failed')) {
      displayError = "Authentication error. Please sign out and sign in again.";
    } else if (displayError.includes('HTTP error 403')) {
      displayError = "Permission denied. Please make sure you have access to Google Sheets.";
    } else if (displayError.includes('HTTP error 404')) {
      displayError = "Resource not found. Please try again.";
    } else if (displayError.includes('HTTP error 429')) {
      displayError = "Too many requests. Please wait a moment and try again.";
    } else if (displayError.includes('HTTP error 5')) {
      displayError = "Google Sheets server error. Please try again later.";
    } else if (displayError.includes('Network error')) {
      displayError = "Network connection issue. Please check your internet connection.";
    }
    
    // Show error message
    if (errorMessage) {
      errorMessage.textContent = displayError;
    }
    
    // Reset button
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = '<i class="fas fa-file-alt" aria-hidden="true"></i> Create Plan';
      submitButton.setAttribute('aria-busy', 'false');
    }
    
    // Remove progress container
    if (progressContainer && progressContainer.parentNode) {
      progressContainer.parentNode.removeChild(progressContainer);
    }
    
    // Show error section
    hideAllSections();
    showSection(errorSection);
  }

  // Show success view after successful plan creation
  function showSuccessView(accountName, createResponse, isInlineNavigation) {
    // Update success message
    const successMessage = document.getElementById('success-message');
    if (successMessage) {
      successMessage.textContent = `Your account plan for "${accountName}" has been created successfully!`;
    }
    
    // Update "Open in Google Sheets" link
    if (openSheetLink) {
      openSheetLink.href = createResponse.spreadsheetUrl;
      
      // If we're already navigating in the current tab, change the button text
      if (isInlineNavigation) {
        openSheetLink.textContent = "Go to your plan";
      }
    }
    
    // Show success section
    hideAllSections();
    showSection(successSection);
  }
  // Reset to create view
  function resetToCreate() {
    // Reset form if it exists
    if (createPlanForm) {
      createPlanForm.reset();
      
      // Remove any validation errors
      const accountNameInput = document.getElementById('account-name');
      if (accountNameInput) {
        accountNameInput.style.borderColor = '';
        accountNameInput.setAttribute('aria-invalid', 'false');
        
        const errorEl = document.getElementById(`account-name-error`);
        if (errorEl) {
          errorEl.remove();
        }
      }
      
      // Remove any progress containers
      const progressContainer = document.querySelector('.progress-container');
      if (progressContainer && progressContainer.parentNode) {
        progressContainer.parentNode.removeChild(progressContainer);
      }
      
      // Reset submit button
      const submitButton = createPlanForm.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-file-alt" aria-hidden="true"></i> Create Plan';
        submitButton.setAttribute('aria-busy', 'false');
      }
      // Remove any loading classes
      createPlanForm.classList.remove('loading');
      createPlanForm.classList.remove('submitting');
      createPlanForm.classList.remove('transform-scale-98');
      createPlanForm.classList.remove('transform-scale-1');
    }
    
    // Switch to main section and select create tab
    hideAllSections();
    showSection(mainSection);
    
    // Click the create tab button
    const createTabBtn = document.querySelector('[data-tab="create"]');
    if (createTabBtn) {
      createTabBtn.click();
    }
  }
  // Save a plan to recent plans
  function saveRecentPlan(name, id, url, gid = null) {
    console.log("Saving new plan to local storage:", name, id);
    
    chrome.storage.local.get([STORAGE_KEY_RECENT_PLANS], (result) => {
      const plans = result[STORAGE_KEY_RECENT_PLANS] || [];
      
      // Add new plan to the beginning of the array
      plans.unshift({
        name: name,
        id: id,
        url: url,
        gid: gid,
        date: new Date().toISOString(),
        type: 'Account Plan'
      });
      
      // Remove duplicates (in case of updates)
      const uniquePlans = plans.filter((plan, index, self) => 
        index === self.findIndex((p) => (
          p.name === plan.name && p.id === plan.id
        ))
      );
      
      // Keep only the most recent MAX_RECENT_PLANS plans
      if (uniquePlans.length > 20) {
        uniquePlans.splice(20);
      }
      
      // Save updated plans
      chrome.storage.local.set({ [STORAGE_KEY_RECENT_PLANS]: uniquePlans });
    });
  }
  // Handle plan search
  function handlePlanSearch(searchTerm) {
    if (!recentPlans) return;
    
    chrome.storage.local.get([STORAGE_KEY_RECENT_PLANS], (result) => {
      const plans = result[STORAGE_KEY_RECENT_PLANS] || [];
      
      if (plans.length === 0) {
        showEmptyPlansState();
        return;
      }
      
      if (!searchTerm) {
        // Show all plans
        displayPlans(plans);
        return;
      }
      
      // Filter plans by name
      const filteredPlans = plans.filter(plan => 
        plan.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (filteredPlans.length === 0) {
        // Show empty search state
        recentPlans.innerHTML = `
          <div class="empty-search-state">
            <p>No plans match "${searchTerm}"</p>
            <button class="button clear-search-button">
              <i class="fas fa-times"></i> Clear Search
            </button>
          </div>
        `;
        
        // Add event listener to clear search
        const clearSearchBtn = recentPlans.querySelector('.clear-search-button');
        if (clearSearchBtn) {
          clearSearchBtn.addEventListener('click', function() {
            const searchInput = document.getElementById('search-plans');
            if (searchInput) {
              searchInput.value = '';
              searchInput.dispatchEvent(new Event('input'));
            }
          });
        }
      } else {
        // Display filtered plans
        displayPlans(filteredPlans);
      }
    });
  }
  // Show empty plans state
  function showEmptyPlansState() {
    if (!recentPlans) return;
    
    recentPlans.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <i class="fas fa-clipboard-list"></i>
        </div>
        <h3>No plans yet</h3>
        <p>Create your first account plan to get started.</p>
        <button class="button primary create-first-plan-btn">
          <i class="fas fa-plus"></i> Create Plan
        </button>
      </div>
    `;
    // Add event listener to the button
    const createFirstBtn = recentPlans.querySelector('.create-first-plan-btn');
    if (createFirstBtn) {
      createFirstBtn.addEventListener('click', function() {
        // Switch to the create tab
        const createTabBtn = document.querySelector('[data-tab="create"]');
        if (createTabBtn) {
          createTabBtn.click();
        }
      });
    }
  }
  function connectService(service) {
    // This would be implemented with actual OAuth or API connections
    console.log(`Connecting to ${service}...`);
    // Simulate connection process
    const button = document.querySelector(`.connect-button[data-service="${service}"]`);
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
      
      // Customize messages based on service type
      let connectionMessage = '';
      let permissions = '';
      let delay = 1500;
      
      switch(service) {
        case 'linkedin':
          connectionMessage = 'Authorizing LinkedIn account...';
          permissions = 'access to your LinkedIn profile and company insights';
          delay = 2000; // Slightly longer delay for LinkedIn
          break;
        case 'google-calendar':
          connectionMessage = 'Authorizing Google Calendar...';
          permissions = 'view and manage your calendar events';
          delay = 2000; // Slightly longer delay for Google Calendar
          break;
        case 'zoominfo':
          connectionMessage = 'Connecting to ZoomInfo...';
          permissions = 'import contact data';
          break;
        case 'crm':
          connectionMessage = 'Connecting to CRM...';
          permissions = 'access your CRM data';
          break;
        case 'openai':
          connectionMessage = 'Connecting to OpenAI...';
          permissions = 'use AI for content generation';
          break;
        default:
          connectionMessage = `Connecting to ${service}...`;
          permissions = 'access service data';
      }
      
      // Show connecting message
      if (typeof RevPilotUI !== 'undefined' && RevPilotUI.showToast) {
        RevPilotUI.showToast(connectionMessage, 'info');
      } else if (typeof showEnhancedToast === 'function') {
        showEnhancedToast(connectionMessage, 'info');
      }
      
      // Simulate authorization flow
      setTimeout(() => {
        // For LinkedIn and Google Calendar, show a permissions dialog
        if (service === 'linkedin' || service === 'google-calendar') {
          // Create a permissions dialog element if it doesn't exist
          if (!document.getElementById('permissions-dialog-overlay')) {
            createPermissionsDialog(service, permissions);
          }
          
          // Show the dialog
          showPermissionsDialog(service, permissions, button);
        } else {
          // For other services, just complete the connection
          completeConnection(button, service);
        }
      }, delay);
    }
  }
  /**
   * Creates a permissions dialog for OAuth-style connections
   * @param {string} service - Service name
   * @param {string} permissions - Permissions being requested
   */
   function createPermissionsDialog(service, permissions) {
    const overlay = document.createElement('div');
    overlay.id = 'permissions-dialog-overlay';
    overlay.className = 'popup-overlay';
    
    const serviceNames = {
      'linkedin': 'LinkedIn',
      'google-calendar': 'Google Calendar'
    };
    
    const serviceName = serviceNames[service] || service;
    const serviceIcon = service === 'linkedin' ? 'fab fa-linkedin' : 'far fa-calendar-alt';
    
    overlay.innerHTML = `
      <div class="popup-container" style="width: 320px; max-width: 90%;">
        <div class="popup-header">
          <h3><i class="${serviceIcon}"></i> Connect to ${serviceName}</h3>
          <button class="popup-close" aria-label="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="popup-content">
          <div style="text-align: center; margin-bottom: 20px;">
            <i class="${serviceIcon}" style="font-size: 48px; color: var(--primary-color);"></i>
          </div>
          <p>RevPilot AI is requesting permission to ${permissions}.</p>
          <p style="margin-top: 12px; font-size: 13px; color: var(--gray);">By clicking "Allow", you'll be redirected to ${serviceName} to complete the authorization process.</p>
        </div>
        <div style="padding: 16px; display: flex; justify-content: space-between; border-top: 1px solid var(--light-gray);">
          <button class="button permissions-cancel" data-service="${service}">Cancel</button>
          <button class="button primary permissions-allow" data-service="${service}">Allow</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Add event listeners for the dialog buttons
    const closeButton = overlay.querySelector('.popup-close');
    const cancelButton = overlay.querySelector('.permissions-cancel');
    const allowButton = overlay.querySelector('.permissions-allow');
    
    closeButton.addEventListener('click', () => {
      closePermissionsDialog(service, false);
    });
    
    cancelButton.addEventListener('click', () => {
      closePermissionsDialog(service, false);
    });
    
    allowButton.addEventListener('click', () => {
      closePermissionsDialog(service, true);
    });
    
    return overlay;
  }
  /**
   * Shows the permissions dialog
   * @param {string} service - Service name
   * @param {string} permissions - Permissions being requested
   * @param {HTMLElement} button - The connect button that was clicked
   */
   function showPermissionsDialog(service, permissions, button) {
    const overlay = document.getElementById('permissions-dialog-overlay') || createPermissionsDialog(service, permissions);
    
    // Store the button reference for later use
    overlay.setAttribute('data-button-reference', service);
    
    // Show the dialog with animation
    setTimeout(() => {
      overlay.classList.add('show');
      const container = overlay.querySelector('.popup-container');
      if (container) {
        container.classList.add('show');
      }
    }, 10);
  }
  /**
   * Closes the permissions dialog
   * @param {string} service - Service name
   * @param {boolean} approved - Whether the user approved the permissions
   */
   function closePermissionsDialog(service, approved) {
    const overlay = document.getElementById('permissions-dialog-overlay');
    if (!overlay) return;
    
    // Hide the dialog with animation
    overlay.classList.remove('show');
    const container = overlay.querySelector('.popup-container');
    if (container) {
      container.classList.remove('show');
    }
    
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      
      // Get the button reference
      const button = document.querySelector(`.connect-button[data-service="${service}"]`);
      
      if (approved) {
        // If approved, complete the connection
        completeConnection(button, service);
      } else {
        // If denied, reset the button
        if (button) {
          button.disabled = false;
          const serviceName = service === 'google-calendar' ? 'Google Calendar' : service.charAt(0).toUpperCase() + service.slice(1);
          button.innerHTML = 'Connect';
          
          // Show canceled message
          if (typeof RevPilotUI !== 'undefined' && RevPilotUI.showToast) {
            RevPilotUI.showToast(`${serviceName} connection canceled`, 'info');
          } else if (typeof showEnhancedToast === 'function') {
            showEnhancedToast(`${serviceName} connection canceled`, 'info');
          }
        }
      }
    }, 300);
  }
  /**
   * Completes the connection process
   * @param {HTMLElement} button - The connect button
   * @param {string} service - Service name
   */
   function completeConnection(button, service) {
    if (!button) return;
    
    button.innerHTML = '<i class="fas fa-check"></i> Connected';
    button.classList.add('success');
    
    // Format the service name for display
    let displayName = service;
    if (service === 'google-calendar') {
      displayName = 'Google Calendar';
    } else if (service === 'linkedin') {
      displayName = 'LinkedIn';
    } else {
      displayName = service.charAt(0).toUpperCase() + service.slice(1);
    }
    
    // Show success message
    if (typeof RevPilotUI !== 'undefined' && RevPilotUI.showToast) {
      RevPilotUI.showToast(`Connected to ${displayName} successfully!`, 'success');
    } else if (typeof showEnhancedToast === 'function') {
      showEnhancedToast(`Connected to ${displayName} successfully!`, 'success');
    } else {
      console.log(`Connected to ${displayName} successfully!`);
    }
  }
  // Validate an input field
  function validateInput(input, type) {
    const value = input.value.trim();
    
    // Check if field has a pattern defined
    const validationInfo = validationPatterns[type];
    
    if (!validationInfo) {
      // Default validation - just check if not empty
      return {
        valid: value.length > 0,
        message: 'This field is required'
      };
    }
    
    // Required check
    if (value.length === 0) {
      return { 
        valid: false, 
        message: 'This field is required'
      };
    }
    
    // Min length check
    if (validationInfo.minLength && value.length < validationInfo.minLength) {
      return { 
        valid: false, 
        message: `Must be at least ${validationInfo.minLength} characters` 
      };
    }
    
    // Max length check
    if (validationInfo.maxLength && value.length > validationInfo.maxLength) {
      return { 
        valid: false, 
        message: `Cannot exceed ${validationInfo.maxLength} characters` 
      };
    }
    
    // Pattern check
    if (validationInfo.pattern && !validationInfo.pattern.test(value)) {
      return { 
        valid: false, 
        message: 'Contains invalid characters' 
      };
    }
    
    // All checks passed
    return { valid: true };
  }
  // Show validation error
  function showValidationError(input, message) {
    if (!input) return;
    
    // Add error styling
    input.style.borderColor = 'var(--error-color)';
    input.classList.add('shake');
    input.setAttribute('aria-invalid', 'true');
    
    // Remove shake animation after it completes
    setTimeout(() => {
      input.classList.remove('shake');
    }, 500);
    
    // Find existing error or create new error element
    let errorEl = document.getElementById(`${input.id}-error`);
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.id = `${input.id}-error`;
      errorEl.className = 'error-text';
      errorEl.setAttribute('role', 'alert');
      input.parentNode.appendChild(errorEl);
    }
    
    errorEl.textContent = message;
  }

  // Clear validation error
  function clearValidationError(input) {
    if (!input) return;
    
    input.style.borderColor = '';
    input.setAttribute('aria-invalid', 'false');
    
    const errorEl = document.getElementById(`${input.id}-error`);
    if (errorEl) {
      errorEl.remove();
    }
  }
  // Update progress status
  function updateProgressStatus(container, stepNum, message) {
    if (!container) return;
    
    const steps = container.querySelectorAll('.step');
    if (!steps.length) return;
    
    // Update steps
    steps.forEach(step => {
      const stepNumber = parseInt(step.getAttribute('data-step'));
      if (stepNumber <= stepNum) {
        step.classList.add('active');
        if (stepNumber < stepNum) {
          step.classList.add('completed');
        }
      } else {
        step.classList.remove('active');
      }
    });
    
    // Update progress bar
    const progressFill = container.querySelector('.progress-fill');
    if (progressFill) {
      // Use classes instead of inline styles
      progressFill.className = 'progress-fill';
      
      // Round to nearest 25% for simplicity
      let progressPercent = Math.ceil((stepNum / steps.length) * 4) * 25;
      if (progressPercent > 100) progressPercent = 100;
      
      progressFill.classList.add(`progress-fill-${progressPercent}`);
    }
    
    // Update status message
    const statusElement = container.querySelector('.progress-status');
    if (statusElement && message) {
      statusElement.textContent = message;
    }
  }
  // Add keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    // Alt+C for Create tab
    if (e.altKey && e.key === 'c') {
      const createTab = document.querySelector('[data-tab="create"]');
      if (createTab) createTab.click();
      e.preventDefault();
    }
    // Alt+M for Manage tab
    else if (e.altKey && e.key === 'm') {
      const manageTab = document.querySelector('[data-tab="manage"]');
      if (manageTab) manageTab.click();
      e.preventDefault();
    }
    // Alt+N for New Plan (focus account name input)
    else if (e.altKey && e.key === 'n') {
      const createTab = document.querySelector('[data-tab="create"]');
      if (createTab) createTab.click();
      
      setTimeout(() => {
        const accountNameInput = document.getElementById('account-name');
        if (accountNameInput) accountNameInput.focus();
      }, 100);
      e.preventDefault();
    }
    // Alt+D for Dark Mode Toggle
    else if (e.altKey && e.key === 'd') {
      const darkModeToggle = document.getElementById('dark-mode-toggle');
      if (darkModeToggle) darkModeToggle.click();
      e.preventDefault();
    }
  });
  // Clean up event listeners when popup is closed
  window.addEventListener('unload', function() {
    // Remove event listeners that won't be garbage collected
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.removeEventListener('click', null);
    });
    
    document.removeEventListener('keydown', null);
    
    console.log('Popup cleanup complete');
  });
});
// Enhanced Search Plans functionality
function initSearchPlans() {
  const searchInput = document.getElementById('search-plans');
  const clearSearchBtn = document.getElementById('clear-search');
  const recentPlans = document.getElementById('recent-plans');
  
  if (!searchInput || !clearSearchBtn || !recentPlans) {
    console.warn('Search plans elements not found in the DOM');
    return;
  }
  
  // Clear any existing event listeners
  searchInput.removeEventListener('input', handleSearchInput);
  clearSearchBtn.removeEventListener('click', clearSearch);
  
  // Add event listeners
  searchInput.addEventListener('input', handleSearchInput);
  clearSearchBtn.addEventListener('click', clearSearch);
  // Initialize with empty search
  handlePlanSearch('');
}
// Function to handle search input with debounce
let searchDebounceTimer;
function handleSearchInput() {
  const searchTerm = this.value.toLowerCase().trim();
  
  // Toggle clear button visibility
  const clearSearchBtn = document.getElementById('clear-search');
  if (clearSearchBtn) {
    clearSearchBtn.classList.toggle('hide-button', !searchTerm);
  }
  
  // Debounce the search to improve performance
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    handlePlanSearch(searchTerm);
  }, 300);
}

// Function to clear search
function clearSearch() {
  const searchInput = document.getElementById('search-plans');
  if (searchInput) {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
    searchInput.focus();
  }
  
  this.classList.add('hide-button');
}
// Helper function to escape HTML for security
function escapeHtml(text) {
  if (!text) return '';
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
// Add this to your DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', function() {
  // Initialize search plans functionality
  initSearchPlans();
  
  // Add event listener for tab switching to ensure search works when switching to manage tab
  const manageTabBtn = document.querySelector('[data-tab="manage"]');
  if (manageTabBtn) {
    manageTabBtn.addEventListener('click', function() {
      // Initialize search again when switching to manage tab
      setTimeout(initSearchPlans, 100);
    });
  }
});
// Override loadRecentPlans to ensure it works with search
const originalLoadRecentPlans = window.loadRecentPlans || function(){};
window.loadRecentPlans = function(forceRefresh = false) {
  originalLoadRecentPlans(forceRefresh);
  
  // Re-initialize search after loading plans
  setTimeout(initSearchPlans, 300);
};
// Add this to your DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', function() {
  // Initialize dark mode toggle
  initDarkModeToggle();
  
  // Add other initialization code as needed
});
document.addEventListener('DOMContentLoaded', function() {
  // Help modal functionality
  const helpLink = document.getElementById('help-link');
  const helpModalOverlay = document.getElementById('help-modal-overlay');
  const helpCloseBtn = helpModalOverlay.querySelector('.help-close');
  const helpTabButtons = helpModalOverlay.querySelectorAll('.help-tab-button');
  const helpTabContents = helpModalOverlay.querySelectorAll('.help-tab-content');
  const faqQuestions = helpModalOverlay.querySelectorAll('.faq-question');
  
  // Update version number in help modal
  const helpVersionNumber = document.getElementById('help-version-number');
  const versionElement = document.getElementById('version-number');
  if (helpVersionNumber && versionElement) {
    helpVersionNumber.textContent = versionElement.textContent;
  }
  
  // Tab switching
  helpTabButtons.forEach(function(button) {
    button.addEventListener('click', function() {
      const tabName = button.getAttribute('data-tab');
      
      // Update active tab button
      helpTabButtons.forEach(function(btn) {
        btn.classList.remove('active');
      });
      button.classList.add('active');
      
      // Show corresponding tab content
      helpTabContents.forEach(function(content) {
        content.classList.remove('active');
      });
      
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });
  
  // FAQ accordion functionality
  faqQuestions.forEach(function(question) {
    question.addEventListener('click', function() {
      const answer = this.nextElementSibling;
      const isOpen = this.classList.contains('open');
      
      // First close all other FAQ items
      faqQuestions.forEach(function(q) {
        if (q !== question) { // Only close others, not the current one
          q.classList.remove('open');
          q.querySelector('i').className = 'fas fa-chevron-right';
          
          if (q.nextElementSibling) {
            q.nextElementSibling.classList.remove('open');
            q.nextElementSibling.style.maxHeight = null;
            q.nextElementSibling.style.paddingTop = '0px';
            q.nextElementSibling.style.paddingBottom = '0px';
          }
        }
      });
      
      // Then toggle the current FAQ item
      if (!isOpen) {
        this.classList.add('open');
        this.querySelector('i').className = 'fas fa-chevron-down';
        answer.classList.add('open');
        
        // Get the scrollHeight to allow the content to expand properly
        const scrollHeight = answer.scrollHeight;
        answer.style.maxHeight = scrollHeight + 'px';
        answer.style.paddingTop = '10px';
        answer.style.paddingBottom = '15px';
        
        // Scroll the container to make sure the opened item is visible
        const helpTabContent = this.closest('.help-tab-content');
        if (helpTabContent) {
          // Calculate position to scroll
          const questionPosition = this.offsetTop;
          const containerScrollPosition = helpTabContent.scrollTop;
          const containerHeight = helpTabContent.clientHeight;
          
          // If question is below visible area, scroll down
          if (questionPosition > containerScrollPosition + containerHeight - 100) {
            helpTabContent.scrollTop = questionPosition - 100;
          }
        }
      } else {
        // Close current item
        this.classList.remove('open');
        this.querySelector('i').className = 'fas fa-chevron-right';
        answer.classList.remove('open');
        answer.style.maxHeight = null;
        answer.style.paddingTop = '0px';
        answer.style.paddingBottom = '0px';
      }
    });
  });
  // Add keyboard shortcut for help (Alt+H)
  document.addEventListener('keydown', function(e) {
    if (e.altKey && e.key === 'h') {
      e.preventDefault();
      helpLink.click();
    }
  });

  // Update the keyboard help button functionality
  const keyboardHelpButton = document.getElementById('keyboard-help');
  if (keyboardHelpButton) {
    keyboardHelpButton.addEventListener('click', function() {
      const helpModalOverlay = document.getElementById('help-modal-overlay');
      const shortcutsTabButton = helpModalOverlay.querySelector('.help-tab-button[data-tab="shortcuts"]');
      
      showPopup('help-modal-overlay');
      
      if (shortcutsTabButton) {
          shortcutsTabButton.click();
      }
    });
  }
  // Remove the old keyboard help modal if it exists
  const oldKeyboardHelpOverlay = document.getElementById('keyboard-help-overlay');
  if (oldKeyboardHelpOverlay) {
    // Either remove it completely
    if (oldKeyboardHelpOverlay.parentNode) {
      oldKeyboardHelpOverlay.parentNode.removeChild(oldKeyboardHelpOverlay);
    }
  }
  
  // If you had a separate showKeyboardHelp function, you can update it to use the new help modal
  window.showKeyboardHelp = function() {
    const helpModalOverlay = document.getElementById('help-modal-overlay');
    const shortcutsTabButton = helpModalOverlay.querySelector('.help-tab-button[data-tab="shortcuts"]');
    
    showPopup('help-modal-overlay');
    
    if (shortcutsTabButton) {
      shortcutsTabButton.click();
    }
  };
  // Function to update the max-height dynamically when window is resized
  window.addEventListener('resize', function() {
    const openAnswers = document.querySelectorAll('.faq-answer.open');
    openAnswers.forEach(function(answer) {
      // Temporarily remove the max-height to get the true scrollHeight
      answer.style.maxHeight = 'none';
      const scrollHeight = answer.scrollHeight;
      
      // Re-apply with the new scrollHeight
      answer.style.maxHeight = scrollHeight + 'px';
    });
  });
});
// Account tab functionality
document.addEventListener('DOMContentLoaded', function() {
  // Elements
  const signedOutState = document.getElementById('signed-out-state');
  const signedInState = document.getElementById('signed-in-state');
  const googleSignInButton = document.getElementById('google-signin-button');
  const logoutBtn = document.getElementById('logout-btn');
  let companyNameInput = document.getElementById('company-name-input');  
  let saveCompanyBtn = document.getElementById('save-company-btn');
  const rememberMeCheckbox = document.getElementById('remember-me-checkbox');
  
  // Check if user is signed in (placeholder for now)
  function checkAuthState() {
    // For now, always show signed out state
    // This will be replaced with actual auth check later
    showSignedOutState();
    
    // You can uncomment this to test the signed-in state
    // showSignedInState({name: "John Doe", email: "john@example.com"});
  }
  
  // Show signed out state
  function showSignedOutState() {
    if (signedOutState && signedInState) {
      signedOutState.classList.remove('hidden');
      signedInState.classList.add('hidden');
    }
  }
  
  // Show signed in state
  function showSignedInState(user) {
    if (signedOutState && signedInState) {
      signedOutState.classList.add('hidden');
      signedInState.classList.remove('hidden');
      
      // Populate user info
      const userName = document.getElementById('user-name');
      const userEmail = document.getElementById('user-email');
      
      if (userName && user.name) {
        userName.textContent = user.name;
      }
      
      if (userEmail && user.email) {
        userEmail.textContent = user.email;
      }
      
      // Load company name if available
      chrome.storage.local.get(['revpilot_companyName'], (result) => {
        if (companyNameInput && result.revpilot_companyName) {
          companyNameInput.value = result.revpilot_companyName;
        }
      });
    }
  }
  
  // Google Sign-in button click handler (placeholder)
  if (googleSignInButton) {
    googleSignInButton.addEventListener('click', function() {
      // This is a placeholder - will be replaced with actual Google auth
      if (typeof showEnhancedToast === 'function') {
        showEnhancedToast('Sign-in feature coming soon!', 'info');
      } else {
        console.log('Sign-in feature coming soon!');
      }
      
      // For development/testing - uncomment to simulate successful login
      // showSignedInState({name: "Test User", email: "test@example.com"});
    });
  }
  
  // Remember Me checkbox handler
  if (rememberMeCheckbox) {
    rememberMeCheckbox.addEventListener('change', function() {
      // Placeholder for future functionality
      console.log('Remember me setting changed:', this.checked);
      
      // Store the preference (implementation to be added later)
      // chrome.storage.local.set({ 'revpilot_rememberMe': this.checked });
    });
    
    // Load saved preference (implementation to be added later)
    // chrome.storage.local.get(['revpilot_rememberMe'], (result) => {
    //   if (result.revpilot_rememberMe !== undefined) {
    //     rememberMeCheckbox.checked = result.revpilot_rememberMe;
    //   }
    // });
  }
  

  // Company name input handling
  
  // Load company name if available
  if (companyNameInput) {
    chrome.storage.local.get(['revpilot_companyName'], (result) => {
      if (result.revpilot_companyName) {
        companyNameInput.value = result.revpilot_companyName;
      }
    });
  }

  // Save company button click handler
  if (saveCompanyBtn && companyNameInput) {
    saveCompanyBtn.addEventListener('click', function() {
      saveCompanyName();
    });
    
    // Also save when pressing Enter in the input field
    companyNameInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        saveCompanyName();
      }
    });
  }

  // Function to save company name
  function saveCompanyName() {
    const companyName = companyNameInput.value.trim();
    
    if (companyName) {
      // Save to local storage
      chrome.storage.local.set({ 'revpilot_companyName': companyName }, () => {
        // Show a success toast notification
        if (typeof showEnhancedToast === 'function') {
          showEnhancedToast('Company name saved!', 'success', 2000);
        } else if (typeof RevPilotUI !== 'undefined' && RevPilotUI.showToast) {
          RevPilotUI.showToast('Company name saved!', 'success', 2000);
        } else {
          console.log('Company name saved!');
        }
        
        // Add a small visual feedback
        saveCompanyBtn.innerHTML = '<i class="fas fa-check"></i>';
        saveCompanyBtn.style.backgroundColor = 'var(--success-color)';
        
        // Reset button after a short delay
        setTimeout(() => {
          saveCompanyBtn.innerHTML = '<i class="fas fa-check"></i>';
          saveCompanyBtn.style.backgroundColor = '';
        }, 1500);
      });
    } else {
      // Show error for empty input
      if (typeof showEnhancedToast === 'function') {
        showEnhancedToast('Please enter a company name', 'warning');
      } else if (typeof RevPilotUI !== 'undefined' && RevPilotUI.showToast) {
        RevPilotUI.showToast('Please enter a company name', 'warning');
      } else {
        console.log('Please enter a company name');
      }
      
      // Focus the input field
      companyNameInput.focus();
    }
  }


  // Logout button click handler
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function() {
      // This will be enhanced later with actual sign-out logic
      showSignedOutState();
      
      if (typeof showEnhancedToast === 'function') {
        showEnhancedToast('You have been signed out', 'info');
      } else {
        console.log('You have been signed out');
      }
    });
  }
  
  // Initialize auth state check
  checkAuthState();
});
