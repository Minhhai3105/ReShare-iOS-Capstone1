// Browser smoke checks against the running mock preview, using Chrome's CDP.
// Run: node verify-preview.mjs (set ADMIN_DEMO_BROWSER to override Chrome path).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const artifacts = resolve(root, '.preview');
await mkdir(artifacts, { recursive: true });
const chrome = spawn(process.env.ADMIN_DEMO_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-extensions', '--disable-component-update',
  '--disable-breakpad', '--remote-debugging-port=9223',
  `--user-data-dir=${resolve(artifacts, 'browser')}`, 'about:blank'
], { windowsHide: true, cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
let browserLog = '';
chrome.stderr.on('data', chunk => { browserLog += chunk.toString(); });
let socket;
try {
  let target;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { target = (await (await fetch('http://127.0.0.1:9223/json')).json()).find(t => t.type === 'page'); } catch {}
    if (target) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert(target, 'Headless Chrome must expose a page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, reject) => { socket.addEventListener('open', r, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const pending = new Map();
  const errors = [];
  let id = 0;
  socket.addEventListener('close', event => {
    for (const callback of pending.values()) callback.reject(new Error(`Chrome connection closed: ${event.code}. ${browserLog.slice(-1500)}`));
    pending.clear();
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const callback = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) callback?.reject(message.error); else callback?.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id;
    const timeout = setTimeout(() => reject(new Error(`CDP timeout: ${method}. ${browserLog.slice(-1500)}`)), 10000);
    pending.set(messageId, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id: messageId, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert(!result.exceptionDetails, result.exceptionDetails?.text);
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`Timed out: ${expression}`);
  };
  const navigate = async () => {
    await send('Page.navigate', { url: process.env.ADMIN_DEMO_URL || 'http://127.0.0.1:5173/' });
    await waitFor('!!document.querySelector(".source-block")');
    await evaluate('document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))');
  };
  const screenshot = async (filename, full = false) => {
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(full ? { clip: { x: 0, y: 0, width: 1296, height: await evaluate('document.documentElement.scrollHeight'), scale: 1 } } : {}) });
    await writeFile(resolve(artifacts, filename), Buffer.from(result.data, 'base64'));
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  // Match the Figma canvas without OS scrollbar width affecting the layout.
  await send('Emulation.setScrollbarsHidden', { hidden: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1296, height: 1743, deviceScaleFactor: 1, mobile: false });
  await navigate();
  await screenshot('screen-e-1296x1743.png');
  await screenshot('screen-e-full.png', true);
  const geometry = await evaluate(`(() => {
    const rect = s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    return { viewport: { width: innerWidth, height: innerHeight }, overflow: document.documentElement.scrollWidth > innerWidth, topbar: { warehouse: rect('.warehouse-switch'), shift: rect('.shift-pill'), search: rect('.e-search-box'), searchText: rect('.e-search-box > span'), account: rect('.e-user-pill') }, sidebarActive: rect('.e-nav-item.active'), header: rect('.e-header-row'), item: rect('.item-card'), history: rect('.request-history-card'), sender: rect('.sender-card'), warehouse: rect('.warehouse-card'), assessment: rect('.assessment-card'), footer: rect('.e-footer'), sources: rect('.review-sources-card') };
  })()`);
  console.log('Desktop geometry:', JSON.stringify(geometry));
  assert.equal(geometry.overflow, false, 'Desktop must not overflow horizontally');
  assert.equal(geometry.item.x, geometry.history.x, 'History belongs to the left column');
  assert.equal(geometry.sender.x, geometry.warehouse.x, 'Sender and warehouse belong to the right column');
  assert(geometry.assessment.width > geometry.item.width + 100, 'Assessment spans both columns');
  const sources = 'Array.from(document.querySelectorAll(".source-block")).slice(0, 2).map(e => e.innerText)';
  const originalSources = await evaluate(sources);
  await evaluate('document.querySelector(".assessment-card .primary-button").click()');
  await waitFor('!!document.querySelector(".review-dialog")');
  assert.equal(await evaluate('document.querySelector(".dialog-actions .primary-button").disabled'), true, 'Approval requires a staff category');
  await evaluate('const select = document.querySelector("#approval-category"); select.value = "Đồ gia dụng"; select.dispatchEvent(new Event("change", { bubbles: true }));');
  await waitFor('!document.querySelector(".dialog-actions .primary-button").disabled');
  await evaluate('document.querySelector(".dialog-actions .primary-button").click()');
  await waitFor('!document.querySelector(".review-dialog")');
  assert.deepEqual(await evaluate(sources), originalSources, 'Approval must preserve AI and donor values');
  assert.match(await evaluate('document.querySelector(".staff-source").innerText'), /Đồ gia dụng/);
  assert.match(await evaluate('document.querySelector(".detail-status-badge").innerText'), /ĐÃ DUYỆT/);
  assert.equal(await evaluate('document.querySelector(".assessment-card .primary-button").disabled'), true, 'Repeat review must be disabled');
  await navigate();
  await evaluate('document.querySelector(".assessment-card .secondary-button").click()');
  await waitFor('!!document.querySelector("#rejection-reason")');
  assert.equal(await evaluate('document.querySelector(".dialog-actions .primary-button").disabled'), true, 'Rejection requires a reason');
  await evaluate('const textarea = document.querySelector("#rejection-reason"); textarea.value = "   "; textarea.dispatchEvent(new Event("input", { bubbles: true }));');
  assert.equal(await evaluate('document.querySelector(".dialog-actions .primary-button").disabled'), true, 'Whitespace is not a rejection reason');
  await evaluate('document.querySelector("#rejection-reason").value = "Ảnh chưa đủ rõ để thẩm định"; document.querySelector("#rejection-reason").dispatchEvent(new Event("input", { bubbles: true }));');
  await waitFor('!document.querySelector(".dialog-actions .primary-button").disabled');
  await evaluate('document.querySelector(".dialog-actions .primary-button").click()');
  await waitFor('!document.querySelector(".review-dialog")');
  assert.deepEqual(await evaluate(sources), originalSources, 'Rejection must preserve AI and donor values');
  assert.match(await evaluate('document.querySelector(".staff-source").innerText'), /Ảnh chưa đủ rõ/);
  assert.match(await evaluate('document.querySelector(".detail-status-badge").innerText'), /ĐÃ TỪ CHỐI/);
  await navigate();
  await evaluate('document.querySelector("#mock-item").value = "ai-02"; document.querySelector("#mock-item").dispatchEvent(new Event("change", { bubbles: true }));');
  await waitFor('document.querySelector(".source-block").innerText.includes("Không có model AI")');
  assert.doesNotMatch(await evaluate('document.querySelector(".source-block").innerText'), /92%|Quần áo/);
  assert.match(await evaluate('document.querySelectorAll(".source-block")[1].innerText'), /Đồ gia dụng/);
  await evaluate('document.querySelector("#mock-item").value = "ai-04"; document.querySelector("#mock-item").dispatchEvent(new Event("change", { bubbles: true }));');
  await waitFor('document.querySelector(".staff-source").innerText.includes("không có quyền")');
  assert.equal(await evaluate('document.querySelector(".assessment-card .primary-button").disabled'), true, 'Approval requires staff permission');
  assert.equal(await evaluate('document.querySelector(".assessment-card .secondary-button").disabled'), true, 'Rejection requires staff permission');
  assert.equal(await evaluate('document.querySelector("#staff-category").disabled'), true, 'Category control requires staff permission');
  await evaluate('document.querySelector(".assessment-card .primary-button").click()');
  assert.equal(await evaluate('!!document.querySelector(".review-dialog")'), false, 'Permission denial must not open a confirmation dialog');
  await evaluate('document.querySelector("#demo-role").value = "warehouse_admin"; document.querySelector("#demo-role").dispatchEvent(new Event("change", { bubbles: true }));');
  await waitFor('document.querySelector("#mock-item").value === "ai-01"');
  assert.equal(await evaluate('Array.from(document.querySelectorAll("#mock-item option")).some(option => option.value === "ai-04")'), false, 'Warehouse Admin must not see another warehouse');
  await evaluate('document.querySelector("#demo-role").value = "viewer"; document.querySelector("#demo-role").dispatchEvent(new Event("change", { bubbles: true }));');
  await waitFor('document.querySelector(".assessment-card .primary-button").disabled');
  assert.equal(await evaluate('document.querySelector("#staff-category").disabled'), true, 'Viewer cannot save staff confirmation');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await navigate();
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'Mobile must not overflow horizontally');
  await screenshot('screen-e-mobile.png');
  await send('Emulation.setDeviceMetricsOverride', { width: 1296, height: 1743, deviceScaleFactor: 1, mobile: false });
  const previewBase = process.env.ADMIN_DEMO_URL || 'http://127.0.0.1:5173/';
  await send('Page.navigate', { url: `${previewBase}?screen=F` });
  await waitFor('!!document.querySelector(".f-sources")');
  await evaluate('document.fonts.ready');
  await screenshot('screen-f-1296x1743.png');
  await screenshot('screen-f-full.png', true);
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'F must not overflow horizontally');
  assert.match(await evaluate('document.querySelector(".f-source-grid").innerText'), /AI prediction[\s\S]*Donor confirmation[\s\S]*Staff confirmation/);
  await evaluate('document.querySelector(".ac-preview select").value = "warehouse_admin"; document.querySelector(".ac-preview select").dispatchEvent(new Event("change", { bubbles: true }));');
  await waitFor('document.querySelector(".ac-user").innerText.includes("Warehouse Admin")');
  assert.equal(await evaluate('Array.from(document.querySelectorAll(".f-sources option")).some(option => option.value === "ai-11" || option.value === "ai-12")'), false, 'F must scope approved records by assigned warehouse');
  await evaluate('document.querySelector(".f-sources select").value = "ai-09"; document.querySelector(".f-sources select").dispatchEvent(new Event("change", { bubbles: true }));');
  await waitFor('document.querySelector(".f-source-grid").innerText.includes("Không có model AI")');
  await evaluate('document.querySelector(".f-next button").click()');
  assert.match(await evaluate('document.querySelector(".f-next-message").innerText'), /Chưa ghi nhận/);
  await send('Emulation.setDeviceMetricsOverride', { width: 1296, height: 2153, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${previewBase}?screen=Q` });
  await waitFor('!!document.querySelector(".q-ai-results")');
  assert.match(await evaluate('document.querySelector(".q-ai-results").innerText'), /71%[\s\S]*5 \/ 7 mẫu/);
  await evaluate('document.querySelector(".ac-preview select").value = "warehouse_admin"; document.querySelector(".ac-preview select").dispatchEvent(new Event("change", { bubbles: true }));');
  await waitFor('document.querySelector(".q-ai-results").innerText.includes("80%")');
  assert.match(await evaluate('document.querySelector(".q-ai-results").innerText'), /4 \/ 5 mẫu/);
  await screenshot('screen-q-1296x2153.png');
  await screenshot('screen-q-full.png', true);
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'Q must not overflow horizontally');
  await evaluate('document.querySelectorAll(".q-filter input[type=date]")[0].value = "2025-05-01"; document.querySelectorAll(".q-filter input[type=date]")[0].dispatchEvent(new Event("input", { bubbles: true }));');
  await evaluate('document.querySelectorAll(".q-filter input[type=date]")[1].value = "2025-05-10"; document.querySelectorAll(".q-filter input[type=date]")[1].dispatchEvent(new Event("input", { bubbles: true })); document.querySelector(".q-filter button").click();');
  await waitFor('document.querySelector(".q-ai-results").innerText.includes("100%")');
  assert.match(await evaluate('document.querySelector(".q-ai-results").innerText'), /2 \/ 2 mẫu/);
  assert.deepEqual(errors, [], 'Browser must have no runtime or resource errors');
  await writeFile(resolve(artifacts, 'verification.json'), JSON.stringify({ geometry, checks: 'PASS: E/F/Q layout, approval, rejection, source isolation, no AI, role scope, calculated report, date filtering, mobile, browser errors' }, null, 2));
  console.log('PASS: E/F/Q layout, approval/rejection, independent sources, no-AI fallback, role scope, calculated report, date filtering, mobile, no browser errors.');
} finally {
  socket?.close();
  chrome.kill();
}
