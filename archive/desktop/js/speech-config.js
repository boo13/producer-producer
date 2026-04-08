/**
 * Speech Bubble Configuration
 * 
 * Add, remove, or modify messages easily.
 * Messages are grouped by category for contextual triggers.
 */

const SPEECH_CONFIG = {
    // How long each idle message displays (ms)
    idleInterval: 6000,

    // Delay before returning to idle cycle after a reaction (ms)
    reactionCooldown: 4000,

    // Random messages that cycle when user is idle
    idle: [
        "Why is every job remote-friendly except the one I want?",
        "Another 'Executive Producer' that's really a coordinator role...",
        "Salary: DOE. Experience: Also DOE. Helpful.",
        "'Fast-paced environment' = we're understaffed",
        "Looking for a unicorn who codes, shoots, edits, and does payroll",
        "'Competitive salary' competing with what exactly?",
        "Must have 10 years experience in software released 3 years ago",
        "Entry level. 5+ years required.",
        "'We're like a family here' 🚩",
        "Hybrid = come in whenever we feel like it",
        "The job post is longer than my resume",
        "Unlimited PTO* (*please never use it)",
        "Seeking a 'rockstar' — do I need to audition?",
        "Posted 30+ days ago. Still 'actively hiring.'",
        "Benefits include... being employed?",
    ],

    // Reactions to specific user actions
    reactions: {
        // When user drags any window
        windowDrag: [
            "Nice rearranging!",
            "Interior decorator vibes",
            "That's the spot",
            "Feng shui master",
            "Redecorating again?",
        ],

        // When user clicks to bring a window to front
        windowFocus: [
            "Good choice",
            "Ooh, that one",
            "Interesting...",
            "👀",
        ],

        // When user minimizes a window
        windowMinimize: [
            "Tidying up?",
            "Out of sight, out of mind",
            "Bye for now",
            "Minimalism. Nice.",
        ],

        // When user restores a window
        windowRestore: [
            "Welcome back!",
            "Missed that one?",
            "Back in action",
        ],

        // When user opens the trash/recently deleted window
        trashOpen: [
            "Digging through the rejects?",
            "One person's trash...",
            "The graveyard of 'almost' jobs",
            "F in the chat",
            "RIP to these listings",
        ],

        // When user closes the trash window
        trashClose: [
            "Seen enough?",
            "Back to the good stuff",
            "Closing that chapter",
        ],

        // When user double-clicks a folder
        folderClick: [
            "Patience, young padawan",
            "Soon™",
            "Under construction 🚧",
            "That button is decorative... for now",
        ],

        // When user submits the form successfully
        formSubmit: [
            "You're in! 🎉",
            "Welcome to the club!",
            "One of us! One of us!",
            "Your inbox will thank you. Maybe.",
        ],

        // When user hovers over the robot
        robotHover: [
            "👋",
            "Beep boop",
            "That tickles",
            "I'm watching...",
        ],
    },
};

// Make available globally (or export if using modules)
if (typeof window !== 'undefined') {
    window.SPEECH_CONFIG = SPEECH_CONFIG;
}
