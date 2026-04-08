/**
 * Speech Bubble Controller
 * 
 * Manages the robot's speech bubble with idle cycling and contextual reactions.
 * Requires speech-config.js to be loaded first.
 */

(function initSpeechBubble() {
    const bubble = document.querySelector('.speech-bubble');
    const bubbleText = bubble?.querySelector('.speech-bubble-text');
    
    if (!bubble || !bubbleText || typeof SPEECH_CONFIG === 'undefined') {
        console.warn('Speech bubble: missing element or config');
        return;
    }

    const config = SPEECH_CONFIG;
    let idleTimer = null;
    let reactionCooldownTimer = null;
    let lastIdleIndex = -1;
    let isPaused = false;

    // Utility: pick random item from array (avoid immediate repeats for idle)
    const pickRandom = (arr, avoidIndex = -1) => {
        if (arr.length === 0) return null;
        if (arr.length === 1) return { item: arr[0], index: 0 };
        
        let index;
        do {
            index = Math.floor(Math.random() * arr.length);
        } while (index === avoidIndex && arr.length > 1);
        
        return { item: arr[index], index };
    };

    // Animate text change with fade
    const setText = (text, isReaction = false) => {
        bubble.classList.add('is-changing');
        
        setTimeout(() => {
            bubbleText.textContent = text;
            bubble.classList.remove('is-changing');
            
            if (isReaction) {
                bubble.classList.add('is-reacting');
                setTimeout(() => bubble.classList.remove('is-reacting'), 300);
            }
        }, 150);
    };

    // Show next idle message
    const showNextIdle = () => {
        if (isPaused) return;
        
        const { item, index } = pickRandom(config.idle, lastIdleIndex);
        lastIdleIndex = index;
        setText(item);
    };

    // Start idle cycling
    const startIdleCycle = () => {
        stopIdleCycle();
        showNextIdle();
        idleTimer = setInterval(showNextIdle, config.idleInterval);
    };

    // Stop idle cycling
    const stopIdleCycle = () => {
        if (idleTimer) {
            clearInterval(idleTimer);
            idleTimer = null;
        }
    };

    // Show a reaction message, then resume idle after cooldown
    const react = (category) => {
        const messages = config.reactions[category];
        if (!messages || messages.length === 0) return;

        // Clear any pending cooldown
        if (reactionCooldownTimer) {
            clearTimeout(reactionCooldownTimer);
        }

        // Pause idle and show reaction
        stopIdleCycle();
        const { item } = pickRandom(messages);
        setText(item, true);

        // Resume idle after cooldown
        reactionCooldownTimer = setTimeout(() => {
            startIdleCycle();
            reactionCooldownTimer = null;
        }, config.reactionCooldown);
    };

    // Pause when tab is hidden (save resources)
    const handleVisibilityChange = () => {
        if (document.hidden) {
            isPaused = true;
            stopIdleCycle();
        } else {
            isPaused = false;
            startIdleCycle();
        }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Expose react function globally for other scripts to use
    window.speechBubble = {
        react,
        pause: () => {
            isPaused = true;
            stopIdleCycle();
        },
        resume: () => {
            isPaused = false;
            startIdleCycle();
        },
    };

    // Start the idle cycle
    startIdleCycle();
})();
