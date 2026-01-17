// Rate limiting configuration (20 seconds)
const RATE_LIMIT_SECONDS = 20;
const RATE_LIMIT_KEY = 'pp_last_submit';

// Email validation regex (more strict than HTML5)
const EMAIL_REGEX = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

document.getElementById('subscribe-form').addEventListener('submit', function(e) {
    e.preventDefault();

    const form = this;
    const submitBtn = form.querySelector('.submit');
    const emailInput = document.getElementById('bd-email');

    // Note: All anti-spam enforcement must be server-side.
    // 1. Rate limiting check (UX only)
    const lastSubmit = localStorage.getItem(RATE_LIMIT_KEY);
    if (lastSubmit) {
        const timeSinceLastSubmit = (Date.now() - parseInt(lastSubmit)) / 1000;
        if (timeSinceLastSubmit < RATE_LIMIT_SECONDS) {
            const remainingSeconds = Math.ceil(RATE_LIMIT_SECONDS - timeSinceLastSubmit);
            alert(`Please wait ${remainingSeconds} seconds before trying again.`);
            return false;
        }
    }

    // 2. Stronger email validation
    const email = emailInput.value.trim();
    if (!EMAIL_REGEX.test(email)) {
        alert('Please enter a valid email address.');
        emailInput.focus();
        return false;
    }

    // 3. Double-click protection
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    // Store submission timestamp
    localStorage.setItem(RATE_LIMIT_KEY, Date.now().toString());

    // Trigger confetti animation
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
    });

    // Submit the form after a brief delay to show confetti
    setTimeout(function() {
        form.submit();
    }, 300);
});

