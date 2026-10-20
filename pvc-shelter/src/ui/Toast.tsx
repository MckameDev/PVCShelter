import { useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';

const TONES = {
  error: 'border-red-500 bg-red-950/95',
  success: 'border-emerald-500 bg-emerald-950/95',
  info: 'border-sky-500 bg-sky-950/95',
};

export function Toast() {
  const notice = useGameStore((s) => s.notice);
  const dismiss = useGameStore((s) => s.dismissNotice);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(dismiss, 2800);
    return () => window.clearTimeout(timer);
  }, [notice, dismiss]);

  if (!notice) return null;
  return (
    <div
      role="status"
      className={`pointer-events-auto absolute top-16 left-1/2 max-w-[90vw] -translate-x-1/2 rounded-lg border-2 px-4 py-2 text-sm font-semibold shadow-xl ${TONES[notice.tone]}`}
      onClick={dismiss}
    >
      {notice.text}
    </div>
  );
}
