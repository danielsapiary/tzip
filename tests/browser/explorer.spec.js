import {test,expect} from '@playwright/test';

test('Unicode limits and mobile layout', async ({page}) => {
  await page.goto('/demo.html');
  await expect(page.locator('#interval-diagram text')).toHaveCount(0);
  await expect(page.locator('#range-start, #range-end')).toHaveCount(2);
  await expect(page.locator('#fraction-added')).toHaveCount(1);
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

test('Trace UI wraps long code and enables computed context tokens', async ({page}) => {
  const pageErrors=[];
  await page.clock.install({time:new Date('2026-10-10T12:00:00Z')});
  page.on('pageerror',error=>pageErrors.push(error.message));
  await page.addInitScript(() => {
    class FakeWorker {
      listeners = {};
      addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
      emit(data) { for (const listener of this.listeners.message || []) listener({data}); }
      postMessage(message) {
        if (message.type !== 'trace' && message.type !== 'decode') return;
        const decoding = message.type === 'decode';
        const labels=['"a"','"b"','"c"'];
        const bits='10110010'.repeat(512);
        queueMicrotask(() => {
          this.emit({type:'tokens',tokens:[1,2,3],pieces:[[97],[98],[99]],labels,total:3});
          for (let i=0;i<3;i++) this.emit({type:'step',step:{
            symbol:100,label:labels[i],blockStart:0,precedingBytes:i,precedingBits:i*2,
            precedingHuffmanBits:i, beforeBounds:'[0.0000, 1.0000)',newBounds:'[0.3000, 0.5000)',
            selectionStart:.3,probability:decoding ? .4 : .2,cumulativeBits:2,modelProbability:.2,
            pointPositionBefore:decoding || i ? .5 : null,selectedPointPosition:i ? -7 : .5,pointPositionAfter:.5,pointMoved:!decoding && i<2,
            code:decoding ? undefined : `${i+1}:${i===0 ? '1011' : bits}`, partitions:decoding ? [{first:0,last:99,start:0,end:.3,label:'Earlier tokens'},{first:100,last:100,start:.3,end:.7,label:labels[i]},{first:101,last:50256,start:.7,end:1,label:'Later tokens'}] : undefined, rows:Array.from({length:31},(_,j)=>({id:85+j,label:`t${85+j}`,probability:1/31}))
          }});
          this.emit(decoding ? {type:'decoded',text:'abc'} : {type:'encoded',code:`3:${bits}`});
          this.emit({type:'done',cancelled:false});
        });
      }
    }
    Object.defineProperty(window,'Worker',{configurable:true,value:FakeWorker});
  });
  await page.goto('/demo.html');
  await page.clock.pauseAt(new Date('2026-10-10T12:00:10Z'));
  await page.locator('#run-demo').click();
  await page.waitForTimeout(100);
  expect(pageErrors).toEqual([]);
  await expect(page.locator('#trace-progress')).toBeHidden();
  await expect(page.locator('#step-title')).toHaveText('Start · 0 of 3 tokens encoded');
  await expect(page.locator('#code-help')).toHaveText(/count comes first/);
  expect((await page.locator('#code-help').textContent()).length).toBeLessThan(160);
  const codeField=page.locator('#code-text');
  await expect(codeField).toBeVisible();
  const dimensions=await codeField.evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth,parent:el.parentElement.clientWidth}));
  expect(dimensions.parent).toBeLessThanOrEqual(dimensions.client+2);
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client+2);
  await expect(page.locator('#token-strip button')).toHaveCount(4);
  await expect(page.locator('#token-strip button:disabled')).toHaveCount(0);
  const start = page.getByRole('button',{name:'Start: before the first token',exact:true});
  await expect(start).toHaveText('▶');
  await start.click();
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','start');
  await expect(page.locator('#step-title')).toHaveText('Start · 0 of 3 tokens encoded');
  await expect(page.locator('#previous-step')).toBeDisabled();
  await expect(page.locator('#next-step')).toBeEnabled();
  await expect(page.locator('#live-fraction')).toHaveText('0.');
  await expect(page.locator('#code-panel')).toBeVisible();
  await expect(page.locator('#code-text')).toHaveValue(`3:${'10110010'.repeat(512)}`);
  await expect(page.locator('#encoded-marker')).toBeHidden();
  await expect(page.locator('#current-symbol')).toHaveText('▶');
  await expect(page.locator('#selected-probability')).toBeEmpty();
  await expect(page.locator('#interval-width')).toHaveText('≈ 1.000 × 100');
  await expect(page.locator('#our-bits')).toHaveText('0.00 bits');
  await expect(page.locator('#unicode-bits')).toHaveText('0 bits');
  await expect(page.locator('#distribution-rows .chosen-row')).toHaveCount(0);
  await page.locator('#next-step').click();
  await expect(page.locator('#step-title')).toContainText('Token 1 of 3');
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','previous');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','start');
  await page.clock.runFor(8000);
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','start');
  await expect(page.locator('#live-fraction')).toHaveText('0.');
  await page.locator('#token-strip button[data-step-index="0"]').click();
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','previous');
  await page.clock.runFor(5500);
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','complete');
  await expect(page.locator('#live-fraction')).toHaveText('0.1011');
  await page.locator('#restart-demo').click();
  await expect(start).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#step-title')).toContainText('Start · 0 of 3');
  await page.locator('#play-demo').click();
  await page.clock.runFor(8100);
  await expect(page.locator('#step-title')).toContainText('Token 1 of 3');
  await page.locator('#play-demo').click();
  await page.locator('#token-strip button[data-step-index="1"]').click();
  await expect(page.locator('#range-start')).toHaveAttribute('x1','57.5');
  await expect(page.locator('#range-end')).toHaveAttribute('x1','342.5');
  await expect(page.locator('#fraction-fixed')).toHaveText('1011');
  await expect(page.locator('#fraction-added')).toBeEmpty();
  await expect(page.locator('#current-symbol')).toHaveText('"a"');
  await page.clock.runFor(900);
  await expect(page.locator('#current-symbol')).toHaveText('"a"');
  await page.clock.runFor(150);
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','select');
  await expect(page.locator('#current-symbol')).toHaveText('"b"');
  await page.clock.runFor(1600);
  await expect.poll(()=>page.locator('#encoded-marker').getAttribute('fill'),{timeout:3000}).toBe('#c94040');
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','outside');
  await expect(page.locator('#point-status')).toContainText('red point');
  await expect(page.locator('#fraction-fixed')).toHaveText('1011');
  await expect(page.locator('#fraction-added')).toBeEmpty();
  await page.clock.runFor(1400);
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','move');
  const partialBits = await page.locator('#fraction-added').textContent();
  expect(partialBits.length).toBeGreaterThan(0);
  expect(partialBits.length).toBeLessThan(4092);
  const newestBit = page.locator('.fraction-typing-bit');
  await expect(newestBit).toHaveCount(1);
  await expect(newestBit).toHaveText(/^[01]$/);
  const newestFont = await newestBit.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  const normalFont = await page.locator('#live-fraction').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(newestFont).toBeGreaterThan(normalFont);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  const typingBounds = await newestBit.evaluate(el => {
    const digit=el.getBoundingClientRect(), code=el.closest('code').getBoundingClientRect();
    return {left:digit.left,right:digit.right,bottom:digit.bottom,codeLeft:code.left,codeRight:code.right,codeBottom:code.bottom};
  });
  expect(typingBounds.left).toBeGreaterThanOrEqual(typingBounds.codeLeft);
  expect(typingBounds.right).toBeLessThanOrEqual(typingBounds.codeRight+1);
  expect(typingBounds.bottom).toBeLessThanOrEqual(typingBounds.codeBottom+1);
  await page.locator('.live-fraction').screenshot({path:test.info().outputPath('fraction-typing-mobile.png')});
  await page.setViewportSize({width:1280,height:1000});
  await page.clock.runFor(800);
  await expect.poll(()=>page.locator('#encoded-marker').getAttribute('fill'),{timeout:5000}).toBe('#214c59');
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','inside');
  await expect(page.locator('#encoded-marker')).toHaveAttribute('cx','171.5');
  expect((await page.locator('#fraction-added').textContent()).length).toBe(4092);
  await expect(newestBit).toHaveCount(0);
  await page.clock.runFor(2400);
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','complete',{timeout:5000});
  await expect(page.locator('#interval-current, #range-start, #range-end')).toHaveCount(3);
  for (const oldPart of ['interval-current','range-start','range-end']) {
    await expect(page.locator(`#${oldPart}`)).toHaveAttribute('opacity','0');
  }
  await expect(page.locator('#encoded-marker')).toHaveAttribute('cx','200');
  await expect(page.locator('#selected-probability')).toHaveText('20.0000% probability');
  await page.locator('.bound-diagram').screenshot({path:test.info().outputPath('interval-complete.png')});
  await page.locator('#token-strip button[data-step-index="0"]').click();
  await expect(page.locator('#step-title')).toContainText('Token 1 of 3');
  await expect(page.locator('#encoded-marker')).toBeVisible();
  expect(Number(await page.locator('#encoded-marker').getAttribute('cx'))).toBeGreaterThan(0);
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','complete',{timeout:5000});
  await expect(page.locator('#interval-selection')).toHaveAttribute('x','57.5');
  await expect(page.locator('#interval-selection')).toHaveAttribute('width','285');
  await expect(page.locator('#live-fraction')).toHaveText('0.1011');
  await page.locator('#next-step').click();
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','previous');
  await page.locator('#previous-step').click();
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','complete');
  await page.locator('#next-step').click();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#step-title')).toContainText('Token 1 of 3');
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','complete');
  await page.clock.runFor(7000);
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','complete');
  await expect(page.locator('#live-fraction')).toHaveText('0.1011');
  await page.locator('#token-strip button').last().click();
  const completeCode = await page.locator('#code-text').inputValue();
  await page.locator('#decode-mode').click();
  await page.locator('#run-demo').click();
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','start');
  await expect(page.locator('#decoded-text')).toBeEmpty();
  await expect(page.locator('#code-text')).toHaveValue(completeCode);
  await start.click();
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','start');
  await expect(page.locator('#step-title')).toHaveText('Start · 0 of 3 tokens decoded');
  await expect(page.locator('#code-text')).toHaveValue(completeCode);
  await expect(page.locator('#live-fraction')).toHaveText(`0.${completeCode.split(':')[1]}`);
  await expect(page.locator('#decoded-text')).toBeEmpty();
  await expect(page.locator('#decode-bit-progress')).toHaveCount(0);
  await expect(page.locator('#token-strip button:not([hidden])')).toHaveCount(4);
  await expect(page.locator('#encoded-marker')).toBeVisible();
  await expect(page.locator('#previous-step')).toBeDisabled();
  await page.locator('#next-step').click();
  await expect(page.locator('#step-title')).toContainText('Decoding token 1');
  await expect(page.locator('.live-fraction')).toBeHidden();
  await expect(page.locator('#fraction-label')).toBeHidden();
  await page.clock.runFor(1100);
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','partition');
  await expect(page.locator('#interval-partitions rect')).toHaveCount(3);
  for (const selector of ['#interval-current', '#interval-selection', '#interval-partitions rect']) {
    for (const element of await page.locator(selector).all()) {
      await expect(element).toHaveAttribute('y', '46');
      await expect(element).toHaveAttribute('height', '8');
    }
  }
  await expect(page.locator('#interval-selection')).toHaveAttribute('opacity','0');
  await expect(page.locator('#current-symbol')).toHaveText('?');
  await expect(page.locator('#selected-probability')).toHaveText('Finding new interval overlapping point');
  await expect(page.locator('#decoded-text')).toBeEmpty();
  await expect(page.locator('#token-strip button:not([hidden])')).toHaveCount(4);
  await expect(page.locator('#live-fraction')).toHaveText(`0.${completeCode.split(':')[1]}`);
  await page.clock.runFor(1600);
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','locate');
  await expect(page.locator('#selected-probability')).toHaveText('40.0000% probability');
  await expect(page.locator('#step-title')).toContainText('Decoded token 1');
  await expect(page.locator('#decoded-text')).toHaveText('a');
  await expect(page.locator('#interval-selection')).toHaveAttribute('opacity','1');
  await expect(page.locator('#encoded-marker')).toHaveAttribute('fill','#214c59');
  await page.locator('.bound-diagram').screenshot({path:test.info().outputPath('decode-selected.png')});
  await page.clock.runFor(2500);
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','complete');
  await expect(page.locator('#live-fraction')).toHaveText(`0.${completeCode.split(':')[1]}`);
  await expect(page.locator('#interval-partitions rect').first()).toHaveAttribute('opacity','0');
  await expect(page.locator('#token-strip button:disabled')).toHaveCount(0);
  await page.locator('#token-strip button[data-step-index="2"]').click();
  await page.clock.runFor(5200);
  await expect(page.locator('#step-title')).toContainText('Decoded token 3');
  await expect(page.locator('#decoded-text')).toHaveText('abc');
  await page.locator('#token-strip button[data-step-index="0"]').click();
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','complete');
  await expect(page.locator('#decoded-text')).toHaveText('a');
  await expect(page.locator('#token-strip button:not([hidden])')).toHaveCount(4);
  expect(pageErrors).toEqual([]);
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
  await page.locator('#token-strip button[data-step-index="0"]').click();
  await expect(page.locator('#step-title')).toContainText('Token 1');
  await expect(page.locator('#huffman-improvement')).toHaveText('—');
  await expect(page.locator('#selected-label')).toBeHidden();
  await expect(page.locator('#interval-width')).toBeVisible();
  await page.locator('.bound-inspection > summary').click();
  await expect(page.locator('#selected-label')).toBeVisible();
  expect(await page.locator('#selected-label').textContent()).not.toContain('...');
  const firstBounds = (await page.locator('#selected-label').textContent()).slice(1,-1).split(', ').map(Number);
  await expect(page.locator('#context-note, #table-explanation')).toHaveCount(0);
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
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','complete',{timeout:15000});
  await page.setViewportSize({width:390,height:844});
  expect(await page.locator('#token-strip').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBeTruthy();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  const code = await page.locator('#code-text').inputValue();
  const encodedFraction = await page.locator('#live-fraction').textContent();
  expect(encodedFraction).toMatch(/^0\.[01]+$/);
  await page.locator('#decode-mode').click();
  await expect(page.locator('#code-text')).toHaveValue(code);
  await expect(page.locator('#demo-text')).toBeHidden();
  await page.locator('#run-demo').click();
  await page.waitForFunction(() => !document.getElementById('run-demo').disabled || !document.getElementById('demo-error').hidden, undefined, {timeout:540000});
  await expect(page.locator('#demo-error')).toBeHidden();
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','start');
  await expect(page.locator('#code-text')).toHaveValue(code);
  const tokenCount = Number(code.split(':')[0]);
  for (let i = 0; i < tokenCount; i++) await page.locator('#next-step').click();
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','complete',{timeout:15000});
  await expect(page.locator('#decode-verification')).toContainText('binary fraction stays fixed');
  await expect(page.locator('#decoded-text')).toHaveText('banana banana <|endoftext|> 🦋');
  await expect(page.locator('#encoded-marker')).toBeVisible();
  await expect(page.locator('#step-title')).toContainText('Decoded token');
  await expect(page.locator('.live-fraction')).toBeHidden();
  await expect(page.locator('#fraction-label')).toBeHidden();
  await expect(page.locator('#live-fraction')).toHaveText(encodedFraction);
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','complete',{timeout:15000});
  await expect(page.locator('#point-status')).toContainText('Use the recovered token as context');
  await page.locator('#restart-demo').click();
  await expect(page.locator('#step-title')).toContainText('Start · 0');
  await expect(page.locator('#decoded-text')).toBeEmpty();
  await expect(page.locator('#decode-bit-progress')).toHaveCount(0);
  await expect(page.locator('#token-strip button:not([hidden])')).toHaveCount(tokenCount + 1);
  await expect(page.locator('#interval-diagram')).toHaveAttribute('data-phase','start');
  await expect(page.locator('#decoded-text')).not.toHaveText('banana banana <|endoftext|> 🦋');
  await page.locator('#encode-mode').click();
  await expect(page.locator('#demo-text')).toHaveValue('banana banana <|endoftext|> 🦋');
  await page.locator('#demo-text').fill('changed');
  await expect(page.locator('#decode-mode')).toBeEnabled();
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
