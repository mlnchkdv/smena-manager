// Moderated first-use session. Output contains only durations and enumerated outcomes.
import { createInterface } from 'node:readline/promises';
import { performance } from 'node:perf_hooks';
import { stdin, stdout, stderr } from 'node:process';

const ru = process.argv.includes('--ru');
const words = (en, russian) => (ru ? russian : en);
const steps = [
  ['access', words('Accept access and enter the workspace', 'Принять приглашение и войти в пространство')],
  ['project', words('Find your assigned project', 'Найти свой проект')],
  ['first-result', words('Complete a task or save a material', 'Завершить задачу или сохранить материал')],
];
const reasons = ['access', 'navigation', 'unclear-action', 'technical', 'other'];
const prompt = createInterface({ input: stdin, output: stderr });
const stages = [];
try {
  await prompt.question(words('Press Enter when the participant is ready. ', 'Нажмите Enter, когда участник будет готов. '));
  for (const [stage, label] of steps) {
    const start = performance.now();
    let outcome;
    do {
      const answer = (
        await prompt.question(
          label +
            words(' — Enter when done, or 1–5 for a blocker: ', ' — Enter по завершении или 1–5 при затруднении: ') +
            reasons.map((v, i) => i + 1 + '=' + v).join(', ') +
            ' ',
        )
      ).trim();
      outcome = answer === '' ? 'completed' : /^[1-5]$/u.test(answer) ? reasons[Number(answer) - 1] : undefined;
    } while (!outcome);
    stages.push({ stage, seconds: Math.round((performance.now() - start) / 1000), outcome });
    if (outcome !== 'completed') break;
  }
  stdout.write(JSON.stringify({ schema: 1, locale: ru ? 'ru' : 'en', stages }) + '\n');
} finally {
  prompt.close();
}
