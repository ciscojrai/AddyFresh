// Run: npm run test:voice   (compiles the parser with tsc, then runs this file)
// The test imports the real compiled module, so it proves the shipped parser.
import assert from 'node:assert/strict';
import test from 'node:test';
import { hasWake, stripWake, parseIntent, listenForIntent, confirmIntent } from '../../.voice-test/intents.js';

test('wake phrase is recognized with and without a greeting', () => {
  assert.ok(hasWake('hey pagos'));
  assert.ok(hasWake('Hey Pagos, zoom in'));
  assert.ok(hasWake('Pagos'));
  assert.ok(!hasWake('the pagoda is tall'));
  assert.ok(!hasWake(''));
});

test('stripWake removes the name and keeps the command', () => {
  assert.equal(stripWake('Hey Pagos, zoom in'), 'zoom in');
  assert.equal(stripWake('Pagos go to tokyo'), 'go to tokyo');
  assert.equal(stripWake('Hey Pagos'), '');
  assert.equal(stripWake('zoom in'), null);
});

test('filler words before the wake phrase are tolerated', () => {
  assert.equal(stripWake('um, so hey pagos zoom in'), 'zoom in');
});

test('an utterance without the wake word is ignored', () => {
  const r = listenForIntent('zoom in');
  assert.equal(r.woke, false);
  assert.equal(r.intent, null);
});

test('zoom in and out', () => {
  assert.deepEqual(parseIntent('zoom in'), { kind: 'zoom', dir: 'in' });
  assert.deepEqual(parseIntent('closer'), { kind: 'zoom', dir: 'in' });
  assert.deepEqual(parseIntent('zoom out'), { kind: 'zoom', dir: 'out' });
  assert.deepEqual(parseIntent('farther out'), { kind: 'zoom', dir: 'out' });
});

test('left and right map to panning', () => {
  assert.deepEqual(parseIntent('left'), { kind: 'pan', dir: 'left' });
  assert.deepEqual(parseIntent('go right'), { kind: 'pan', dir: 'right' });
});

test('"right now" is not a pan command', () => {
  assert.equal(parseIntent('take me to tokyo right now').kind, 'ask');
});

test('end phrases close the conversation', () => {
  for (const phrase of ['end', 'stop', 'goodbye', 'hang up', 'never mind']) {
    assert.equal(parseIntent(phrase).kind, 'end', phrase);
  }
});

test('a command that merely contains a stop word is not an end', () => {
  assert.notEqual(parseIntent('stop the rain radar').kind, 'end');
  assert.notEqual(parseIntent('where does the festival end tonight').kind, 'end');
});

test('everything else is a question for the assistant', () => {
  const r = parseIntent('where is the jazz festival this weekend');
  assert.equal(r.kind, 'ask');
  assert.equal(r.text, 'where is the jazz festival this weekend');
});

test('confirmations exist for local intents only', () => {
  assert.equal(confirmIntent({ kind: 'ask', text: 'hi' }), null);
  assert.match(confirmIntent({ kind: 'zoom', dir: 'in' }), /Zooming in/);
  assert.match(confirmIntent({ kind: 'pan', dir: 'left' }), /left/i);
  assert.match(confirmIntent({ kind: 'end' }), /Ending/);
});
