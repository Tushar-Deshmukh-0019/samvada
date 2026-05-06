#!/usr/bin/env node
/**
 * Waits a moment for both servers to start, then prints the access URLs.
 * Called by the root `npm run dev` script via concurrently's --on-start hook.
 */

const FRONTEND_PORT = 5173;
const BACKEND_PORT  = 3000;

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const CYAN   = '\x1b[36m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const DIM    = '\x1b[2m';

function box(lines) {
  const width = Math.max(...lines.map(l => stripAnsi(l).length)) + 4;
  const hr = '─'.repeat(width - 2);
  console.log(`\n╭${hr}╮`);
  for (const line of lines) {
    const pad = width - 2 - stripAnsi(line).length;
    console.log(`│ ${line}${' '.repeat(pad)} │`);
  }
  console.log(`╰${hr}╯\n`);
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// Give servers ~6 seconds to boot before printing
setTimeout(() => {
  box([
    `${BOLD}${GREEN}  Samvada is running${RESET}`,
    ``,
    `${DIM}  Frontend${RESET}`,
    `  ${CYAN}${BOLD}Citizen  ${RESET}  ${YELLOW}http://localhost:${FRONTEND_PORT}/${RESET}`,
    `  ${CYAN}${BOLD}Agent    ${RESET}  ${YELLOW}http://localhost:${FRONTEND_PORT}/agent${RESET}`,
    ``,
    `${DIM}  Backend${RESET}`,
    `  ${MAGENTA}${BOLD}API/WS   ${RESET}  ${YELLOW}http://localhost:${BACKEND_PORT}/${RESET}`,
  ]);
}, 3000);
