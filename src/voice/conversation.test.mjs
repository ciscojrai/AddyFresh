// Run: npm run test:voice
// Exercises the real compiled session against a fake SpeechRecognition, so the restart
// and countdown logic is proven without a microphone.
import assert from 'node:assert/strict';
import test from 'node:test';

const instances = [];
class FakeRecognition {
  constructor() {
    this.lang = '';
    this.continuous = true;
    this.interimResults = false;
    this.aborted = false;
    this.started = false;
    instances.push(this);
  }
  start() { this.started = true; }
  abort() { this.aborted = true; this.started = false; }
  // Test helpers: simulate the browser returning words, then ending by itself.
  // Words accumulate in this.results, exactly like the real API's cumulative list.
  say(...words) {
    this.results = this.results || [];
    this.resultIndex = this.results.length;
    for (const w of words) this.results.push([{ transcript: w }]);
    this.onresult?.({ results: this.results, resultIndex: this.resultIndex });
  }
  autoEnd() { this.started = false; this.onend?.(); }
}

const fakeTrack = { stop() {} };
// Node exposes navigator as a getter, so override the property instead of assigning it.
Object.defineProperty(globalThis, 'navigator', {
  value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [fakeTrack] }) } },
  configurable: true,
});
globalThis.window = { SpeechRecognition: FakeRecognition };
const { createVoiceSession } = await import('../../.voice-test/conversation.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Opens a session and waits for the recognizer to be created (mic priming is async). */
async function openSession(h) {
  h.session.open();
  for (let i = 0; i < 50; i++) {
    await sleep(4);
    const rec = instances.at(-1);
    if (rec && rec.started && !rec.aborted) return rec;
  }
  throw new Error('recognizer never started');
}

function harness() {
  const events = [];
  const run = [];
  const notices = [];
  let asked = null;
  let reply = 'Here is what I found.';
  const session = createVoiceSession({
    countdownMs: 600,
    silenceMs: 20,
    ask: async (text) => { asked = text; return reply; },
    run: (intent) => run.push(intent),
    onState: (state) => events.push(state),
    onNotice: (text) => notices.push(text),
    onError: (message) => notices.push(`error: ${message}`),
  });
  return {
    session, events, run, notices,
    asked: () => asked,
    setReply: (r) => { reply = r; },
    states: () => events.slice(),
  };
}

test('nothing listens until the session is opened', () => {
  const before = instances.length;
  harness();
  assert.equal(instances.length, before, 'constructing a session must not touch the mic');
});

test('opening arms the mic and reports listening', async () => {
  const h = harness();
  const rec = await openSession(h);
  assert.equal(h.session.state(), 'listening');
  assert.ok(rec.started);
  h.session.close();
});

test('a question goes to the backend, then counts down', async () => {
  const h = harness();
  const rec = await openSession(h);
  rec.say('where is the jazz festival');
  await sleep(80);
  assert.equal(h.asked(), 'where is the jazz festival');
  assert.equal(h.session.state(), 'countdown');
  assert.ok(h.notices.some((n) => n.includes('Here is what I found')));
  h.session.close();
});

test('zoom is handled locally and never reaches the backend', async () => {
  const h = harness();
  const rec = await openSession(h);
  rec.say('zoom in');
  await sleep(80);
  assert.deepEqual(h.run.at(-1), { kind: 'zoom', dir: 'in' });
  assert.equal(h.asked(), null);
  assert.equal(h.session.state(), 'countdown');
  h.session.close();
});

test('a leading Pagos is accepted but not required', async () => {
  const h = harness();
  const rec = await openSession(h);
  rec.say('Pagos, move right');
  await sleep(80);
  assert.deepEqual(h.run.at(-1), { kind: 'pan', dir: 'right' });
  h.session.close();
});

test('the browser ending the recognizer does not end the session', async () => {
  const h = harness();
  const rec = await openSession(h);
  rec.autoEnd();
  await sleep(320);
  const live = instances.filter((r) => r.started && !r.aborted);
  assert.ok(live.length >= 1, 'a new recognizer should have been armed');
  assert.equal(h.session.state(), 'listening');
  h.session.close();
});

test('saying end closes the session', async () => {
  const h = harness();
  const rec = await openSession(h);
  rec.say('goodbye');
  await sleep(80);
  assert.equal(h.session.state(), 'closed');
  assert.ok(h.notices.some((n) => /Ending/.test(n)));
});

test('the countdown closes the session when it runs out', async () => {
  const h = harness();
  const rec = await openSession(h);
  rec.say('zoom out');
  await sleep(80);
  assert.equal(h.session.state(), 'countdown');
  await sleep(900);
  assert.equal(h.session.state(), 'closed');
});

test('closing stops the recognizer', async () => {
  const h = harness();
  const rec = await openSession(h);
  h.session.close();
  assert.ok(rec.aborted, 'recognizer must be aborted on close');
  assert.equal(h.session.state(), 'closed');
});

test('cumulative results do not duplicate earlier words', async () => {
  const h = harness();
  const rec = await openSession(h);
  rec.say('where');
  await sleep(5);
  rec.say('is');
  await sleep(5);
  rec.say('tokyo');
  await sleep(80);
  assert.equal(h.asked(), 'where is tokyo');
  h.session.close();
});

test('the countdown does not start until the answer arrives', async () => {
  const states = [];
  let release;
  const answerPending = new Promise((r) => { release = r; });
  const { createVoiceSession } = await import('../../.voice-test/conversation.js');
  const session = createVoiceSession({
    countdownMs: 5000,
    silenceMs: 20,
    ask: async () => { await answerPending; return 'The answer.'; },
    run: () => {},
    onState: (s) => states.push(s),
  });
  session.open();
  instances.at(-1).say('where is the festival');
  await sleep(120);
  // Muse is still thinking: no countdown may have started yet.
  assert.ok(!states.includes('countdown'), `countdown started early: ${states.join(',')}`);
  assert.equal(session.state(), 'thinking');
  release();
  await sleep(120);
  assert.equal(session.state(), 'countdown', 'countdown should begin once the answer lands');
  session.close();
});

test('a slow answer cannot shorten the reply window', async () => {
  const { createVoiceSession } = await import('../../.voice-test/conversation.js');
  let release;
  const pending = new Promise((r) => { release = r; });
  const session = createVoiceSession({
    countdownMs: 400,
    silenceMs: 20,
    ask: async () => { await pending; return 'Slow answer.'; },
    run: () => {},
  });
  session.open();
  instances.at(-1).say('slow question please');
  await sleep(250); // longer than the countdown itself would last
  assert.equal(session.state(), 'thinking', 'must still be waiting on the answer');
  release();
  await sleep(100);
  assert.equal(session.state(), 'countdown', 'the full window opens after the answer');
  session.close();
});
