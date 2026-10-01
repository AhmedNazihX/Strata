/** Receipt formatting. A gate is passed, failed or skipped — never implied. */

const TICK = '✓';
const CROSS = '✗';
const DASH = '–';

export function createReceipt(input) {
  return { input, gates: {}, output: null, warnings: [], ok: false };
}

export function recordGate(receipt, name, status, detail = {}) {
  receipt.gates[name] = { status, ...detail };
  return receipt;
}

export function finish(receipt) {
  const statuses = Object.values(receipt.gates).map((g) => g.status);
  receipt.ok = statuses.length > 0 && statuses.every((s) => s === 'passed' || s === 'skipped');
  return receipt;
}

export function printReceipt(receipt, flags = {}) {
  if (flags.json) {
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    return;
  }
  if (flags.quiet && receipt.ok) return;

  const lines = [];
  for (const [name, gate] of Object.entries(receipt.gates)) {
    const mark = gate.status === 'passed' ? TICK : gate.status === 'skipped' ? DASH : CROSS;
    lines.push(`${mark} ${name}${gate.note ? ` ${DASH} ${gate.note}` : ''}`);
    for (const issue of gate.issues || []) lines.push(`    ! ${issue}`);
  }
  for (const warning of receipt.warnings) lines.push(`  ~ ${warning}`);
  if (receipt.output) lines.push(`\n  ${receipt.output}`);
  process.stdout.write(`${lines.join('\n')}\n`);
}