// Enable draggable faux windows on larger screens
(function enableWindowDragging() {
    const MOBILE_BREAKPOINT = 768;
    const mobileQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    let teardown = null;

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const initDraggableWindows = () => {
        if (teardown || mobileQuery.matches) {
            return;
        }

        const desktop = document.querySelector('.desktop');
        if (!desktop) {
            return;
        }

        const windows = Array.from(desktop.querySelectorAll('.window'));
        if (windows.length === 0) {
            return;
        }

        const originalInlineStyles = new Map();
        const titleBarListeners = [];
        const desktopRect = desktop.getBoundingClientRect();
        const windowRects = new Map();

        windows.forEach(win => {
            windowRects.set(win, win.getBoundingClientRect());
        });

        const Z_INDEX_RANGES = {
            decorative: { base: 1, seed: 10, max: 99 },
            functional: { base: 100, seed: 110, max: 999 }
        };

        let activeWindow = null;
        let activePointerId = null;
        let startX = 0;
        let startY = 0;
        let baseLeft = 0;
        let baseTop = 0;
        let zIndexSeeds = {
            decorative: Z_INDEX_RANGES.decorative.seed,
            functional: Z_INDEX_RANGES.functional.seed
        };

        const windowStates = new WeakMap();

        const toggleMinimize = (win) => {
            const state = windowStates.get(win);
            const body = win.querySelector('.window-body');

            if (!state || !body) return;

            // Get computed padding values
            const computedStyle = window.getComputedStyle(body);
            const paddingTop = computedStyle.paddingTop;
            const paddingBottom = computedStyle.paddingBottom;

            if (state.isMinimized) {
                // Restore
                body.classList.remove('is-minimized');
                body.classList.add('is-restoring');

                // Force starting values
                body.style.maxHeight = '0px';
                body.style.paddingTop = '0px';
                body.style.paddingBottom = '0px';
                body.style.opacity = '0';

                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        body.style.maxHeight = state.normalBodyHeight + 'px';
                        body.style.paddingTop = state.originalPaddingTop;
                        body.style.paddingBottom = state.originalPaddingBottom;
                        body.style.opacity = '1';
                    });
                });

                const cleanup = (e) => {
                    if (e.propertyName === 'max-height') {
                        body.classList.remove('is-restoring');
                        body.style.maxHeight = '';
                        body.style.paddingTop = '';
                        body.style.paddingBottom = '';
                        body.style.opacity = '';
                        body.removeEventListener('transitionend', cleanup);
                    }
                };
                body.addEventListener('transitionend', cleanup);

                state.isMinimized = false;
                win.setAttribute('aria-expanded', 'true');
            } else {
                // Minimize - store original values
                state.normalBodyHeight = body.scrollHeight;
                state.originalPaddingTop = paddingTop;
                state.originalPaddingBottom = paddingBottom;

                // Set explicit starting values
                body.style.maxHeight = body.scrollHeight + 'px';
                body.style.paddingTop = paddingTop;
                body.style.paddingBottom = paddingBottom;
                body.style.opacity = '1';
                body.classList.add('is-minimizing');

                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        body.style.maxHeight = '0px';
                        body.style.paddingTop = '0px';
                        body.style.paddingBottom = '0px';
                        body.style.opacity = '0';
                    });
                });

                const cleanup = (e) => {
                    if (e.propertyName === 'max-height') {
                        body.classList.remove('is-minimizing');
                        body.classList.add('is-minimized');
                        body.removeEventListener('transitionend', cleanup);
                    }
                };
                body.addEventListener('transitionend', cleanup);

                state.isMinimized = true;
                win.setAttribute('aria-expanded', 'false');
            }
        };

        const bringToFront = (win) => {
            const tier = win.getAttribute('data-window-tier') || 'decorative';
            const range = Z_INDEX_RANGES[tier];

            zIndexSeeds[tier] = Math.min(zIndexSeeds[tier] + 1, range.max);
            win.style.zIndex = String(zIndexSeeds[tier]);
        };

        const windowPointerDown = (win, titleBar) => (event) => {
            // Only handle if click is NOT on title bar (title bar has its own handler)
            if (titleBar.contains(event.target)) {
                return;
            }
            bringToFront(win);
        };

        const stopDragging = () => {
            if (activeWindow) {
                const titleBar = activeWindow.querySelector('.window-title-bar');
                if (titleBar && activePointerId !== null) {
                    try {
                        titleBar.releasePointerCapture(activePointerId);
                    } catch (err) {
                        /* Ignore if capture was not set */
                    }
                }
            }

            activeWindow = null;
            activePointerId = null;
        };

        const onPointerMove = (event) => {
            if (!activeWindow || activePointerId !== event.pointerId) {
                return;
            }

            event.preventDefault();

            const deltaX = event.clientX - startX;
            const deltaY = event.clientY - startY;
            const maxX = Math.max(desktop.clientWidth - activeWindow.offsetWidth, 0);
            const maxY = Math.max(desktop.clientHeight - activeWindow.offsetHeight, 0);
            const nextLeft = clamp(baseLeft + deltaX, 0, maxX);
            const nextTop = clamp(baseTop + deltaY, 0, maxY);

            activeWindow.style.left = `${nextLeft}px`;
            activeWindow.style.top = `${nextTop}px`;
        };

        const onPointerUp = (event) => {
            if (activePointerId !== event.pointerId) {
                return;
            }

            stopDragging();
        };

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);

        const tierIndexes = { decorative: 0, functional: 0 };

        windows.forEach((win) => {
            const titleBar = win.querySelector('.window-title-bar');
            if (!titleBar) {
                return;
            }

            originalInlineStyles.set(win, {
                position: win.style.position || '',
                left: win.style.left || '',
                top: win.style.top || '',
                right: win.style.right || '',
                bottom: win.style.bottom || '',
                margin: win.style.margin || '',
                zIndex: win.style.zIndex || ''
            });

            const rect = windowRects.get(win);
            if (!rect) {
                return;
            }
            const offsetLeft = rect.left - desktopRect.left;
            const offsetTop = rect.top - desktopRect.top;

            win.style.position = 'absolute';
            win.style.left = `${offsetLeft}px`;
            win.style.top = `${offsetTop}px`;
            win.style.right = 'auto';
            win.style.bottom = 'auto';
            win.style.margin = '0';
            if (!win.style.zIndex) {
                const tier = win.getAttribute('data-window-tier') || 'decorative';
                const range = Z_INDEX_RANGES[tier];
                win.style.zIndex = String(range.seed + tierIndexes[tier]);
                tierIndexes[tier]++;
            }

            const pointerDown = (event) => {
                if (event.button !== 0) {
                    return;
                }

                event.preventDefault();

                activeWindow = win;
                activePointerId = event.pointerId;
                startX = event.clientX;
                startY = event.clientY;
                baseLeft = parseFloat(win.style.left) || 0;
                baseTop = parseFloat(win.style.top) || 0;

                bringToFront(win);

                try {
                    titleBar.setPointerCapture(activePointerId);
                } catch (err) {
                    /* Ignore capture failures */
                }
            };

            titleBar.addEventListener('pointerdown', pointerDown);
            titleBarListeners.push({ element: titleBar, handler: pointerDown });

            const windowClickHandler = windowPointerDown(win, titleBar);
            win.addEventListener('pointerdown', windowClickHandler);
            titleBarListeners.push({ element: win, handler: windowClickHandler });

            // Initialize state
            windowStates.set(win, {
                isMinimized: false,
                normalBodyHeight: null
            });

            // Double-click detection
            let clickCount = 0;
            let clickTimer = null;

            const handleTitleBarClick = (event) => {
                clickCount++;

                if (clickCount === 1) {
                    clickTimer = setTimeout(() => {
                        clickCount = 0;
                    }, 300);
                } else if (clickCount === 2) {
                    clearTimeout(clickTimer);
                    clickCount = 0;
                    toggleMinimize(win);
                }
            };

            titleBar.addEventListener('click', handleTitleBarClick);
            titleBarListeners.push({ element: titleBar, handler: handleTitleBarClick, type: 'click' });

            // Minimize button click handler
            const minimizeBtn = win.querySelector('.window-control.minimize');
            if (minimizeBtn) {
                const handleMinimizeClick = (event) => {
                    event.stopPropagation(); // Prevent triggering title bar double-click
                    toggleMinimize(win);
                };
                minimizeBtn.addEventListener('click', handleMinimizeClick);
                titleBarListeners.push({ element: minimizeBtn, handler: handleMinimizeClick, type: 'click' });
            }
        });

        teardown = () => {
            windows.forEach((win) => {
                const original = originalInlineStyles.get(win);
                if (original) {
                    win.style.position = original.position;
                    win.style.left = original.left;
                    win.style.top = original.top;
                    win.style.right = original.right;
                    win.style.bottom = original.bottom;
                    win.style.margin = original.margin;
                    win.style.zIndex = original.zIndex;
                }
            });

            titleBarListeners.forEach(({ element, handler, type }) => {
                element.removeEventListener(type || 'pointerdown', handler);
            });

            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            document.removeEventListener('pointercancel', onPointerUp);

            originalInlineStyles.clear();
            titleBarListeners.length = 0;
            stopDragging();
            teardown = null;
        };
    };

    const destroyDraggableWindows = () => {
        if (teardown) {
            const fn = teardown;
            teardown = null;
            fn();
        }
    };

    if (!mobileQuery.matches) {
        initDraggableWindows();
    }

    const handleBreakpointChange = (event) => {
        if (event.matches) {
            destroyDraggableWindows();
        } else {
            initDraggableWindows();
        }
    };

    if (typeof mobileQuery.addEventListener === 'function') {
        mobileQuery.addEventListener('change', handleBreakpointChange);
    } else if (typeof mobileQuery.addListener === 'function') {
        mobileQuery.addListener(handleBreakpointChange);
    }
})();

