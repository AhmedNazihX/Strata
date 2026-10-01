/** Argument parsing. Flags are `--name` or `--name value`; the rest are positional. */

const VALUED = new Set(['--repo-root', '--out-dir', '--title', '--browser-timeout', '--browsers']);

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) { positional.push(token); continue; }
    if (VALUED.has(token)) { flags[token.slice(2)] = argv[i + 1]; i += 1; continue; }
    const [name, inline] = token.slice(2).split('=');
    flags[name] = inline === undefined ? true : inline;
  }
  return { positional, flags };
}

export const USAGE = `strata — narrated architecture and flow diagrams as standalone HTML

  finalize <candidate.json> [output.html]   validate, lay out, render and gate in one run
  validate <candidate.json>                 schema, references and geometry only
  render   <candidate.json> [output.html]   write the HTML without the browser gate
  check    <output.html>                    run the browser gate against an existing file
  schema   [directory]                      write the five JSON Schema files
  demo     <directory>                      write and render one example of each type
  doctor                                    report what this install can do

Flags
  --repo-root <path>    verify every nodes[].sources entry against a real checkout
  --no-browser          skip the browser gate and say so in the receipt
  --json                machine-readable receipt on stdout
  --quiet               errors only
  --browsers <list>     engines for the browser gate (default chromium,webkit)
  --browser-timeout <ms>  default 20000
`;
