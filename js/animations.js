// animations.js - Animation controller for RevPilot AI
document.addEventListener('DOMContentLoaded', function() {
    // Prevent transition flashes on page load
    document.body.classList.add('preload');
    
    // Remove the preload class after a short delay to enable animations
    setTimeout(function() {
      document.body.classList.remove('preload');
    }, 100);
    
    // Cache DOM elements for performance
    const tabContents = document.querySelectorAll('.tab-content');
    const tabButtons = document.querySelectorAll('.tab-button');
    // Enhanced tab switching with animations
    function enhanceTabSwitching() {
        tabButtons.forEach(function(button) {
          button.addEventListener('click', function() {
            const tabName = button.getAttribute('data-tab');
            
            // First hide all tab contents with opacity transition
            tabContents.forEach(content => {
              content.classList.remove('active');
            });
            
            // Set the active button
            tabButtons.forEach(btn => {
              btn.classList.remove('active');
              btn.setAttribute('aria-selected', 'false');
            });
            
            // Show the selected tab with animation
            button.classList.add('active');
            button.setAttribute('aria-selected', 'true');
            
            // Slight delay for better animation sequence
            setTimeout(() => {
              const selectedContent = document.getElementById(tabName + '-tab');
              if (selectedContent) {
                selectedContent.classList.add('active');
              }
            }, 50);
          });
        });
      }
      // Enhanced section transitions
    function enhanceSectionTransitions() {
        // Improved showSection function
        window.showSectionAnimated = function(sectionId) {
          const allSections = document.querySelectorAll('.section');
          
          // Hide all sections first
          allSections.forEach(section => {
            section.classList.add('hidden');
          });
          
          // Show the requested section with animation
          const targetSection = typeof sectionId === 'string' 
            ? document.getElementById(sectionId) 
            : sectionId;
            
          if (targetSection) {
            setTimeout(() => {
              targetSection.classList.remove('hidden');
            }, 100);
          }
        };
      }
      // Animate plan items with staggered entrance
    function animatePlanItems() {
        const observer = new IntersectionObserver((entries) => {
          entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
              // Add animation class with staggered delay based on index
              setTimeout(() => {
                entry.target.classList.add('animate-in');
              }, index * 50); // 50ms staggered delay
              
              // Unobserve after animation is applied
              observer.unobserve(entry.target);
            }
          });
        }, { threshold: 0.1 });
        
        // Observe all plan items
        document.querySelectorAll('.plan-item').forEach(item => {
          observer.observe(item);
        });
      }
      // Enhance form submission animation
    function enhanceFormAnimation() {
        const form = document.getElementById('create-plan-form');
        if (form) {
          form.addEventListener('submit', function() {
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton) {
              submitButton.classList.add('submitting');
            }
          });
        }
      }
      // Enhance toast notifications
    function enhanceToastAnimations() {
        // Override the default toast creation to include animations
        window.showToastAnimated = function(message, type = 'info', duration = 3000) {
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
          
          // Create new toast with animation
          setTimeout(() => {
            const toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = `toast ${type}`;
            
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
          }, existingToast ? 300 : 0);
        };
      }
      // Enhance popup animations
    function enhancePopupAnimations() {
        // Override default popup functions with animated versions
        window.showPopupAnimated = function(popupId) {
          const popupOverlay = document.getElementById(popupId);
          if (!popupOverlay) return;
          
          // First make the overlay visible but transparent
          popupOverlay.style.visibility = 'visible';
          popupOverlay.style.opacity = '0';
          
          // Force a reflow to enable the transition
          void popupOverlay.offsetWidth;
          
          // Then add the show class to trigger the transition
          popupOverlay.classList.add('show');
          
          // Find and animate the popup container
          const popupContainer = popupOverlay.querySelector('.popup-container');
          if (popupContainer) {
            popupContainer.style.transform = 'scale(0.95)';
            popupContainer.style.opacity = '0';
            
            // Force a reflow for the container too
            void popupContainer.offsetWidth;
            
            // Then animate it in
            popupContainer.style.transform = 'scale(1)';
            popupContainer.style.opacity = '1';
          }
        };
        
        window.closePopupAnimated = function(popupId) {
          const popupOverlay = document.getElementById(popupId);
          if (!popupOverlay) return;
          
          // First animate the container out
          const popupContainer = popupOverlay.querySelector('.popup-container');
          if (popupContainer) {
            popupContainer.style.transform = 'scale(0.95)';
            popupContainer.style.opacity = '0';
          }
          
          // Then remove the show class from the overlay
          popupOverlay.classList.remove('show');
          
          // Wait for animations to finish before hiding completely
          setTimeout(() => {
            popupOverlay.style.visibility = 'hidden';
          }, 300);
        };
      }
      // Function to handle dark mode toggle animation
    function enhanceDarkModeToggle() {
        const toggle = document.getElementById('dark-mode-toggle');
        if (toggle) {
          toggle.addEventListener('click', function() {
            const icon = toggle.querySelector('i');
            if (icon) {
              icon.style.transform = 'rotate(360deg)';
              setTimeout(() => {
                icon.style.transform = '';
              }, 500);
            }
          });
        }
      }
      // NEW: Function to handle animations for plan features
    function animatePlanFeatures() {
        const planFeatures = document.querySelectorAll('.plan-features li');
        planFeatures.forEach((feature, index) => {
          // Reset animation
          feature.style.animation = 'none';
          feature.offsetHeight; // Trigger reflow
          
          // Apply animation with calculated delay
          feature.style.animation = `fadeInUp 0.3s forwards ${index * 0.05}s`;
        });
      }
  
      // NEW: Animation for plan cards when they appear
      function animatePlanCard(planElement) {
        if (!planElement) return;
        
        // Reset any transforms
        planElement.style.transform = 'scale(0.95)';
        planElement.style.opacity = '0';
        
        // Force reflow
        planElement.offsetHeight;
        
        // Apply animation
        setTimeout(() => {
          planElement.style.transform = 'scale(1)';
          planElement.style.opacity = '1';
        }, 10);
      }
      // NEW: Add event listeners to tabs to trigger animations
    function setupUpgradeTabAnimations() {
        document.querySelectorAll('.popup-tab-button').forEach(tab => {
          tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            
            // If switching to upgrade tab, animate the plan features
            if (tabId === 'upgrade') {
              setTimeout(animatePlanFeatures, 200);
              
              // Animate the current plan card
              const currentPlan = document.querySelector('.plan.current');
              animatePlanCard(currentPlan);
            }
          });
        });
        
        // Enhanced hover effect for plan cards
        const planCards = document.querySelectorAll('.plan');
        planCards.forEach(card => {
          card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-5px)';
            this.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.12)';
          });
          
          card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '';
          });
        });
      }
      // Initialize all animation enhancements
    function initAnimations() {
        enhanceTabSwitching();
        enhanceSectionTransitions();
        enhanceFormAnimation();
        enhanceToastAnimations();
        enhancePopupAnimations();
        enhanceDarkModeToggle();
        setupUpgradeTabAnimations();
        
        // Run plan item animations whenever the manage tab is shown
        document.querySelector('#tab-manage')?.addEventListener('click', function() {
          setTimeout(animatePlanItems, 300);
        });
      }
      
      // Call the initialization function
      initAnimations();
    });
  
  // IMPORTANT: REMOVE THIS ENTIRE SECTION - DELETE or COMMENT it out
  // Enhanced upgrade view switching with smooth animations
  /*
  document.addEventListener('DOMContentLoaded', function() {
    // Get references to the buttons
    const showProPlanBtn = document.getElementById('show-pro-plan');
    const backToFreeBtn = document.getElementById('back-to-free');
    
    // Get references to the plan slides
    const freePlanView = document.getElementById('free-plan-view');
    const proPlanView = document.getElementById('pro-plan-view');
    
    // Add event listener for "View Pro Plan" button
    if (showProPlanBtn) {
      showProPlanBtn.addEventListener('click', function() {
        console.log("View Pro Plan clicked");
        freePlanView.classList.remove('active');
        freePlanView.classList.add('slide-out');
        
        // Show pro plan view with slight delay for smoother transition
        setTimeout(() => {
          proPlanView.classList.add('active');
        }, 50);
      });
    }
    
    // Add event listener for "Back" button
    if (backToFreeBtn) {
      backToFreeBtn.addEventListener('click', function() {
        console.log("Back to Free clicked");
        proPlanView.classList.remove('active');
        
        // Show free plan view with slight delay
        setTimeout(() => {
          freePlanView.classList.remove('slide-out');
          freePlanView.classList.add('active');
        }, 50);
      });
    }
  });
  */