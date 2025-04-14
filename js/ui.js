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
        planItemClick: null,
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
            
            // Initialize theme based on stored preference
            initializeTheme();
            
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
        
        // Dark mode toggle with proper state preservation
        darkModeToggle = document.getElementById('dark-mode-toggle');
        if (darkModeToggle) {
            // Remove any existing event listener to prevent duplicates
            darkModeToggle.removeEventListener('click', toggleDarkMode);
            // Add the event listener
            darkModeToggle.addEventListener('click', toggleDarkMode);
            console.log("Dark mode toggle event listener attached in setupEventListeners");
        } else {
            console.warn("Dark mode toggle not found during event listener setup");
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
        // Handle open button
        const openButton = event.target.closest('.open-button');
        if (openButton) {
            const planUrl = openButton.getAttribute('data-plan-url');
            if (planUrl) {
                chrome.tabs.create({ url: planUrl });
            }
            return;
        }
        
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
        // Update active tab button and ARIA states
        tabButtons.forEach(function(btn) {
            const isActive = btn.getAttribute('data-tab') === tabName;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            btn.setAttribute('tabindex', isActive ? '0' : '-1');
        });
        
        // Show corresponding tab content
        tabContents.forEach(function(content) {
            const isActive = content.id === tabName + '-tab';
            content.classList.toggle('active', isActive);
            content.setAttribute('aria-hidden', isActive ? 'false' : 'true');
            content.setAttribute('tabindex', isActive ? '0' : '-1');
            
            // If showing manage tab, load plans
            if (isActive && tabName === 'manage') {
                loadRecentPlans();
            }
        });
        
        // Announce tab change to screen readers
        const notificationArea = document.getElementById('notification-area');
        if (notificationArea) {
            notificationArea.textContent = `${tabName} tab selected`;
        }
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
        // If utils is available, use that implementation
        if (typeof RevPilotUtils !== 'undefined' && RevPilotUtils.showToast) {
            RevPilotUtils.showToast(message, type, duration);
            return;
        }
        
        // Remove existing toast if present
        const existingToast = document.getElementById('toast');
        if (existingToast) {
            existingToast.remove();
        }
        
        // Create new toast with enhanced styling
        const toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = `toast ${type}`;
        
        // Add appropriate icon based on type
        let icon = 'info-circle';
        if (type === 'success') {
            icon = 'check-circle';
        } else if (type === 'error') {
            icon = 'exclamation-circle';
        }
        
        // Helper for HTML escaping
        const escapeHtml = (text) => {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };
        
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas fa-${icon} toast-icon"></i>
                <span>${escapeHtml(message)}</span>
            </div>
            <button class="toast-close" aria-label="Dismiss notification">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Add to DOM
        document.body.appendChild(toast);
        
        // Announce for screen readers
        const notificationArea = document.getElementById('notification-area');
        if (notificationArea) {
            notificationArea.textContent = message;
        }
        
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
            if (toast.parentNode) { // Check if toast still exists
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
     * Initialize theme based on stored preferences with improved caching
     */
    // In ui.js - Update the initializeTheme function
    function initializeTheme() {
        // Get the dark mode toggle button if not already cached
        if (!darkModeToggle) {
          darkModeToggle = document.getElementById('dark-mode-toggle');
        }
        
        // Check stored preference and apply theme
        chrome.storage.local.get(['revpilot_darkMode'], (result) => {
          const isDarkMode = !!result['revpilot_darkMode'];
          
          // Apply theme
          document.body.classList.toggle('dark-mode', isDarkMode);
          
          // Update button appearance
          updateDarkModeToggle(isDarkMode);
        });
        
        // Ensure event listener is properly attached
        if (darkModeToggle) {
          // Remove any existing event listeners to prevent duplicates
          darkModeToggle.removeEventListener('click', toggleDarkMode);
          // Add the event listener
          darkModeToggle.addEventListener('click', toggleDarkMode);
        }
      }
      
    
    /**
     * Toggle dark mode with improved storage
     */
     function toggleDarkMode() {
        const isDarkMode = document.body.classList.toggle('dark-mode');
        
        // Update toggle button
        updateDarkModeToggle(isDarkMode);
        
        // Save preference
        chrome.storage.local.set({ 
            'revpilot_darkMode': isDarkMode 
        }, () => {
            if (chrome.runtime.lastError) {
                console.warn('Error saving theme preference:', chrome.runtime.lastError);
            }
        });
        
        // Announce change to screen readers
        const notificationArea = document.getElementById('notification-area');
        if (notificationArea) {
            notificationArea.textContent = isDarkMode ? 'Dark mode enabled' : 'Light mode enabled';
        }
        
        // Show visual feedback
        showToast(isDarkMode ? 'Dark mode enabled' : 'Light mode enabled', 'info', 1500);
    }
    
    /**
     * Update dark mode toggle icon and label
     * @param {boolean} isDarkMode - Whether dark mode is enabled
     */
     function updateDarkModeToggle(isDarkMode) {
        if (!darkModeToggle) return;
        
        if (isDarkMode) {
          darkModeToggle.innerHTML = '<i class="fas fa-sun"></i>';
          darkModeToggle.setAttribute('aria-label', 'Switch to light mode');
        } else {
          darkModeToggle.innerHTML = '<i class="fas fa-moon"></i>';
          darkModeToggle.setAttribute('aria-label', 'Switch to dark mode');
        }
      }
      

    
    /**
     * Create dark mode toggle button with proper accessibility
     * @returns {HTMLElement} The toggle button
     */
     function createDarkModeToggle() {
        const toggle = document.createElement('button');
        toggle.id = 'dark-mode-toggle';
        toggle.className = 'icon-button';
        toggle.setAttribute('aria-label', 'Toggle dark mode');
        toggle.innerHTML = '<i class="fas fa-moon"></i>';
        
        // Add event listener
        eventHandlers.darkModeToggle = toggleDarkMode;
        toggle.addEventListener('click', eventHandlers.darkModeToggle);
        
        
        const logoContainer = document.querySelector('.logo-container');
        if (logoContainer) {
          logoContainer.insertBefore(toggle, logoContainer.firstChild);
        }
        
        return toggle;
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
     * Load recent plans for the manage tab with improved caching
     * @param {boolean} forceRefresh - Whether to force refresh from the server
     */
    function loadRecentPlans(forceRefresh = false) {
        if (!recentPlans) {
            console.error("recentPlans element not found");
            return;
        }
        
        // Set loading state with accessible messaging
        recentPlans.innerHTML = `
            <div class="skeleton-container" aria-hidden="true">
                <div class="skeleton-item"></div>
                <div class="skeleton-item"></div>
                <div class="skeleton-item"></div>
            </div>
            <p class="visually-hidden" aria-live="polite">Loading plans...</p>
        `;
        
        // Get the master sheet ID directly
        chrome.storage.local.get(['revpilot_masterSheetId'], (result) => {
            const masterSheetId = result['revpilot_masterSheetId'];
            
            if (masterSheetId) {
                // Check cache first if not forcing refresh
                if (!forceRefresh) {
                    chrome.storage.local.get(['revpilot_plansCache', 'revpilot_plansCacheExpiry'], (result) => {
                        const now = Date.now();
                        const cache = result['revpilot_plansCache'];
                        const expiry = result['revpilot_plansCacheExpiry'];
                        
                        // Use cache if valid and not expired (10 min TTL)
                        if (cache && expiry && now < expiry && cache.masterSheetId === masterSheetId) {
                            console.log("Using cached plans data");
                            displayPlans(cache.plans);
                            return;
                        }
                        
                        // Fetch fresh data if cache invalid or expired
                        fetchPlansData();
                    });
                } else {
                    // Skip cache check if forcing refresh
                    fetchPlansData();
                }
            } else {
                // No master sheet ID, load from local storage
                loadLocalPlans();
            }
        });
        
        // Function to fetch fresh data from API
        function fetchPlansData() {
            chrome.runtime.sendMessage({
                action: 'getSheetDetails',
                spreadsheetId: masterSheetId,
                forceRefresh: forceRefresh
            }, function(response) {
                if (chrome.runtime.lastError) {
                    console.error("Error fetching sheet details:", chrome.runtime.lastError);
                    showToast('Error loading plans. Using local data.', 'error');
                    loadLocalPlans();
                    return;
                }
                
                if (response && response.success && response.sheets) {
                    const sheets = response.sheets.filter(sheet => 
                        sheet.properties && sheet.properties.title !== 'Overview'
                    );
                    
                    if (sheets.length > 0) {
                        // Convert sheets to plan format for display
                        const plans = sheets.map(sheet => {
                            return {
                                name: sheet.properties.title, 
                                id: masterSheetId,
                                gid: sheet.properties.sheetId,
                                url: `https://docs.google.com/spreadsheets/d/${masterSheetId}/edit#gid=${sheet.properties.sheetId}`,
                                date: new Date().toISOString(),
                                type: 'Account Plan'
                            };
                        });
                        
                        // Display the plans
                        displayPlans(plans);
                        
                        // Cache the plans data with 10 min expiry
                        chrome.storage.local.set({ 
                            'revpilot_recentPlans': plans,
                            'revpilot_plansCache': {
                                masterSheetId,
                                plans,
                                fetched: Date.now()
                            },
                            'revpilot_plansCacheExpiry': Date.now() + 600000 // 10 min cache
                        });
                    } else {
                        showEmptyPlansState();
                    }
                } else {
                    loadLocalPlans();
                }
            });
        }
    }
    /**
 * Direct display of plans - should work even if loadRecentPlans has issues
 * @param {Array} plans - Array of plan objects
 */
function displayPlans(plans) {
    const recentPlans = document.getElementById('recent-plans');
    if (!recentPlans) {
        console.error("recentPlans element not found");
        return;
    }
    
    if (!plans || plans.length === 0) {
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
        
        // Add event listener to the create button
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
    
    // Add each plan with proper formatting
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
    
    console.log(`Successfully displayed ${plans.length} plans`);
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
        if (!recentPlans) return;
        
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
                recentPlans.innerHTML = `
                    <div class="empty-search-state">
                        <div class="empty-state-icon">
                            <i class="fas fa-search"></i>
                        </div>
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
 * Enhanced handleDeletePlan function that fixes the blurred plans issue
 * @param {string} planId - ID of the plan to delete
 * @param {string} accountName - Name of the account
 * @param {string} sheetGid - Sheet GID
 */
function handleDeletePlan(planId, accountName, sheetGid) {
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
                <h3>Delete Confirmation</h3>
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
                            showToast(`Error: ${chrome.runtime.lastError.message}`, 'error');
                            return;
                        }
                        
                        if (response && response.success) {
                            showToast(`Account plan "${accountName}" deleted successfully`, 'success');
                            
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
                            showToast(`Error: ${errorMsg}`, 'error');
                            
                            // Still refresh to show local changes
                            displayPlans(updatedPlans);
                        }
                    });
                });
            });
        });
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
        toggleDarkMode,
        handleDeletePlan,
        initializeTheme,
        updateDarkModeToggle
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
