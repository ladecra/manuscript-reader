import { useEffect, useState, useRef, type ReactNode } from 'react';
import { QuillIcon } from '../components/ui/Icons';
import './landing.css';

interface LandingScreenProps {
  onOpenApp: () => void;
}

// ── Reduced-motion guard ────────────────────────────────────────────────────────
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ── Atmosphere: slow-drifting particles ─────────────────────────────────────────
// A single absolutely-positioned layer of small dots, each given a randomized
// position, size, drift duration and delay. Pure transform/opacity animation —
// cheap on the GPU. Suppressed entirely under prefers-reduced-motion.
function Particles({ count = 26 }: { count?: number }) {
  // Lazy-initialized once on mount. Randomness lives in the initializer (not the
  // render body), and is skipped entirely under reduced-motion.
  const [dots] = useState(() => {
    if (prefersReducedMotion()) return [] as {
      key: number; left: number; top: number; size: number;
      dur: number; delay: number; drift: number; opacity: number;
    }[];
    return Array.from({ length: count }, (_, i) => {
      const size = 1 + Math.random() * 2.4;
      return {
        key: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size,
        dur: 18 + Math.random() * 26,
        delay: -Math.random() * 30,
        drift: (Math.random() * 2 - 1) * 40,
        opacity: 0.12 + Math.random() * 0.5,
      };
    });
  });

  if (dots.length === 0) return null;
  return (
    <div className="lp-particles" aria-hidden="true">
      {dots.map(d => (
        <span
          key={d.key}
          className="lp-particle"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: `${d.size}px`,
            height: `${d.size}px`,
            opacity: d.opacity,
            // CSS custom props consumed by the keyframes
            ['--drift' as string]: `${d.drift}px`,
            animationDuration: `${d.dur}s`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Scroll-reveal hook ──────────────────────────────────────────────────────────
// Reveals all .lp-reveal descendants when the section enters the viewport.
function useReveal(threshold = 0.13) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const targets = () => Array.from(el.querySelectorAll<HTMLElement>('.lp-reveal'));
    if (prefersReducedMotion()) {
      targets().forEach(t => t.classList.add('lp-visible'));
      return;
    }
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          targets().forEach(t => t.classList.add('lp-visible'));
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return ref;
}

// ── Scroll-progress hook ────────────────────────────────────────────────────────
// Returns 0→1 progress of a tall section scrolling past a sticky viewport, used to
// drive the defamiliarization sequence. rAF-throttled; transform/opacity only.
function useScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(() => prefersReducedMotion() ? 1 : 0);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const p = total <= 0 ? 0 : Math.min(1, Math.max(0, -rect.top / total));
      setProgress(p);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    raf = requestAnimationFrame(measure); // defer initial measurement out of effect body
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return [ref, progress] as const;
}

// ── Synthetic manuscript prose ──────────────────────────────────────────────────
// Invented, generic literary text. NEVER real/unpublished manuscript content.
const HERO_LINES: { text: string; hl?: boolean }[] = [
  { text: 'The harbor had gone quiet by the time she reached the last pier,' },
  { text: 'and the lamps along the water burned low, the way they always did', hl: true },
  { text: 'in the hour before the boats came in. She had rehearsed the words' },
  { text: 'a hundred times on the walk down, and now, standing at the edge', hl: true },
  { text: 'of the dark and patient sea, she found she could not remember one.' },
];

const HERO_NOTES = [
  { type: 'Pacing', text: 'The hour before — lovely, but we linger here too long.' },
  { type: 'Question', text: 'Does she want to forget, or is she afraid to?' },
];

// ── The defamiliarization sequence — five stages of a manuscript page ────────────
const DEFAM_STAGES = [
  { kicker: 'Draft', caption: 'A working manuscript — marked, struck through, half-revised.' },
  { kicker: 'Clean reader', caption: 'The same words, given room to breathe. The author meets them as a stranger.' },
  { kicker: 'Highlighted', caption: 'Passages begin to carry weight. The eye returns to what matters.' },
  { kicker: 'Observations', caption: 'Reactions gather in the margins — honest, specific, in context.' },
  { kicker: 'Patterns', caption: 'Scattered notes resolve into structure. The manuscript starts to speak back.' },
];

const INTEL_CLUSTERS = [
  { label: 'Questions', n: 14 },
  { label: 'Hotspots', n: 6 },
  { label: 'Continuity', n: 9 },
  { label: 'Engagement', n: 23 },
];

// ── Icons (line-art, marketing) ─────────────────────────────────────────────────
const ico = (paths: ReactNode, size = 20) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>
);
const EyeIco  = () => ico(<><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="2.6" /></>);

// ── Component ────────────────────────────────────────────────────────────────────
export function LandingScreen({ onOpenApp }: LandingScreenProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const problemRef = useReveal();
  const readingRef = useReveal();
  const intelRef   = useReveal();
  const workRef    = useReveal();
  const ctaRef     = useReveal();

  // Defamiliarization pin
  const [defamRef, defamProgress] = useScrollProgress();
  const stageCount = DEFAM_STAGES.length;
  const stage = Math.min(stageCount - 1, Math.floor(defamProgress * stageCount));

  return (
    <div className="lp">
      {/* ── Fixed atmosphere ─────────────────────────────────────────────────── */}
      <div className="lp-atmosphere" aria-hidden="true">
        <div className="lp-glow lp-glow-amber" />
        <div className="lp-glow lp-glow-indigo" />
        <div className="lp-glow lp-glow-plum" />
        <Particles />
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <nav className={`lp-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="lp-container lp-nav-inner">
          <button className="lp-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <QuillIcon size={18} />
            <span className="lp-brand-name">
              <span className="lp-brand-word">Vellibris</span>
              <span className="lp-brand-sub">Manuscript Reader</span>
            </span>
          </button>
          <div className="lp-nav-links">
            <button className="lp-nav-link" onClick={() => scrollTo('lp-problem')}>The problem</button>
            <button className="lp-nav-link" onClick={() => scrollTo('lp-reading')}>The reader</button>
            <button className="lp-nav-link" onClick={() => scrollTo('lp-intelligence')}>Intelligence</button>
            <button className="lp-btn lp-nav-cta" onClick={onOpenApp}>Open a manuscript</button>
          </div>
        </div>
      </nav>

      {/* ── 1. Hero — a manuscript floating in darkness ──────────────────────── */}
      <header className="lp-hero">
        <div className="lp-container lp-hero-inner">
          <div className="lp-hero-copy">
            <h1 className="lp-h1 lp-rise d1">
              Read your manuscript<br />like a <em>reader.</em>
            </h1>
            <p className="lp-lead lp-rise d2">
              Step outside the drafting process. Experience your work with fresh eyes,
              capture authentic reactions, and discover what your manuscript is actually
              doing on the page.
            </p>
            <div className="lp-hero-cta lp-rise d3">
              <button className="lp-btn lp-btn-lg lp-btn-amber" onClick={onOpenApp}>Open a manuscript</button>
              <button className="lp-btn lp-btn-lg lp-btn-ghost" onClick={() => scrollTo('lp-problem')}>See how it works</button>
            </div>
            <p className="lp-hero-note lp-rise d4">
              For authors, beta readers, ARC readers &amp; editors&nbsp;·&nbsp;runs in your
              browser&nbsp;·&nbsp;your manuscript never leaves your device
            </p>
          </div>

          {/* Floating manuscript page */}
          <div className="lp-hero-visual lp-rise d5" aria-hidden="true">
            <div className="lp-page lp-page-float">
              <div className="lp-page-head">
                <span className="lp-page-ch">Chapter One</span>
                <span className="lp-page-title">The Last Pier</span>
              </div>
              <div className="lp-page-body">
                {HERO_LINES.map((l, i) => (
                  <p key={i} className={`lp-page-line${l.hl ? ' hl' : ''}`}>{l.text}</p>
                ))}
              </div>
              {HERO_NOTES.map((n, i) => (
                <div key={i} className={`lp-margin-note n${i}`}>
                  <span className="lp-margin-type">{n.type}</span>
                  <span className="lp-margin-text">{n.text}</span>
                </div>
              ))}
            </div>
            <div className="lp-page-shadow" />
          </div>
        </div>
        <button className="lp-scroll-cue" onClick={() => scrollTo('lp-problem')} aria-label="Scroll down">
          <span>Begin</span>
          <svg viewBox="0 0 16 24" width="14" height="22" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3v15M3 13l5 5 5-5" />
          </svg>
        </button>
      </header>

      {/* ── 2. The Problem — split screen ────────────────────────────────────── */}
      <section className="lp-section lp-problem" id="lp-problem" ref={problemRef}>
        <div className="lp-container">
          <div className="lp-problem-grid lp-reveal">
            <div className="lp-problem-panel lp-noise">
              <div className="lp-noise-toolbar">
                <span /><span /><span /><span /><span /><span /><span /><span />
              </div>
              <div className="lp-noise-ribbon"><span /><span /><span /><span /><span /></div>
              <div className="lp-noise-page">
                <p>The harbor <s>was</s> had gone quiet by the <mark className="lp-tc">time</mark> she</p>
                <p>reached the <s>final</s> last pier, and the lamps <mark className="lp-tc-ins">along</mark></p>
                <p>the water burned low<span className="lp-tc-comment">↩ awkward?</span></p>
                <p>the way they always did in the hour before</p>
                <p>the <s>ships</s> boats came in.</p>
              </div>
              <span className="lp-panel-tag">A drafting tool</span>
            </div>

            <div className="lp-problem-panel lp-quiet">
              <div className="lp-page lp-page-still">
                <div className="lp-page-body">
                  <p className="lp-page-line">The harbor had gone quiet by the time she reached the last pier,</p>
                  <p className="lp-page-line">and the lamps along the water burned low, the way they always did</p>
                  <p className="lp-page-line">in the hour before the boats came in.</p>
                </div>
              </div>
              <span className="lp-panel-tag">The Manuscript Reader</span>
            </div>
          </div>

          <div className="lp-problem-copy lp-reveal">
            <p className="lp-statement">Writers cannot evaluate what they are actively editing.</p>
            <p className="lp-statement-sub">
              The core problem isn't annotation, and it isn't reports. It's
              <em> perception</em> — the near-impossibility of seeing your own pages the
              way a reader will.
            </p>
          </div>
        </div>
      </section>

      {/* ── 3. Defamiliarization — scroll-driven transformation ──────────────── */}
      <section className="lp-defam" ref={defamRef}>
        <div className="lp-defam-pin">
          <div className="lp-container lp-defam-inner">
            <div className="lp-defam-copy">
              <span className="lp-kicker">{DEFAM_STAGES[stage].kicker}</span>
              <h2 className="lp-h2">The moment a manuscript becomes readable, it becomes editable.</h2>
              <p className="lp-defam-caption">{DEFAM_STAGES[stage].caption}</p>
              <div className="lp-defam-track" aria-hidden="true">
                {DEFAM_STAGES.map((_, i) => (
                  <span key={i} className={`lp-defam-pip${i <= stage ? ' on' : ''}`} />
                ))}
              </div>
            </div>

            <div className={`lp-defam-stage s${stage}`} aria-hidden="true">
              {/* Layer 0 — draft */}
              <div className="lp-defam-layer lp-defam-draft">
                <p>The harbor <s>was</s> had gone <s>very</s> quiet by the time</p>
                <p>she reached the <s>final</s> last pier, and the lamps</p>
                <p>along the water <s>shone</s> burned low,</p>
                <p>the way they always did in the hour before.</p>
              </div>
              {/* Layer 1+ — clean page, progressively augmented */}
              <div className="lp-defam-layer lp-defam-clean">
                <p className="dl">The harbor had gone quiet by the time she reached the last pier,</p>
                <p className="dl dl-hl">and the lamps along the water burned low, the way they always did</p>
                <p className="dl">in the hour before the boats came in. She had rehearsed the words</p>
                <p className="dl dl-hl">a hundred times on the walk down, and now, standing at the edge</p>
                <p className="dl">of the dark and patient sea, she found she could not remember one.</p>

                <div className="lp-defam-note dn0">
                  <span className="lp-margin-type">Pacing</span>
                  <span>We linger in this hour a touch too long.</span>
                </div>
                <div className="lp-defam-note dn1">
                  <span className="lp-margin-type">Question</span>
                  <span>Does she want to forget — or fear to?</span>
                </div>

                <div className="lp-defam-cluster">
                  {INTEL_CLUSTERS.map((c, i) => (
                    <span key={c.label} className={`lp-cluster-node c${i}`}>{c.n}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. The Reading Experience — screenshots as art ───────────────────── */}
      <section className="lp-section lp-reading" id="lp-reading" ref={readingRef}>
        <div className="lp-container">
          <div className="lp-reading-head lp-reveal">
            <span className="lp-kicker">The reading experience</span>
            <h2 className="lp-h2">A place to meet your work as a stranger.</h2>
            <p className="lp-sub">
              No cursor. No edit mode. No toolbars between you and the prose — just the
              manuscript, chapter by chapter, the way a reader will first meet it.
            </p>
          </div>
        </div>
        <figure className="lp-art lp-reveal">
          <img src="/screenshots/reader-light.png" alt="The Vellibris reader in light mode — clean, immersive prose" loading="lazy" />
        </figure>
        <figure className="lp-art lp-art-dark lp-reveal">
          <img src="/screenshots/reader-annotated.png" alt="A manuscript with reader annotations in the margin" loading="lazy" />
        </figure>
      </section>

      {/* ── 5. Intelligence Emerging ─────────────────────────────────────────── */}
      <section className="lp-section lp-intel" id="lp-intelligence" ref={intelRef}>
        <div className="lp-container">
          <div className="lp-intel-head lp-reveal">
            <span className="lp-kicker">Intelligence, revealed late</span>
            <h2 className="lp-h2">Read. Observe. Collect reactions. Discover patterns.</h2>
            <p className="lp-sub">
              Most tools begin with analysis. We end with it. Annotations accumulate into
              structured editorial signal — questions, hotspots, continuity breaks, the
              chapters readers move through without a flicker. Nothing generated. Nothing
              invented. Signals that were already there, made visible.
            </p>
          </div>

          <div className="lp-intel-stage lp-reveal">
            <div className="lp-intel-clusters" aria-hidden="true">
              {INTEL_CLUSTERS.map((c, i) => (
                <div key={c.label} className={`lp-intel-cluster ic${i}`}>
                  <span className="lp-intel-n">{c.n}</span>
                  <span className="lp-intel-label">{c.label}</span>
                </div>
              ))}
            </div>
            <figure className="lp-art lp-art-inset">
              <img src="/screenshots/reader-dark.png" alt="The intelligence report drawn from the manuscript and its annotations" loading="lazy" />
            </figure>
          </div>
        </div>
      </section>

      {/* ── 6. The Author's Workspace — the observatory ──────────────────────── */}
      <section className="lp-section lp-work" ref={workRef}>
        <div className="lp-container lp-work-inner">
          <div className="lp-work-copy lp-reveal">
            <span className="lp-kicker">The author's workspace</span>
            <h2 className="lp-h2">Where serious manuscripts mature.</h2>
            <p className="lp-sub">
              Not file management. Project state. Each manuscript becomes a living thing —
              its reads, its readers, its open questions, its progress toward done — held in
              one quiet observatory rather than scattered across drafts and inboxes.
            </p>
            <button className="lp-link-cta" onClick={onOpenApp}>
              <EyeIco /> Open the workspace
            </button>
          </div>
          <div className="lp-work-visual lp-reveal" aria-hidden="true">
            {[
              { t: 'The Last Pier', s: 'In revision', p: 0.62, n: 41 },
              { t: 'Salt and Ember', s: 'With readers', p: 0.34, n: 17 },
              { t: 'The Quiet House', s: 'Draft', p: 0.12, n: 4 },
            ].map((m, i) => (
              <div key={m.t} className={`lp-obs-card oc${i}`}>
                <div className="lp-obs-top">
                  <span className="lp-obs-title">{m.t}</span>
                  <span className="lp-obs-status">{m.s}</span>
                </div>
                <div className="lp-obs-bar"><span style={{ width: `${m.p * 100}%` }} /></div>
                <div className="lp-obs-meta">{m.n} reader notes</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. Closing ───────────────────────────────────────────────────────── */}
      <section className="lp-section lp-close" ref={ctaRef}>
        <div className="lp-container lp-reveal lp-close-inner">
          <p className="lp-close-quote">
            The best stories aren't only written.<br />
            They're <em>read, felt, questioned —</em> and only then revised.
          </p>
          <button className="lp-btn lp-btn-lg lp-btn-amber lp-btn-arrow" onClick={onOpenApp}>
            Open a manuscript
            <svg className="lp-arrow-ico" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 10h12M12 5l5 5-5 5" />
            </svg>
          </button>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <button className="lp-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <QuillIcon size={18} />
            <span className="lp-brand-name">
              <span className="lp-brand-word">Vellibris</span>
              <span className="lp-brand-sub">Manuscript Reader</span>
            </span>
          </button>
          <nav className="lp-foot-links">
            <a onClick={() => scrollTo('lp-problem')}>The problem</a>
            <a onClick={() => scrollTo('lp-reading')}>The reader</a>
            <a onClick={() => scrollTo('lp-intelligence')}>Intelligence</a>
            <a onClick={onOpenApp}>Open the app</a>
          </nav>
          <span className="lp-foot-copy">© {new Date().getFullYear()} Vellibris — placeholder name</span>
        </div>
      </footer>
    </div>
  );
}
