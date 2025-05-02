// ui.js - Enhanced UI Module with performance optimizations
const RevPilotUI = (() => {
    // DOM element references - will be initialized when DOM is ready
    let loginSection;
    let mainSection;
    let successSection;
    let errorSection;
    let errorMessage;
    let recentPlans;
    let tabButtons;
    let tabContents;
    let darkModeToggle;
    let searchInput;
    
    // Store event handler references for proper cleanup
    const eventHandlers = {
        tabClick: null,
        planItemClick: handlePlanItemClick, // Use the function we defined
        searchInput: null,
        clearSearch: null,
        planIncludes: null,
        createPlan: null,
        createAnother: null,
        backButton: null,
        tryAgain: null,
        darkModeToggle: null
      };
      
    
    // Initialize UI components
    function init() {
        try {
            setupDomReferences();
            
            // Setup event listeners with proper cleanup
            setupEventListeners();
            
            // Add network status listeners
            monitorNetworkStatus();
            
            // Initialize accessibility improvements
            if (typeof RevPilotUtils !== 'undefined' && RevPilotUtils.addAccessibilityImprovements) {
                RevPilotUtils.addAccessibilityImprovements();
            } else {
                // Fallback implementation
                addAccessibilityImprovements();
            }
            
            // Remove the loader once everything is ready
            const appLoader = document.getElementById('app-loader');
            if (appLoader) {
                setTimeout(() => {
                    if (appLoader.parentNode) {
                        appLoader.classList.add('fade-out');
                        setTimeout(() => {
                            if (appLoader.parentNode) {
                                appLoader.parentNode.removeChild(appLoader);
                            }
                        }, 300);
                    }
                }, 200); // Give a moment for all scripts to load
            }
            
            console.log("RevPilotUI initialized successfully");
        } catch (error) {
            console.error("Error initializing UI:", error);
            // Fallback initialization for critical components
            const appLoader = document.getElementById('app-loader');
            if (appLoader && appLoader.parentNode) {
                appLoader.parentNode.removeChild(appLoader);
            }
        }
    }

    function setupDomReferences() {
        // Cache references to DOM elements using a more efficient selector approach
        const getElementById = document.getElementById.bind(document);
        const querySelectorAll = document.querySelectorAll.bind(document);
        
        loginSection = getElementById('login-section');
        mainSection = getElementById('main-section');
        successSection = getElementById('success-section');
        errorSection = getElementById('error-section');
        errorMessage = getElementById('error-message');
        recentPlans = getElementById('recent-plans');
        tabButtons = querySelectorAll('.tab-button');
        tabContents = querySelectorAll('.tab-content');
        darkModeToggle = getElementById('dark-mode-toggle');
        searchInput = getElementById('search-plans');
    }
    /**
     * Fallback accessibility improvements if Utils module isn't available
     */
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
    /**
     * Setup all UI event listeners with improved performance
     */
     function setupEventListeners() {
        // Tab switching - use event delegation for better performance
        const tabsContainer = document.querySelector('.tabs');
        if (tabsContainer) {
            // Remove existing handler if any
            if (eventHandlers.tabClick) {
                tabsContainer.removeEventListener('click', eventHandlers.tabClick);
            }
            
            // Create new handler with delegation
            eventHandlers.tabClick = (e) => {
                const button = e.target.closest('.tab-button');
                if (button) {
                    const tabName = button.getAttribute('data-tab');
                    if (tabName) {
                        switchTab(tabName);
                    }
                }
            };
            
            tabsContainer.addEventListener('click', eventHandlers.tabClick);
        }
        // Add handler for delete selected button
    const deleteSelectedButton = document.getElementById('delete-selected-button');
    if (deleteSelectedButton) {
        if (eventHandlers.deleteSelected) {
            deleteSelectedButton.removeEventListener('click', eventHandlers.deleteSelected);
        }
        
        eventHandlers.deleteSelected = handleDeleteSelectedPlans;
        deleteSelectedButton.addEventListener('click', eventHandlers.deleteSelected);
    }
        // Add keyboard navigation for accessibility
        if (tabContents) {
            tabContents.forEach(content => {
                content.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowLeft') {
                        const prevTab = document.querySelector('[data-tab="create"]');
                        if (prevTab) prevTab.click();
                        e.preventDefault();
                    } else if (e.key === 'ArrowRight') {
                        const nextTab = document.querySelector('[data-tab="manage"]');
                        if (nextTab) nextTab.click();
                        e.preventDefault();
                    }
                });
            });
        }
        
        // Event delegation for plan items - more efficient than individual listeners
        if (recentPlans) {
            if (eventHandlers.planItemClick) {
              recentPlans.removeEventListener('click', eventHandlers.planItemClick);
            }
            
            eventHandlers.planItemClick = handlePlanItemClick;
            recentPlans.addEventListener('click', eventHandlers.planItemClick);
          }
        
          
        
        // Debounced search for better performance
        if (searchInput) {
            const searchHandler = typeof RevPilotUtils !== 'undefined' && RevPilotUtils.debounce
                ? RevPilotUtils.debounce(handleSearch, 300)
                : handleSearch;
            
            if (eventHandlers.searchInput) {
                searchInput.removeEventListener('input', eventHandlers.searchInput);
            }
            
            eventHandlers.searchInput = searchHandler;
            searchInput.addEventListener('input', eventHandlers.searchInput);
            
            // Clear button
            const clearSearchBtn = document.getElementById('clear-search');
            if (clearSearchBtn) {
                if (eventHandlers.clearSearch) {
                    clearSearchBtn.removeEventListener('click', eventHandlers.clearSearch);
                }
                
                eventHandlers.clearSearch = clearSearch;
                clearSearchBtn.addEventListener('click', eventHandlers.clearSearch);
            }
        }
        
        // Plan includes button
        const planIncludesBtn = document.getElementById('plan-includes-btn');
        if (planIncludesBtn) {
            if (eventHandlers.planIncludes) {
                planIncludesBtn.removeEventListener('click', eventHandlers.planIncludes);
            }
            
            eventHandlers.planIncludes = showPlanIncludesModal;
            planIncludesBtn.addEventListener('click', eventHandlers.planIncludes);
        }
        
        // Create form submission
        const createPlanForm = document.getElementById('create-plan-form');
        if (createPlanForm) {
            if (eventHandlers.createPlan) {
                createPlanForm.removeEventListener('submit', eventHandlers.createPlan);
            }
            
            eventHandlers.createPlan = handleCreatePlan;
            createPlanForm.addEventListener('submit', eventHandlers.createPlan);
        }
        
        // Success section buttons
        const createAnotherButton = document.getElementById('create-another-button');
        if (createAnotherButton) {
            if (eventHandlers.createAnother) {
                createAnotherButton.removeEventListener('click', eventHandlers.createAnother);
            }
            
            eventHandlers.createAnother = resetToCreate;
            createAnotherButton.addEventListener('click', eventHandlers.createAnother);
        }
        
        // Error section buttons
        const backButton = document.getElementById('back-button');
        if (backButton) {
            if (eventHandlers.backButton) {
                backButton.removeEventListener('click', eventHandlers.backButton);
            }
            
            eventHandlers.backButton = resetToCreate;
            backButton.addEventListener('click', eventHandlers.backButton);
        }
        
        const tryAgainButton = document.getElementById('try-again-button');
        if (tryAgainButton) {
            if (eventHandlers.tryAgain) {
                tryAgainButton.removeEventListener('click', eventHandlers.tryAgain);
            }
            
            eventHandlers.tryAgain = resetToCreate;
            tryAgainButton.addEventListener('click', eventHandlers.tryAgain);
        }

        // Refresh plans button (only in manage tab)
        const refreshPlansBtn = document.getElementById('refresh-plans');
        if (refreshPlansBtn) {
            refreshPlansBtn.addEventListener('click', function() {
                loadRecentPlans(true); // Force refresh
                showToast('Refreshing plans...', 'info');
                
                // Add a visual spinning effect to the icon
                const icon = refreshPlansBtn.querySelector('i');
                if (icon) {
                    icon.classList.add('fa-spin');
                    setTimeout(() => {
                        icon.classList.remove('fa-spin');
                    }, 2000);
                }
            });
        }
    }
    // Handler for plan item clicks (delegation)
    function handlePlanItemClick(event) {
        const openButton = event.target.closest('.open-button');
        if (openButton) {
          const planUrl = openButton.getAttribute('data-plan-url');
          if (planUrl) {
            chrome.tabs.create({ url: planUrl });
          }
          return;
        }
        
        const deleteButton = event.target.closest('.delete-button');
        if (deleteButton) {
          const planId = deleteButton.getAttribute('data-plan-id');
          const accountName = deleteButton.getAttribute('data-account-name');
          const sheetGid = deleteButton.getAttribute('data-sheet-gid');
          
          if (planId && accountName) {
            handleDeletePlan(planId, accountName, sheetGid);
          }
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
      
      
    
    // Handler for search input using debounce for better performance
    function handleSearch() {
        const searchTerm = this.value.toLowerCase().trim();
        
        // Toggle clear button visibility
        const clearSearchBtn = document.getElementById('clear-search');
        if (clearSearchBtn) {
            clearSearchBtn.classList.toggle('hide-button', !searchTerm);
        }
        
        // Filter plans
        handlePlanSearch(searchTerm);
    }
    
    // Clear search handler
    function clearSearch() {
        if (searchInput) {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input'));
            searchInput.focus();
            this.classList.add('hide-button');
        }
    }
    /**
     * Switch to a specific tab with improved performance
     * @param {string} tabName - Name of the tab to switch to
     */
     function switchTab(tabName) {
        const currentActive = document.querySelector('.tab-content.active');
        const nextTab = document.getElementById(tabName + '-tab');
        
        if (!nextTab || currentActive === nextTab) return;
        
        // Exit animation for current tab
        currentActive.classList.add('exiting');
        
        setTimeout(() => {
            currentActive.classList.remove('active', 'exiting');
            currentActive.style.display = 'none';
            
            // Enter animation for next tab
            nextTab.style.display = 'block';
            void nextTab.offsetWidth; // Force reflow
            nextTab.classList.add('active');
            
            // Update tab buttons
            tabButtons.forEach(function(btn) {
                const isActive = btn.getAttribute('data-tab') === tabName;
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
                btn.setAttribute('tabindex', isActive ? '0' : '-1');
            });
            
            // Announce tab change to screen readers
            const notificationArea = document.getElementById('notification-area');
            if (notificationArea) {
                notificationArea.textContent = `${tabName} tab selected`;
            }
            
            if (tabName === 'manage') {
                loadRecentPlans();
            }
        }, 200);
    }
    
    
    /**
     * Hide all major UI sections with improved performance
     */
    function hideAllSections() {
        // Get all sections
        const allSections = [loginSection, mainSection, successSection, errorSection];
        
        // Hide all sections immediately without animation
        allSections.forEach(function(s) {
            if (s) {
                s.classList.add('hidden');
                s.setAttribute('aria-hidden', 'true');
            }
        });
    }
    
    /**
     * Show a specific section with animation and improved accessibility
     * @param {HTMLElement|string} section - Section element or ID to show
     */
    function showSection(section) {
        // If section is a string ID, get the element
        if (typeof section === 'string') {
            section = document.getElementById(section);
        }
        
        if (!section) return;
        
        // Show requested section immediately
        section.classList.remove('hidden');
        section.setAttribute('aria-hidden', 'false');
        
        // Apply the fadeIn animation
        section.classList.add('fadeIn');
        
        // If it's the error section, make sure screen readers announce it
        if (section === errorSection && errorMessage) {
            errorMessage.setAttribute('role', 'alert');
        }
        
        // Add success checkmark animation if showing success section
        if (section === successSection) {
            const successIcon = section.querySelector('.success-icon i');
            if (successIcon) {
                successIcon.classList.add('success-icon-hidden');
                
                // Trigger the animation after a tiny delay
                setTimeout(() => {
                    successIcon.classList.remove('success-icon-hidden');
                    successIcon.classList.add('success-icon-visible');
                }, 100);
            }
        }
    }
    /**
     * Show a toast notification with improved accessibility
     * @param {string} message - Message to display
     * @param {string} type - Type of toast (success, error, info)
     * @param {number} duration - Duration in milliseconds
     */
     function showToast(message, type = 'info', duration = 3000) {
        // If RevPilotUtils is available, use it
        if (typeof RevPilotUtils !== 'undefined' && RevPilotUtils.showToast) {
          RevPilotUtils.showToast(message, type, duration);
          return;
        }
        
        // Remove existing toast if present
        const existingToast = document.getElementById('toast');
        if (existingToast) {
          existingToast.remove();
        }
        
        // Create new toast
        const toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = `toast ${type}`;
        
        // Add appropriate icon based on type
        let icon = 'info-circle';
        if (type === 'success') {
          icon = 'check-circle';
        } else if (type === 'error') {
          icon = 'exclamation-circle';
        } else if (type === 'warning') {
          icon = 'exclamation-triangle';
        }
        
        toast.innerHTML = `
          <div class="toast-content">
            <i class="fas fa-${icon} toast-icon"></i>
            <span>${message}</span>
          </div>
          <button class="toast-close" aria-label="Dismiss notification">
            <i class="fas fa-times"></i>
          </button>
        `;
        
        // Add to DOM
        document.body.appendChild(toast);
        
        // Add close button functionality
        const closeBtn = toast.querySelector('.toast-close');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            toast.classList.add('toast-hiding');
            setTimeout(() => {
              if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
              }
            }, 300);
          });
        }
        
        // Auto-remove after delay
        setTimeout(() => {
          if (toast.parentNode) {
            toast.classList.add('toast-hiding');
            setTimeout(() => {
              if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
              }
            }, 300);
          }
        }, duration);
      }
      
      
    
    
    
    
    /**
     * Monitor network status and update UI with improved user feedback
     */
     function monitorNetworkStatus() {
        // Initial check
        const isOffline = !navigator.onLine;
        document.body.classList.toggle('offline', isOffline);
        
        if (isOffline) {
            showToast('You are offline. Some features may not work.', 'error', 5000);
        }
        
        // Add event listeners
        window.addEventListener('online', function() {
            document.body.classList.remove('offline');
            showToast('You are back online!', 'success');
        });
        
        window.addEventListener('offline', function() {
            document.body.classList.add('offline');
            showToast('You are offline. Some features may not work.', 'error', 5000);
        });
    }
    
