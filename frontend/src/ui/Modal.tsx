import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Modal({ title, children, footer, onClose, className = '' }: { title: string; children: ReactNode; footer: ReactNode; onClose: () => void; className?: string }) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]') ?? [])];
    (focusable()[0] ?? panel.current)?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); panel.current?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keys, true);
    return () => { document.removeEventListener('keydown', keys, true); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return createPortal(
    <div className="overlay light" onMouseDown={event => { if (event.target === event.currentTarget) close.current(); }}>
      <section ref={panel} className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header><h2 id={titleId}>{title}</h2></header>
        <div className="body">{children}</div>
        <footer>{footer}</footer>
      </section>
    </div>, document.body,
  );
}

export function ConfirmButton({ title, message, confirmLabel, children, className = 'btn', disabled = false, onConfirm }: {
  title: string; message: ReactNode; confirmLabel: string; children: ReactNode; className?: string; disabled?: boolean; onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={className} disabled={disabled} onClick={() => setOpen(true)}>{children}</button>
    {open && <Modal title={title} onClose={() => setOpen(false)} footer={<>
      <button type="button" className="btn" onClick={() => setOpen(false)}>取消</button>
      <button type="button" className="btn btn-primary" disabled={disabled} onClick={() => { if (disabled) return; setOpen(false); onConfirm(); }}>{confirmLabel}</button>
    </>}>{message}</Modal>}
  </>;
}
