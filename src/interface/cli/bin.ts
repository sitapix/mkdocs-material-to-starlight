#!/usr/bin/env node
/**
 * Installable CLI entry point.
 *
 * This file is the npm `bin` target. It wires the real `process.argv` and
 * `process.stdout` / `process.stderr` into `runCli`, then exits with the
 * returned code. Keep it thin — the entire CLI logic lives in `main.ts` so it
 * stays testable without spawning subprocesses.
 */

import { runCli } from './main.js';

const exitCode = await runCli(process.argv.slice(2), {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
});
process.exit(exitCode);
