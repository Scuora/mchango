import { Dialog as PrimeDialog } from "primereact/dialog";
import type { ReactNode } from "react";
import "@/styles/prime.css";

/** A modal for management screens. PrimeReact's dialog stacks correctly with
 *  its dropdown and date-picker overlays. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <PrimeDialog
      visible={open}
      onHide={onClose}
      header={title}
      modal
      dismissableMask
      draggable={false}
      resizable={false}
      blockScroll
      style={{ width: wide ? "42rem" : "32rem" }}
      breakpoints={{ "640px": "calc(100vw - 1.5rem)" }}
    >
      {children}
    </PrimeDialog>
  );
}
