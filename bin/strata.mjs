#!/usr/bin/env node
import { parseArgs, USAGE } from '../src/cli/args.mjs';
import * as commands from '../src/cli/commands.mjs';

const COMMANDS = {
  finalize: commands.finalize,
  validate: commands.validate,
  render: commands.render,
  check: commands.check,
  schema: commands.schema,
  demo: commands.demo,
  doctor: commands.doctor,
};

async function main() {
  const [name, ...rest] = process.argv.slice(2);
  if (!name || name === '--help' || name === '-h') {
    process.stdout.write(USAGE);
    return 0;
  }
  const command = COMMANDS[name];
  if (!command) {
    process.stderr.write(`unknown command "${name}"\n\n${USAGE}`);
    return 2;
  }
  const { positional, flags } = parseArgs(rest);
  if (!positional.length && !['doctor', 'schema', 'demo'].includes(name)) {
    process.stderr.write(`${name} needs a file argument\n\n${USAGE}`);
    return 2;
  }
  return command(positional, flags);
}

main()
  .then((code) => { process.exitCode = code ?? 0; })
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
