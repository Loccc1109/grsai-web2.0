const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const root = resolve(__dirname, '..');
const variants = ['gpt-image-2.6', 'gpt-image-2.6-flare', 'gpt-image-2.6-sunburst'];
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const svg = '\uFEFF<?xml version="1.0"?>\n<!-- sample -->\n<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';

function browserHarness() {
    const elements = new Map();
    const downloads = [];
    const context = vm.createContext({
        console, Blob, FormData, Headers, Response, Request, URL, AbortSignal,
        TextDecoder, TextEncoder, Uint8Array, crypto: require('node:crypto').webcrypto,
        atob, btoa, setTimeout: () => 0, clearTimeout() {},
        addEventListener() {},
        document: {
            readyState: 'loading', addEventListener() {},
            getElementById(id) { return elements.get(id) || { addEventListener() {} }; },
            querySelector() { return null; }, querySelectorAll() { return []; },
            body: { appendChild() {} },
            createElement(tag) {
                if (tag !== 'a') throw new Error(`Unexpected DOM rendering: ${tag}`);
                const anchor = { click() { downloads.push({ name: this.download, href: this.href }); }, remove() {} };
                return anchor;
            }
        }
    });
    context.window = context;
    const html = readFileSync(resolve(root, 'public/index.html'), 'utf8');
    for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(match[1], context);
    const gallerySource = readFileSync(resolve(root, 'public/static/local_gallery.js'), 'utf8');
    vm.runInContext(gallerySource.replace('    const ImageAssetService = {', '    window.__testXmpLabeler = XmpLabeler;\n    const ImageAssetService = {'), context);
    return { context, elements, downloads, evaluate: code => vm.runInContext(code, context) };
}

const plain = value => JSON.parse(JSON.stringify(value));

test('2.6 models are registered only for GRSAI', () => {
    const { evaluate } = browserHarness();
    for (const variant of variants) {
        assert.equal(evaluate(`AVAILABLE_MODELS.includes('${variant}')`), true);
        assert.equal(evaluate(`getModelProvider('${variant}')`), 'grsai');
        assert.equal(evaluate(`getModelName('${variant}')`), variant);
        assert.equal(evaluate(`isGptImageModel('${variant}')`), true);
        for (const suffix of ['-65535', '-change2pro']) {
            const id = variant + suffix;
            assert.equal(evaluate(`AVAILABLE_MODELS.includes('${id}')`), false);
            assert.equal(evaluate(`Object.hasOwn(MODEL_CATALOG, '${id}')`), false);
        }
    }
    assert.deepEqual(plain(evaluate("getModelImageSizes('gpt-image-2.6')")), ['1K']);
    assert.deepEqual(plain(evaluate("getModelOutputFormats('gpt-image-2.6')")), ['png', 'gif', 'svg']);
    for (const variant of variants.slice(1)) {
        assert.deepEqual(plain(evaluate(`getModelImageSizes('${variant}')`)), ['1K', '2K', '4K']);
        assert.deepEqual(plain(evaluate(`getModelOutputFormats('${variant}')`)), ['png', 'gif']);
    }
    assert.deepEqual(plain(evaluate("getModelOutputFormats('gpt-image-2.6-change2pro')")), ['png']);
});

