// Integration probe for the actual overridden startGeneration entry, without network or IndexedDB.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

test('GRSAI generation entry preserves sizing, output format, bytes and filenames', async () => {
    const variants = ['gpt-image-2.6', 'gpt-image-2.6-flare', 'gpt-image-2.6-sunburst'];
    for (const suffix of ['']) {
        for (const variant of variants) {
            const model = variant + suffix;
            const elements = new Map();
            const context = vm.createContext({
                console, Blob, TextDecoder, TextEncoder, Uint8Array,
                crypto: require('node:crypto').webcrypto,
                setTimeout, clearTimeout, URL, AbortSignal,
                addEventListener() {},
                document: {
                    readyState: 'loading', addEventListener() {},
                    getElementById(id) {
                        if (!elements.has(id)) elements.set(id, { value: '', style: {}, addEventListener() {}, classList: { add() {}, remove() {}, contains: () => false } });
                        return elements.get(id);
                    },
                    querySelector() { return null; }, querySelectorAll() { return []; }
                }
            });
            context.window = context;
            const html = readFileSync(resolve(__dirname, '../public/index.html'), 'utf8');
            for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(match[1], context);
            const gallerySource = readFileSync(resolve(__dirname, '../public/static/local_gallery.js'), 'utf8');
            // Rendering is outside this integration probe; stub the closure-local renderer.
            vm.runInContext(gallerySource.replace('    installOverrides();', '    updateTaskStatus = () => {};\n    installOverrides();'), context);
            const requested = [];
            const saved = [];
            const records = [];
            const db = context.LocalGalleryDB;
            db.init = async () => {};
            db.getSetting = async () => ({ apiKey: 'test-key', apiKey65535: 'test-key', apiKeyChange2proGpt: 'test-key' });
            db.putGeneration = async record => records.push({ ...record });
            const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
            context.BrowserGenerationClient.generateImage = async params => {
                requested.push(params);
                return [new Blob([bytes], { type: 'application/octet-stream' })];
            };
            context.ImageAssetService.saveAssetFromBlob = async (blob, usage, name) => {
                saved.push({ blob, usage, name });
                return { hash: 'test-hash' };
            };
            context.updateTaskStatus = () => {};
            context.showToast = () => {};
            vm.runInContext("windows[1] = { id: 1, selectedSize: '4K', selectedRatio: '16:9', referenceImageItems: [] };", context);
            context.document.getElementById('model-1').value = model;
            context.document.getElementById('imageOutputFormat-1').value = 'svg';
            context.document.getElementById('singlePrompt-1').value = 'test prompt';
            context.document.getElementById('countPerPrompt-1').value = '1';
            await context.startGeneration(1);
            assert.equal(requested.length, 1);
            const request = requested[0];
            assert.equal(request.provider, 'grsai');
            if (variant === 'gpt-image-2.6') {
                assert.equal(request.imageSize, '1K');
                assert.equal(request.aspectRatio, '16:9');
                assert.equal(request.outputFormat, 'svg');
            } else {
                assert.equal(request.imageSize, '3840x2160');
                assert.equal(request.aspectRatio, '3840x2160');
                assert.equal(request.outputFormat, 'png');
            }
            assert.equal(saved.length, 1);
            assert.equal(saved[0].blob.type, 'image/svg+xml');
            assert.deepEqual(Buffer.from(await saved[0].blob.arrayBuffer()), Buffer.from(bytes));
            assert.equal(saved[0].usage, 'generation');
            assert.match(saved[0].name, /\.svg$/);
            assert.equal(records.at(-1).status, 'completed');
            assert.equal(records.at(-1).outputFormat, request.outputFormat);
        }
    }
});
