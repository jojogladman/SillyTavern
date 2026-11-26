/* global document */
import { test, expect } from '@playwright/test';
import { testSetup } from './frontent-test-utils.js';

test.beforeEach(testSetup.awaitST);

test('overlapping textarea sends load the character once and a failed load can be retried', async ({ page }) => {
    let loads = 0;
    await page.route('**/api/characters/get', async route => {
        if (route.request().postDataJSON()?.avatar_url !== 'rapid-send-fixture.png') {
            return route.continue();
        }
        loads++;
        await route.abort('failed');
    });
    const result = await page.evaluate(async () => {
        const host = await import('./script.js');
        const oldId = host.this_chid;
        const count = host.characters.length;
        try {
            host.characters.push({ name: 'Send fixture', avatar: 'rapid-send-fixture.png', shallow: true });
            host.setCharacterId(count);
            const pair = await Promise.allSettled([host.sendTextareaMessage(), host.sendTextareaMessage()]);
            const retry = await Promise.allSettled([host.sendTextareaMessage()]);
            return [...pair, ...retry].map(result => result.status);
        } finally {
            host.setCharacterId(oldId);
            host.characters.length = count;
        }
    });
    expect(loads).toBe(2);
    expect(result).toEqual(['rejected', 'fulfilled', 'rejected']);
});

test('a slash command can await its own generation while a textarea send is pending', async ({ page }) => {
    const started = await page.evaluate(async () => {
        const host = await import('./script.js');
        const oldId = host.this_chid;
        const oldStatus = host.online_status;
        const field = document.getElementById('send_textarea');
        const oldText = field.value;
        let starts = 0;
        const onStart = () => { starts++; };
        host.eventSource.on(host.event_types.GENERATION_STARTED, onStart);
        try {
            // A temporary non-shallow entry avoids creating a chat or contacting a provider.
            const id = host.characters.push({ name: 'Command fixture', shallow: false }) - 1;
            host.setCharacterId(id);
            host.setOnlineStatus('no_connection');
            field.value = '/trigger await=true';
            await host.sendTextareaMessage();
            return starts;
        } finally {
            host.eventSource.removeListener(host.event_types.GENERATION_STARTED, onStart);
            host.setCharacterId(oldId);
            host.characters.pop();
            host.setOnlineStatus(oldStatus);
            field.value = oldText;
        }
    });
    expect(started).toBe(2);
});
