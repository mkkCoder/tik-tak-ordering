import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AVERY_5302, A4_FLAT, buildCards, buildCardsPdf, customSheet, fitText } from './cards';
import { demoProject } from '@/model/demo';
import { emptyProject } from '@/model/types';

const OUT_DIR = process.env.TIKTAK_PDF_OUT ?? '/tmp/tiktak-pdf';

async function render(name: string, ...args: Parameters<typeof buildCardsPdf>) {
  const result = await buildCardsPdf(...args);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/${name}.pdf`, Buffer.from(result.bytes));
  return result;
}

describe('sheet geometry', () => {
  it('matches Avery 5302 to the millimetre', () => {
    // 3.5in × 2in folded, on a Letter sheet.
    expect(AVERY_5302.card.width).toBeCloseTo(88.9, 3);
    expect(AVERY_5302.card.height).toBeCloseTo(50.8, 3);
    expect(AVERY_5302.page.width).toBeCloseTo(215.9, 3);
    expect(AVERY_5302.page.height).toBeCloseTo(279.4, 3);
  });

  it('keeps every Avery slot inside the page', () => {
    const slotHeight = AVERY_5302.card.height * 2;
    const usedHeight = AVERY_5302.margin.top + AVERY_5302.rows * slotHeight;
    const usedWidth = AVERY_5302.margin.left + AVERY_5302.columns * AVERY_5302.card.width;
    expect(usedHeight).toBeLessThanOrEqual(AVERY_5302.page.height);
    expect(usedWidth).toBeLessThanOrEqual(AVERY_5302.page.width);
  });

  it('centres a custom sheet and keeps it on the page', () => {
    const sheet = customSheet({
      cardWidth: 80,
      cardHeight: 45,
      columns: 2,
      rows: 3,
      fold: false,
      page: 'a4',
    });
    expect(sheet.margin.left).toBeCloseTo((210 - 160) / 2, 6);
    expect(sheet.margin.top + 3 * 45).toBeLessThanOrEqual(297);
  });

  it('doubles the slot height when the card folds', () => {
    const folded = customSheet({
      cardWidth: 80,
      cardHeight: 45,
      columns: 1,
      rows: 2,
      fold: true,
      page: 'a4',
    });
    expect(folded.margin.top + 2 * 90).toBeLessThanOrEqual(297);
  });
});

describe('card ordering', () => {
  const project = demoProject();

  it('escort cards are alphabetical by surname', () => {
    const cards = buildCards(project, 'escort');
    const keys = cards.map((c) => c.name.split(' ').pop() ?? '');
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
  });

  it('place cards are grouped by table, in seat order', () => {
    const cards = buildCards(project, 'place');
    const seen: string[] = [];
    for (const card of cards) {
      if (seen[seen.length - 1] !== card.table) seen.push(card.table);
    }
    // Each table appears exactly once in the run — never interleaved.
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('only includes seated guests', () => {
    const seated = project.guests.filter((g) => g.seat).length;
    expect(buildCards(project, 'place')).toHaveLength(seated);
  });

  it('produces nothing for an empty project', () => {
    expect(buildCards(emptyProject(), 'place')).toHaveLength(0);
  });
});

describe('generated card sheets', () => {
  it('fills whole Avery sheets and starts a new page when full', async () => {
    const project = demoProject();
    const result = await render('cards-place-avery', project, {
      kind: 'place',
      sheet: AVERY_5302,
      showCutLines: true,
    });
    const perPage = AVERY_5302.columns * AVERY_5302.rows;
    expect(result.pages).toBe(Math.ceil(result.cards / perPage));
  });

  it('produces escort cards on plain A4', async () => {
    const result = await render('cards-escort-a4', demoProject(), {
      kind: 'escort',
      sheet: A4_FLAT,
      showCutLines: true,
    });
    expect(result.pages).toBe(Math.ceil(result.cards / (A4_FLAT.columns * A4_FLAT.rows)));
  });

  it('keeps the names searchable', async () => {
    const result = await buildCardsPdf(demoProject(), {
      kind: 'escort',
      sheet: A4_FLAT,
      showCutLines: false,
    });
    expect(Buffer.from(result.bytes).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('handles an empty guest list without producing a broken file', async () => {
    const result = await buildCardsPdf(emptyProject(), {
      kind: 'place',
      sheet: A4_FLAT,
      showCutLines: true,
    });
    expect(result.cards).toBe(0);
    expect(result.pages).toBe(1);
  });
});

describe('fitting a name onto a card', () => {
  // A stand-in for jsPDF's metrics: width is linear in size, which is the
  // property the exact-scale fallback relies on.
  const measure = (text: string, size: number) => text.length * size * 0.5;

  it('leaves a short name at full size on one line', () => {
    expect(fitText(measure, 'Dana Levi', 100, 20, 9)).toEqual({ lines: ['Dana Levi'], size: 20 });
  });

  it('shrinks rather than wraps when shrinking is enough', () => {
    const fitted = fitText(measure, 'Jonathan Baker', 100, 20, 9);
    expect(fitted.lines).toEqual(['Jonathan Baker']);
    expect(fitted.size).toBeLessThan(20);
    expect(measure(fitted.lines[0]!, fitted.size)).toBeLessThanOrEqual(100);
  });

  it('wraps the name that started all this, and fits it', () => {
    const fitted = fitText(measure, 'Alexandra Rosenbaum-Feldman', 100, 20, 9);
    expect(fitted.lines).toHaveLength(2);
    for (const line of fitted.lines) {
      expect(measure(line, fitted.size)).toBeLessThanOrEqual(100);
    }
  });

  it('breaks at the most even space, not the first one', () => {
    const fitted = fitText(measure, 'Mr and Mrs Jonathan Baker', 60, 20, 9);
    expect(fitted.lines).toEqual(['Mr and Mrs', 'Jonathan Baker']);
  });

  it('trims a single unbroken word too long for the card, rather than overflowing', () => {
    const word = 'Wolfeschlegelsteinhausenbergerdorff';
    const fitted = fitText(measure, word, 60, 20, 9);
    expect(fitted.lines[0]).toMatch(/^Wolfe.*…$/);
    expect(measure(fitted.lines[0]!, fitted.size)).toBeLessThanOrEqual(60);
  });

  it('fits a two-line name that is still too wide at the floor', () => {
    const fitted = fitText(measure, 'Bartholomew Fitzwilliam Montgomery-Cavendish', 40, 20, 9);
    for (const line of fitted.lines) {
      expect(measure(line, fitted.size)).toBeLessThanOrEqual(40);
    }
  });

  it('never wraps when told it may not', () => {
    const fitted = fitText(measure, 'Groom university friends', 40, 12, 6, 1);
    expect(fitted.lines).toHaveLength(1);
    expect(measure(fitted.lines[0]!, fitted.size)).toBeLessThanOrEqual(40);
  });

  it('never returns an unreadably small size', () => {
    const fitted = fitText(measure, 'x'.repeat(500), 10, 20, 9);
    expect(fitted.size).toBeGreaterThanOrEqual(4);
  });
});
