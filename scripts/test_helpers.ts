import { formatHashrate, convertHashrate } from '../utils/helpers';

const cases: Array<[any, boolean?]> = [
  [0, true],
  ['0', true],
  [BigInt(0), true],
  [0.5, true],
  ['0.5', true],
  ['0.5', false],
  ['0.0001', true],
  ['1', true],
  [1234, true],
  ['1k', true],
  ['1.5M', true],
];

console.log('formatHashrate edge case outputs:');
for (const [input, flag] of cases) {
  try {
    const out = formatHashrate(input as any, Boolean(flag));
    console.log(JSON.stringify(input), '->', out);
  } catch (err) {
    console.error('error for', input, err);
  }
}

console.log('\nconvertHashrate outputs:');
for (const input of ['0', '1', '1k', '1.5M', '0.5']) {
  try {
    console.log(input, '->', convertHashrate(input).toString());
  } catch (err) {
    console.error('convertHashrate error for', input, err);
  }
}
