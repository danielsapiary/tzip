import {test,expect} from '@playwright/test';

test('Unicode limits and mobile layout', async ({page}) => {
  await page.goto('/demo.html');
  await page.getByRole('button',{name:'Random text',exact:true}).click();
  const randomText = await page.locator('#demo-text').inputValue();
  expect(randomText).toHaveLength(300);
  expect(randomText).toMatch(/^[ -~]+$/);
  await page.getByRole('button',{name:'Bee movie',exact:true}).click();
  await expect(page.locator('#demo-text')).toHaveValue(/According to all known laws of aviation/);
  await page.locator('#demo-text').fill('🦋'.repeat(2049));
  await expect(page.locator('.preset-chip[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator('#character-count')).toHaveText('2048 / 2048 characters');
  expect(Array.from(await page.locator('#demo-text').inputValue()).length).toBe(2048);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  expect(await page.locator('input[type=file]').count()).toBe(0);
});

test('Empty text needs no model download', async ({page}) => {
  await page.goto('/demo.html');
  await page.locator('#demo-text').fill('');
  await page.locator('#run-demo').click();
  await expect(page.locator('#trace-progress')).toBeHidden();
  await expect(page.locator('#demo-placeholder h2')).toContainText('Empty input');
});

test('Real GPT-2 runs in the browser with full logits and token navigation', async ({page}) => {
  test.skip(process.env.TZIP_MODEL_TESTS !== '1','Opt-in live model download');
  const requests = [];
  const errors = [];
  page.on('request',request=>requests.push({method:request.method(),url:request.url()}));
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/demo.html');
  await page.locator('#demo-text').fill('banana banana <|endoftext|> 🦋');
  await page.locator('#run-demo').click();
  await page.waitForFunction(() => !document.getElementById('run-demo').disabled || !document.getElementById('demo-error').hidden, undefined, {timeout:540000});
  await expect(page.locator('#demo-error')).toBeHidden();
  await expect(page.locator('#trace-progress')).toBeHidden();
  await expect(page.locator('#demo-error')).toBeHidden();
  await expect(page.locator('#step-title')).toContainText('Token 1');
  await expect(page.locator('#huffman-improvement')).toHaveText('—');
  await expect(page.locator('#selected-label')).toBeHidden();
  await expect(page.locator('#interval-width')).toBeVisible();
  await page.locator('.bound-inspection > summary').click();
  await expect(page.locator('#selected-label')).toBeVisible();
  expect(await page.locator('#selected-label').textContent()).not.toContain('...');
  const firstBounds = (await page.locator('#selected-label').textContent()).slice(1,-1).split(', ').map(Number);
  await expect(page.locator('#table-explanation')).toContainText('50,257');
  await page.locator('#next-step').click();
  await expect(page.locator('#unicode-bits')).toHaveText('24 bits');
  const secondBounds = (await page.locator('#selected-label').textContent()).slice(1,-1).split(', ').map(Number);
  expect(secondBounds[0]).toBeGreaterThanOrEqual(firstBounds[0]);
  expect(secondBounds[1]).toBeLessThanOrEqual(firstBounds[1]);
  expect(secondBounds[1]-secondBounds[0]).toBeLessThan(firstBounds[1]-firstBounds[0]);
  const huffmanBits = parseFloat(await page.locator('#huffman-bits').textContent());
  const modelBits = parseFloat(await page.locator('#our-bits').textContent());
  expect(huffmanBits).toBeGreaterThan(0);
  const improvement = parseFloat(await page.locator('#huffman-improvement').textContent());
  expect(Math.abs(improvement - 100*(huffmanBits-modelBits)/huffmanBits)).toBeLessThan(0.2);
  const fonts = await page.evaluate(() => ['our-bits','huffman-bits'].map(id => getComputedStyle(document.getElementById(id)).font));
  expect(fonts[0]).toBe(fonts[1]);
  expect(parseFloat(await page.locator('#unicode-extra').evaluate(element => element.style.width))).toBeGreaterThan(0);
  await page.locator('#next-step').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#step-title')).toContainText('Token 3');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#step-title')).toContainText('Token 2');
  expect(await page.locator('.distribution-table th').allTextContents()).toEqual(['Token','Probability']);
  await expect(page.locator('#distribution-rows tr')).toHaveCount(31);
  const panelHeights = await page.evaluate(() => ['.distribution-table-wrap','.bound-diagram'].map(selector=>document.querySelector(selector).getBoundingClientRect().height));
  expect(Math.abs(panelHeights[0]-panelHeights[1])).toBeLessThan(1);
  expect(requests.filter(request=>request.method==='POST')).toEqual([]);
  expect(requests.some(request=>new URL(request.url).origin === 'http://127.0.0.1:4173' && new URL(request.url).pathname.startsWith('/api/'))).toBeFalsy();
  expect(errors).toEqual([]);
  await page.locator('#token-strip button').last().click();
  await page.setViewportSize({width:390,height:844});
  expect(await page.locator('#context-bytes').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBeTruthy();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});

test('About page explains the theory in order and works without model loading', async ({page}) => {
  const requests = [];
  page.on('request',request=>requests.push(request.url()));
  await page.goto('/demo.html');
  const demoWidth = await page.locator('main').evaluate(element=>element.getBoundingClientRect().width);
  await page.getByRole('link',{name:'About',exact:true}).click();
  expect(await page.locator('main').evaluate(element=>element.getBoundingClientRect().width)).toBe(demoWidth);
  await expect(page.locator('.equation .katex')).toHaveCount(8);
  await expect(page).toHaveTitle('About · GPT-2 Compress');
  expect(new URL(page.url()).pathname).toBe('/');
  expect(await page.locator('.page-nav a').allTextContents()).toEqual(['About','Demo']);
  await expect(page.getByRole('link',{name:'Explore the demo →',exact:true})).toHaveAttribute('href','./demo.html');
  const rover = page.locator('#entropy .rover-example');
  await expect(rover.locator('table')).toBeHidden();
  await rover.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(rover.locator('table')).toBeVisible();
  const headings = await page.locator('.about-article > section > h2').allTextContents();
  expect(headings.slice(0,6)).toEqual([
    'Entropy',
    'Cross-entropy',
    'When Q = P, cross-entropy equals entropy.',
    'Arithmetic coding turns probability into an interval.',
    'Best predictor → best compressor',
    'Best predictor ← best compressor',
  ]);
  expect(await page.locator('#perfect-model .about-interactive').count()).toBe(1);
  await page.locator('.about-interactive > summary').click();
  await expect(page.locator('#mismatch-value')).toHaveText('0.000 bits');
  const entropyWidth = await page.locator('#entropy-bar').evaluate(element=>element.style.width);
  const markerX = await page.locator('#cross-entropy-marker').getAttribute('cx');
  await page.locator('#model-probability').fill('50');
  await expect(page.locator('#cross-entropy-value')).toHaveText('1.000 bits');
  expect(await page.locator('#cross-entropy-marker').getAttribute('cx')).not.toBe(markerX);
  await expect(page.locator('#mismatch-value')).toHaveText('0.189 bits');
  await page.locator('#model-probability').fill('1');
  expect(await page.locator('#entropy-bar').evaluate(element=>element.style.width)).toBe(entropyWidth);
  expect(await page.locator('#mismatch-bar').evaluate(element=>parseFloat(element.style.width))).toBeLessThan(84);
  expect(await page.locator('a[href="https://arxiv.org/html/2309.10668v2"]').count()).toBeGreaterThan(0);
  expect(requests.some(url=>url.includes('huggingface.co')||url.includes('.onnx'))).toBeFalsy();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.getByRole('link',{name:'Demo',exact:true}).click();
  await expect(page.locator('#demo-text')).toBeVisible();
});
