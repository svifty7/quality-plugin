#!/usr/bin/env node
import { runCli } from './scan.ts';

process.exitCode = await runCli(process.argv.slice(2));