test('GRSAI 2.6 output format and ordinary-model sizing follow the supplied spec', async () => {
    const { context } = browserHarness();
    const client = context.BrowserGenerationClient;
    client.getReferenceDataUrls = async () => ['data:image/png;base64,AA=='];
    client.rememberGrsaiHost = async () => {};
    const bodies = [];
    client.fetchJson = async (url, init) => {
        bodies.push(JSON.parse(init.body));
        return { id: 'test-id', status: 'succeeded', results: [{ b64_json: gif.toString('base64') }] };
    };
    for (const model of variants) {
        await client.generateImage({ provider: 'grsai', apiKey: 'test-key', prompt: 'test', model,
            imageSize: '3840x2160', aspectRatio: model === 'gpt-image-2.6' ? '16:9' : '3840x2160',
            outputFormat: 'svg', referenceHashes: [] });
        const body = bodies.at(-1);
        assert.equal(body.model, model);
        assert.equal(body.replyType, 'async');
        assert.equal(body.quality, 'auto');
        assert.deepEqual(body.images, ['data:image/png;base64,AA==']);
        assert.equal(body.outputFormat, model === 'gpt-image-2.6' ? 'svg' : 'png');
        assert.equal(body.aspectRatio, model === 'gpt-image-2.6' ? '16:9' : '3840x2160');
        assert.equal('imageSize' in body, model !== 'gpt-image-2.6');
        await client.generateGrsai({ apiKey: 'test-key', prompt: 'test', model,
            aspectRatio: '1:1', outputFormat: 'gif', referenceHashes: [] });
        assert.equal(bodies.at(-1).outputFormat, 'gif');
    }
});

test('existing 65535 2.5 async task payload and polling remain unchanged', async () => {
    const { context } = browserHarness();
    const client = context.BrowserGenerationClient;
    client.getReferenceAssets = async () => [];
    client.sleep = async () => {};
    for (const model of ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst']) {
        const calls = [];
        client.fetchJson = async (url, init) => {
            calls.push({ url, init });
            return init.method === 'POST' ? { id: 'test-task', status: 'queued' }
                : { id: 'test-task', status: 'done', result: { b64_json: gif.toString('base64') } };
        };
        await client.generateImage({ provider: '65535', apiKey: 'test-key', prompt: 'test', model: `${model}-65535`,
            imageSize: '4K', aspectRatio: '16:9', outputFormat: 'gif', referenceHashes: [] });
        assert.deepEqual(JSON.parse(calls[0].init.body), {
            kind: 'image', model,
            input: { prompt: 'test', size: '16:9', resolution: '4k', n: 1, response_format: 'url' }
        });
        assert.match(calls[1].url, /\/v1\/tasks\/test-task$/);
    }
});

test('GIF and SVG bytes survive conversion, labeling, display and download even with incorrect MIME', async () => {
    const { context, downloads } = browserHarness();
    const service = context.ImageAssetService;
    service.renderJpegBlob = async () => { throw new Error('GIF/SVG must not be rendered to JPEG'); };
    for (const [bytes, expectedType, extension] of [[gif, 'image/gif', 'gif'], [Buffer.from(svg), 'image/svg+xml', 'svg']]) {
        for (const mimeType of ['', 'application/octet-stream', 'image/jpeg', `${expectedType}; charset=utf-8`]) {
            const input = new Blob([bytes], { type: mimeType });
            const output = await service.toLabeledJpegBlob(input);
            assert.equal(output.type, expectedType);
            assert.deepEqual(Buffer.from(await output.arrayBuffer()), bytes);
            assert.equal((await service.convertToJpegBlob(input)).type, expectedType);
            context.LocalGalleryDB.getAsset = async () => ({
                hash: 'test', blob: input, mimeType, usageTypes: ['generation'], originalName: 'test.jpg',
                thumbBlob: new Blob(['static thumbnail'], { type: 'image/webp' })
            });
            service.revokeAssetUrls('test');
            const previewUrl = await service.getAssetObjectUrl('test', true);
            const preview = await fetch(previewUrl).then(response => response.blob());
            assert.equal(preview.type, expectedType);
            assert.deepEqual(Buffer.from(await preview.arrayBuffer()), bytes);
            await service.downloadAsset('test');
            assert.equal(downloads.at(-1).name, `test.${extension}`);
            const saved = await fetch(downloads.at(-1).href).then(response => response.arrayBuffer());
            assert.deepEqual(Buffer.from(saved), bytes);
            URL.revokeObjectURL(downloads.at(-1).href);
            service.revokeAssetUrls('test');
        }
    }
});

