#!/bin/bash

# Configuration
URL="http://localhost:8080" # Change this if your local server runs elsewhere

echo "🤖 Starting Agent-Browser Smoke Test..."
echo "Target: $URL"

# The prompt instructions for the agent
PROMPT="Navigate to $URL.
1. Verify the page title contains 'Producer-Producer'.
2. Check that the 'Space Invader' canvas is visible.
3. Click on the 'Interweb Search' folder icon.
4. Verify that a window titled 'Search...' opens.
5. Close the search window.
6. Click on the 'Opportunities' folder.
7. Verify that it shows a message about logging in (since we are not authenticated).
Report 'SUCCESS' if all steps pass, otherwise 'FAILURE' with details."

# Execute agent-browser (assuming 'start' or direct string argument mode)
# Adjust the command flags based on your specific version of agent-browser
agent-browser start "$PROMPT"
