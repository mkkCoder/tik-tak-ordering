import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FREE_INDEX_LIMIT,
  buildIndex,
  buildSeatingPdf,
  buildTableSections,
  freeOptions,
  proOptions,
  surnameOf,
} from './index';
import { demoProject } from '@/model/demo';
import { emptyProject } from '@/model/types';

/** Written out so the printed result can be inspected, not just asserted on. */
const OUT_DIR = process.env.TIKTAK_PDF_OUT ?? '/tmp/tiktak-pdf';

async function render(name: string, options: Parameters<typeof buildSeatingPdf>[1]) {
  const project = demoProject();
  const result = await buildSeatingPdf(project, options);
  const bytes = Buffer.from(result.bytes);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/${name}.pdf`, bytes);
  return { ...result, bytes };
}

describe('surnameOf', () => {
  it('takes the last word', () => {
    expect(surnameOf('Ruth Cohen')).toBe('Cohen');
  });

  it('ignores the +N suffix on party members', () => {
    expect(surnameOf('Ruth Cohen +2')).toBe('Cohen');
  });

  it('handles a single-word name', () => {
    expect(surnameOf('Madonna')).toBe('Madonna');
  });

  it('keeps compound surnames intact enough to sort', () => {
    expect(surnameOf('Zohar Ben-Ami')).toBe('Ben-Ami');
  });
});

describe('index', () => {
  const project = demoProject();

  it('lists only seated guests', () => {
    const index = buildIndex(project);
    const seated = project.guests.filter((g) => g.seat).length;
    expect(index).toHaveLength(seated);
  });

  it('sorts by surname', () => {
    const keys = buildIndex(project).map((e) => e.sortKey);
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
  });

  it('gives every entry a table', () => {
    expect(buildIndex(project).every((e) => e.table.length > 0)).toBe(true);
  });

  it('drops a guest whose table was deleted', () => {
    const broken = {
      ...project,
      guests: project.guests.map((g) => ({
        ...g,
        seat: g.seat ? { ...g.seat, tableId: 'gone' } : null,
      })),
    };
    expect(buildIndex(broken)).toHaveLength(0);
  });
});

describe('table sections', () => {
  it('lists each table once, in seat order', () => {
    const project = demoProject();
    const sections = buildTableSections(project);
    expect(sections).toHaveLength(project.tables.length);
    for (const s of sections) {
      const seats = s.guests.map((g) => g.seat);
      expect(seats).toEqual([...seats].sort((a, b) => a - b));
    }
  });

  it('numbers seats from one, not zero', () => {
    const sections = buildTableSections(demoProject());
    const withGuests = sections.find((s) => s.guests.length > 0);
    expect(withGuests?.guests[0]?.seat).toBe(1);
  });
});

describe('generated documents', () => {
  it('produces a multi-page A4 document', async () => {
    const result = await render('pro-a4-portrait', proOptions('a4', 'portrait'));
    expect(result.pages).toBeGreaterThanOrEqual(3);
    expect(result.indexTruncated).toBe(false);
    expect(result.bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('produces Letter and landscape variants', async () => {
    const letter = await render('pro-letter-portrait', proOptions('letter', 'portrait'));
    const landscape = await render('pro-a4-landscape', proOptions('a4', 'landscape'));
    expect(letter.pages).toBeGreaterThanOrEqual(3);
    expect(landscape.pages).toBeGreaterThanOrEqual(3);
  });

  it('truncates the index on the free tier', async () => {
    const free = await render('free-a4-portrait', freeOptions('a4', 'portrait'));
    expect(free.indexTruncated).toBe(true);
    const full = buildIndex(demoProject());
    expect(full.length).toBeGreaterThan(FREE_INDEX_LIMIT);
  });

  it('survives an empty project without throwing', async () => {
    const result = await buildSeatingPdf(emptyProject(), proOptions('a4', 'portrait'));
    expect(result.pages).toBeGreaterThanOrEqual(3);
  });

  it('handles a plan with no seated guests', async () => {
    const project = demoProject();
    const result = await buildSeatingPdf(
      { ...project, guests: project.guests.map((g) => ({ ...g, seat: null })) },
      proOptions('a4', 'portrait'),
    );
    expect(result.indexTruncated).toBe(false);
  });
});
