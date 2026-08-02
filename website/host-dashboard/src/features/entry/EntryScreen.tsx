import {
  useEffect,
  useRef,
  useState,
} from "react";
import { motion } from "motion/react";

import type {
  AccessMode,
  AuthDraft,
  AuthSubmission,
} from "@/app/contracts";
import { BrandMark } from "@/components/brand/BrandMark";
import {
  ChapterIndex,
  RegistrationMarks,
  Reveal,
  RevealLines,
  StatusBand,
} from "./EntryMotion";
import {
  ENTRY_STAGGER,
  useChoreographySettled,
  useEntryReducedMotion,
} from "./entry-motion-state";
import { SettingsDialog } from "@/components/layout/SettingsDialog";
import { Button } from "@/components/ui/button";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { GameDefinition, ThemeId } from "@/domain/types";
import { AccessForm } from "./AccessForm";
import { BoardRouteRelief } from "./BoardRouteRelief";

const modes: Array<{
  id: AccessMode;
  index: string;
  label: string;
  hint: string;
}> = [
  { id: "guest", index: "01", label: "Host", hint: "Start without an account" },
  { id: "join", index: "02", label: "Join", hint: "Use the host’s GT code" },
  { id: "login", index: "03", label: "Log in", hint: "Return as a host" },
  { id: "signup", index: "04", label: "Sign up", hint: "Create a host identity" },
];

const chapters = [
  {
    index: "01",
    title: "Set the table. Share one code.",
    body: "Seat the players, prepare the printed decks, and read out one GT code. Everyone joins the same live session.",
    detail: "The QR and code connect screens. They do not replace the board.",
  },
  {
    index: "02",
    title: "Move every pawn by hand.",
    body: "Roll the physical D6, advance on S00–S43, and draw from the printed deck. The app verifies what happened.",
    detail: "Physical play stays visible, social, and accountable.",
  },
  {
    index: "03",
    title: "Turn choices into evidence.",
    body: "Prices synchronize around the table while decisions, finance terms, and reflections accumulate into the final record.",
    detail: "One session. Twelve turns. Evidence you can inspect.",
  },
];

export interface EntryScreenProps {
  game: GameDefinition;
  mode: AccessMode;
  draft: AuthDraft;
  pending: boolean;
  error: string | null;
  backendError: string | null;
  theme: ThemeId;
  reducedMotion: boolean;
  onModeChange(mode: AccessMode): void;
  onDraftChange(patch: Partial<AuthDraft>): void;
  onSubmit(input: AuthSubmission): void;
  onRetryBackend(): void;
  onThemeChange(theme: ThemeId): void;
  onReducedMotionChange(reduced: boolean): void;
}

