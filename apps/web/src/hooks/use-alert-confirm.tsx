import { useCallback, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

export type AlertConfirmInput = {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
};

export function useAlertConfirm() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<AlertConfirmInput | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const finish = useCallback((value: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setOpen(false);
    setOptions(null);
    resolve?.(value);
  }, []);

  const ask = useCallback((input: AlertConfirmInput): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setOptions(input);
      setOpen(true);
    });
  }, []);

  const confirmDialog =
    options != null ? (
      <AlertDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && resolveRef.current != null) {
            finish(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {options.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{options.cancelText ?? "取消"}</AlertDialogCancel>
            <AlertDialogAction
              className={
                options.variant === "destructive"
                  ? buttonVariants({ variant: "destructive" })
                  : undefined
              }
              onClick={() => finish(true)}
            >
              {options.confirmText ?? "确认"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ) : null;

  return { ask, confirmDialog };
}
