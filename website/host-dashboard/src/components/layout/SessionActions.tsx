import { FilePlus2, LogOut } from "lucide-react";

import type { HostUnsyncedState } from "@/state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SessionActions({
  hostUnsyncedState,
  playerLocked,
  className,
  onNewSession,
  onSignOut,
}: {
  hostUnsyncedState: HostUnsyncedState;
  playerLocked: boolean;
  className?: string;
  onNewSession(discardUnsynced: boolean): void;
  onSignOut(discardUnsynced: boolean): void;
}) {
  const saveInFlight = hostUnsyncedState === "saving";
  const saveFailed = hostUnsyncedState === "failed";

  return (
    <div className={cn("session-actions", className)}>
      {!playerLocked && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost">
              <FilePlus2 aria-hidden="true" />
              New session
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start a new table?</AlertDialogTitle>
              <AlertDialogDescription>
                {saveInFlight
                  ? "A Supabase save is still in progress. Wait for it to finish before replacing this table."
                  : saveFailed
                    ? "This table has changes that Supabase has not confirmed. Starting a new session will discard this device’s unsynced copy."
                    : "This keeps the host identity but replaces the current table with a fresh code. The existing shared record is not deleted."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {saveInFlight ? "Keep waiting" : "Keep current table"}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={saveInFlight}
                onClick={() => onNewSession(saveFailed)}
              >
                {saveInFlight ? "Save in progress" : "Create new session"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost">
            <LogOut aria-hidden="true" />
            Leave table
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this table?</AlertDialogTitle>
            <AlertDialogDescription>
              {saveInFlight
                ? "A Supabase save is still in progress. Wait for it to finish before leaving this device."
                : saveFailed
                  ? "Supabase has not confirmed the latest host changes. Leaving now discards this device’s unsynced copy."
                  : "This clears the table from this device and returns to entry. It does not delete an already-synced shared record."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {saveInFlight ? "Keep waiting" : "Stay at table"}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={saveInFlight}
              onClick={() => onSignOut(saveFailed)}
            >
              {saveInFlight ? "Save in progress" : "Leave this table"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
