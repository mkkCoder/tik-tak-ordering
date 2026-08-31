import { useEffect, useState } from 'react';
import { Button, Dialog, Field } from '@/ui/primitives';
import { useUiStore } from '@/store/ui';
import { useLicenseStore } from './useLicense';
import { openCheckout, type CheckoutOutcome } from './checkout';

export const PRICE = '$19';

/**
 * The Lemon Squeezy buy link for TIKTAK Pro. `openCheckout` appends `?embed=1`
 * itself, so this is the plain share link exactly as the dashboard gives it.
 */
export const BUY_URL =
  'https://tik-tak.lemonsqueezy.com/checkout/buy/a27bfe9c-e09f-4cc4-9ad0-d44d5410d29b';

/** What the money actually buys, in the order a person cares about it. */
export const PRO_INCLUDES = [
  'Printable place cards for every seat, and escort cards for the entrance',
  'The complete A–Z guest list to hang at the door — every guest, not the first 20',
  'A clean chart with no watermark',
] as const;

type Stage = 'offer' | 'code';

/**
 * The upgrade dialog.
 *
 * Three things this is careful about.
 *
 * It sells the print pack rather than the removal of a watermark — nobody is
 * delighted to pay for something to stop being ugly, but printing 150 name
 * cards by hand is a real evening of work.
 *
 * There is one button. A licence code is not a thing a person should have to
 * handle: the overlay hands the key back on this page, and the receipt email's
 * button carries it in the URL, so the ordinary path never shows a code at all.
 * The code field survives as a quiet link, for a second computer.
 *
 * And unlocking is not the end of anything. Whoever gets here was in the middle
 * of exporting something; `onUnlocked` puts them back in front of it.
 */
export function LicenseDialog({
  open,
  onClose,
  onUnlocked,
}: {
  open: boolean;
  onClose: () => void;
  /** Called instead of `onClose` when Pro has just been activated. */
  onUnlocked?: () => void;
}) {
  const [stage, setStage] = useState<Stage>('offer');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const activate = useLicenseStore((s) => s.activate);
  const deactivate = useLicenseStore((s) => s.deactivate);
  const checking = useLicenseStore((s) => s.checking);
  const error = useLicenseStore((s) => s.error);
  const clearError = useLicenseStore((s) => s.clearError);
  const license = useLicenseStore((s) => s.license);
  const pro = useLicenseStore((s) => s.pro);
  const notify = useUiStore((s) => s.notify);

  useEffect(() => {
    if (open) setStage('offer');
  }, [open]);

  function close() {
    clearError();
    onClose();
  }

  /** Pro is on. Hand them back to whatever they were trying to export. */
  function unlocked() {
    setCode('');
    (onUnlocked ?? onClose)();
  }

  async function submit() {
    const ok = await activate(code);
    if (ok) unlocked();
  }

  async function onPaid(outcome: CheckoutOutcome) {
    if (outcome.kind === 'activated') {
      // The overlay handed back the key: finish the job for them.
      const ok = await activate(outcome.key);
      if (ok) {
        notify('Thank you — Pro is active. Everything prints clean now.');
        unlocked();
        return;
      }
    }
    // Paid, but no usable key in hand. The code is in their email, so put the
    // field in front of them rather than leaving them to hunt for it.
    setStage('code');
  }

  async function buy() {
    setBusy(true);
    try {
      // Note the two-stage shape: this await ends when the overlay is on screen.
      // Whether they buy, close it, or wander off is not this button's business
      // — anything else leaves it stuck on "Opening…" when they press Escape.
      const opened = await openCheckout(BUY_URL, (outcome) => void onPaid(outcome));
      if (opened === 'new-tab') setStage('code');
    } finally {
      setBusy(false);
    }
  }

  if (pro) {
    return (
      <Dialog
        open={open}
        title="TIKTAK Pro"
        onClose={close}
        footer={
          <>
            <Button variant="danger" onClick={deactivate}>
              Remove from this browser
            </Button>
            <Button variant="primary" data-autofocus onClick={onClose}>
              Done
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <p>
            Pro is active in this browser{license?.label ? ` — ${license.label}` : ''}. Charts print
            clean, the guest index is complete, and place cards are unlocked.
          </p>
          <p className="text-slate">
            Using a different computer? Open this dialog there and enter the same code from your
            email. There is no limit on how many of your own machines you use it on.
          </p>
        </div>
      </Dialog>
    );
  }

  if (stage === 'code') {
    return (
      <Dialog
        open={open}
        title="Enter your code"
        onClose={close}
        footer={
          <>
            <Button onClick={() => setStage('offer')}>Back</Button>
            <Button variant="primary" disabled={checking || !code.trim()} onClick={submit}>
              {checking ? 'Checking…' : 'Unlock'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-slate">
            Your code is in the email from your purchase. You can paste the whole line — TIKTAK will
            find the code in it.
          </p>
          <Field
            data-autofocus
            label="Code from your email"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (error) clearError();
            }}
            placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && code.trim()) void submit();
            }}
          />
          {error && (
            <p className="rounded-[3px] bg-[color:rgba(179,38,30,0.08)] px-2 py-1.5 text-[13px] text-flag">
              {error}
            </p>
          )}
          <p className="text-micro text-slate">
            Can&apos;t find the email? Search your inbox for <strong>TIKTAK</strong>, and check the
            spam folder — it arrives within a minute or two of paying.
          </p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      title="Everything you need to print"
      onClose={close}
      width={460}
      footer={
        <Button variant="primary" data-autofocus disabled={busy} onClick={buy}>
          {busy ? 'Opening…' : `Unlock for ${PRICE}`}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-slate">
          Planning stays free, forever — guests, tables, rules, auto-arrange and CSV export. This is
          the part you print and hand out.
        </p>

        <ul className="flex flex-col gap-1.5">
          {PRO_INCLUDES.map((item) => (
            <li key={item} className="flex gap-2 text-[13px]">
              <svg
                viewBox="0 0 16 16"
                width="14"
                height="14"
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-sage"
              >
                <path
                  d="M3 8.5 6.3 11.8 13 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <p className="rounded-[3px] border border-[color:var(--hairline)] bg-linen px-2.5 py-2 text-[13px]">
          {PRICE} once. Not a subscription, no account, yours for good — and a calligrapher charges
          more than that for four cards.
        </p>

        {/* Deliberately quiet. Most people never need it: the overlay activates
            Pro on this page, and the link in the receipt email activates it on
            any other. This is for a second computer, months later. */}
        <button
          type="button"
          onClick={() => setStage('code')}
          className="self-start text-micro text-slate underline underline-offset-2 hover:text-ink"
        >
          Already bought it? Enter your code
        </button>
      </div>
    </Dialog>
  );
}
