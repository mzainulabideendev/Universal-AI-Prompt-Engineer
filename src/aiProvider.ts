import type * as vscode from 'vscode';
import type { PromptMode } from './promptEngine';

export const API_KEY_SECRET = 'universalAIPromptEngineer.apiKey';

const MODE_INSTRUCTIONS: Record<PromptMode, string> = {
  quick: 'Make the request clearer and more specific while keeping it concise. Do not add unnecessary sections.',
  professional: 'Produce a polished, well-structured prompt with appropriate context, scope, deliverables, and success criteria.',
  developer: 'Emphasize implementation details, project conventions, error handling, security where relevant, and focused tests.',
  architect: 'Emphasize requirements, architecture, component boundaries, data flow, trade-offs, scalability, and staged implementation.',
  debugging: 'Emphasize reproduction steps, evidence gathering, root-cause analysis, a minimal fix, and regression verification. Do not assume a cause.',
  'code-review': 'Ask for a review of the provided scope, prioritizing actionable findings by severity across correctness, security, performance, and maintainability. Do not ask the reviewer to implement changes unless requested.',
  uiux: 'Emphasize user goals, layout, responsive behavior, accessibility, interaction states, and consistency with the existing design system.',
  game: 'Emphasize gameplay goals, mechanics, controls, player feedback, assets, performance, and playtesting appropriate to the request.',
  autonomous: 'Structure the request for an autonomous coding agent: inspect the repository, state a concise plan, implement the scoped change, run relevant checks, and report actual results and remaining risks.'
};

export interface ChatCompletionOptions {
  apiKey: string;
  endpoint: string;
  model: string;
  mode: PromptMode;
  prompt: string;
  fetchImpl?: typeof fetch;
}

export function getCompletionUrl(endpoint: string): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('The API endpoint must be a valid HTTPS URL.');
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('The API endpoint must use HTTPS and cannot include credentials, a query, or a fragment.');
  }

  const path = url.pathname.replace(/\/+$/, '');
  if (!path.endsWith('/chat/completions')) {
    url.pathname = `${path}/chat/completions`.replace(/^\/\//, '/');
  }
  return url.toString();
}

export async function requestPromptEnhancement(options: ChatCompletionOptions): Promise<string> {
  const { apiKey, endpoint, model, mode, prompt } = options;
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    throw new Error('Enter a prompt before enhancing it.');
  }
  if (normalizedPrompt.length > 20000) {
    throw new Error('The prompt is too long. Please keep it under 20,000 characters.');
  }
  if (!apiKey.trim()) {
    throw new Error('No API key is configured. Add one in the Prompt Engineer panel or run “AI Prompt Engineer: Set API Key”.');
  }
  if (!model.trim()) {
    throw new Error('Set an AI model in the extension settings before enhancing a prompt.');
  }

  const request = (options.fetchImpl ?? fetch);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await request(getCompletionUrl(endpoint), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model.trim(),
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content: [
              'You are an expert prompt engineer. Improve the user’s request so an AI assistant can execute it accurately.',
              'Preserve the user’s actual intent. Do not invent technologies, requirements, project facts, or results.',
              'When project context is unknown, instruct the downstream assistant to inspect the project before making assumptions.',
              'Keep the result proportionate to the task. Make it clear, actionable, and easy to review.',
              'Return only the enhanced prompt, without commentary about your process.',
              `Mode-specific guidance: ${MODE_INSTRUCTIONS[mode]}`
            ].join('\n')
          },
          { role: 'user', content: normalizedPrompt }
        ]
      }),
      signal: controller.signal
    });

    const responseText = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new Error(`The AI provider returned an invalid response (HTTP ${response.status}).`);
    }

    if (!response.ok) {
      const errorMessage = readProviderError(payload);
      throw new Error(`AI provider request failed (HTTP ${response.status})${errorMessage ? `: ${errorMessage}` : '.'}`);
    }

    const content = readCompletionContent(payload);
    if (!content) {
      throw new Error('The AI provider returned an empty response. Check the selected model and try again.');
    }
    return content;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The AI request timed out after 90 seconds. Try again or choose a faster model.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function enhanceWithConfiguredProvider(
  secrets: vscode.SecretStorage,
  configuration: vscode.WorkspaceConfiguration,
  prompt: string,
  mode: PromptMode,
  fetchImpl?: typeof fetch
): Promise<string> {
  const apiKey = await secrets.get(API_KEY_SECRET);
  return requestPromptEnhancement({
    apiKey: apiKey ?? '',
    endpoint: configuration.get<string>('apiEndpoint', 'https://api.openai.com/v1'),
    model: configuration.get<string>('model', 'gpt-4o-mini'),
    mode,
    prompt,
    fetchImpl
  });
}

function readProviderError(payload: unknown): string {
  if (!isRecord(payload) || !isRecord(payload.error) || typeof payload.error.message !== 'string') {
    return '';
  }
  return payload.error.message.slice(0, 500);
}

function readCompletionContent(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices) || !isRecord(payload.choices[0])) {
    return '';
  }
  const message = payload.choices[0].message;
  if (!isRecord(message) || typeof message.content !== 'string') {
    return '';
  }
  return message.content.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
