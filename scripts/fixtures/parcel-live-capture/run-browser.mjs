import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.IILAS_PLAYWRIGHT_MODULE || 'C:/Users/Home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({channel: 'msedge', headless: true});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/scripts/fixtures/parcel-live-capture/index.html');
  await page.waitForFunction(() => typeof window.runCaptureFixture === 'function');
  const results = await page.evaluate(() => window.runCaptureFixture());
  const expected = [{width: 960, height: 540}, {width: 540, height: 960}, {width: 320, height: 180}];
  assert.equal(results.length, 3);
  for (const [index, result] of results.entries()) {
    assert.deepEqual(result.payload, expected[index]);
    assert.deepEqual(result.encoded, expected[index]);
    assert.equal(result.type, 'image/jpeg');
    assert.ok(result.bytes > 0 && result.bytes <= 1048576);
    assert.equal(new Date(result.capturedAtClient).toISOString(), result.capturedAtClient);
  }
  assert.deepEqual(errors, []);
  const evidence = {passed: true, browser: await browser.version(), syntheticOnly: true, results};
  await writeFile(new URL('../../../outputs/parcel-live-sessions-20261021/capture-browser.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
