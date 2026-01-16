// Track form load time for bot detection
const formLoadTime = Date.now();

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
    const phoneField = document.getElementById('phone');

    // 1. Honeypot check
    if (phoneField.value !== '') {
        return false;
    }

    // 2. Timing-based bot detection (reject if submitted in < 2 seconds)
    const timeOnPage = (Date.now() - formLoadTime) / 1000;
    if (timeOnPage < 2) {
        return false;
    }

    // 3. Rate limiting check
    const lastSubmit = localStorage.getItem(RATE_LIMIT_KEY);
    if (lastSubmit) {
        const timeSinceLastSubmit = (Date.now() - parseInt(lastSubmit)) / 1000;
        if (timeSinceLastSubmit < RATE_LIMIT_SECONDS) {
            const remainingSeconds = Math.ceil(RATE_LIMIT_SECONDS - timeSinceLastSubmit);
            alert(`Please wait ${remainingSeconds} seconds before trying again.`);
            return false;
        }
    }

    // 4. Stronger email validation
    const email = emailInput.value.trim();
    if (!EMAIL_REGEX.test(email)) {
        alert('Please enter a valid email address.');
        emailInput.focus();
        return false;
    }

    // 5. Double-click protection
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

        let activeWindow = null;
        let activePointerId = null;
        let startX = 0;
        let startY = 0;
        let baseLeft = 0;
        let baseTop = 0;
        let zIndexSeed = 10;

        const bringToFront = (win) => {
            zIndexSeed += 1;
            win.style.zIndex = zIndexSeed.toString();
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

        windows.forEach((win, index) => {
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
                win.style.zIndex = String(zIndexSeed + index);
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

            titleBarListeners.forEach(({ element, handler }) => {
                element.removeEventListener('pointerdown', handler);
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
