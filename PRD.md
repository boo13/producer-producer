# PRD: Producer Producer Retro Desktop Landing Page

## Overview
Create a refreshed single-page experience for Producer Producer that visually mimics the retro desktop collage shared in the reference image. The updated page must keep the current Buttondown subscription form functional while surrounding it with multiple stylized "windows" and folders. The result should feel like a playful, stacked OS desktop and remain readable on mobile.

## Goals
- Re-skin the landing page so it adopts the retro operating system design language (dark slate desktop, beige windows, folder icons, speech bubbles).
- Preserve the existing subscription flow (Buttondown form submission and honeypot field) inside a prominent hero window.
- Introduce supporting decorative windows (search, system error, lost message, media player, folders) to match the collage while keeping the DOM semantic and accessible.
- Ensure the layout is responsive: collage grid on desktop, vertical stack on smaller screens.

## Non-Goals
- Rewriting backend/email functionality beyond embedding the existing Buttondown form.
- Building interactive drag/drop windows; the experience can be static with hover/focus affordances only.
- Implementing brand-new imagery beyond lightweight SVG/pseudo-element accents or placeholder illustrations.

## User Stories
1. **Visitor**: "When I open the site, I want to immediately understand that this is a quirky, curated newsletter for producers." → Achieved by bold hero window with title + supporting copy.
2. **Subscriber**: "I want to enter my email and submit it easily without distractions." → Form stays centered with high contrast and clear button states.
3. **Mobile visitor**: "On my phone the layout shouldn’t feel cramped." → Windows stack with reduced rotation/margins and maintain tap targets.

## Functional Requirements
- Add a `.desktop` wrapper that sets the global background and hosts floating elements.
- Create reusable `.window` components with `.title-bar`, `.window-body`, window controls, and variant modifiers for size/rotation.
- Include supporting decorative sections (folders list, search bar, system-error dialog, lost-message bubble, media player row, globe icon).
- Keep form markup accessible; new decorative elements must have ARIA labels when they imitate dialogs.
- Define CSS custom properties for palette and sizing to keep theming consistent.

## Detailed Implementation Steps
1. **HTML Structure**
   - Wrap existing content in a `<main class="desktop">` and split into semantic sections: hero window (contains title, description, form), search window, system-error modal, robot/photo window, folders column, media player block, loading bar, lost message bubble.
   - Reuse existing form markup but move it inside the hero window body. Add new decorative divs with placeholder text/icons. Use inline SVG for window controls and icons where needed.
   - Add aria roles (`role="dialog"`, `aria-label`) to modal-like blocks for screen readers.
2. **CSS Reset & Variables**
   - Define `:root` color variables (e.g., `--desktop`, `--window`, `--border`, `--accent`, `--ink`). Update the global font stack to include mono/grotesque families.
   - Update `body` styles to use the dark slate background, center the `.desktop`, and remove the previous gradient.
3. **Window System Styling**
   - Create base `.window` class with beige background, 2px border, subtle drop shadow, padding, and optional rotation via modifier classes (e.g., `.tilt-left`, `.tilt-right`).
   - Style `.title-bar` with darker strip, uppercase label, and inline window control dots. Add `.window-body` for padding and content layout.
   - Build specialized components: `.folders`, `.search-window`, `.error-modal`, `.media-player`, `.loading-bar`, `.speech-bubble`, etc., ensuring each mirrors the reference layout.
4. **Form Styling**
   - Restyle `.input-main`, inputs, and `.submit` to match flat retro controls (no gradients, all caps, blocky outlines). Ensure focus states are visible.
   - Keep honeypot field hidden as before.
5. **Layout**
   - Use CSS Grid or flexbox on `.desktop` to place windows roughly like the collage. Apply absolute positioning only for accent elements if needed.
   - Add responsive media queries: collapse grid into column layout < 768px, remove rotations, adjust font sizes, and ensure padding remains comfortable.

## Testing Plan
1. **Visual Verification**
   - Open `index.html` in the browser and verify windows appear layered with the new palette. Compare key elements (search bar, system error modal, folders) against the reference image.
2. **Form Functionality**
   - Enter a test email and confirm the form posts to Buttondown (watch network request or rely on existing integration). Ensure honeypot stays hidden and keyboard navigation is intact.
3. **Responsive Behavior**
   - Use dev tools to inspect layouts at 1440px, 1024px, 768px, and 375px widths. Confirm windows rearrange/stack without overlapping important content and text remains legible.
4. **Accessibility Checks**
   - Tab through the page to ensure focus order reaches the form fields/button and window controls are skipped if they’re decorative. Run a quick Lighthouse/axe check to catch obvious contrast issues.
5. **Cross-Browser Smoke**
   - Test in at least Chrome and Safari (or Firefox) to ensure CSS variables, grid layout, and flexbox behave consistently.
