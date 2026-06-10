// UI smoke test: drives the real app with Playwright's Electron support.
// Verifies per-tab undo history and decoration-based Find & Replace.
// Run with: node scripts/ui-smoke.cjs  (requires `npm run build` first)
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert');
const path = require('node:path');

(async () => {
  const app = await electron.launch({
    args: ['.'],
    cwd: path.join(__dirname, '..')
  });
  const win = await app.firstWindow();
  win.setDefaultTimeout(8000);
  win.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[renderer ${m.type()}]`, m.text());
  });
  win.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await win.waitForSelector('.milkdown .ProseMirror', { timeout: 15000 });
  const editor = win.locator('.milkdown .ProseMirror');

  // --- Tab 1: type some content
  await editor.click();
  await win.keyboard.type('alpha bravo charlie');
  await win.waitForTimeout(300);

  // --- Tab 2: new tab, different content
  await win.click('#new-tab-btn');
  await win.waitForTimeout(300);
  console.log('tab count after new-tab click:', await win.locator('.tabs-container .tab').count());
  await editor.click();
  await win.keyboard.type('second document');
  await win.waitForTimeout(300);

  // --- Switch back to tab 1: content must survive
  await win.click('.tabs-container .tab:nth-child(1)');
  await win.waitForTimeout(300);
  const tab1Text = await editor.innerText();
  assert(tab1Text.includes('alpha bravo charlie'), `tab 1 content survived switch, got: ${tab1Text}`);

  // --- Undo must still work after the switch (per-tab history)
  await editor.click();
  await win.keyboard.press('Meta+z');
  await win.waitForTimeout(300);
  const afterUndo = await editor.innerText();
  assert(afterUndo !== tab1Text, 'undo works on tab 1 after switching back');
  console.log('PASS: per-tab undo history survives tab switches');

  // --- Tab 2 unaffected by tab 1's undo
  await win.click('.tabs-container .tab:nth-child(2)');
  await win.waitForTimeout(300);
  let text = await editor.innerText();
  assert(text.includes('second document'), `tab 2 intact, got: ${text}`);
  console.log('PASS: tab isolation');

  // --- Find: decorations render and count is right
  await win.evaluate(() => {
    document.getElementById('find-replace-panel').classList.add('show');
    document.getElementById('replace-row').style.display = 'flex';
  });
  await win.fill('#find-input', 'second');
  await win.waitForTimeout(500); // 150ms debounce + search
  const highlights = await win
    .locator('.milkdown .find-highlight, .milkdown .find-highlight-current')
    .count();
  assert(highlights >= 1, `find decorations rendered (got ${highlights})`);
  const count = await win.locator('#find-count').innerText();
  assert(count === '1/1', `find count is 1/1, got: ${count}`);
  console.log('PASS: find renders decorations with correct count');

  // --- Replace All goes through a transaction…
  await win.fill('#replace-input', 'SECOND');
  await win.click('#replace-all-btn');
  await win.waitForTimeout(300);
  text = await editor.innerText();
  assert(text.includes('SECOND document'), `replace all applied, got: ${text}`);

  // --- …and is therefore a single undoable step
  await editor.click();
  await win.keyboard.press('Meta+z');
  await win.waitForTimeout(300);
  text = await editor.innerText();
  assert(text.includes('second document'), `replace all is undoable, got: ${text}`);
  console.log('PASS: replace all applies and undoes as one step');

  console.log('ALL SMOKE TESTS PASSED');
  // The app prompts to save the modified test tabs on a normal close,
  // which would hang the script — just kill the test instance.
  app.process().kill('SIGKILL');
  process.exit(0);
})().catch((err) => {
  console.error('SMOKE TEST FAILED:', err.message);
  process.exit(1);
});
