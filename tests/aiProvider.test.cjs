const assert = require('node:assert/strict');
const test = require('node:test');
const { getCompletionUrl, requestPromptEnhancement } = require('../dist/aiProvider');

test('builds a chat completions URL from a provider base URL', () => {
  assert.equal(getCompletionUrl('https://api.example.com/v1/'), 'https://api.example.com/v1/chat/completions');
});

test('requires HTTPS and rejects URLs containing credentials', () => {
  assert.throws(() => getCompletionUrl('http://api.example.com/v1'), /must use HTTPS/);
  assert.throws(() => getCompletionUrl('https://user:pass@api.example.com/v1'), /must use HTTPS/);
});

test('sends the prompt and selected mode to the configured model and returns its completion', async () => {
  let url;
  let request;
  const output = await requestPromptEnhancement({
    apiKey: 'test-secret',
    endpoint: 'https://api.example.com/v1',
    model: 'test-model',
    mode: 'debugging',
    prompt: 'The application crashes when I save.',
    fetchImpl: async (target, options) => {
      url = target;
      request = options;
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Reproduce the save crash, investigate the root cause, and verify a focused fix.' } }]
      }), { status: 200 });
    }
  });

  assert.equal(url, 'https://api.example.com/v1/chat/completions');
  assert.equal(request.headers.Authorization, 'Bearer test-secret');
  const body = JSON.parse(request.body);
  assert.equal(body.model, 'test-model');
  assert.match(body.messages[0].content, /root-cause analysis/);
  assert.equal(body.messages[1].content, 'The application crashes when I save.');
  assert.match(output, /Reproduce the save crash/);
});

test('surfaces provider errors without returning a success-shaped fallback', async () => {
  await assert.rejects(
    requestPromptEnhancement({
      apiKey: 'test-secret',
      endpoint: 'https://api.example.com/v1',
      model: 'test-model',
      mode: 'professional',
      prompt: 'Add a login page.',
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'Invalid model' } }), { status: 400 })
    }),
    /HTTP 400\): Invalid model/
  );
});

test('does not call the provider when the prompt or key is missing', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return new Response('{}', { status: 200 });
  };

  await assert.rejects(
    requestPromptEnhancement({
      apiKey: 'test-secret',
      endpoint: 'https://api.example.com/v1',
      model: 'test-model',
      mode: 'quick',
      prompt: '   ',
      fetchImpl
    }),
    /Enter a prompt/
  );

  await assert.rejects(
    requestPromptEnhancement({
      apiKey: '',
      endpoint: 'https://api.example.com/v1',
      model: 'test-model',
      mode: 'quick',
      prompt: 'Add a health check endpoint.',
      fetchImpl
    }),
    /No API key is configured/
  );

  assert.equal(called, false);
});

test('rejects prompts above the 20,000 character limit', async () => {
  await assert.rejects(
    requestPromptEnhancement({
      apiKey: 'test-secret',
      endpoint: 'https://api.example.com/v1',
      model: 'test-model',
      mode: 'professional',
      prompt: 'a'.repeat(20001),
      fetchImpl: async () => new Response('{}', { status: 200 })
    }),
    /too long/
  );
});

test('includes the selected mode instructions in the system prompt', async () => {
  let body;
  await requestPromptEnhancement({
    apiKey: 'test-secret',
    endpoint: 'https://api.example.com/v1',
    model: 'test-model',
    mode: 'autonomous',
    prompt: 'Ship the feature.',
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
    }
  });

  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /autonomous coding agent/);
  assert.equal(body.temperature, 0.4);
});

test('reports an empty completion instead of returning blank text', async () => {
  await assert.rejects(
    requestPromptEnhancement({
      apiKey: 'test-secret',
      endpoint: 'https://api.example.com/v1',
      model: 'test-model',
      mode: 'professional',
      prompt: 'Add a login page.',
      fetchImpl: async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })
    }),
    /empty response/
  );
});
