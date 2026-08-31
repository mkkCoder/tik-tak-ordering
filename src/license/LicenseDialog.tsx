import { useState } from 'react';
import { Button, Dialog, Field } from '@/ui/primitives';
import { useLicenseStore } from './useLicense';

export const PRICE = '$19';
export const BUY_URL = 'https://tiktak.lemonsqueezy.com/checkout';

/**
 * One field and one button. When it fails, the message says what to do next —
 * an error that only says "invalid" leaves someone who has paid with nowhere
 * to go.
 */
export function LicenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [key, setKey] = useState('');
  const activate = useLicenseStore((s) => s.activate);
  const deactivate = useLicenseStore((s) => s.deactivate);
  const checking = useLicenseStore((s) => s.checking);
  const error = useLicenseStore((s) => s.error);
  const clearError = useLicenseStore((s) => s.clearError);
  const license = useLicenseStore((s) => s.license);
  const pro = useLicenseStore((s) => s.pro);

  async function submit() {
    const ok = await activate(key);
    if (ok) {
      setKey('');
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      title={pro ? 'TIKTAK Pro' : 'Activate TIKTAK Pro'}
      onClose={() => {
        clearError();
        onClose();
      }}
      footer={
        pro ? (
          <>
            <Button variant="danger" onClick={deactivate}>
              Remove licence
            </Button>
            <Button variant="primary" data-autofocus onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={checking || !key.trim()} onClick={submit}>
              {checking ? 'Checking…' : 'Activate'}
            </Button>
          </>
        )
      }
    >
      {pro ? (
        <div className="flex flex-col gap-2">
          <p>
            This browser is activated{license?.label ? ` for ${license.label}` : ''}. Exports have
            no watermark and the full guest index.
          </p>
          <p className="text-slate">
            Your licence is stored in this browser. Activate it again on another computer with the
            same key.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-slate">
            Planning is free and always will be. {PRICE} once, for good, removes the watermark and
            prints the complete guest index.
          </p>
          <Field
            data-autofocus
            label="Licence key"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              if (error) clearError();
            }}
            placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && key.trim()) void submit();
            }}
          />
          {error && (
            <p className="rounded-[3px] bg-[color:rgba(179,38,30,0.08)] px-2 py-1.5 text-[13px] text-flag">
              {error}
            </p>
          )}
          <p className="text-micro text-slate">
            Don&apos;t have a key yet?{' '}
            <a
              href={BUY_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2"
            >
              Buy TIKTAK Pro
            </a>{' '}
            — {PRICE}, one payment, no subscription.
          </p>
        </div>
      )}
    </Dialog>
  );
}
