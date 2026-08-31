import { useEffect, useState } from 'react';
import { Button, Dialog, Field } from '@/ui/primitives';
import { useUiStore } from '@/store/ui';
import { useLicenseStore } from './useLicense';
import { openCheckout } from './checkout';

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
 * Two things this is careful about. It sells the print pack rather than the
 * removal of a watermark — nobody is delighted to pay for something to stop
 * being ugly, but printing 150 name cards by hand is a real evening of work.
 * And it never makes a code the first thing you see: buying happens in an
 * overlay on this page, and the code field is the fallback for people who
 * already paid, not the front door.
 */
export function LicenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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

  async function submit() {
    const ok = await activate(code);
    if (ok) {
      setCode('');
      onClose();
    }
  }

  async function buy() {
    setBusy(true);
    try {
      const outcome = await openCheckout(BUY_URL);
      if (outcome.kind === 'activated') {
        // The overlay handed back the key: finish the job for them.
        const ok = await activate(outcome.key);
        if (ok) {
          notify('Thank you — Pro is active. Everything prints clean now.');
          onClose();
          return;
        }
      }
      // Paid but no key in hand, or the checkout opened in a new tab: the code
      // is in their email either way, so put the field in front of them.
      setStage('code');
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
            Pro is active in this browser{license?.label ? ` — ${license.label}` : ''}. Charts
            print clean, the guest index is complete, and place cards are unlocked.
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
            Your code is in the email from your purchase. You can paste the whole line — TIKTAK
            will find the code in it.
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
        <>
          <Button onClick={() => setStage('code')}>I already paid</Button>
          <Button variant="primary" data-autofocus disabled={busy} onClick={buy}>
            {busy ? 'Opening…' : `Unlock for ${PRICE}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-slate">
          Planning stays free, forever — guests, tables, rules, auto-arrange and CSV export. This
          is the part you print and hand out.
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
          {PRICE} once. Not a subscription, no account, yours for good — and a calligrapher
          charges more than that for four cards.
        </p>
      </div>
    </Dialog>
  );
}