/**
 * Load recent plans with improved update handling
 * @param {boolean} forceRefresh - Whether to force refresh from storage
 */
 function loadRecentPlans(forceRefresh = false) {
    const recentPlans = document.getElementById('recent-plans');
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
        // Use a consistent approach to display plans
        if (typeof displayPlans === 'function') {
          displayPlans(plans);
        } else if (typeof window.displayPlans === 'function') {
          window.displayPlans(plans);
        } else if (typeof RevPilotUI !== 'undefined' && typeof RevPilotUI.displayPlans === 'function') {
          RevPilotUI.displayPlans(plans);
        } else {
          console.error("displayPlans function not found");
          // Implement a fallback here if needed
          recentPlans.innerHTML = '';
          // Simple fallback to show plans
          plans.forEach(plan => {
            // Create plan item HTML
            const planItem = document.createElement('div');
            planItem.className = 'plan-item';
            planItem.setAttribute('data-plan-id', plan.id || '');
            planItem.setAttribute('data-account-name', plan.name || '');
            if (plan.gid) {
              planItem.setAttribute('data-sheet-gid', plan.gid);
            }
            
            planItem.innerHTML = `
              <div class="plan-info">
                <input type="checkbox" class="plan-checkbox" aria-label="Select ${plan.name}">
                <div>
                  <div class="plan-name">${plan.name}</div>
                  <div class="plan-date">
                    <i class="fas fa-clock" aria-hidden="true"></i> 
                    ${new Date(plan.date).toLocaleDateString()}
                  </div>
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
      } else {
        // Show empty state
        showEmptyPlansState();
      }
      
      // Update delete selected button state
      updateDeleteSelectedButton();
    });
  }
  
  
  

  
    /**
 * Direct display of plans - should work even if loadRecentPlans has issues
 * @param {Array} plans - Array of plan objects
 */
     function displayPlans(plans) {
        const recentPlans = document.getElementById('recent-plans');
        if (!recentPlans) return;
        
        if (!plans || plans.length === 0) {
          // Show empty state
          showEmptyPlansState();
          return;
        }
        
        // Always completely clear the container first
        recentPlans.innerHTML = '';
        console.log(`Displaying ${plans.length} plans in UI`);
        
        // Add each plan
        plans.forEach(plan => {
          const planItem = document.createElement('div');
          planItem.className = 'plan-item';
          planItem.setAttribute('data-plan-id', plan.id || '');
          planItem.setAttribute('data-account-name', plan.name || '');
          if (plan.gid) {
            planItem.setAttribute('data-sheet-gid', plan.gid);
          }
          
          planItem.innerHTML = `
            <div class="plan-info">
              <input type="checkbox" class="plan-checkbox" aria-label="Select ${plan.name}">
              <div>
                <div class="plan-name">${plan.name}</div>
                <div class="plan-date">
                  <i class="fas fa-clock" aria-hidden="true"></i> 
                  ${new Date(plan.date).toLocaleDateString()}
                </div>
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
        
        // Add event listener for checkboxes
        const checkboxes = recentPlans.querySelectorAll('.plan-checkbox');
        
        checkboxes.forEach(checkbox => {
          checkbox.addEventListener('change', function() {
            // Call the appropriate function to update delete selected button state
            if (typeof updateDeleteSelectedButton === 'function') {
              updateDeleteSelectedButton();
            } else if (typeof RevPilotUI !== 'undefined' && typeof RevPilotUI.updateDeleteSelectedButton === 'function') {
              RevPilotUI.updateDeleteSelectedButton();
            }
          });
        });
        
        // Initial call to set the correct state on load
        if (typeof updateDeleteSelectedButton === 'function') {
          updateDeleteSelectedButton();
        } else if (typeof RevPilotUI !== 'undefined' && typeof RevPilotUI.updateDeleteSelectedButton === 'function') {
          RevPilotUI.updateDeleteSelectedButton();
        }
        
        console.log(`Successfully displayed ${plans.length} plans`);
      }
      
      
      
      
      // Function to update delete selected button state
      function updateDeleteSelectedButton() {
        const deleteSelectedButton = document.getElementById('delete-selected-button');
        if (!deleteSelectedButton) return;
        
        const selectedCount = document.querySelectorAll('.plan-checkbox:checked').length;
        
        // Hide button when no plans are selected, show otherwise
        if (selectedCount === 0) {
          deleteSelectedButton.classList.add('hidden');
          deleteSelectedButton.disabled = true;
        } else {
          deleteSelectedButton.classList.remove('hidden');
          deleteSelectedButton.disabled = false;
          
          // Update button text to show count
          if (selectedCount === 1) {
            deleteSelectedButton.innerHTML = `<i class="fas fa-trash-alt"></i> Delete Selected Plan`;
          } else {
            deleteSelectedButton.innerHTML = `<i class="fas fa-trash-alt"></i> Delete ${selectedCount} Selected Plans`;
          }
        }
        
        // Announce to screen readers for accessibility
        const notificationArea = document.getElementById('notification-area');
        if (notificationArea && selectedCount > 0) {
          notificationArea.textContent = `${selectedCount} plans selected`;
        }
      }
      
    /**
     * Load plans from local storage when API request fails
     */
    function loadLocalPlans() {
        chrome.storage.local.get(['revpilot_recentPlans'], (result) => {
            const plans = result['revpilot_recentPlans'] || [];
            
            if (plans.length > 0) {
                displayPlans(plans);
            } else {
                showEmptyPlansState();
            }
        });
    }

    /**
     * Show empty state when no plans exist
     */
     function showEmptyPlansState() {
        const recentPlans = document.getElementById('recent-plans');
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
      
    /**
     * Handle plan search
     * @param {string} searchTerm - Search term
     */
     function handlePlanSearch(searchTerm) {
        const recentPlansContainer = document.getElementById('recent-plans');
        if (!recentPlansContainer) return;
        
        // Cache the search input element
        const searchInput = document.getElementById('search-plans');
        
        chrome.storage.local.get(['revpilot_recentPlans'], (result) => {
          const plans = result['revpilot_recentPlans'] || [];
          
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
            recentPlansContainer.innerHTML = `
              <div class="empty-search-state">
                <p>No plans match "${searchTerm}"</p>
                <button class="button clear-search-button">
                  <i class="fas fa-times"></i> Clear Search
                </button>
              </div>
            `;
            
            // Add event listener to clear search using cached search input
            const clearSearchBtn = recentPlansContainer.querySelector('.clear-search-button');
            if (clearSearchBtn) {
              clearSearchBtn.addEventListener('click', function() {
                if (searchInput) {
                  searchInput.value = '';
                  searchInput.dispatchEvent(new Event('input'));
                  searchInput.focus(); // Improve UX by focusing the input
                }
              });
            }
          } else {
            // Display filtered plans
            displayPlans(filteredPlans);
          }
        });
      }
      

    /**
     * Handle create error with improved user feedback
     * @param {string} errorMsg - Error message
     * @param {HTMLElement} submitButton - Submit button to reset
     * @param {HTMLElement} progressContainer - Progress container to remove
     */
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

    /**
     * Show success view after successful plan creation
     * @param {string} accountName - Account name
     * @param {Object} createResponse - Response object with spreadsheet information
     * @param {boolean} isInlineNavigation - Whether navigation happens in current tab
     */
    function showSuccessView(accountName, createResponse, isInlineNavigation) {
        // Update success message
        const successMessage = document.getElementById('success-message');
        if (successMessage) {
            successMessage.textContent = `Your account plan for "${accountName}" has been created successfully!`;
        }
        
        // Update "Open in Google Sheets" link
        const openSheetLink = document.getElementById('open-sheet-link');
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

    /**
     * Reset to create view
     */
    function resetToCreate() {
        // Reset form if it exists
        const createPlanForm = document.getElementById('create-plan-form');
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
    
/**
 * Enhanced handleDeletePlan function that fixes the UI update issue
 * @param {string} planId - ID of the plan to delete
 * @param {string} accountName - Name of the account
 * @param {string} sheetGid - Sheet GID
 */
 async function handleDeletePlan(planId, accountName, sheetGid) {
    try {
      if (!planId || !accountName) {
        showToast('Invalid plan data for deletion', 'error');
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
          
          // Find the plan item in the DOM BEFORE we start deletion process
          // This is crucial - we need to keep a reference to it before any async operations
          const planItems = document.querySelectorAll('.plan-item');
          const matchingItems = Array.from(planItems).filter(item => {
            const itemPlanId = item.getAttribute('data-plan-id');
            const itemAccountName = item.getAttribute('data-account-name');
            const itemSheetGid = item.getAttribute('data-sheet-gid');
            
            return (sheetGid && itemSheetGid === sheetGid) || 
                   (itemPlanId === planId && itemAccountName === accountName);
          });
          
          console.log(`Found ${matchingItems.length} matching items to delete`);
          
          // First update local storage
          chrome.storage.local.get(['revpilot_recentPlans'], (result) => {
            const plans = result['revpilot_recentPlans'] || [];
            
            // Filter out the plan to delete - use GID if available
            const updatedPlans = plans.filter(plan => {
              if (sheetGid && plan.gid) {
                // If both have GIDs, use that for comparison (most reliable)
                return plan.gid !== sheetGid;
              }
              // Fall back to name and ID comparison
              return !(plan.name === accountName && plan.id === planId);
            });
            
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
                  showToast(`Error: ${chrome.runtime.lastError.message}`, 'error');
                  return;
                }
                
                if (response && response.success) {
                  // Show success message
                  showToast(`Account plan "${accountName}" deleted successfully`, 'success');
                  
                  // Remove matching items from the DOM
                  matchingItems.forEach(item => {
                    // Add deletion animation class
                    item.classList.add('deleting');
                    
                    // Schedule removal after animation completes
                    setTimeout(() => {
                      if (item.parentNode) {
                        item.parentNode.removeChild(item);
                      }
                      
                      // Check if all plans are gone and show empty state if needed
                      const remainingPlans = document.querySelectorAll('.plan-item');
                      if (remainingPlans.length === 0) {
                        showEmptyPlansState();
                      }
                    }, 500);
                  });
                  
                  // Update delete selected button state
                  updateDeleteSelectedButton();
                } else {
                  const errorMsg = response && response.error ? response.error : 'Unknown error';
                  showToast(`Error: ${errorMsg}`, 'error');
                  
                  // Force a full refresh to ensure UI is consistent
                  loadRecentPlans(true);
                }
              });
            });
          });
        });
      }
    } catch (error) {
      console.error("Error in handleDeletePlan:", error);
      showToast(`Error: ${error.message || 'An unknown error occurred'}`, 'error');
    }
  }
  
      

