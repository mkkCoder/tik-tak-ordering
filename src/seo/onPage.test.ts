import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');

function load(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

function meta(html: string, attr: 'name' | 'property', key: string): string | null {
  const re = new RegExp(
    `<meta\\s+[^>]*${attr}="${key}"[^>]*content="([^"]*)"|<meta\\s+[^>]*content="([^"]*)"[^>]*${attr}="${key}"`,
    'i',
  );
  const m = html.match(re);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function title(html: string): string {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  if (!m?.[1]) throw new Error('missing title');
  return m[1];
}

function canonical(html: string): string | null {
  const m = html.match(/<link\s+[^>]*rel="canonical"[^>]*href="([^"]*)"/i);
  return m?.[1] ?? null;
}

function jsonLd(html: string): unknown {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m?.[1]) throw new Error('missing JSON-LD');
  return JSON.parse(m[1]);
}

function h1Count(html: string): number {
  return (html.match(/<h1[\s>]/g) ?? []).length;
}

const INDEXABLE = [
  {
    file: 'index.html',
    canonical: 'https://tik-tak.online/',
    maxTitle: 60,
  },
  {
    file: 'guides/index.html',
    canonical: 'https://tik-tak.online/guides/',
    maxTitle: 60,
  },
  {
    file: 'guides/how-to-make-a-wedding-seating-chart/index.html',
    canonical: 'https://tik-tak.online/guides/how-to-make-a-wedding-seating-chart/',
    maxTitle: 60,
  },
  {
    file: 'guides/avery-5302-place-card-template/index.html',
    canonical: 'https://tik-tak.online/guides/avery-5302-place-card-template/',
    maxTitle: 60,
  },
  {
    file: 'guides/how-many-people-fit-at-a-round-table/index.html',
    canonical: 'https://tik-tak.online/guides/how-many-people-fit-at-a-round-table/',
    maxTitle: 60,
  },
  {
    file: 'guides/escort-cards-vs-place-cards/index.html',
    canonical: 'https://tik-tak.online/guides/escort-cards-vs-place-cards/',
    maxTitle: 60,
  },
  {
    file: 'privacy/index.html',
    canonical: 'https://tik-tak.online/privacy/',
    maxTitle: 60,
  },
  {
    file: 'terms/index.html',
    canonical: 'https://tik-tak.online/terms/',
    maxTitle: 60,
  },
] as const;

