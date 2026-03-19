import { createInterface } from 'readline';

const rl = () =>
  createInterface({
    input: process.stdin,
    output: process.stdout,
  });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const iface = rl();
    iface.question(question, (answer) => {
      iface.close();
      resolve(answer.trim());
    });
  });
}

export interface CheckboxChoice {
  name: string;
  value: string;
  checked?: boolean;
}

export async function checkbox(options: {
  message: string;
  choices: CheckboxChoice[];
}): Promise<string[]> {
  const { message, choices } = options;

  console.log(`\n${message}\n`);
  for (let i = 0; i < choices.length; i++) {
    const c = choices[i];
    const marker = c.checked ? '[x]' : '[ ]';
    console.log(`  ${i + 1}) ${marker} ${c.name}`);
  }

  console.log(
    '\nEnter numbers to toggle (e.g. "1 3 5"), "all" to select all, or press Enter to confirm:',
  );

  const selected = new Set(
    choices.map((c, i) => (c.checked ? i : -1)).filter((i) => i >= 0),
  );

  const input = await ask('> ');

  if (input.toLowerCase() === 'all') {
    return choices.map((c) => c.value);
  }

  if (input === '') {
    return choices
      .filter((_, i) => selected.has(i))
      .map((c) => c.value);
  }

  const toggles = input
    .split(/[\s,]+/)
    .map((s) => parseInt(s, 10) - 1)
    .filter((n) => n >= 0 && n < choices.length);

  for (const idx of toggles) {
    if (selected.has(idx)) {
      selected.delete(idx);
    } else {
      selected.add(idx);
    }
  }

  return choices
    .filter((_, i) => selected.has(i))
    .map((c) => c.value);
}

export async function confirm(options: {
  message: string;
  default?: boolean;
}): Promise<boolean> {
  const defaultHint = options.default !== false ? 'Y/n' : 'y/N';
  const answer = await ask(`${options.message} (${defaultHint}) `);

  if (answer === '') return options.default !== false;
  return answer.toLowerCase().startsWith('y');
}
