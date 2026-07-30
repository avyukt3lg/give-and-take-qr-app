import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { motion } from "motion/react";

import type {
  AccessMode,
  AuthDraft,
  AuthSubmission,
} from "@/app/contracts";
import {
  AsciiRasterCanvas,
  createEntryBoardPreset,
} from "@/components/effects/ascii";
import { BrandMark } from "@/components/brand/BrandMark";
import { useScene } from "@/hooks/useScene";
import { useThemeTokens } from "@/hooks/useThemeTokens";
import { useBoardResolve } from "./useBoardResolve";
import {
  ChapterIndex,
  ENTRY_STAGGER,
  RegistrationMarks,
  Reveal,
  RevealLines,
  StatusBand,
  useEntryReducedMotion,
  useLayerParallax,
} from "./EntryMotion";
import { SettingsDialog } from "@/components/layout/SettingsDialog";
import { Button } from "@/components/ui/button";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ThemeId } from "@/domain/types";
import { AccessForm } from "./AccessForm";

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

interface LazyBoardSceneProps {
  active: boolean;
  progress?: number;
  reducedMotion?: boolean;
  className?: string;
  onError?: (error: Error) => void;
}

const BOARD_FALLBACK_URL = `${import.meta.env.BASE_URL}outputs/final_assets/board/give_and_take_board_web_640.webp`;

const StaticBoardScene: ComponentType<LazyBoardSceneProps> = ({
  active,
  className,
}) =>
  active ? (
    <div
      className={`board-point-scene ${className ?? ""}`}
      aria-hidden="true"
      data-renderer="static"
    >
      <img
        src={BOARD_FALLBACK_URL}
        alt=""
        className="board-point-scene__fallback"
        decoding="async"
      />
    </div>
  ) : null;

const LazyBoardPointCloudScene = lazy<ComponentType<LazyBoardSceneProps>>(
  async (): Promise<{ default: ComponentType<LazyBoardSceneProps> }> => {
  try {
    const module = await import("@/components/effects/BoardPointCloudScene");
      return {
        default: module.BoardPointCloudScene as ComponentType<LazyBoardSceneProps>,
      };
  } catch {
    return { default: StaticBoardScene };
  }
  },
);

const DevelopmentAsciiEffectLab = import.meta.env.DEV
  ? lazy(() => import("@/components/effects/ascii/AsciiEffectLab"))
  : null;

/**
 * The hero samples the printed board, not the box photo.
 *
 * The box photo is a dark product shot, so dithering it produced a handful of
 * lit cells on grey and the caption promising a "sampled table signal" was
 * writing a cheque the frame could not cash. The board is the actual focal
 * object of this product, it is bright and high-contrast, and it survives
 * being reduced to a cell grid — you can still read the route.
 */
const BOARD_ARTWORK_1280 = `${import.meta.env.BASE_URL}outputs/final_assets/board/give_and_take_board_web_1280.webp`;
const BOARD_ARTWORK_640 = `${import.meta.env.BASE_URL}outputs/final_assets/board/give_and_take_board_web_640.webp`;

function prefersMobileArtwork(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  return (
    window.matchMedia("(max-width: 640px)").matches ||
    (navigator.hardwareConcurrency ?? 8) <= 4
  );
}

function useEntryArtworkSource(): { source: string; mobile: boolean } {
  const [mobile, setMobile] = useState(prefersMobileArtwork);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const update = () => setMobile(prefersMobileArtwork());
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return {
    source: mobile ? BOARD_ARTWORK_640 : BOARD_ARTWORK_1280,
    mobile,
  };
}

export interface EntryScreenProps {
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
  const { active: asciiActive, activate: activateAscii } = useScene("ascii");
  const {
    active: boardActive,
    activate: activateBoard,
    release: releaseBoard,
  } = useScene("board");
  const [renderFailed, setRenderFailed] = useState(false);
  const [boardProgress, setBoardProgress] = useState(0);
  const boardChapterRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const chaptersRef = useRef<HTMLElement>(null);
  const [activeChapter, setActiveChapter] = useState(0);
  const motionOff = useEntryReducedMotion(reducedMotion);
  // Background slowest, marks a touch faster, console fixed. Small on purpose.
  const artworkDrift = useLayerParallax(heroRef, 26, motionOff);
  const markDrift = useLayerParallax(heroRef, 40, motionOff);
  const { source: artworkSource, mobile } = useEntryArtworkSource();
  const tokens = useThemeTokens(theme);
  const quality = mobile ? "balanced" : "high";
  const boardCellSize = useBoardResolve(motionOff, asciiActive);
  const asciiConfig = useMemo(
    () =>
      createEntryBoardPreset({
        tint: tokens.brass,
        background: tokens.canvasSunk,
        quality,
        cellSize: boardCellSize,
        reducedMotion,
      }),
    [boardCellSize, quality, reducedMotion, tokens.brass, tokens.canvasSunk],
  );
  const showEffectLab =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("ascii-lab");