describe('on-page SEO for indexable HTML', () => {
  it.each(INDEXABLE)(
    '$file has a short title, description, canonical, OG and Twitter tags',
    (page) => {
      const html = load(page.file);
      const t = title(html);
      const d = meta(html, 'name', 'description');
      expect(t.length).toBeGreaterThan(10);
      expect(t.length).toBeLessThanOrEqual(page.maxTitle);
      expect(d).toBeTruthy();
      expect(d!.length).toBeGreaterThan(50);
      expect(d!.length).toBeLessThanOrEqual(155);
      expect(canonical(html)).toBe(page.canonical);
      expect(meta(html, 'property', 'og:title')).toBeTruthy();
      expect(meta(html, 'property', 'og:description')).toBeTruthy();
      expect(meta(html, 'property', 'og:url')).toBe(page.canonical);
      expect(meta(html, 'property', 'og:image')).toBe('https://tik-tak.online/og.png');
      expect(meta(html, 'name', 'twitter:card')).toBe('summary_large_image');
      expect(meta(html, 'name', 'twitter:title')).toBeTruthy();
      expect(meta(html, 'name', 'twitter:description')).toBeTruthy();
      expect(meta(html, 'name', 'twitter:image')).toBe('https://tik-tak.online/og.png');
      expect(h1Count(html)).toBe(1);
      expect(html).toMatch(/<script type="application\/ld\+json">/);
      JSON.parse(JSON.stringify(jsonLd(html)));
    },
  );

  it('landing page targets the core query in the only h1 and ships crawlable copy', () => {
    const html = load('index.html');
    expect(html).toMatch(/<h1>Free wedding seating chart maker<\/h1>/);
    expect(html).toMatch(/How the seating chart maker works/);
    expect(html).toMatch(/Who the seating chart maker is for/);
    expect(html).toMatch(/Seating chart maker FAQ/);
    expect(html).toMatch(/<img[^>]+alt="/);
    const ld = jsonLd(html) as { '@graph': Array<{ '@type': unknown }> };
    const types = ld['@graph'].flatMap((n) =>
      Array.isArray(n['@type']) ? n['@type'] : [n['@type']],
    );
    expect(types).toContain('Organization');
    expect(types).toContain('SoftwareApplication');
    expect(types).toContain('WebApplication');
    expect(types).toContain('FAQPage');
  });

  it('guides hub lists every article and the wedding how-to is original how-to copy', () => {
    const hub = load('guides/index.html');
    expect(hub).toMatch(/how-to-make-a-wedding-seating-chart/);
    expect(hub).toMatch(/how-many-people-fit-at-a-round-table/);
    expect(hub).toMatch(/escort-cards-vs-place-cards/);
    expect(hub).toMatch(/avery-5302-place-card-template/);
    const howto = load('guides/how-to-make-a-wedding-seating-chart/index.html');
    expect(howto).toMatch(/Get the names in, not the table numbers/);
    expect(howto).toMatch(/Mark who must sit together and who must not/);
    expect(howto).toMatch(/Print from the plan, once/);
  });

  it('every indexable image has a non-empty alt', () => {
    for (const page of INDEXABLE) {
      const html = load(page.file);
      const imgs = [...html.matchAll(/<img\b([^>]*)>/gi)];
      for (const match of imgs) {
        const attrs = match[1] ?? '';
        const alt = attrs.match(/alt="([^"]*)"/);
        const altText = alt?.[1];
        expect(altText, `missing alt in ${page.file}`).toBeTruthy();
        expect(altText!.length).toBeGreaterThan(8);
      }
    }
  });
});

describe('robots, sitemap and GitHub Pages 404', () => {
  it('allows all user agents and declares the production sitemap', () => {
    const robots = load('public/robots.txt');
    expect(robots).toMatch(/User-agent:\s*\*/);
    expect(robots).toMatch(/Allow:\s*\//);
    expect(robots).toMatch(/Sitemap:\s*https:\/\/tik-tak\.online\/sitemap\.xml/);
    expect(robots).not.toMatch(/Disallow:/);
  });

  it('lists only canonical production URLs with lastmod and changefreq', () => {
    const xml = load('public/sitemap.xml');
    expect(xml).toContain('https://tik-tak.online/');
    expect(xml).toContain('https://tik-tak.online/guides/');
    expect(xml).toContain('https://tik-tak.online/guides/how-to-make-a-wedding-seating-chart/');
    expect(xml).toContain('https://tik-tak.online/guides/avery-5302-place-card-template/');
    expect(xml).toContain('https://tik-tak.online/guides/how-many-people-fit-at-a-round-table/');
    expect(xml).toContain('https://tik-tak.online/guides/escort-cards-vs-place-cards/');
    expect(xml).toContain('https://tik-tak.online/privacy/');
    expect(xml).toContain('https://tik-tak.online/terms/');
    expect(xml).not.toContain('http://tik-tak.online');
    expect((xml.match(/<lastmod>/g) ?? []).length).toBe(8);
    expect((xml.match(/<changefreq>/g) ?? []).length).toBe(8);
    expect(xml).not.toContain('/app/');
  });

  it('ships a static 404 page so unknown paths stay 404 instead of an SPA shell', () => {
    expect(existsSync(resolve(root, 'public/404.html'))).toBe(true);
    const html = load('public/404.html');
    expect(meta(html, 'name', 'robots')).toMatch(/noindex/);
    expect(h1Count(html)).toBe(1);
  });

  it('keeps the planner out of the index while remaining a real HTML document', () => {
    const html = load('app/index.html');
    expect(meta(html, 'name', 'robots')).toMatch(/noindex/);
    expect(canonical(html)).toBe('https://tik-tak.online/app/');
    expect(html).toMatch(/<noscript>/);
  });
});
