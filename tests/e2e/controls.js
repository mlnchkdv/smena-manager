import { expect } from './fixtures.js';

// Exercise the visible design-system control. Its native select remains in
// the DOM for form state but is deliberately clipped and hidden from AT.
export async function chooseSelect(page, select, value) {
  const index = await select.evaluate((element, target) => [...element.options].findIndex(option => option.value === target), value);
  expect(index, `Select option ${value}`).toBeGreaterThanOrEqual(0);
  await select.locator('xpath=following-sibling::button[1]').click();
  await page.locator(`.select-menu [role="option"][data-i="${index}"]`).click();
  await expect(select).toHaveValue(value);
}
