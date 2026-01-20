(function initSwipeManager() {
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    class SwipeManager {
        constructor() {
            this.config = {
                threshold: 0.4,
                maxRotation: 15,
                flyOffDuration: 300,
            };
            this.cardState = new WeakMap();
            this.activeCard = null;
            this.activePointerId = null;
            this.boundPointerMove = (event) => this.handlePointerMove(event);
            this.boundPointerUp = (event) => this.handlePointerUp(event);
        }

        registerCard(card, callbacks = {}) {
            if (!card) return;

            const state = {
                callbacks,
                overlays: {
                    left: card.querySelector('.swipe-overlay-left'),
                    right: card.querySelector('.swipe-overlay-right'),
                },
                isDismissed: false,
                startX: 0,
                startY: 0,
                width: Math.max(card.offsetWidth, 1),
            };

            this.cardState.set(card, state);

            card.addEventListener('pointerdown', (event) => {
                this.handlePointerDown(event, card);
            });
        }

        unregisterCard(card) {
            this.cardState.delete(card);
        }

        handlePointerDown(event, card) {
            if (event.button !== 0) {
                return;
            }

            const state = this.cardState.get(card);
            if (!state || state.isDismissed) {
                return;
            }

            this.activeCard = card;
            this.activePointerId = event.pointerId;
            state.startX = event.clientX;
            state.startY = event.clientY;
            state.width = Math.max(card.offsetWidth, 1);

            try {
                card.setPointerCapture(event.pointerId);
            } catch (err) {
                /* Ignore capture errors */
            }

            card.classList.add('is-swipe-active');
            card.dispatchEvent(new CustomEvent('swipe:activate', { bubbles: true }));

            window.addEventListener('pointermove', this.boundPointerMove);
            window.addEventListener('pointerup', this.boundPointerUp);
            window.addEventListener('pointercancel', this.boundPointerUp);
        }

        handlePointerMove(event) {
            if (!this.activeCard || event.pointerId !== this.activePointerId) {
                return;
            }

            const state = this.cardState.get(this.activeCard);
            if (!state) {
                return;
            }

            const deltaX = event.clientX - state.startX;
            const deltaY = event.clientY - state.startY;
            const progress = deltaX / state.width;
            const rotation = clamp(progress * this.config.maxRotation, -this.config.maxRotation, this.config.maxRotation);

            this.activeCard.style.transform = `translate(${deltaX}px, ${deltaY}px) rotate(${rotation}deg)`;
            this.updateOverlays(this.activeCard, progress);
        }

        handlePointerUp(event) {
            if (!this.activeCard || event.pointerId !== this.activePointerId) {
                return;
            }

            const state = this.cardState.get(this.activeCard);
            if (!state) {
                this.cleanupActivePointer();
                return;
            }

            const deltaX = event.clientX - state.startX;
            const progress = deltaX / state.width;

            if (Math.abs(progress) >= this.config.threshold) {
                const direction = progress > 0 ? 'right' : 'left';
                this.completeSwipe(this.activeCard, direction);
            } else {
                this.resetCard(this.activeCard);
            }

            this.cleanupActivePointer();
        }

        cleanupActivePointer() {
            if (this.activeCard && this.activePointerId !== null) {
                try {
                    this.activeCard.releasePointerCapture(this.activePointerId);
                } catch (err) {
                    /* Ignore */
                }
            }

            window.removeEventListener('pointermove', this.boundPointerMove);
            window.removeEventListener('pointerup', this.boundPointerUp);
            window.removeEventListener('pointercancel', this.boundPointerUp);

            if (this.activeCard) {
                this.activeCard.classList.remove('is-swipe-active');
            }

            this.activeCard = null;
            this.activePointerId = null;
        }

        updateOverlays(card, progress) {
            const state = this.cardState.get(card);
            if (!state) {
                return;
            }

            const intensity = Math.min(Math.abs(progress) / this.config.threshold, 1);
            const leftOpacity = progress < 0 ? intensity : 0;
            const rightOpacity = progress > 0 ? intensity : 0;

            if (state.overlays.left) {
                state.overlays.left.style.opacity = leftOpacity.toString();
            }
            if (state.overlays.right) {
                state.overlays.right.style.opacity = rightOpacity.toString();
            }
        }

        resetCard(card) {
            card.style.transition = 'transform 180ms ease-out';
            card.style.transform = 'translate(0, 0) rotate(0)';
            this.updateOverlays(card, 0);

            const cleanup = () => {
                card.style.transition = '';
                card.removeEventListener('transitionend', cleanup);
            };

            card.addEventListener('transitionend', cleanup);
        }

        completeSwipe(card, direction) {
            const state = this.cardState.get(card);
            if (!state || state.isDismissed) {
                return;
            }

            state.isDismissed = true;
            this.updateOverlays(card, direction === 'right' ? 1 : -1);

            const distance = direction === 'right' ? card.offsetWidth * 1.4 : card.offsetWidth * -1.4;
            const rotation = direction === 'right' ? this.config.maxRotation : -this.config.maxRotation;

            card.style.transition = `transform ${this.config.flyOffDuration}ms cubic-bezier(0.34, 1, 0.64, 1), opacity ${this.config.flyOffDuration}ms ease-out`;
            card.style.transform = `translate(${distance}px, -24px) rotate(${rotation}deg)`;
            card.style.opacity = '0';

            const detail = { direction };
            card.dispatchEvent(new CustomEvent('swipe:decided', { detail }));

            if (typeof state.callbacks.onDecision === 'function') {
                state.callbacks.onDecision(direction, card);
            }

            window.setTimeout(() => {
                card.dispatchEvent(new CustomEvent('swipe:complete', { detail }));
            }, this.config.flyOffDuration);
        }

        forceDecision(card, direction) {
            if (!card) {
                return;
            }

            const state = this.cardState.get(card);
            if (!state) {
                return;
            }

            this.cleanupActivePointer();
            this.completeSwipe(card, direction);
        }
    }

    window.SwipeManager = new SwipeManager();

    class AudioManager {
        constructor() {
            this.registry = {
                pop: document.getElementById('audio-pop'),
                swoosh: document.getElementById('audio-swoosh'),
                bloop: document.getElementById('audio-bloop'),
                fanfare: document.getElementById('audio-fanfare'),
            };
        }

        play(name) {
            const sound = this.registry[name];
            if (!sound) {
                return;
            }

            try {
                sound.currentTime = 0;
                const playPromise = sound.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => {
                        /* ignore autoplay blocks */
                    });
                }
            } catch (err) {
                /* ignore */
            }
        }
    }

    window.AudioManager = new AudioManager();
})();
