import { useEffect, type ReactNode } from 'react';

export function Modal({ title, onClose, children, peek = false }: { title: string; onClose: () => void; children: ReactNode; peek?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={peek ? 'backdrop peek' : 'backdrop'} onClick={peek ? undefined : onClose}>
      <div className="sheet" role="dialog" aria-modal={!peek} aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn btn-small" onClick={onClose} aria-label="Close">
            ✕ Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
