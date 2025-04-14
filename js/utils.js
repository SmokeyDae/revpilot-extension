// utils.js - Enhanced Utilities Module
const RevPilotUtils = (() => {
    /**
     * Format a date string in a human-readable format
     * @param {string} dateString - Date string in ISO format
     * @param {Object} options - Intl.DateTimeFormat options
     * @returns {string} Formatted date string
     */
    function formatDate(dateString, options = {}) {
        try {
            if (!dateString) return 'Unknown date';
            
            const date = new Date(dateString);
            
            // Check if the date is valid
            if (isNaN(date.getTime())) {
                return 'Unknown date';
            }
            
            // Default options
            const defaultOptions = {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            };
            
            // Merge with provided options
            const formatOptions = { ...defaultOptions, ...options };
            
            // Use Intl formatter for localized date
            return new Intl.DateTimeFormat('en-US', formatOptions).format(date);
        } catch (error) {
            console.error('Error formatting date:', error);
            return 'Unknown date';
        }
    }
  
    /**
     * Format a relative time (e.g., "2 days ago")
     * @param {string|Date} date - Date string or Date object
     * @returns {string} Relative time string
     */
    function formatRelativeTime(date) {
        try {
            const inputDate = date instanceof Date ? date : new Date(date);
            
            // Check if the date is valid
            if (isNaN(inputDate.getTime())) {
                return 'Unknown time';
            }
            
            const now = new Date();
            const diffMs = now - inputDate;
            const diffSec = Math.floor(diffMs / 1000);
            const diffMin = Math.floor(diffSec / 60);
            const diffHour = Math.floor(diffMin / 60);
            const diffDay = Math.floor(diffHour / 24);
            
            if (diffSec < 60) {
                return 'Just now';
            } else if (diffMin < 60) {
                return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
            } else if (diffHour < 24) {
                return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
            } else if (diffDay < 7) {
                return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
            } else {
                return formatDate(date);
            }
        } catch (error) {
            console.error('Error formatting relative time:', error);
            return 'Unknown time';
        }
    }
  
    /**
     * Create a plan item element for display with enhanced features
     * @param {Object} plan - Plan data
     * @returns {HTMLElement} Plan item element
     */
     function createPlanItem(plan) {
        // Validate input
        if (!plan || !plan.name) {
          console.error('Invalid plan data:', plan);
          return document.createElement('div'); // Return empty div as fallback
        }
        
        const planItem = document.createElement('div');
        planItem.className = 'plan-item plan-item-hidden';
        planItem.setAttribute('data-plan-id', plan.id || '');
        planItem.setAttribute('data-plan-name', plan.name);
        
        // Format date string
        const dateString = formatDate(plan.date);
        const relativeDate = formatRelativeTime(plan.date);
        
        // Create plan info element
        const planInfo = document.createElement('div');
        planInfo.className = 'plan-info';
        
        // Create plan name element
        const planName = document.createElement('div');
        planName.className = 'plan-name';
        planName.textContent = plan.name;
        planName.setAttribute('title', plan.name); // For longer names that might truncate
        
        // Create plan metadata element
        const planMeta = document.createElement('div');
        planMeta.className = 'plan-meta';
        
        // Create date element with tooltip
        const planDate = document.createElement('div');
        planDate.className = 'plan-date';
        planDate.innerHTML = `<i class="fas fa-clock" aria-hidden="true"></i> ${relativeDate}`;
        planDate.setAttribute('title', `Created on ${dateString}`);
        planDate.setAttribute('aria-label', `Created on ${dateString}`);
        
        // Add plan type if available
        if (plan.type) {
          const planType = document.createElement('div');
          planType.className = 'plan-type';
          planType.textContent = plan.type;
          planMeta.appendChild(planType);
        }
        
        // Assemble plan info
        planMeta.appendChild(planDate);
        planInfo.appendChild(planName);
        planInfo.appendChild(planMeta);
        
        // Create plan actions element
        const planActions = document.createElement('div');
        planActions.className = 'plan-actions';
        
        // Create open button
        const openButton = document.createElement('button');
        openButton.className = 'button primary open-button';
        openButton.innerHTML = '<i class="fas fa-external-link-alt" aria-hidden="true"></i> Open';
        openButton.setAttribute('aria-label', `Open ${plan.name}`);
        openButton.setAttribute('data-plan-url', plan.url);
        
        // Create delete button
        const deleteButton = document.createElement('button');
        deleteButton.className = 'button delete-button';
        deleteButton.innerHTML = '<i class="fas fa-trash-alt" aria-hidden="true"></i> Delete';
        deleteButton.setAttribute('aria-label', `Delete ${plan.name}`);
        deleteButton.setAttribute('data-plan-id', plan.id);
        deleteButton.setAttribute('data-account-name', plan.name);
        
        if (plan.gid) {
          deleteButton.setAttribute('data-sheet-gid', plan.gid);
        }
        
        // Assemble plan actions
        planActions.appendChild(openButton);
        planActions.appendChild(deleteButton);
        
        // Assemble plan item
        planItem.appendChild(planInfo);
        planItem.appendChild(planActions);
        
        return planItem;
      }
  
    /**
     * Show an empty plans state with enhanced messaging
     * @param {string} message - Optional custom message
     * @param {HTMLElement} container - Container element (default: document.getElementById('recent-plans'))
     */
    function showEmptyPlansState(message, container) {
        const recentPlans = container || document.getElementById('recent-plans');
        if (!recentPlans) return;
        
        const defaultMessage = 'Create your first account plan to get started.';
        
        recentPlans.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="fas fa-clipboard-list"></i>
                </div>
                <h3>No plans yet</h3>
                <p>${escapeHtml(message || defaultMessage)}</p>
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
     * Show an empty search results state
     * @param {string} searchTerm - The search term that yielded no results
     * @param {HTMLElement} container - Container element (default: document.getElementById('recent-plans'))
     */
    function showEmptySearchState(searchTerm, container) {
        const recentPlans = container || document.getElementById('recent-plans');
        if (!recentPlans) return;
        
        recentPlans.innerHTML = `
            <div class="empty-search-state">
                <div class="empty-state-icon">
                    <i class="fas fa-search"></i>
                </div>
                <p>No plans match "${escapeHtml(searchTerm)}"</p>
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
    }
  
    /**
     * Show toast notification
     * @param {string} message - Message to display
     * @param {string} type - Type of toast (success, error, info)
     * @param {number} duration - Duration in milliseconds
     */
    function showToast(message, type = 'info', duration = 3000) {
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
            toast.classList.add('toast-hiding');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, duration);
    }
  
    /**
     * Create a progress bar for tracking multi-step operations
     * @param {Array} steps - Array of step names, defaults to standard steps
     * @returns {HTMLElement} The progress container element
     */
    function createProgressBar(steps = ['Preparing', 'Creating', 'Formatting', 'Finishing']) {
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-container';
        
        // Create step indicators
        const stepsHtml = steps.map((step, index) => `
            <div class="step${index === 0 ? ' active' : ''}" data-step="${index + 1}">
                <div class="step-circle"><span>${index + 1}</span></div>
                <div class="step-label">${escapeHtml(step)}</div>
            </div>
        `).join('');
        
        progressContainer.innerHTML = `
            <div class="progress-steps">
            ${stepsHtml}
            </div>
            <div class="progress-bar">
                <div class="progress-fill progress-fill-25"></div>
            </div>
            <div class="progress-status">Preparing to create plan...</div>
        `;
        
        return progressContainer;
    }
  
    /**
     * Update the progress status and visual indicators
     * @param {HTMLElement} container - Progress container element
     * @param {number} stepNum - Current step number (1-based)
     * @param {string} message - Status message to display
     */
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
    
    /**
     * Validate input against specified rules
     * @param {HTMLElement} input - Input element to validate
     * @param {Object} rules - Validation rules (required, minLength, maxLength, pattern, validator)
     * @returns {Object} Validation result {valid: boolean, message: string}
     */
    function validateInput(input, rules = {}) {
        const value = input.value.trim();
        
        // Required check
        if (rules.required && !value) {
            return { 
                valid: false, 
                message: rules.requiredMessage || `This field is required` 
            };
        }
        
        // Min length check
        if (rules.minLength && value.length < rules.minLength) {
            return { 
                valid: false, 
                message: rules.minLengthMessage || `Must be at least ${rules.minLength} characters` 
            };
        }
        
        // Max length check
        if (rules.maxLength && value.length > rules.maxLength) {
            return { 
                valid: false, 
                message: rules.maxLengthMessage || `Cannot exceed ${rules.maxLength} characters` 
            };
        }
        
        // Pattern check
        if (rules.pattern && !rules.pattern.test(value)) {
            return { 
                valid: false, 
                message: rules.patternMessage || `Contains invalid characters` 
            };
        }
        
        // Custom validator
        if (rules.validator && typeof rules.validator === 'function') {
            const customResult = rules.validator(value);
            if (customResult !== true) {
                return {
                    valid: false,
                    message: customResult || `Invalid input`
                };
            }
        }
        
        return { valid: true };
    }
    
    /**
     * Show validation error for an input
     * @param {HTMLElement} input - Input element
     * @param {string} message - Error message
     */
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
    
    /**
     * Clear validation error for an input
     * @param {HTMLElement} input - Input element
     */
    function clearValidationError(input) {
        if (!input) return;
        
        input.style.borderColor = '';
        input.setAttribute('aria-invalid', 'false');
        
        const errorEl = document.getElementById(`${input.id}-error`);
        if (errorEl) {
            errorEl.remove();
        }
    }
    
    /**
     * Throttle a function to limit how often it can be called
     * @param {Function} func - Function to throttle
     * @param {number} limit - Time limit in milliseconds
     * @returns {Function} Throttled function
     */
    function throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    /**
     * Debounce a function to delay execution until after wait milliseconds
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }
    
    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    function escapeHtml(text) {
        if (!text) return '';
        
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Add accessibility improvements to the UI
     */
    function addAccessibilityImprovements() {
        // Add role="tablist" to tabs container
        const tabsContainer = document.querySelector('.tabs');
        if (tabsContainer) {
            tabsContainer.setAttribute('role', 'tablist');
        }
        
        // Add proper ARIA attributes to tab buttons
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(function(button, index) {
            const tabId = button.getAttribute('data-tab');
            button.setAttribute('id', `tab-${tabId}`);
            button.setAttribute('aria-controls', `${tabId}-tab`);
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-selected', button.classList.contains('active') ? 'true' : 'false');
            button.setAttribute('tabindex', button.classList.contains('active') ? '0' : '-1');
        });
        
        // Add proper ARIA attributes to tab contents
        const tabContents = document.querySelectorAll('.tab-content');
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
     * Generate a unique ID
     * @param {string} prefix - Optional prefix for the ID
     * @returns {string} Unique ID
     */
    function generateUniqueId(prefix = 'revpilot') {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Check if an element is in the viewport
     * @param {HTMLElement} element - Element to check
     * @param {number} offset - Optional offset
     * @returns {boolean} Whether element is in viewport
     */
    function isInViewport(element, offset = 0) {
        if (!element) return false;
        
        const rect = element.getBoundingClientRect();
        
        return (
            rect.top >= 0 - offset &&
            rect.left >= 0 - offset &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + offset &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth) + offset
        );
    }
    
    /**
     * Cleanup resources when the window is closed
     */
    function cleanupResources() {
        // Clear any timeouts or intervals
        // Remove event listeners that were dynamically added
        // This helps prevent memory leaks
        
        console.log('Cleaning up RevPilotUtils resources');
    }
    
    // Register cleanup handler
    window.addEventListener('unload', cleanupResources);
    
    // Public API
    return {
        formatDate,
        formatRelativeTime,
        createPlanItem,
        showEmptyPlansState,
        showEmptySearchState,
        showToast,
        createProgressBar,
        updateProgressStatus,
        validateInput,
        showValidationError,
        clearValidationError,
        throttle,
        debounce,
        escapeHtml,
        addAccessibilityImprovements,
        generateUniqueId,
        isInViewport,
        cleanupResources
    };
})();