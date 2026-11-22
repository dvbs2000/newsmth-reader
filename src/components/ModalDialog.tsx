import React, { useEffect, useRef } from 'react';

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  className?: string;
  ariaLabel: string;
  children: React.ReactNode;
}

/**
 * Native <dialog> wrapper using showModal() + reliable backdrop dismissal
 * (handles Safari where closedby="any" is not yet universal).
 */
export function ModalDialog({
  open,
  onClose,
  className,
  ariaLabel,
  children,
}: ModalDialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const pointerStartedOutside = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const isOutside = (e: React.PointerEvent<HTMLDialogElement>): boolean => {
    const dialog = ref.current;
    if (!dialog) return false;
    const rect = dialog.getBoundingClientRect();
    return (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    );
  };

  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={ariaLabel}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onPointerDown={(e) => {
        pointerStartedOutside.current = e.target === ref.current && isOutside(e);
      }}
      onPointerUp={(e) => {
        if (pointerStartedOutside.current && e.target === ref.current && isOutside(e)) {
          onClose();
        }
        pointerStartedOutside.current = false;
      }}
    >
      {open ? children : null}
    </dialog>
  );
}