export function EntryScreen({
  game,
  mode,
  draft,
  pending,
  error,
  backendError,
  theme,
  reducedMotion,
  onModeChange,
  onDraftChange,
  onSubmit,
  onRetryBackend,
  onThemeChange,
  onReducedMotionChange,
}: EntryScreenProps) {
  const chaptersRef = useRef<HTMLElement>(null);
  const [activeChapter, setActiveChapter] = useState(0);
  const motionOff = useEntryReducedMotion(reducedMotion);
  const choreographySettled = useChoreographySettled(motionOff);

  // Which chapter the reader is in, for the vertical index. An observer on the
  // list items rather than a scroll handler, so it costs nothing when idle.
  useEffect(() => {
    const list = chaptersRef.current?.querySelectorAll("ol > li");
    if (!list?.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number(
            (entry.target as HTMLElement).dataset.chapterIndex ?? 0,
          );
          setActiveChapter(index);
        }
      },
      { threshold: 0.55 },
    );
    list.forEach((node, index) => {
      (node as HTMLElement).dataset.chapterIndex = String(index);
      observer.observe(node);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="entry-page"
      data-entry-state={choreographySettled ? "settled" : "entering"}
      data-entry-submit={pending ? "pending" : "idle"}
    >
      {!motionOff && (
        <ScrollProgress className="entry-scroll-progress" aria-hidden="true" />
      )}
      <a className="skip-link" href="#entry-console">
        Skip to table entry
      </a>
      <ChapterIndex count={chapters.length} active={activeChapter} />
      <StatusBand reducedMotion={motionOff} />

      <header className="entry-header">
        <BrandMark />
        <div className="entry-header__meta" aria-hidden="true">
          <span>S00—S43</span>
          <span>12 turns</span>
          <span>Fictional market</span>
        </div>
        <SettingsDialog
          theme={theme}
          companionMode="host"
          reducedMotion={reducedMotion}
          gameStarted={false}
          playerLocked={false}
          onThemeChange={onThemeChange}
          onModeChange={() => undefined}
          onReducedMotionChange={onReducedMotionChange}
        />
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="entry-hero" aria-labelledby="entry-title">
        <div className="entry-hero__stage">
          <div className="entry-hero__copy">
            <Reveal
              as="p"
              className="eyebrow"
              delay={ENTRY_STAGGER.eyebrow}
              reducedMotion={motionOff}
            >
              The physical board’s digital instrument
            </Reveal>
            <RevealLines
              id="entry-title"
              className="display-serif"
              delay={ENTRY_STAGGER.headline}
              reducedMotion={motionOff}
              lines={[
                <>
                  Keep the board <em>physical.</em>
                </>,
                <>
                  Run the table <em>here.</em>
                </>,
              ]}
            />
            <Reveal as="p" delay={ENTRY_STAGGER.body} reducedMotion={motionOff}>
              Give And Take tracks the shared market, verifies physical turns,
              and records evidence without turning the game into another screen.
            </Reveal>
          </div>

          <Reveal
            className="entry-relief-reveal"
            delay={ENTRY_STAGGER.artwork}
            reducedMotion={motionOff}
            y={18}
          >
            <BoardRouteRelief
              spaces={game.boardSpaces}
              reducedMotion={motionOff}
              interactive
            />
          </Reveal>

          <dl className="entry-proof">
            <div>
              <dt>44</dt>
              <dd>board spaces</dd>
            </div>
            <div>
              <dt>81</dt>
              <dd>printed cards</dd>
            </div>
            <div>
              <dt>2–5</dt>
              <dd>players</dd>
            </div>
          </dl>
        </div>

        <div className="entry-marks-layer">
          <RegistrationMarks />
        </div>

        <div id="entry-console" className="entry-console" tabIndex={-1}>
          {backendError && (
            <div className="entry-backend-alert" role="alert">
              <div>
                <strong>Shared table service unavailable</strong>
                <p>{backendError}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={onRetryBackend}
              >
                Retry connection
              </Button>
            </div>
          )}
          <Reveal
            as="header"
            className="entry-console__head"
            delay={ENTRY_STAGGER.console}
            reducedMotion={motionOff}
          >
            <p className="eyebrow">Table entry</p>
            <h2 id="entry-console-title" className="display-serif">
              Enter the table
            </h2>
          </Reveal>
          <Tabs
            value={mode}
            onValueChange={(value) => onModeChange(value as AccessMode)}
          >
            <TabsList className="access-tabs" aria-label="Access mode">
              {modes.map((item) => (
                <TabsTrigger key={item.id} value={item.id} disabled={pending}>
                  <span>{item.index}</span>
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </TabsTrigger>
              ))}
            </TabsList>
            {modes.map((item) => (
              <TabsContent key={item.id} value={item.id}>
                <AccessForm
                  mode={item.id}
                  draft={draft}
                  pending={pending}
                  error={error}
                  onDraftChange={onDraftChange}
                  onSubmit={onSubmit}
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>
        </section>

        <section
          className="entry-chapters"
          aria-labelledby="entry-story-title"
          ref={chaptersRef}
        >
        <header>
          <p className="eyebrow">The division of labour</p>
          <h2 id="entry-story-title" className="display-serif">
            Screen where it helps.
            <br />
            Table where it matters.
          </h2>
        </header>
        {/* The active chapter is carried by structure and the chapter index.
            Copy never starts dimmed: hosts must not depend on an intersection
            observer firing before the product explanation becomes readable. */}
        <ol>
          {chapters.map((chapter, index) => (
            <motion.li
              key={chapter.index}
              data-active={activeChapter === index || undefined}
              initial={motionOff ? false : { y: 18 }}
              whileInView={motionOff ? undefined : { y: 0 }}
              viewport={{ amount: 0.55, margin: "-12% 0px -12% 0px" }}
              transition={{
                duration: 0.6,
                delay: index * 0.05,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <span>{chapter.index}</span>
              <div>
                <h3 className="display-serif">{chapter.title}</h3>
                <p>{chapter.body}</p>
                <small>{chapter.detail}</small>
              </div>
            </motion.li>
          ))}
        </ol>
        </section>

        <section
          className="entry-board-chapter"
          aria-labelledby="entry-board-title"
        >
        <div className="entry-board-chapter__visual">
          <BoardRouteRelief
            spaces={game.boardSpaces}
            reducedMotion={motionOff}
            variant="chapter"
          />
        </div>
        <div className="entry-board-chapter__copy">
          <p className="eyebrow">The physical route, reconstructed</p>
          <h2 id="entry-board-title" className="display-serif">
            Forty-four spaces.
            <br />
            One shared signal.
          </h2>
          <p>
            The companion carries the printed perimeter into the host surface,
            then steps aside. Pawns still move by hand; only the verified
            position, shared market revision, and evidence record travel
            between screens.
          </p>
          <dl>
            <div>
              <dt>44</dt>
              <dd>physical stops</dd>
            </div>
            <div>
              <dt>05</dt>
              <dd>printed decks</dd>
            </div>
            <div>
              <dt>00</dt>
              <dd>digital dice</dd>
            </div>
          </dl>
        </div>
        </section>
      </main>

      <footer className="entry-footer">
        <BrandMark compact />
        <p>
          All prices, cash values and investment information are fictional.
          This game is not financial advice.
        </p>
      </footer>
    </div>
  );
}
