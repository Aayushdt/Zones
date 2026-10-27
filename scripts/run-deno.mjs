#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const check = spawnSync('deno', ['--version'], { stdio: 'ignore' })
if (check.error || check.status !== 0) {
  console.error('\x1b[31m[xzones:preflight] Error: Deno runtime is required for this command but was not found on PATH.\x1b[0m')
  console.error('\nTo install Deno (>= v2.9.x):')
  console.error('  Linux / macOS: curl -fsSL https://deno.land/install.sh | sh')
  console.error('  Windows:       irm https://deno.land/install.ps1 | iex')
  console.error('\nAfter installation, ensure ~/.deno/bin (or your installation directory) is in your PATH.')
  console.error('Reference: https://docs.deno.com/runtime/getting_started/installation/\n')
  process.exit(1)
}

const args = process.argv.slice(2)
const res = spawnSync('deno', args, { stdio: 'inherit' })
process.exit(res.status ?? 1)
