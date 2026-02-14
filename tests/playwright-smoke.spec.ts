import { test, expect } from '@playwright/test';

test.describe('Producer-Producer Smoke Test', () => {
  test.beforeEach(async ({ page }) => {
    // Assumes the app is running locally. You might need to change this port.
    await page.goto('http://localhost:8080'); 
  });

  test('should load the home page and key elements', async ({ page }) => {
    await expect(page).toHaveTitle(/Producer-Producer/);
    
    // Check for the Space Invader canvas
    const invader = page.locator('#space-invader');
    await expect(invader).toBeVisible();

    // Check for folder icons
    const appsFolder = page.locator('.folder-icon[data-opens="applications-window"]');
    await expect(appsFolder).toBeVisible();
  });

  test('should open Search window when clicking Interweb Search', async ({ page }) => {
    // Click the search folder
    await page.click('.interweb-folder');

    // Verify the search window opens
    const searchWindow = page.locator('.search-window');
    await expect(searchWindow).toBeVisible();
    await expect(searchWindow.locator('.window-title')).toHaveText('Search...');
  });

  test('should open Opportunities window when clicking folder', async ({ page }) => {
    await page.locator('.folder-icon[data-opens="notes-window"]').click();

    const notesWindow = page.locator('.notes-window');
    await expect(notesWindow).toBeVisible();
    await expect(notesWindow.locator('.window-title')).toHaveText('Opportunities');
  });
});
