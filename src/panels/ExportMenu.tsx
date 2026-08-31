import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '@/store/project';
import { toProject } from '@/store/selectors';
import { useUiStore } from '@/store/ui';
import { useLicenseStore } from '@/license/useLicense';
import { LicenseDialog, PRICE } from '@/license/LicenseDialog';
import { downloadBlob, downloadText } from '@/io/download';
import { guestsCsv, tablesCsv } from '@/io/csvExport';
import { projectFileName } from '@/io/projectFile';
import type { Orientation, PageFormat } from '@/io/pdf';
import { AVERY_5302, A4_FLAT, type CardKind } from '@/io/pdf/cards';
import { Button, Dialog, Field, Select, cx } from '@/ui/primitives';
import { track } from '@/analytics';

export function ExportMenu() {
  const [open, setOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  function baseName(): string {
    return projectFileName(useProjectStore.getState().event.name).replace('.tiktak.json', '');
  }

  return (
    <div className="relative" ref={ref}>
      <Button variant="primary" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Export
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-60 overflow-hidden rounded-[3px] border border-[color:var(--hairline)] bg-paper py-1 shadow-lift"
        >
          <Item
            onClick={() => {
              setOpen(false);
              setPdfOpen(true);
            }}
          >
            Seating chart (PDF)…
          </Item>
          <Item
            onClick={() => {
              setOpen(false);
              setCardsOpen(true);
            }}
          >
            Place &amp; escort cards…
          </Item>
          <div className="my-1 h-px bg-[color:var(--hairline)]" />
          <Item
            onClick={() => {
              setOpen(false);
              downloadText(guestsCsv(toProject(useProjectStore.getState())), `${baseName()}-guests.csv`, 'text/csv');
            }}
          >
            Guests (CSV)
          </Item>
          <Item
            onClick={() => {
              setOpen(false);
              downloadText(tablesCsv(toProject(useProjectStore.getState())), `${baseName()}-tables.csv`, 'text/csv');
            }}
          >
            Tables (CSV)
          </Item>
        </div>
      )}

      <PdfDialog
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        onUpgrade={() => {
          setPdfOpen(false);
          setLicenseOpen(true);
        }}
      />
      <CardsDialog
        open={cardsOpen}
        onClose={() => setCardsOpen(false)}
        onUpgrade={() => {
          setCardsOpen(false);
          setLicenseOpen(true);
        }}
      />
      <LicenseDialog open={licenseOpen} onClose={() => setLicenseOpen(false)} />
    </div>
  );
}

function Item({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-[color:rgba(22,32,43,0.06)]"
    >
      {children}
    </button>
  );
}

