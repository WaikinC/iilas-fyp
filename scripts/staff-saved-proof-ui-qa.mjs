// The real staff UI and Spark transport run in an isolated browser. All service
// replies are synthetic in-memory fixtures. Only literal loopback Vite is used.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.IILAS_PLAYWRIGHT_MODULE ||
  'C:/Users/Home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'http://127.0.0.1:5173';
const browser = await chromium.launch({channel: 'msedge', headless: true});

try {
  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  const pageErrors = [];
  const outsideVite = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const fixture = {
      user: {uid: 'fixture-driver', getIdToken: async () => 'fixture-proof-auth'},
      binaryReads: [],
      createdUrls: [],
      revokedUrls: [],
      prepareInput: null,
      uploadedBlob: null,
      savedRecord: null,
    };
    window.staffProofFixture = fixture;
    const createUrl = URL.createObjectURL.bind(URL);
    const revokeUrl = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      const url = createUrl(blob);
      fixture.createdUrls.push(url);
      return url;
    };
    URL.revokeObjectURL = url => {
      fixture.revokedUrls.push(url);
      revokeUrl(url);
    };
    const headers = {
      'x-iilas-protocol': 'iilas-msi-api-1.0',
      'x-iilas-backend': '11111111-1111-4111-8111-111111111111',
    };
    const json = data => new Response(JSON.stringify({data}), {
      headers: {...headers, 'content-type': 'application/json'},
    });
    fixture.fetch = async (rawUrl, init) => {
      const {pathname} = new URL(rawUrl);
      if (init.headers.Authorization !== 'Bearer fixture-proof-auth' ||
        init.headers['X-IILAS-Backend'] !== headers['x-iilas-backend'] ||
        init.cache !== 'no-store') throw Error('Missing protected proof transport authority');
      if (pathname === '/v1/command') {
        const {action, input} = JSON.parse(init.body);
        if (action === 'prepareEvidenceUpload') {
          fixture.prepareInput = input;
          return json({
            intentId: 'fixture-intent',
            path: `evidence/${fixture.member.workspaceId}/${input.shipmentId}/${input.evidenceId}`,
          });
        }
        if (action === 'registerEvidence') {
          const prepared = fixture.prepareInput;
          if (!prepared || !fixture.uploadedBlob || input.id !== prepared.evidenceId ||
            input.intentId !== 'fixture-intent') throw Error('Registration must follow proof upload');
          const record = {
            ...input,
            ownerId: fixture.member.workspaceId,
            actor: fixture.member.uid,
            version: 1,
            integrityVersion: 2,
            contentType: prepared.contentType,
            bytes: prepared.bytes,
            sha256: prepared.sha256,
            createdAt: {seconds: 1},
          };
          fixture.savedRecord = record;
          // The Firestore listener can deliver the saved row after the reply.
          setTimeout(() => fixture.publish(record), 75);
          return json({id: record.id, sha256: record.sha256});
        }
      }
      if (pathname === '/v1/evidence/web/fixture-intent/bytes' && init.method === 'PUT') {
        fixture.uploadedBlob = init.body;
        return json({bytes: init.body.size});
      }
      const match = /^\/v1\/evidence\/([^/]+)\/bytes$/.exec(pathname);
      if (match && init.method === 'GET') {
        const id = match[1];
        fixture.binaryReads.push(id);
        if (id !== fixture.savedRecord?.id) throw Error('Unexpected proof binary read');
        const blob = fixture.uploadedBlob;
        return new Response(blob, {
          headers: {...headers, 'content-type': blob.type, 'content-length': String(blob.size)},
        });
      }
      throw Error('Unexpected staff proof fixture request');
    };
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      outsideVite.push(url.origin);
      return route.abort();
    }
    if (url.pathname === '/lib/firebaseRuntime.js') {
      return route.fulfill({contentType: 'text/javascript', body: `
        import {createSparkTransport} from '/lib/sparkTransport.js';
        export const projectId = 'fyp-inventory-and-logistics';
        export const demoEnvironment = {
          schema: 'iilas-spark-loopback-test-1.0', mode: 'spark-loopback-test', projectId,
          backendInstanceId: '11111111-1111-4111-8111-111111111111',
          apiOrigin: 'http://127.0.0.1:8011', webOrigins: ['http://127.0.0.1:5173'],
          emulatorHosts: {auth: '127.0.0.1:9099', firestore: '127.0.0.1:8081', storage: '127.0.0.1:9199'},
        };
        export const auth = {get currentUser(){return window.staffProofFixture.user;}};
        export const db = null, storage = null, functions = null, configured = true;
        export const sessionRecoveryStorage = sessionStorage;
        export const sparkTransport = createSparkTransport({
          profile: demoEnvironment, auth, fetch: window.staffProofFixture.fetch,
        });
      `});
    }
    if (url.pathname === '/lib/workspace.js') {
      return route.fulfill({contentType: 'text/javascript', body: `
        import {sparkTransport} from '/lib/firebaseRuntime.js';
        export const getActiveWorkspace = () => window.staffProofFixture.member;
        export const workspaceCommand = (action, input) => sparkTransport.command(action, input);
      `});
    }
    return route.continue();
  });

  await page.goto(origin + '/scripts/fixtures/staff-saved-proof/harness.html');
  const active = page.getByRole('region', {name: 'Active delivery fixture'});
  const panel = active.getByText('Proof & parcel records', {exact: true});
  await panel.click({timeout: 5000});
  assert.deepEqual(await page.evaluate(() => window.staffProofFixture.binaryReads), []);
  const png = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const drawing = canvas.getContext('2d');
    drawing.fillStyle = '#1b3b6f';
    drawing.fillRect(0, 0, 640, 360);
    drawing.fillStyle = '#ffffff';
    drawing.font = '36px sans-serif';
    drawing.fillText('Fixture proof', 60, 180);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await active.getByLabel('Evidence file', {exact: true}).setInputFiles({
    name: 'saved-proof.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png),
  });
  await active.getByRole('button', {name: 'Upload evidence', exact: true}).click({timeout: 5000});
  await active.getByRole('button', {name: 'saved-proof.png · Proof of Delivery', exact: true}).waitFor({timeout: 5000});
  const evidenceId = await page.evaluate(() => window.staffProofFixture.savedRecord.id);
  assert.ok(evidenceId, 'The assigned Driver must have registered the proof');
  const preview = active.getByRole('img', {name: 'Saved proof of delivery', exact: true});
  await preview.waitFor({timeout: 3500});
  const previewUrl = await preview.evaluate(async image => {
    await image.decode();
    if (image.naturalWidth !== 640 || image.naturalHeight !== 360) throw Error('Wrong saved proof image');
    return image.src;
  });
  assert.match(previewUrl, /^blob:/);
  assert.deepEqual(await page.evaluate(() => window.staffProofFixture.binaryReads), [evidenceId]);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({width, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.ok(await preview.evaluate(image => {
      const bounds = image.getBoundingClientRect();
      return bounds.width > 0 && bounds.left >= 0 && bounds.right <= innerWidth;
    }), `The saved proof must fit the ${width}px viewport`);
  }
  await page.getByRole('button', {name: 'Retire delivery fixture', exact: true}).click();
  await preview.waitFor({state: 'hidden', timeout: 3500});
  await page.waitForFunction(url => window.staffProofFixture.revokedUrls.includes(url), previewUrl);
  assert.deepEqual(await page.evaluate(() => window.staffProofFixture.binaryReads), [evidenceId]);
  await page.getByRole('button', {name: 'Reopen recorded delivery fixture', exact: true}).click();
  await preview.waitFor({timeout: 3500});
  const recordedPreviewUrl = await preview.evaluate(image => image.src);
  assert.notEqual(recordedPreviewUrl, previewUrl);
  await page.getByRole('button', {name: 'Reassign delivery fixture', exact: true}).click();
  await preview.waitFor({state: 'hidden', timeout: 3500});
  await page.waitForFunction(url => window.staffProofFixture.revokedUrls.includes(url), recordedPreviewUrl);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.deepEqual(await page.evaluate(() => window.staffProofFixture.binaryReads), [evidenceId, evidenceId]);
  assert.equal(await active.getByLabel('Evidence file', {exact: true}).count(), 0);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(outsideVite, []);
  console.log('Staff proof browser passed: assigned Driver saves PNG and protected bytes decode inline at 1440/390/320px. Hidden and reassigned deliveries make no binary request. Retirement and reassignment revoke their previews.');
} finally {
  await browser.close();
}
