import { bold, cyan, dim, green, symbols } from './ui.js';

export interface CheckboxChoice {
  name: string;
  value: string;
  checked?: boolean;
}

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const CLEAR_LINE = '\x1b[2K';
const MOVE_UP = (n: number) => `\x1b[${n}A`;

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export async function checkbox(options: {
  message: string;
  choices: CheckboxChoice[];
}): Promise<string[]> {
  const { message, choices } = options;

  if (!isInteractive()) {
    return fallbackCheckbox(options);
  }

  return new Promise((resolve) => {
    let cursor = 0;
    const selected = new Set(
      choices.map((c, i) => (c.checked ? i : -1)).filter((i) => i >= 0),
    );

    const render = (first = false) => {
      // Move cursor up to overwrite previous render
      if (!first) {
        process.stdout.write(MOVE_UP(choices.length + 2));
      }

      // Header
      process.stdout.write(`${CLEAR_LINE}  ${cyan(symbols.info)} ${bold(message)}\n`);
      process.stdout.write(
        `${CLEAR_LINE}  ${dim(`  ${symbols.pointer} arrows to move, space to toggle, a to toggle all, enter to confirm`)}\n`,
      );

      // Choices
      for (let i = 0; i < choices.length; i++) {
        const isActive = i === cursor;
        const isSelected = selected.has(i);

        const pointer = isActive ? cyan(symbols.pointer) : ' ';
        const check = isSelected
          ? green(symbols.check)
          : dim(symbols.radio_off);
        const label = isActive ? choices[i].name : dim(choices[i].name);

        process.stdout.write(`${CLEAR_LINE}  ${pointer} ${check} ${label}\n`);
      }
    };

    process.stdout.write(HIDE_CURSOR);
    render(true);

    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf-8');

    const onKey = (key: string) => {
      // Ctrl+C
      if (key === '\x03') {
        cleanup();
        process.stdout.write(SHOW_CURSOR);
        process.exit(0);
      }

      // Enter
      if (key === '\r' || key === '\n') {
        cleanup();
        process.stdout.write(SHOW_CURSOR);

        const result = choices
          .filter((_, i) => selected.has(i))
          .map((c) => c.value);

        // Show summary
        const count = result.length;
        process.stdout.write(MOVE_UP(choices.length + 2));
        process.stdout.write(`${CLEAR_LINE}  ${green(symbols.check)} ${bold(message)} ${dim(`(${count} selected)`)}\n`);
        for (let i = 0; i < choices.length + 1; i++) {
          process.stdout.write(`${CLEAR_LINE}\n`);
        }
        // Move back up to clear blank lines
        process.stdout.write(MOVE_UP(choices.length + 1));

        resolve(result);
        return;
      }

      // Space — toggle
      if (key === ' ') {
        if (selected.has(cursor)) {
          selected.delete(cursor);
        } else {
          selected.add(cursor);
        }
        render();
        return;
      }

      // 'a' — toggle all
      if (key === 'a') {
        const allSelected = selected.size === choices.length;
        if (allSelected) {
          selected.clear();
        } else {
          for (let i = 0; i < choices.length; i++) {
            selected.add(i);
          }
        }
        render();
        return;
      }

      // Arrow up / k
      if (key === '\x1b[A' || key === 'k') {
        cursor = cursor > 0 ? cursor - 1 : choices.length - 1;
        render();
        return;
      }

      // Arrow down / j
      if (key === '\x1b[B' || key === 'j') {
        cursor = cursor < choices.length - 1 ? cursor + 1 : 0;
        render();
        return;
      }
    };

    const cleanup = () => {
      stdin.removeListener('data', onKey);
      stdin.setRawMode(false);
      stdin.pause();
    };

    stdin.on('data', onKey);
  });
}

export async function confirm(options: {
  message: string;
  default?: boolean;
}): Promise<boolean> {
  if (!isInteractive()) {
    return options.default !== false;
  }

  return new Promise((resolve) => {
    const defaultVal = options.default !== false;
    const hint = defaultVal
      ? `${bold('Y')}${dim('/')}${dim('n')}`
      : `${dim('y')}${dim('/')}${bold('N')}`;

    process.stdout.write(`  ${cyan(symbols.info)} ${bold(options.message)} ${hint} `);

    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf-8');

    const onKey = (key: string) => {
      stdin.removeListener('data', onKey);
      stdin.setRawMode(false);
      stdin.pause();

      if (key === '\x03') {
        process.stdout.write('\n' + SHOW_CURSOR);
        process.exit(0);
      }

      let result: boolean;
      if (key === '\r' || key === '\n') {
        result = defaultVal;
      } else {
        result = key.toLowerCase() === 'y';
      }

      const label = result ? green('Yes') : dim('No');
      process.stdout.write(`${label}\n`);
      resolve(result);
    };

    stdin.on('data', onKey);
  });
}

// Fallback for non-interactive (piped) environments
async function fallbackCheckbox(options: {
  message: string;
  choices: CheckboxChoice[];
}): Promise<string[]> {
  return options.choices.filter((c) => c.checked).map((c) => c.value);
}
