import { useMemo, useState } from 'react';
import { nanoid } from 'nanoid';
import { useProjectStore, withHistoryGroup } from '@/store/project';
import { useUiStore } from '@/store/ui';
import {
  buildImport,
  extractRows,
  findDuplicates,
  guessRoles,
  parseSheet,
  type ColumnRole,
  type DuplicateStrategy,
  type ParsedSheet,
} from '@/io/csvImport';
import { pickTextFile } from '@/io/download';
import { Button, Dialog, cx } from '@/ui/primitives';
import { track } from '@/analytics';

const ROLE_LABELS: Record<ColumnRole, string> = {
  name: 'Name (required)',
  party: 'Party',
  quantity: 'Seats / quantity',
  tags: 'Tags',
  notes: 'Notes',
  ignore: "Don't import",
};

/**
 * Two ways in — a file, or a paste straight out of a spreadsheet — then one
 * screen to correct the guesses, with a preview so nobody imports 500 rows on
 * faith.
 */
export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [roles, setRoles] = useState<ColumnRole[]>([]);
  const [strategy, setStrategy] = useState<DuplicateStrategy>('skip');
  const notify = useUiStore((s) => s.notify);
  const existingGuests = useProjectStore((s) => s.guests);

  function analyse(raw: string) {
    const parsed = parseSheet(raw);
    if (parsed.rows.length === 0) {
      notify('That looks empty — no rows to import.', 'refusal');
      return;
    }
    setSheet(parsed);
    setRoles(guessRoles(parsed));
  }

  async function chooseFile() {
    const picked = await pickTextFile('.csv,.tsv,.txt,text/csv,text/plain');
    if (!picked) return;
    setText(picked.text);
    analyse(picked.text);
  }

  const rows = useMemo(
    () => (sheet ? extractRows(sheet, roles) : []),
    [sheet, roles],
  );
  const duplicates = useMemo(
    () => findDuplicates(rows, existingGuests),
    [rows, existingGuests],
  );
  const expandedRows = useMemo(() => rows.filter((r) => r.quantity > 1).length, [rows]);

  const totalPeople = useMemo(
    () => buildImport(rows, existingGuests, strategy, () => 'count').guests.length,
    [rows, existingGuests, strategy],
  );

  const hasName = roles.includes('name');

  function reset() {
    setText('');
    setSheet(null);
    setRoles([]);
  }

  function confirm() {
    const built = buildImport(rows, existingGuests, strategy, () => nanoid());
    withHistoryGroup(() => {
      const store = useProjectStore.getState();
      // Parties must exist before their members reference them.
      useProjectStore.setState((s) => ({ parties: [...s.parties, ...built.parties] }));
      store.addGuests(built.guests);
    });
    track('guests_imported');
    notify(
      built.skipped > 0
        ? `Imported ${built.guests.length} guests. Skipped ${built.skipped} already on the list.`
        : `Imported ${built.guests.length} guests.`,
    );
    reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      title="Import a guest list"
      width={sheet ? 720 : 520}
      onClose={() => {
        reset();
        onClose();
      }}
      footer={
        sheet ? (
          <>
            <Button onClick={reset}>Back</Button>
            <Button variant="primary" disabled={!hasName || rows.length === 0} onClick={confirm}>
              Import {totalPeople} {totalPeople === 1 ? 'guest' : 'guests'}
            </Button>
          </>
        ) : (
          <>
            <Button
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" disabled={!text.trim()} onClick={() => analyse(text)}>
              Continue
            </Button>
          </>
        )
      }
    >
      {!sheet ? (
        <div className="flex flex-col gap-3">
          <p className="text-slate">
            Paste straight from Excel, Numbers or Google Sheets — columns and all. Nothing is
            uploaded anywhere.
          </p>
          <textarea
            data-autofocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text/plain');
              if (pasted.trim()) {
                e.preventDefault();
                setText(pasted);
                analyse(pasted);
              }
            }}
            rows={8}
            placeholder={'Ruth Cohen\tCohen\t4\nDov Levi\tLevi\t2'}
            aria-label="Paste your guest list"
            className="w-full resize-y rounded-[3px] border border-[color:var(--hairline)] bg-paper p-2 font-mono text-[12px] focus:border-sage focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <span className="text-micro text-slate">or</span>
            <Button onClick={chooseFile}>Choose a CSV file</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-slate">
              {sheet.hasHeader
                ? 'Found a header row. Check the columns below.'
                : 'No header row found, so columns were guessed from the data.'}
            </p>
            <div className="tk-scroll overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    {sheet.headers.map((header, i) => (
                      <th key={i} className="border-b border-[color:var(--hairline)] p-1 text-left align-top">
                        <span className="mb-1 block truncate font-medium" title={header}>
                          {header}
                        </span>
                        <select
                          value={roles[i] ?? 'ignore'}
                          aria-label={`What is in ${header}?`}
                          onChange={(e) => {
                            const role = e.target.value as ColumnRole;
                            setRoles((prev) =>
                              prev.map((r, j) => {
                                if (j === i) return role;
                                // Each role is used once; taking it frees the old column.
                                return role !== 'ignore' && r === role ? 'ignore' : r;
                              }),
                            );
                          }}
                          className="w-full rounded-[2px] border border-[color:var(--hairline)] bg-paper px-1 py-0.5 text-[11px]"
                        >
                          {(Object.keys(ROLE_LABELS) as ColumnRole[]).map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className={cx(
                            'max-w-[12rem] truncate border-b border-[color:var(--hairline)] p-1',
                            roles[j] === 'ignore' && 'text-slate/50',
                          )}
                          title={cell}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sheet.rows.length > 10 && (
              <p className="mt-1 text-micro text-slate">
                Showing the first 10 of {sheet.rows.length} rows.
              </p>
            )}
          </div>

          {!hasName && (
            <p className="rounded-[3px] bg-[color:rgba(179,38,30,0.08)] px-2 py-1.5 text-[13px] text-flag">
              Pick which column holds the guest&apos;s name before importing.
            </p>
          )}

          {(duplicates.existing.length > 0 || duplicates.internal.length > 0) && (
            <div>
              <p className="mb-1.5 text-[13px]">
                {duplicates.existing.length > 0 && (
                  <>
                    {duplicates.existing.length}{' '}
                    {duplicates.existing.length === 1 ? 'name is' : 'names are'} already on your
                    guest list
                    {duplicates.internal.length > 0 && ', and '}
                  </>
                )}
                {duplicates.internal.length > 0 && (
                  <>
                    {duplicates.internal.length} repeat inside this file
                  </>
                )}
                .
              </p>
              <div
                className="inline-flex rounded-[3px] border border-[color:var(--hairline)] bg-paper p-0.5"
                role="radiogroup"
                aria-label="What to do with duplicates"
              >
                {(
                  [
                    ['skip', 'Skip duplicates'],
                    ['merge', 'Import them anyway'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={strategy === value}
                    onClick={() => setStrategy(value)}
                    className={cx(
                      'rounded-[2px] px-2.5 py-1 text-[12px] transition-colors',
                      strategy === value ? 'bg-ink text-paper' : 'text-slate hover:text-ink',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <p className="text-[13px] text-slate">
              {rows.length} {rows.length === 1 ? 'row' : 'rows'} &rarr; {totalPeople}{' '}
              {totalPeople === 1 ? 'guest' : 'guests'}
              {expandedRows > 0 && (
                <>
                  , because {expandedRows} {expandedRows === 1 ? 'row brings' : 'rows bring'} more
                  than one person
                </>
              )}
              .
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
