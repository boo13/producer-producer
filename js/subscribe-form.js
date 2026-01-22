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

// Desktop window manager helper so other modules can focus windows
const desktopWindowManager = (() => {
    const api = {
        _bringToFrontImpl: null,
        _zSeed: 100,
        registerBringToFront(fn) {
            this._bringToFrontImpl = fn;
        },
        findWindow(id) {
            if (!id) {
                return null;
            }
            const selector = `[data-window-id="${id}"]`;
            return document.querySelector(selector) || document.getElementById(id) || document.querySelector(`.${id}`);
        },
        bringToFront(win) {
            if (!win) {
                return;
            }

            if (typeof this._bringToFrontImpl === 'function') {
                this._bringToFrontImpl(win);
                return;
            }

            this._zSeed += 1;
            win.style.zIndex = String(this._zSeed);
        },
        setWindowVisibility(win, isVisible, options = {}) {
            if (!win) {
                return null;
            }

            const wasHidden = win.classList.contains('is-hidden');

            if (isVisible) {
                win.classList.remove('is-hidden');
                win.setAttribute('aria-hidden', 'false');
                win.setAttribute('aria-expanded', 'true');

                if (options.anchorElement && wasHidden) {
                    const anchorRect = options.anchorElement.getBoundingClientRect();
                    const windowRect = win.getBoundingClientRect();
                    const deltaX = anchorRect.left - windowRect.left;
                    const deltaY = anchorRect.top - windowRect.top;

                    win.animate([
                        { opacity: 0, transform: `translate(${deltaX}px, ${deltaY}px) scale(0.3)` },
                        { opacity: 1, transform: 'translate(0, 0) scale(1)' }
                    ], {
                        duration: 320,
                        easing: 'cubic-bezier(0.34, 1, 0.64, 1)',
                        fill: 'both'
                    }).onfinish = () => {
                        win.style.opacity = '';
                        win.style.transform = '';
                    };
                }

                this.bringToFront(win);
                document.dispatchEvent(new CustomEvent('desktopWindow:opened', {
                    detail: { id: win.dataset.windowId || win.id, element: win }
                }));
            } else {
                win.classList.add('is-hidden');
                win.setAttribute('aria-hidden', 'true');
                win.setAttribute('aria-expanded', 'false');
                document.dispatchEvent(new CustomEvent('desktopWindow:hidden', {
                    detail: { id: win.dataset.windowId || win.id, element: win }
                }));
            }

            return win;
        },
        openWindowById(id, options = {}) {
            const win = this.findWindow(id);
            if (!win) {
                return null;
            }

            this.setWindowVisibility(win, true, options);
            return win;
        },
        hideWindowById(id) {
            const win = this.findWindow(id);
            if (!win) {
                return null;
            }
            this.setWindowVisibility(win, false);
            return win;
        },
        toggleWindowById(id, anchorElement) {
            const win = this.findWindow(id);
            if (!win) {
                return null;
            }
            const shouldShow = win.classList.contains('is-hidden');
            return this.setWindowVisibility(win, shouldShow, { anchorElement });
        }
    };

    return api;
})();

window.desktopWindowManager = desktopWindowManager;

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

        window.desktopWindowManager.registerBringToFront(bringToFront);

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
            const isInitiallyMinimized = win.getAttribute('aria-expanded') === 'false';
            windowStates.set(win, {
                isMinimized: isInitiallyMinimized,
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

// Wire folder + desktop icons so clicks open their windows
(function initDesktopWindowLaunchers() {
    const launchers = document.querySelectorAll('[data-opens]');
    if (!launchers.length) {
        return;
    }

    const activateLauncher = (launcher) => {
        const targetId = launcher.getAttribute('data-opens');
        if (!targetId) {
            return;
        }
        window.desktopWindowManager.openWindowById(targetId, { anchorElement: launcher });
    };

    launchers.forEach((launcher) => {
        launcher.addEventListener('click', (event) => {
            event.preventDefault();
            // Special case: Interweb Search requires double-click
            if (launcher.getAttribute('data-opens') === 'search-window') {
                return;
            }
            activateLauncher(launcher);
        });

        launcher.addEventListener('dblclick', (event) => {
            event.preventDefault();
            activateLauncher(launcher);
        });

        launcher.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                activateLauncher(launcher);
            }
        });
    });
})();
