import {
  BookOpen,
  ChartNoAxesCombined,
  ClipboardList,
  Download,
  ScrollText,
  SlidersHorizontal,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import type { ViewId } from "@/domain/types";

export interface NavigationItem {
  id: ViewId;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    id: "setup",
    label: "Setup",
    shortLabel: "Setup",
    description: "Seat players and prepare the physical table",
    icon: SlidersHorizontal,
  },
  {
    id: "play",
    label: "Play",
    shortLabel: "Play",
    description: "Run the current physical turn",
    icon: ClipboardList,
  },
  {
    id: "market",
    label: "Market",
    shortLabel: "Market",
    description: "Read shared fictional asset prices",
    icon: ChartNoAxesCombined,
  },
  {
    id: "players",
    label: "Ledger",
    shortLabel: "Ledger",
    description: "Review player holdings and evidence",
    icon: ScrollText,
  },
  {
    id: "scoring",
    label: "Scores",
    shortLabel: "Scores",
    description: "Preview the final scoring model",
    icon: Trophy,
  },
  {
    id: "export",
    label: "Export",
    shortLabel: "Export",
    description: "Download the complete evidence record",
    icon: Download,
  },
  {
    id: "rules",
    label: "Help",
    shortLabel: "Help",
    description: "Search rules and finance terms",
    icon: BookOpen,
  },
];

export function navigationItem(view: ViewId): NavigationItem {
  return (
    NAVIGATION_ITEMS.find((item) => item.id === view) ?? NAVIGATION_ITEMS[0]!
  );
}
