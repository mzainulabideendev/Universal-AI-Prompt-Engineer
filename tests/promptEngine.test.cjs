const assert = require('node:assert/strict');
const test = require('node:test');
const { PromptModes } = require('../dist/promptEngine');

test('exposes nine unique enhancement modes', () => {
  const ids = PromptModes.getAll();
  assert.equal(ids.length, 9);
  assert.equal(new Set(ids).size, 9);
  assert.deepEqual(ids, [
    'quick',
    'professional',
    'developer',
    'architect',
    'debugging',
    'code-review',
    'uiux',
    'game',
    'autonomous'
  ]);
});

test('every mode has user-facing metadata', () => {
  for (const mode of PromptModes.all) {
    assert.ok(mode.label.length > 0, `${mode.id} needs a label`);
    assert.ok(mode.description.length > 0, `${mode.id} needs a description`);
    assert.ok(mode.icon.length > 0, `${mode.id} needs an icon`);
    assert.ok(mode.tooltip.length > 0, `${mode.id} needs a tooltip`);
    assert.equal(PromptModes.labels[mode.id], mode.label);
  }
});

test('get() returns the requested mode and falls back to professional', () => {
  assert.equal(PromptModes.get('debugging').id, 'debugging');
  assert.equal(PromptModes.get('code-review').id, 'code-review');
  assert.equal(PromptModes.get('unknown-mode').id, 'professional');
});
