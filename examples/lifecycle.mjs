/** Lifecycle: a release, from queued to live or rolled back. */
export default {
  schema_version: 1,
  diagram_type: 'lifecycle',
  meta: {
    title: 'Release lifecycle',
    subtitle: 'Every state a deploy can be in, and what moves it',
    output: 'lifecycle.html',
  },
  nodes: [
    { id: 'queued', kind: 'initial', label: 'queued', sublabel: 'merged to main' },
    { id: 'building', kind: 'active', label: 'building', sublabel: 'image and tests' },
    { id: 'staged', kind: 'waiting', label: 'staged', sublabel: 'awaiting approval' },
    { id: 'canary', kind: 'active', label: 'canary', sublabel: '5% of traffic' },
    { id: 'live', kind: 'terminal', label: 'live', sublabel: 'full rollout' },
    { id: 'rolledback', kind: 'terminal', label: 'rolled back', sublabel: 'previous version restored' },
    { id: 'failed', kind: 'error', label: 'failed', sublabel: 'never reached traffic' },
  ],
  links: [
    { id: 'r1', from: 'queued', to: 'building', variant: 'transition', label: 'runner picks it up' },
    { id: 'r2', from: 'building', to: 'staged', variant: 'transition', label: 'tests green' },
    { id: 'r3', from: 'building', to: 'failed', variant: 'failure', label: 'tests red' },
    { id: 'r4', from: 'staged', to: 'canary', variant: 'transition', label: 'approved' },
    { id: 'r5', from: 'canary', to: 'live', variant: 'transition', label: 'budget held' },
    { id: 'r6', from: 'canary', to: 'rolledback', variant: 'failure', label: 'burned' },
    { id: 'r7', from: 'staged', to: 'failed', variant: 'timeout', label: 'no approval in 24h' },
    { id: 'r8', from: 'failed', to: 'queued', variant: 'retry', label: 'retry' },
  ],
  steps: [
    {
      title: 'Build before anything else',
      lede: 'A merge does not deploy anything; it queues a build. The two outcomes are deliberately asymmetric: green moves forward into a waiting state, red stops dead and is allowed to be retried.',
      nodes: ['queued', 'building', 'staged', 'failed'],
      links: ['r1', 'r2', 'r3'],
      notes: [
        { k: 'queued', v: 'The entry point. Merging is cheap; deploying is not, so they are separate events.' },
        { k: 'failed', v: 'A terminal state that can be re-entered. Nothing reached traffic, so a retry is free.' },
      ],
    },
    {
      title: 'A human has to say yes',
      lede: 'Staged is a waiting state, not a slow one. Nothing is running, nothing is costing anything, and the release will sit here indefinitely until somebody approves it or the clock runs out.',
      nodes: ['building', 'staged', 'canary', 'failed'],
      links: ['r2', 'r4', 'r7'],
      notes: [
        { k: 'staged', v: 'The only place a person is required. Everything else is decided by signals.' },
        { k: 'no approval in 24h', v: 'A stale approval is worse than none, so the release expires rather than lingers.' },
      ],
    },
    {
      title: 'Canary decides, not opinion',
      lede: 'Five per cent of traffic for a bounded window, judged against the error budget rather than against whether anyone thinks it looks fine. Both exits from canary are automatic.',
      nodes: ['staged', 'canary', 'live', 'rolledback'],
      links: ['r4', 'r5', 'r6'],
      notes: [
        { k: 'canary', v: 'Small enough that a bad release hurts few people, large enough to see a real signal.' },
        { k: 'error budget', v: 'The one number that promotes or rolls back. It is agreed before the deploy, not during.' },
      ],
    },
    {
      title: 'Three ways to end',
      lede: 'Live, rolled back, and failed are all terminal, and that is the point: at any moment a release is in exactly one of seven states, and anyone can say which without asking who was watching.',
      nodes: ['live', 'rolledback', 'failed', 'queued', 'canary'],
      links: ['r6', 'r8'],
      notes: [
        { k: 'rolled back', v: 'The previous version is serving. The release is over, and the next one starts from queued.' },
        { k: 'retry', v: 'Only from failed. A rolled-back release needs a new commit, not another attempt.' },
      ],
    },
  ],
};
