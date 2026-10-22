import { useState } from "react";

import { dangerBtn } from "@/lib/ui";

type Props = {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
};

// Two-step delete: first click arms it, second click confirms (no browser dialog).
export default function ConfirmButton({
  label,
  confirmLabel = "確定刪除？/ Confirm",
  onConfirm,
  disabled,
}: Props) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        className={`${dangerBtn} font-medium`}
        onClick={async () => {
          await onConfirm();
          setArmed(false);
        }}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        className="rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
        onClick={() => setArmed(false)}
      >
        取消
      </button>
    </span>
  ) : (
    <button type="button" disabled={disabled} className={dangerBtn} onClick={() => setArmed(true)}>
      {label}
    </button>
  );
}