test('JPEG results still route through the existing XMP labeler without re-encoding', async () => {
    const { context } = browserHarness();
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const input = new Blob([bytes], { type: 'image/jpeg' });
    let labelCalls = 0;
    // XMP XML serialization needs a browser DOM; spy on its unchanged boundary here.
    context.__testXmpLabeler.injectIntoJpeg = (data, keyword) => {
        labelCalls += 1;
        assert.deepEqual(Buffer.from(data), Buffer.from(bytes));
        assert.ok(keyword);
        return [data, new TextEncoder().encode('test-xmp')];
    };
    context.ImageAssetService.renderJpegBlob = async () => { throw new Error('JPEG must not be re-encoded'); };
    const output = await context.ImageAssetService.toLabeledJpegBlob(input);
    assert.equal(labelCalls, 1);
    assert.equal(output.type, 'image/jpeg');
    assert.match(Buffer.from(await output.arrayBuffer()).toString(), /test-xmp/);
});

test('generic HTTP content type and base64 responses do not cause GIF/SVG conversion', async () => {
    const { context } = browserHarness();
    for (const [bytes, expectedType] of [[gif, 'image/gif'], [Buffer.from(svg), 'image/svg+xml']]) {
        context.fetch = async () => new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } });
        const downloaded = await context.ImageAssetService.resultToBlob({ url: 'https://example.com/result' });
        assert.equal(downloaded.type, expectedType);
        const base64 = await context.ImageAssetService.resultToBlob({ b64_json: bytes.toString('base64'), mimeType: 'image/jpeg' });
        const output = await context.ImageAssetService.toLabeledJpegBlob(base64);
        assert.equal(output.type, expectedType);
        assert.deepEqual(Buffer.from(await output.arrayBuffer()), bytes);
    }
});

test('Change2pro rejects removed 2.6 models and preserves existing generation/edit formats', async () => {
    const source = readFileSync(resolve(root, 'functions/api/change2pro/images.js'), 'utf8');
    const { onRequestPost } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const originalFetch = global.fetch;
    const captured = [];
    global.fetch = async (url, init) => {
        captured.push({ url, init });
        return Response.json({ data: [{ b64_json: gif.toString('base64'), mime_type: 'image/gif' }] });
    };
    try {
        for (const model of variants) {
            const form = new FormData();
            form.set('api_key', 'test-key');
            form.set('model', `${model}-change2pro`);
            form.set('prompt', 'test');
            const response = await onRequestPost({ request: new Request('https://app.example/api/change2pro/images', {
                method: 'POST', headers: { Origin: 'https://app.example' }, body: form
            }) });
            assert.equal(response.status, 400);
            assert.equal((await response.json()).error, '不支持的 Change2pro 图像模型');
        }
        assert.equal(captured.length, 0);
        for (const model of ['gpt-image-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst']) {
            for (const edit of [false, true]) {
                const form = new FormData();
                form.set('api_key', 'test-key');
                form.set('model', `${model}-change2pro`);
                form.set('prompt', 'test');
                form.set('size', '2048x1152');
                form.set('n', '1');
                if (edit) form.append('image', new Blob(['reference'], { type: 'image/png' }), 'reference.png');
                const response = await onRequestPost({ request: new Request('https://app.example/api/change2pro/images', {
                    method: 'POST', headers: { Origin: 'https://app.example' }, body: form
                }) });
                assert.equal(response.status, 200);
                assert.equal((await response.json()).data[0].mimeType, 'image/gif');
                const { url, init } = captured.at(-1);
                assert.equal(url, `https://gateway.change2pro.com/v1/images/${edit ? 'edits' : 'generations'}`);
                if (edit) {
                    assert.equal(init.body.get('model'), model);
                    assert.equal(init.body.get('size'), '2048x1152');
                    assert.equal(init.body.getAll('image').length, 1);
                    assert.equal(init.body.has('outputFormat'), false);
                } else {
                    assert.deepEqual(JSON.parse(init.body), { model, prompt: 'test', size: '2048x1152', n: 1 });
                }
            }
        }
    } finally {
        global.fetch = originalFetch;
    }
});
