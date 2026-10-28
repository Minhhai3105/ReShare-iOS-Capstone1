// Run against Vite. playwright-core must be available via NODE_PATH or installed externally.
const { chromium } = require('playwright-core')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const base = process.env.LQ_DEMO_URL || 'http://127.0.0.1:5173'
const artifacts = path.join(__dirname, 'artifacts', 'RC1D-114')
fs.mkdirSync(artifacts, { recursive: true })
const results = []

;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  const page = await browser.newPage({ viewport: { width: 1296, height: 1000 } })
  page.setDefaultTimeout(6000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  async function check(name, expected, run) {
    try { await run(); results.push({ name, expected, actual: expected, result: 'PASS', scope: 'FE mock browser' }) }
    catch (error) { console.error(await page.locator('main').innerText()); results.push({ name, expected, actual: error.message, result: 'FAIL', scope: 'FE mock browser' }); throw error }
  }
  async function mount(screen, injected = false) {
    await page.goto(`${base}/src/admin/${screen === 'L' ? 'distribution' : 'reports'}/preview.html`)
    await page.evaluate(async ({ screen, injected }) => {
      const { createApp, reactive } = await import('/node_modules/.vite/deps/vue.js')
      document.querySelector('#app').__vue_app__?.unmount()
      sessionStorage.clear()
      const component = (await import(screen === 'L' ? '/src/admin/distribution/DistributionForm.vue' : '/src/admin/ReportScreen.vue')).default
      const assignment = { active: true, role: 'warehouse_admin', warehouseIds: ['hai-chau'] }
      window.caseProps = reactive({ assignment, actor: { id: 'DEMO-STAFF', displayName: 'Nhân sự mẫu' } })
      if (injected) {
        window.requests = []
        window.caseProps.repository = { load(args) { return new Promise((resolve, reject) => window.requests.push({ args, resolve, reject })) } }
        window.fixture = await (await import('/src/admin/reports/reports.repository.js')).createMockReportsRepository({ delayMs: 0 }).load({ assignment })
      }
      window.caseApp = createApp(component, window.caseProps)
      window.caseApp.mount('#app')
    }, { screen, injected })
  }
  async function fillL(scenario = 'normal') {
    await page.locator('#distribution-quantity').fill('2')
    await page.locator('#distribution-beneficiary').selectOption('DEMO-BEN-001')
    await page.locator('.d-handover input').check()
    await page.locator('#distribution-scenario').selectOption(scenario)
    await page.getByRole('button', { name: 'Xác nhận phân phối', exact: true }).click()
  }
  const submit = () => page.getByRole('button', { name: 'Tạo phiếu xuất mẫu', exact: true }).click()
  const blocked = async () => assert.equal(await page.getByRole('button', { name: 'Xác nhận phân phối', exact: true }).isDisabled(), true)
  try {
    for (const code of ['FORBIDDEN', 'UNAUTHENTICATED']) await check(`L ${code}`, 'Clear inventory, close dialog, lock submit; distinguish permission/session', async () => {
      await mount('L'); await fillL(code); await submit()
      await page.getByTestId('submit-error').waitFor()
      assert.equal(await page.getByTestId('available-stock').innerText(), '—')
      assert.equal(await page.locator('dialog[open]').count(), 0)
      await blocked()
      assert.equal(await page.getByTestId('submit-error').locator('a').count(), code === 'UNAUTHENTICATED' ? 1 : 0)
    })
    for (const code of ['shortage', 'conflict', 'STALE_DATA']) await check(`L ${code}`, 'Reload stock, discard old confirmation, require handover confirmation again', async () => {
      await mount('L'); await fillL(code); await submit()
      await page.getByTestId('submit-error').waitFor()
      await page.waitForFunction(() => !document.querySelector('[role=status]'))
      assert.equal(await page.getByTestId('available-stock').innerText(), code === 'shortage' ? '1 chiếc' : '3 chiếc')
      assert.equal(await page.locator('dialog[open]').count(), 0)
      assert.equal(await page.locator('.d-handover input').isChecked(), false)
      await blocked()
      if (code === 'conflict') await page.screenshot({ path: path.join(artifacts, 'L-conflict.png'), fullPage: true })
      await page.locator('#distribution-quantity').fill(code === 'shortage' ? '1' : '2')
      await page.locator('.d-handover input').check()
      await page.getByRole('button', { name: 'Xác nhận phân phối', exact: true }).click()
      await submit()
      await page.locator('.d-success').waitFor()
      assert.equal(await page.getByTestId('available-stock').innerText(), code === 'shortage' ? '0 chiếc' : '1 chiếc')
    })
    await check('L known not sent', 'Retry read data then explicitly confirm a new write', async () => {
      await mount('L'); await fillL('NOT_SENT'); await submit()
      await page.getByTestId('submit-error').waitFor()
      await page.getByTestId('submit-error').getByRole('button').click()
      await fillL(); await submit(); await page.locator('.d-success').waitFor()
      assert.equal(await page.getByTestId('available-stock').innerText(), '1 chiếc')
    })
    await check('L revoke after success', 'Clear success voucher and inventory when assignment is revoked', async () => {
      await page.evaluate(() => { window.caseProps.assignment.active = false })
      await page.getByTestId('submit-error').waitFor()
      assert.equal(await page.locator('.d-success').count(), 0)
      assert.equal(await page.getByTestId('available-stock').innerText(), '—')
      await blocked()
    })
    for (const code of ['TIMEOUT', 'TIMEOUT_AFTER_COMMIT']) await check(`L ${code}`, 'Unknown outcome; no blind retry after cancel, item change or reload', async () => {
      await mount('L'); await fillL(code); await submit()
      await page.getByTestId('submit-error').waitFor()
      assert.match(await page.getByTestId('submit-error').innerText(), /Chưa xác định kết quả/)
      await page.getByRole('button', { name: 'Hủy', exact: true }).click()
      await blocked()
      await page.locator('.d-selectors select').selectOption('DEMO-INV-002')
      await blocked()
      await page.reload()
      await page.getByTestId('submit-error').waitFor()
      await blocked()
      assert.equal(await page.getByTestId('submit-error').getByRole('button').count(), 0)
      await page.screenshot({ path: path.join(artifacts, `${code}.png`), fullPage: true })
    })
    await check('L revoke during submit', 'Late result cannot reveal revoked data', async () => {
      await mount('L'); await fillL(); await submit()
      await page.evaluate(() => { window.caseProps.assignment.active = false })
      await page.getByTestId('submit-error').waitFor()
      await page.waitForTimeout(300)
      assert.equal(await page.locator('.d-success').count(), 0)
      assert.equal(await page.getByTestId('available-stock').innerText(), '—')
      assert.equal(await page.locator('dialog[open]').count(), 0)
    })
    for (const code of ['FORBIDDEN', 'UNAUTHENTICATED', 'STALE_DATA', 'STOCK_CONFLICT', 'error']) await check(`Q ${code}`, 'No source table, CSV or open drill-down on error; suitable recovery action', async () => {
      await mount('Q'); await page.getByTestId('count-donation').waitFor()
      await page.getByRole('button', { name: 'Xem chi tiết Yêu cầu được gửi', exact: true }).click()
      // Native modal blocks controls; trigger the modeled backend transition through the select event.
      await page.locator('[aria-label="Kịch bản demo"]').evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })) }, code)
      await page.locator('.q-error-state').waitFor()
      assert.equal(await page.getByTestId('source-table').count(), 0)
      assert.equal(await page.locator('dialog[open]').count(), 0)
      assert.equal(await page.getByRole('button', { name: /Xuất CSV/ }).count(), 0)
      const denied = ['FORBIDDEN', 'UNAUTHENTICATED'].includes(code)
      assert.equal(await page.locator('.q-error-state button').count(), denied ? 0 : 1)
      if (!denied) { await page.locator('.q-error-state button').click(); await page.getByTestId('count-donation').waitFor() }
    })
    await check('Q applied filters on retry', 'Retry sends applied filters, preserves uncommitted draft, restores same filtered report', async () => {
      await mount('Q', true)
      await page.evaluate(() => window.requests[0].resolve(window.fixture))
      await page.getByTestId('count-donation').waitFor()
      await page.getByLabel('Từ ngày', { exact: true }).fill('2025-05-10')
      await page.getByRole('button', { name: 'Áp dụng', exact: true }).click()
      await page.getByLabel('Từ ngày', { exact: true }).fill('2025-05-20')
      await page.evaluate(() => { window.caseProps.assignment.warehouseIds.push('son-tra') })
      await page.waitForFunction(() => window.requests.length === 2)
      await page.evaluate(() => window.requests[1].reject(new Error('network')))
      await page.locator('.q-error-state button').click()
      await page.waitForFunction(() => window.requests.length === 3)
      assert.equal(await page.evaluate(() => window.requests[2].args.filters.from), '2025-05-10')
      await page.evaluate(() => window.requests[2].resolve(window.fixture))
      await page.getByTestId('count-donation').waitFor()
      assert.equal(await page.getByLabel('Từ ngày', { exact: true }).inputValue(), '2025-05-20')
      assert.equal(await page.getByTestId('count-donation').innerText(), '1')
      assert.equal(await page.getByTestId('source-table').locator('tbody tr').count(), 6)
    })
    await check('Q late response ignoring abort', 'Newest request wins; revoked data cannot return from late success', async () => {
      await mount('Q', true)
      await page.evaluate(() => { window.caseProps.assignment.warehouseIds.push('son-tra') })
      await page.waitForFunction(() => window.requests.length === 2)
      await page.evaluate(() => window.requests[1].reject(Object.assign(new Error(), { code: 'FORBIDDEN' })))
      await page.locator('.q-error-state').waitFor()
      await page.evaluate(() => window.requests[0].resolve(window.fixture))
      await page.waitForTimeout(100)
      assert.equal(await page.getByTestId('source-table').count(), 0)
      assert.match(await page.locator('.q-error-state').innerText(), /Không còn quyền/)
      await page.setViewportSize({ width: 390, height: 844 })
      await page.screenshot({ path: path.join(artifacts, 'Q-denied-mobile.png'), fullPage: true })
    })
    await check('Q selected warehouse removed', 'Do not broaden the applied warehouse scope after refresh', async () => {
      await mount('Q', true)
      await page.evaluate(() => window.requests[0].resolve(window.fixture))
      await page.getByTestId('count-donation').waitFor()
      await page.getByLabel('Kho', { exact: true }).selectOption('hai-chau')
      await page.getByRole('button', { name: 'Áp dụng', exact: true }).click()
      await page.evaluate(() => { window.caseProps.assignment.active = false })
      await page.waitForFunction(() => window.requests.length === 2)
      await page.evaluate(() => window.requests[1].resolve({ ...window.fixture, warehouses: [] }))
      await page.locator('.q-error-state').waitFor()
      assert.match(await page.locator('.q-error-state').innerText(), /Không còn quyền/)
      assert.equal(await page.getByTestId('source-table').count(), 0)
      assert.equal(await page.getByRole('button', { name: /Xuất CSV/ }).count(), 0)
    })
    assert.deepEqual(errors, [])
    console.log(`${results.length}/${results.length} browser cases PASS; no page errors`)
  } finally {
    fs.writeFileSync(path.join(artifacts, 'browser-results.json'), JSON.stringify({ scope: 'FE mock only; not Backend US26 acceptance', results, pageErrors: errors }, null, 2) + '\n')
    await browser.close()
  }
})().catch((error) => { console.error(error); process.exitCode = 1 })
