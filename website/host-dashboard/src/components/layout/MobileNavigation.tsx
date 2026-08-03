import { Ellipsis } from "lucide-react";
import { useRef, useState } from "react";

import type { ViewId } from "@/domain/types";
import type { HostUnsyncedState } from "@/state";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { NAVIGATION_ITEMS } from "./navigation";
import { SessionActions } from "./SessionActions";

export function MobileNavigation({
  activeView,
  hostUnsyncedState,
  playerLocked,
  onViewChange,
  onNewSession,
  onSignOut,
}: {
  activeView: ViewId;
  hostUnsyncedState: HostUnsyncedState;
  playerLocked: boolean;
  onViewChange(view: ViewId): void;
  onNewSession(discardUnsynced: boolean): void;
  onSignOut(discardUnsynced: boolean): void;
}) {
  const primary = NAVIGATION_ITEMS.slice(0, 5);
  const secondary = NAVIGATION_ITEMS.slice(5);
  const secondaryActive = secondary.some((item) => item.id === activeView);
  const [moreOpen, setMoreOpen] = useState(false);
  const focusSurfaceAfterClose = useRef(false);

  return (
    <nav className="mobile-navigation" aria-label="Game sections">
      {primary.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={activeView === item.id ? "page" : undefined}
            onClick={() => onViewChange(item.id)}
          >
            <Icon aria-hidden="true" />
            <span>{item.shortLabel}</span>
          </button>
        );
      })}
      <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
        <DrawerTrigger asChild>
          <button
            type="button"
            aria-current={secondaryActive ? "page" : undefined}
            aria-label="Open more game sections"
          >
            <Ellipsis aria-hidden="true" />
            <span>More</span>
          </button>
        </DrawerTrigger>
        <DrawerContent
          className="more-drawer"
          onCloseAutoFocus={(event) => {
            if (!focusSurfaceAfterClose.current) return;
            event.preventDefault();
            focusSurfaceAfterClose.current = false;
            requestAnimationFrame(() => {
              document
                .getElementById("main-content")
                ?.focus({ preventScroll: true });
              window.scrollTo({ top: 0, behavior: "auto" });
            });
          }}
        >
          <DrawerHeader>
            <DrawerTitle>More table tools</DrawerTitle>
            <DrawerDescription>
              Evidence export and searchable game help.
            </DrawerDescription>
          </DrawerHeader>
          <div className="more-drawer__list">
            {secondary.map((item) => {
              const Icon = item.icon;
              return (
                <DrawerClose asChild key={item.id}>
                  <button
                    type="button"
                    aria-current={activeView === item.id ? "page" : undefined}
                    onClick={() => {
                      focusSurfaceAfterClose.current = true;
                      onViewChange(item.id);
                    }}
                  >
                    <Icon aria-hidden="true" />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                  </button>
                </DrawerClose>
              );
            })}
          </div>
          <SessionActions
            className="more-drawer__session-actions"
            hostUnsyncedState={hostUnsyncedState}
            playerLocked={playerLocked}
            onNewSession={(discardUnsynced) => {
              setMoreOpen(false);
              onNewSession(discardUnsynced);
            }}
            onSignOut={(discardUnsynced) => {
              setMoreOpen(false);
              onSignOut(discardUnsynced);
            }}
          />
        </DrawerContent>
      </Drawer>
    </nav>
  );
}