// Call this when your extension loads
function initDeleteFunctionality() {
    addStyles();
    
    // Event delegation for plan items - add to your existing code
    const recentPlans = document.getElementById('recent-plans');
    if (recentPlans) {
        recentPlans.addEventListener('click', function(event) {
            // Handle delete button
            const deleteButton = event.target.closest('.delete-button');
            if (deleteButton) {
                const planId = deleteButton.getAttribute('data-plan-id');
                const accountName = deleteButton.getAttribute('data-account-name');
                const sheetGid = deleteButton.getAttribute('data-sheet-gid');
                
                if (planId && accountName) {
                    handleDeletePlan(planId, accountName, sheetGid);
                }
                return;
            }
        });
    }
}
    // Public API
    return {
        init,
        showToast,
        hideAllSections,
        showSection,
        switchTab,
        loadRecentPlans,
        handleCreateError,
        showSuccessView,
        resetToCreate,
        handleDeletePlan,  // Make sure this is exposed
        displayPlans,
        showEmptyPlansState,
        updateDeleteSelectedButton,
        handlePlanItemClick // Add this to expose it
      };
      
    
        
      
      
})();

// Initialize UI when DOM is ready
document.addEventListener('DOMContentLoaded', RevPilotUI.init);
// These are key functions to add to your existing ui.js file
// Focus on improved user interactions and animations