function PdfDialog({
  open,
  onClose,
  onUpgrade,
}: {
  open: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const [format, setFormat] = useState<PageFormat>('a4');
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [busy, setBusy] = useState(false);
  const pro = useLicenseStore((s) => s.pro);
  const notify = useUiStore((s) => s.notify);

  async function run() {
    setBusy(true);
    track('export_attempted');
    try {
      // Loaded on demand: jsPDF and the embedded font are the heaviest things
      // in the app, and most sessions never export.
      const { buildSeatingPdf, freeOptions, proOptions } = await import('@/io/pdf');
      const project = toProject(useProjectStore.getState());
      const options = pro
        ? proOptions(format, orientation)
        : freeOptions(format, orientation);
      const result = await buildSeatingPdf(project, options);
      downloadBlob(result.blob, `${projectFileName(project.event.name).replace('.tiktak.json', '')}.pdf`);
      notify(`Exported ${result.pages} pages.`);
      onClose();
    } catch (err) {
      notify(
        `The PDF couldn't be generated. ${err instanceof Error ? err.message : ''}`.trim(),
        'refusal',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Export the seating chart"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={run}>
            {busy ? 'Building…' : 'Export PDF'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-slate">
          Three parts in one document: the floor plan, a list for every table, and an
          alphabetical index to hang at the entrance.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Select label="Paper" value={format} onChange={(e) => setFormat(e.target.value as PageFormat)}>
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
          </Select>
          <Select
            label="Orientation"
            value={orientation}
            onChange={(e) => setOrientation(e.target.value as Orientation)}
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </Select>
        </div>

        <div
          className={cx(
            'rounded-[3px] border border-[color:var(--hairline)] px-2.5 py-2 text-[13px]',
            pro ? 'bg-[color:rgba(78,107,87,0.09)]' : 'bg-linen',
          )}
        >
          {pro ? (
            <p>Pro is active — no watermark, and the full index.</p>
          ) : (
            <>
              <p className="mb-1.5">
                The free export carries a small watermark and the first 20 index entries. The
                plan and the per-table lists are complete either way.
              </p>
              <Button size="sm" onClick={onUpgrade}>
                Remove watermark — {PRICE} once
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Place and escort cards. Fully a Pro feature, and the gate lives here rather
 * than on a hidden button: someone without a licence still sees exactly what
 * they would get, which is the only honest way to sell it.
 */
function CardsDialog({
  open,
  onClose,
  onUpgrade,
}: {
  open: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const [kind, setKind] = useState<CardKind>('place');
  const [sheetId, setSheetId] = useState<string>(AVERY_5302.id);
  const [custom, setCustom] = useState({ width: 90, height: 55, columns: 2, rows: 4, fold: false });
  const [busy, setBusy] = useState(false);
  const pro = useLicenseStore((s) => s.pro);
  const notify = useUiStore((s) => s.notify);
  const seated = useProjectStore((s) => s.guests.filter((g) => g.seat).length);

  async function run() {
    setBusy(true);
    track('export_attempted');
    try {
      const { buildCardsPdf, customSheet, SHEET_PRESETS } = await import('@/io/pdf/cards');
      const sheet =
        sheetId === 'custom'
          ? customSheet({
              cardWidth: custom.width,
              cardHeight: custom.height,
              columns: custom.columns,
              rows: custom.rows,
              fold: custom.fold,
              page: 'a4',
            })
          : (SHEET_PRESETS.find((s) => s.id === sheetId) ?? SHEET_PRESETS[0]!);

      const project = toProject(useProjectStore.getState());
      const result = await buildCardsPdf(project, { kind, sheet, showCutLines: true });
      downloadBlob(
        result.blob,
        `${projectFileName(project.event.name).replace('.tiktak.json', '')}-${kind}-cards.pdf`,
      );
      notify(`${result.cards} cards across ${result.pages} sheets.`);
      onClose();
    } catch (err) {
      notify(
        `The cards couldn't be generated. ${err instanceof Error ? err.message : ''}`.trim(),
        'refusal',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Print place cards"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {pro ? (
            <Button variant="primary" disabled={busy || seated === 0} onClick={run}>
              {busy ? 'Building…' : 'Export cards'}
            </Button>
          ) : (
            <Button variant="primary" onClick={onUpgrade}>
              Unlock for {PRICE}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Card type">
          <CardChoice
            checked={kind === 'place'}
            onSelect={() => setKind('place')}
            title="Place cards"
            detail="One per seat, grouped by table so you can carry a stack to each one."
          />
          <CardChoice
            checked={kind === 'escort'}
            onSelect={() => setKind('escort')}
            title="Escort cards"
            detail="One per guest, alphabetical, with the table name — for the table at the door."
          />
        </div>

        <Select label="Card stock" value={sheetId} onChange={(e) => setSheetId(e.target.value)}>
          <option value={AVERY_5302.id}>{AVERY_5302.label}</option>
          <option value={A4_FLAT.id}>{A4_FLAT.label}</option>
          <option value="custom">Custom size…</option>
        </Select>

        {sheetId === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Card width (mm)"
              type="number"
              value={custom.width}
              onChange={(e) => setCustom({ ...custom, width: Number(e.target.value) || 90 })}
            />
            <Field
              label="Card height (mm)"
              type="number"
              value={custom.height}
              onChange={(e) => setCustom({ ...custom, height: Number(e.target.value) || 55 })}
            />
            <Field
              label="Columns"
              type="number"
              min={1}
              max={6}
              value={custom.columns}
              onChange={(e) => setCustom({ ...custom, columns: Number(e.target.value) || 1 })}
            />
            <Field
              label="Rows"
              type="number"
              min={1}
              max={10}
              value={custom.rows}
              onChange={(e) => setCustom({ ...custom, rows: Number(e.target.value) || 1 })}
            />
            <label className="col-span-2 flex items-center gap-1.5 text-[13px]">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-[color:var(--sage)]"
                checked={custom.fold}
                onChange={(e) => setCustom({ ...custom, fold: e.target.checked })}
              />
              Fold-over card (prints the name mirrored on the top half)
            </label>
          </div>
        )}

        {seated === 0 && (
          <p className="text-[13px] text-slate">Nobody is seated yet, so there are no cards to print.</p>
        )}

        {!pro && (
          <p className="rounded-[3px] border border-[color:var(--hairline)] bg-linen px-2.5 py-2 text-[13px]">
            Cards are part of Pro — {PRICE} once, the same licence that removes the watermark.
          </p>
        )}
      </div>
    </Dialog>
  );
}

function CardChoice({
  checked,
  onSelect,
  title,
  detail,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cx(
        'rounded-[3px] border px-2.5 py-2 text-left transition-colors',
        checked
          ? 'border-sage bg-[color:rgba(78,107,87,0.09)]'
          : 'border-[color:var(--hairline)] hover:bg-[color:rgba(22,32,43,0.04)]',
      )}
    >
      <span className="block text-[13px] font-medium">{title}</span>
      <span className="block text-micro text-slate">{detail}</span>
    </button>
  );
}
