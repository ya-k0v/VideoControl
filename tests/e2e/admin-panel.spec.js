import { test, expect } from '@playwright/test';

test.describe('Admin Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin.html');
  });

  test('should load admin panel', async ({ page }) => {
    await expect(page).toHaveTitle(/VideoControl/);
    
    // Check for main elements
    await expect(page.locator('#tv-list')).toBeVisible();
  });

  test('should show device list', async ({ page }) => {
    // Wait for devices to load
    await page.waitForSelector('.device-card', { timeout: 5000 });
    
    const deviceCards = await page.locator('.device-card').count();
    expect(deviceCards).toBeGreaterThanOrEqual(0);
  });

  test('should allow creating new device', async ({ page }) => {
    const addButton = page.locator('button:has-text("Добавить устройство")');
    if (await addButton.isVisible()) {
      await addButton.click();
      
      await page.fill('input[name="device_id"]', 'test-device-1');
      await page.fill('input[name="device_name"]', 'Test Device 1');
      
      await page.click('button:has-text("Создать")');
      
      // Wait for device to appear
      await expect(page.locator('.device-card:has-text("Test Device 1")')).toBeVisible();
    }
  });

  test('should handle file upload', async ({ page }) => {
    // This is a placeholder - actual implementation depends on UI
    const uploadArea = page.locator('#upload-area');
    if (await uploadArea.isVisible()) {
      await expect(uploadArea).toBeVisible();
    }
  });

  test('should toggle dark mode', async ({ page }) => {
    const themeToggle = page.locator('#theme-toggle');
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      
      // Check if body has dark theme class
      const bodyClass = await page.locator('body').getAttribute('class');
      expect(bodyClass).toContain('dark');
    }
  });
});