  useEffect(() => {
    if (showEffectLab) return;
    const chapter = boardChapterRef.current;
    if (!chapter) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          activateBoard();
          return;
        }
        if (entry.boundingClientRect.top > 0) {
          activateAscii();
        } else {
          releaseBoard();
        }
      },
      {
        rootMargin: "-10% 0px -18% 0px",
        threshold: [0, 0.15],
      },
    );
    observer.observe(chapter);
    return () => observer.disconnect();
  }, [
    activateAscii,
    activateBoard,
    releaseBoard,
    showEffectLab,
  ]);

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

  useEffect(() => {
    if (!boardActive || reducedMotion) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const chapter = boardChapterRef.current;
      if (!chapter) return;
      const bounds = chapter.getBoundingClientRect();
      const viewport = Math.max(window.innerHeight, 1);
      const progress = Math.max(
        0,
        Math.min(1, (viewport - bounds.top) / (bounds.height + viewport)),
      );
      setBoardProgress(progress);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [boardActive, reducedMotion]);

  const sceneProgress = reducedMotion ? 0.68 : boardProgress;

  if (showEffectLab && DevelopmentAsciiEffectLab) {
    return (
      <Suspense
        fallback={
          <main className="boot-stage">
            <p>Loading the ASCII effect instrument…</p>
          </main>
        }
      >
        <DevelopmentAsciiEffectLab />
      </Suspense>
    );
  }

  return (
    <div className="entry-page">
      <ScrollProgress className="entry-scroll-progress" aria-hidden="true" />
      <a className="skip-link" href="#main-content">
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

      <section className="entry-hero" aria-labelledby="entry-title" ref={heroRef}>
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
          {/* In the copy flow rather than floating over the artwork, where it
              was clipped by the full-bleed overscan and hidden behind the
              console. The claim is deliberately modest: at hero scale this is
              atmosphere sampled from the board, and the board is the subject
              further down the page rather than the ground. */}
          <Reveal
            as="p"
            className="entry-art__caption"
            delay={ENTRY_STAGGER.proof}
            reducedMotion={motionOff}
          >
            Sampled from the printed board
          </Reveal>
        </div>

        <motion.div
          className="entry-art"
          data-failed={renderFailed || undefined}
          style={{ y: artworkDrift }}
          aria-hidden="true"
        >
          <div className="entry-art__frame">
            <AsciiRasterCanvas
              src={artworkSource}
              config={asciiConfig}
              paused={!asciiActive || motionOff}
              quality={quality}
              solidBackground={tokens.canvasSunk}
              fit="cover"
              fallbackImage={artworkSource}
              fallbackAlt=""
              className="entry-ascii"
              onError={() => setRenderFailed(true)}
            />
          </div>
        </motion.div>

        <motion.div className="entry-marks-layer" style={{ y: markDrift }}>
          <RegistrationMarks />
        </motion.div>

        {/* The console holds the primary action, so it is the one thing on this
            page that never parallaxes and never tilts. */}
        <main id="main-content" className="entry-console" tabIndex={-1}>
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
        </main>
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
        {/* Scroll-linked, not scroll-triggered. The previous chapters recede
            and dim as you pass them, so the section reads as one progression
            under the reader's control rather than three independent fades that
            fire once and are then inert. */}
        <ol>
          {chapters.map((chapter, index) => (
            <motion.li
              key={chapter.index}
              data-active={activeChapter === index || undefined}
              initial={motionOff ? false : { opacity: 0.35, y: 26 }}
              whileInView={motionOff ? undefined : { opacity: 1, y: 0 }}
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
        ref={boardChapterRef}
        className="entry-board-chapter"
        aria-labelledby="entry-board-title"
        data-scene-active={boardActive || undefined}
      >
        <div className="entry-board-chapter__visual" aria-hidden="true">
          {boardActive ? (
            <Suspense fallback={<StaticBoardScene active />}>
              <LazyBoardPointCloudScene
                active
                progress={sceneProgress}
                reducedMotion={reducedMotion}
              />
            </Suspense>
          ) : (
            <StaticBoardScene active />
          )}
        </div>
        <div className="entry-board-chapter__copy">
          <p className="eyebrow">The physical route, reconstructed</p>
          <h2 id="entry-board-title" className="display-serif">
            Forty-four spaces.
            <br />
            One shared signal.
          </h2>
          <p>
            The companion samples the printed route into a technical point
            field, then steps aside. Pawns still move by hand; only the verified
            position, market revision, and evidence record travel between
            screens.
          </p>
          <dl>
            <div>
              <dt>44</dt>
              <dd>physical stops</dd>
            </div>
            <div>
              <dt>01</dt>
              <dd>shared revision</dd>
            </div>
            <div>
              <dt>00</dt>
              <dd>digital dice</dd>
            </div>
          </dl>
        </div>
      </section>

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
