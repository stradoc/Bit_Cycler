import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPANIES, companyOf } from '../game/src/data/companies.ts';
import { formatCount } from '../game/src/format.ts';
import { generateProgram, KINDS } from '../game/src/sim/generator.ts';

// The five companies the jobs come from (data/companies.ts): every kind of
// job belongs to one, and each has a logo drawn in plain ASCII.

const SEEDS = Array.from({ length: 600 }, (_, i) => i * 7919 + 1);
/** The unrolled kinds are the same job as their plain ones, for the same company (sim/generator.ts CLIENTS_OF). */
const SAME_AS: Readonly<Record<string, string>> = { 'UNROLLED SUM': 'SUM', 'UNROLLED CHECKSUM': 'CHECKSUM' };

test('every kind of job belongs to exactly one company', () => {
  assert.equal(COMPANIES.length, 5);
  for (const kind of KINDS) {
    const owners = COMPANIES.filter((company) => company.jobs[SAME_AS[kind] ?? kind]);
    assert.equal(owners.length, 1, `${kind}: ${owners.map((company) => company.name).join(', ') || 'no company'}`);
  }
  for (const company of COMPANIES) for (const kind of Object.keys(company.jobs)) assert.ok(KINDS.includes(kind), `${company.name} has an unknown kind ${kind}`);
});

test('logos are badges of plain ASCII, 3 to 7 lines and at most 21 wide', () => {
  for (const company of COMPANIES) {
    assert.ok(company.logo.length >= 3 && company.logo.length <= 7, company.name);
    for (const line of company.logo) {
      assert.match(line, /^[\x20-\x7e]*$/, `${company.name}: "${line}"`);
      assert.ok(line.length <= 21, `${company.name}: "${line}"`);
      assert.equal(line, line.trimEnd(), `${company.name}: trailing spaces`);
    }
  }
  const logo = (id: string) => COMPANIES.find((company) => company.id === id)?.logo ?? [];
  assert.equal(logo('cobalt')[3], '<= CS =>');
  assert.equal(logo('wingtip')[1], '\\ \\___| [:::] |___/ /');
  assert.equal(logo('innercore')[1], '(    innercore    `');
});

test('a company is found by its name; the tutorial job has none', () => {
  for (const company of COMPANIES) assert.equal(companyOf(company.name), company);
  assert.equal(companyOf('CORNER BAKERY'), undefined);
  assert.equal(companyOf(undefined), undefined);
  for (const company of COMPANIES) {
    assert.ok(company.short.length <= 9, company.short);
    assert.ok(company.name.length <= 21, company.name);
  }
});

test('every job line fits beside the logo, at every width', () => {
  for (const seed of SEEDS) {
    for (const bits of [8, 16, 32, 64] as const) {
      const spec = generateProgram(seed, undefined, bits);
      const line = `${spec.verb} ${formatCount(9.99e14)} ${spec.unit}`;
      assert.ok(line.length <= 70, `${spec.name}: "${line}"`);
    }
  }
});