/**
 * Show the "What's Included" modal with smooth animation
 */
 function showPlanIncludesModal() {
    const overlay = document.createElement('div');
    overlay.className = 'plan-includes-overlay';
    
    overlay.innerHTML = `
      <div class="plan-includes-modal">
        <div class="plan-includes-header">
          <h3><i class="fas fa-list-check"></i> What's Included</h3>
          <button class="plan-includes-close" aria-label="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="plan-includes-content">
          <p>Each account plan includes the following sections:</p>
          <ul>
            <li>Account Profile</li>
            <li>Executive Summary</li>
            <li>Strategic Overview</li>
            <li>Key Contacts</li>
          </ul>
        </div>
      </div>
    `;
      
    document.body.appendChild(overlay);
      
    // Show the modal with animation
    setTimeout(() => {
      overlay.classList.add('show');
      const modal = overlay.querySelector('.plan-includes-modal');
      if (modal) {
        modal.classList.add('show');
      }
    }, 10);
      
    // Add event listener to close button
    const closeBtn = overlay.querySelector('.plan-includes-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        overlay.classList.remove('show');
        
        setTimeout(() => {
          if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
        }, 300);
      });
    }
}
  
/**
 * Show the keyboard shortcuts help modal
 */
function showKeyboardHelp() {
    const overlay = document.createElement('div');
    overlay.className = 'help-overlay';
    
    overlay.innerHTML = `
      <div class="help-container">
        <div class="help-header">
          <h3>Keyboard Shortcuts</h3>
          <button class="help-close" aria-label="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="help-content">
          <div class="shortcut-item">
            <div>Switch to Create tab</div>
            <div class="shortcut-keys"><kbd>Alt</kbd> + <kbd>C</kbd></div>
          </div>
          <div class="shortcut-item">
            <div>Switch to Manage tab</div>
            <div class="shortcut-keys"><kbd>Alt</kbd> + <kbd>M</kbd></div>
          </div>
          <div class="shortcut-item">
            <div>Focus new plan form</div>
            <div class="shortcut-keys"><kbd>Alt</kbd> + <kbd>N</kbd></div>
          </div>
          <div class="shortcut-item">
            <div>Toggle dark mode</div>
            <div class="shortcut-keys"><kbd>Alt</kbd> + <kbd>D</kbd></div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Add event listener to close button
    const closeBtn = overlay.querySelector('.help-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      });
    }
}
