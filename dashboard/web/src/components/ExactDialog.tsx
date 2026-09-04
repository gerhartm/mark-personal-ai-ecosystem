import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

export function ExactDialog({
  open,
  onOpenChange,
  closeLabel,
  accessibleTitle,
  labelledBy,
  describedBy,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  closeLabel: string;
  accessibleTitle: string;
  labelledBy?: string;
  describedBy?: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <DialogPrimitive.Content
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          className="fixed left-[50%] top-[50%] z-50 grid max-h-[85vh] w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto border-2 border-[var(--line-strong)] bg-[var(--panel)] p-0 text-foreground shadow-lg duration-200 sm:rounded-lg"
        >
          <DialogPrimitive.Title className="sr-only">{accessibleTitle}</DialogPrimitive.Title>
          {children}
          <DialogPrimitive.Close
            aria-label={closeLabel}
            className="absolute right-4 top-4 cursor-pointer rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
