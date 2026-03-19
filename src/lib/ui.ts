// ANSI color/style helpers — zero dependencies

const isColorSupported =
  process.env.FORCE_COLOR !== '0' &&
  (process.env.FORCE_COLOR !== undefined ||
    (process.stdout.isTTY && process.env.TERM !== 'dumb'));

function wrap(open: string, close: string): (text: string) => string {
  if (!isColorSupported) return (text) => text;
  return (text) => `${open}${text}${close}`;
}

export const bold = wrap('\x1b[1m', '\x1b[22m');
export const dim = wrap('\x1b[2m', '\x1b[22m');
export const italic = wrap('\x1b[3m', '\x1b[23m');
export const cyan = wrap('\x1b[36m', '\x1b[39m');
export const green = wrap('\x1b[32m', '\x1b[39m');
export const yellow = wrap('\x1b[33m', '\x1b[39m');
export const red = wrap('\x1b[31m', '\x1b[39m');
export const magenta = wrap('\x1b[35m', '\x1b[39m');
export const gray = wrap('\x1b[90m', '\x1b[39m');
export const white = wrap('\x1b[97m', '\x1b[39m');
export const bgCyan = wrap('\x1b[46m', '\x1b[49m');
export const bgGreen = wrap('\x1b[42m', '\x1b[49m');

export const symbols = {
  check: isColorSupported ? '\u2714' : 'v',
  cross: isColorSupported ? '\u2718' : 'x',
  bullet: isColorSupported ? '\u25CF' : '*',
  pointer: isColorSupported ? '\u276F' : '>',
  line: isColorSupported ? '\u2500' : '-',
  corner: isColorSupported ? '\u2514' : '\\',
  tee: isColorSupported ? '\u251C' : '|',
  pipe: isColorSupported ? '\u2502' : '|',
  info: isColorSupported ? '\u25C6' : 'i',
  warning: isColorSupported ? '\u25B2' : '!',
  success: isColorSupported ? '\u25C6' : '*',
  radio_on: isColorSupported ? '\u25C9' : '(x)',
  radio_off: isColorSupported ? '\u25EF' : '( )',
};

export function banner(): void {
  const line = gray(symbols.line.repeat(48));
  console.log();
  console.log(`  ${bold(cyan('claude-deps'))}  ${dim('v0.1.0')}`);
  console.log(`  ${line}`);
  console.log(`  ${dim('Dependency manager for Claude Code')}`);
  console.log();
}

export function sectionHeader(title: string, count?: number): void {
  const countStr = count !== undefined ? ` ${dim(`(${count})`)}` : '';
  console.log(`  ${bold(white(title))}${countStr}`);
  console.log();
}

export function success(message: string): void {
  console.log(`  ${green(symbols.check)} ${message}`);
}

export function warning(message: string): void {
  console.log(`  ${yellow(symbols.warning)} ${message}`);
}

export function error(message: string): void {
  console.log(`  ${red(symbols.cross)} ${message}`);
}

export function info(message: string): void {
  console.log(`  ${cyan(symbols.info)} ${message}`);
}

export function listItem(text: string, indent = 2): void {
  const pad = ' '.repeat(indent);
  console.log(`${pad}${dim(symbols.tee)} ${text}`);
}

export function lastItem(text: string, indent = 2): void {
  const pad = ' '.repeat(indent);
  console.log(`${pad}${dim(symbols.corner)} ${text}`);
}

export function pluginLabel(id: string, version: string, source: 'project' | 'user', enabled: boolean): string {
  const name = bold(id.split('@')[0]);
  const marketplace = dim(`@${id.split('@').slice(1).join('@')}`);
  const ver = dim(version.length > 12 ? version.substring(0, 8) + '..' : version);
  const src = source === 'project' ? cyan('project') : yellow('user');
  const status = enabled ? '' : ` ${dim('(disabled)')}`;
  return `${name}${marketplace} ${ver} ${dim('[')}${src}${dim(']')}${status}`;
}

export function hookLabel(event: string, matcher: string, command: string, source: 'project' | 'user'): string {
  const ev = bold(event);
  const m = matcher !== '*' ? ` ${dim(`(${matcher})`)}` : '';
  const src = source === 'project' ? cyan('project') : yellow('user');
  const cmd = dim(command.length > 50 ? command.substring(0, 47) + '...' : command);
  return `${ev}${m} ${dim('[')}${src}${dim(']')} ${cmd}`;
}

export function mcpLabel(name: string, type: string, command: string, source: 'project' | 'user'): string {
  const n = bold(name);
  const t = dim(type);
  const src = source === 'project' ? cyan('project') : yellow('user');
  const cmd = dim(command);
  return `${n} ${t} ${dim('[')}${src}${dim(']')} ${cmd}`;
}

export function divider(): void {
  console.log(`  ${gray(symbols.line.repeat(48))}`);
}

export function nextSteps(steps: string[]): void {
  console.log();
  sectionHeader('Next steps');
  for (let i = 0; i < steps.length; i++) {
    const fn = i === steps.length - 1 ? lastItem : listItem;
    fn(steps[i], 4);
  }
  console.log();
}
