/** Workflow: an incident from the first page to the write-up. */
export default {
  schema_version: 1,
  diagram_type: 'workflow',
  meta: {
    title: 'Incident response',
    subtitle: 'From the first alert to the write-up',
    output: 'workflow.html',
  },
  nodes: [
    { id: 'alert', kind: 'start', label: 'Alert fires', sublabel: 'monitor or a report' },
    { id: 'triage', kind: 'action', label: 'Triage', sublabel: 'is it real, how bad' },
    { id: 'sev', kind: 'gate', label: 'Severity?', sublabel: 'customer impact' },
    { id: 'page', kind: 'action', label: 'Page the on-call', sublabel: 'and open a channel' },
    { id: 'ticket', kind: 'action', label: 'File a ticket', sublabel: 'next business day' },
    { id: 'mitigate', kind: 'action', label: 'Mitigate', sublabel: 'stop the bleeding' },
    { id: 'verify', kind: 'gate', label: 'Recovered?', sublabel: 'signals back to normal' },
    { id: 'monitor', kind: 'wait', label: 'Watch', sublabel: 'one full cycle' },
    { id: 'review', kind: 'action', label: 'Write it up', sublabel: 'blameless review' },
    { id: 'closed', kind: 'end', label: 'Closed' },
  ],
  links: [
    { id: 'w1', from: 'alert', to: 'triage' },
    { id: 'w2', from: 'triage', to: 'sev' },
    { id: 'w3', from: 'sev', to: 'page', variant: 'yes', label: 'high' },
    { id: 'w4', from: 'sev', to: 'ticket', variant: 'no', label: 'low' },
    { id: 'w5', from: 'page', to: 'mitigate' },
    { id: 'w6', from: 'mitigate', to: 'verify' },
    { id: 'w7', from: 'verify', to: 'monitor', variant: 'yes', label: 'ok' },
    { id: 'w8', from: 'verify', to: 'mitigate', variant: 'retry', label: 'no' },
    { id: 'w9', from: 'monitor', to: 'review' },
    { id: 'w10', from: 'ticket', to: 'review' },
    { id: 'w11', from: 'review', to: 'closed' },
  ],
  steps: [
    {
      title: 'Decide before you act',
      lede: 'The first question is not how to fix it but how bad it is, because that is what decides who gets woken up. Triage is a separate step so that decision is made deliberately rather than by whoever happened to see the alert.',
      nodes: ['alert', 'triage', 'sev'],
      links: ['w1', 'w2'],
      notes: [
        { k: 'Triage', v: 'Confirms the alert is real and estimates customer impact before anyone is paged.' },
        { k: 'Severity?', v: 'The only branch that matters. Everything downstream follows from this answer.' },
      ],
    },
    {
      title: 'Two very different paths',
      lede: 'A severe incident pages a human and opens a channel. A minor one becomes a ticket and waits for business hours. Treating both the same is how teams burn out, so the gate makes the choice explicit.',
      nodes: ['sev', 'page', 'ticket'],
      links: ['w3', 'w4'],
      notes: [
        { k: 'Page the on-call', v: 'Wakes someone. Reserved for the cases where waiting actually costs something.' },
        { k: 'File a ticket', v: 'The same work, scheduled rather than interrupt-driven.' },
      ],
    },
    {
      title: 'Mitigate, then verify',
      lede: 'Stopping the bleeding is not the same as fixing the cause, and the loop back exists because the first attempt often does not work. Nothing is declared recovered until the signals say so.',
      nodes: ['page', 'mitigate', 'verify', 'monitor'],
      links: ['w5', 'w6', 'w7', 'w8'],
      notes: [
        { k: 'Mitigate', v: 'Roll back, fail over, shed load. The cause can wait; the impact cannot.' },
        { k: 'Recovered?', v: 'Judged on the monitors that fired, not on the belief that the fix worked.' },
        { k: 'Watch', v: 'One full traffic cycle before closing, so a daily pattern cannot hide a relapse.' },
      ],
    },
    {
      title: 'Both paths end in writing',
      lede: 'The ticket and the page converge on the same review, because the point of the write-up is the next incident rather than this one. A severity-three that repeats weekly is more expensive than one bad night.',
      nodes: ['monitor', 'ticket', 'review', 'closed'],
      links: ['w9', 'w10', 'w11'],
      notes: [
        { k: 'Write it up', v: 'Blameless, and mandatory for both branches. The cheap incidents teach the most.' },
        { k: 'Closed', v: 'Closed means written up and actioned, not merely recovered.' },
      ],
    },
  ],
};
