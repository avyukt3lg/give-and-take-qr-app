import {
  lazy,
  Suspense,
  useEffect,
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
import productBox from "@/assets/product-box-1024.avif";
import productBoxMobile from "@/assets/product-box-640.jpg";
import {
  AsciiRasterCanvas,
  BENJAMINS_DITHER_PRESET,
} from "@/components/effects/ascii";
import { BrandMark } from "@/components/brand/BrandMark";
import { useScene } from "@/hooks/useScene";
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

function prefersMobileArtwork(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  return (
    window.matchMedia("(max-width: 640px)").matches ||
    (navigator.hardwareConcurrency ?? 8) <= 4
  );
}

function useEntryArtworkSource(): string {
  const [mobile, setMobile] = useState(prefersMobileArtwork);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const update = () => setMobile(prefersMobileArtwork());
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return mobile ? productBoxMobile : productBox;
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
  const artworkSource = useEntryArtworkSource();
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

      <section className="entry-hero" aria-labelledby="entry-title">
        <div className="entry-hero__copy">
          <p className="eyebrow">The physical board’s digital instrument</p>
          <h1 id="entry-title" className="display-serif">
            Keep the board <em>physical.</em>
            <br />
            Run the table <em>here.</em>
          </h1>
          <p>
            Give And Take tracks the shared market, verifies physical turns,
            and records evidence without turning the game into another screen.
          </p>
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

        <div className="entry-art" data-failed={renderFailed || undefined}>
          <div className="entry-art__frame">
            <AsciiRasterCanvas
              src={artworkSource}
              config={BENJAMINS_DITHER_PRESET}
              paused={!asciiActive || reducedMotion}
              quality="balanced"
              solidBackground="#080b09"
              fit="cover"
              fallbackImage={artworkSource}
              fallbackAlt=""
              className="entry-ascii"
              onError={() => setRenderFailed(true)}
            />
          </div>
          <span className="entry-art__caption">
            Box artwork translated live into a sampled table signal
          </span>
          <span className="entry-art__code" aria-hidden="true">
            GT / 2026
          </span>
        </div>

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

      <section className="entry-chapters" aria-labelledby="entry-story-title">
        <header>
          <p className="eyebrow">The division of labour</p>
          <h2 id="entry-story-title" className="display-serif">
            Screen where it helps.
            <br />
            Table where it matters.
          </h2>
        </header>
        <ol>
          {chapters.map((chapter, index) => (
            <motion.li
              key={chapter.index}
              initial={reducedMotion ? false : { opacity: 1, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.55, delay: index * 0.04 }}
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
