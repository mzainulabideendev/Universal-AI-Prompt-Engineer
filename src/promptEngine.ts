export type PromptMode =
  | 'quick'
  | 'professional'
  | 'developer'
  | 'architect'
  | 'debugging'
  | 'code-review'
  | 'uiux'
  | 'game'
  | 'autonomous';

export interface PromptModeInfo {
  readonly id: PromptMode;
  /** Short label shown in the sidebar and in the panel mode picker. */
  readonly label: string;
  /** One-line explanation shown as the sidebar description and panel hint. */
  readonly description: string;
  /** Codicon id (without the `$(...)` wrapper) used for the sidebar tree item. */
  readonly icon: string;
  /** Extra detail shown as the tree item tooltip. */
  readonly tooltip: string;
}

const MODES: PromptModeInfo[] = [
  {
    id: 'quick',
    label: 'Quick Enhance',
    description: 'Fast cleanup',
    icon: 'zap',
    tooltip: 'Quick Enhance — tighten the wording and make the request specific without adding structure.'
  },
  {
    id: 'professional',
    label: 'Professional Enhance',
    description: 'Structured prompt',
    icon: 'star-full',
    tooltip: 'Professional Enhance — context, scope, deliverables and success criteria.'
  },
  {
    id: 'developer',
    label: 'Developer Mode',
    description: 'Implementation',
    icon: 'code',
    tooltip: 'Developer Mode — conventions, error handling, security and focused tests.'
  },
  {
    id: 'architect',
    label: 'Expert Architect',
    description: 'System design',
    icon: 'circuit-board',
    tooltip: 'Expert Architect — requirements, boundaries, data flow, trade-offs and staged delivery.'
  },
  {
    id: 'debugging',
    label: 'Debugging Mode',
    description: 'Root cause',
    icon: 'bug',
    tooltip: 'Debugging Mode — reproduction, evidence, root-cause analysis and a verified minimal fix.'
  },
  {
    id: 'code-review',
    label: 'Code Review Mode',
    description: 'Findings',
    icon: 'eye',
    tooltip: 'Code Review Mode — prioritised, actionable findings without unsolicited rewrites.'
  },
  {
    id: 'uiux',
    label: 'UI/UX Mode',
    description: 'Interfaces',
    icon: 'paintcan',
    tooltip: 'UI/UX Mode — user goals, layout, responsive behaviour, accessibility and interaction states.'
  },
  {
    id: 'game',
    label: 'Game Development Mode',
    description: 'Gameplay',
    icon: 'rocket',
    tooltip: 'Game Development Mode — mechanics, controls, feedback, assets, performance and playtesting.'
  },
  {
    id: 'autonomous',
    label: 'Autonomous Agent Mode',
    description: 'Agent-ready',
    icon: 'hubot',
    tooltip: 'Autonomous Agent Mode — inspect, plan, implement, verify and report actual results.'
  }
];

export class PromptModes {
  public static readonly all: readonly PromptModeInfo[] = MODES;

  public static readonly labels: Record<PromptMode, string> = MODES.reduce((labels, mode) => {
    labels[mode.id] = mode.label;
    return labels;
  }, {} as Record<PromptMode, string>);

  public static get(id: PromptMode): PromptModeInfo {
    return MODES.find((mode) => mode.id === id) ?? MODES[1];
  }

  public static getAll(): PromptMode[] {
    return MODES.map((mode) => mode.id);
  }
}