// Show playful bubble when folder icons are double-clicked
(function initFolderIconBubbles() {
    const icons = document.querySelectorAll('.folder-icon');
    if (!icons.length) {
        return;
    }

    const BUBBLE_DURATION_MS = 1800;

    icons.forEach((icon) => {
        let bubble = icon.querySelector('.folder-bubble');
        if (!bubble) {
            bubble = document.createElement('div');
            bubble.className = 'folder-bubble';
            bubble.textContent = 'coming soon...';
            icon.appendChild(bubble);
        }

        let hideTimeout = null;

        icon.addEventListener('dblclick', () => {
            if (hideTimeout) {
                clearTimeout(hideTimeout);
            }

            bubble.classList.remove('is-visible');

            // Force reflow so the animation can retrigger cleanly
            void bubble.offsetWidth;

            bubble.classList.add('is-visible');
            hideTimeout = setTimeout(() => {
                bubble.classList.remove('is-visible');
                hideTimeout = null;
            }, BUBBLE_DURATION_MS);
        });
    });
})();

// Toggle the Recently Deleted window when the trash icon is double-clicked
(function initRecentlyDeletedWindow() {
    const trashIcon = document.querySelector('.trash-icon');
    const deletedWindow = document.querySelector('.recently-deleted-window');

    if (!trashIcon || !deletedWindow) {
        return;
    }

    const bringWindowToFront = () => {
        const tier = deletedWindow.getAttribute('data-window-tier') || 'decorative';
        const windows = document.querySelectorAll('.desktop .window');
        let maxZ = tier === 'decorative' ? 1 : 100;
        const tierMax = tier === 'decorative' ? 99 : 999;

        windows.forEach((win) => {
            const winTier = win.getAttribute('data-window-tier') || 'decorative';
            if (winTier === tier) {
                const zIndex = parseInt(window.getComputedStyle(win).zIndex || '0', 10);
                if (!Number.isNaN(zIndex)) {
                    maxZ = Math.max(maxZ, zIndex);
                }
            }
        });

        deletedWindow.style.zIndex = String(Math.min(maxZ + 1, tierMax));
    };

    const setWindowVisibility = (shouldShow) => {
        deletedWindow.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');

        if (shouldShow) {
            bringWindowToFront();

            // Get positions of trash icon and window
            const trashRect = trashIcon.getBoundingClientRect();
            const windowRect = deletedWindow.getBoundingClientRect();

            // Calculate the offset from window's final position to trash icon
            const deltaX = trashRect.left - windowRect.left;
            const deltaY = trashRect.top - windowRect.top;

            // Remove is-hidden to make element visible
            deletedWindow.classList.remove('is-hidden');

            // Animate from trash icon position to final position using Web Animations API
            const animation = deletedWindow.animate([
                {
                    opacity: 0,
                    transform: `translate(${deltaX}px, ${deltaY}px) scale(0.2)`,
                    offset: 0
                },
                {
                    opacity: 1,
                    transform: 'translate(0, 0) scale(1)',
                    offset: 1
                }
            ], {
                duration: 400,
                easing: 'cubic-bezier(0.34, 1, 0.64, 1)',
                fill: 'forwards'
            });

            // Clean up after animation completes
            animation.onfinish = () => {
                deletedWindow.style.transform = '';
                deletedWindow.style.opacity = '';
            };
        } else {
            deletedWindow.classList.add('is-hidden');
        }
    };

    const toggleWindow = () => {
        const isHidden = deletedWindow.classList.contains('is-hidden');
        setWindowVisibility(isHidden);
    };

    trashIcon.addEventListener('dblclick', () => {
        toggleWindow();
    });

    trashIcon.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleWindow();
        }
    });
})();
