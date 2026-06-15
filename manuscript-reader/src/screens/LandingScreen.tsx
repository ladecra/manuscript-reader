import { useEffect, useState, useRef, type ReactNode } from 'react';
import { QuillIcon } from '../components/ui/Icons';
import './landing.css';

interface LandingScreenProps {
  onOpenApp: () => void;
}

// ── Marketing icons ────────────────────────────────────────────────────────────
const ico = (paths: ReactNode, size = 22) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>
);
const BookIco    = () => ico(<><path d="M4 5.5A2 2 0 0 1 6 4h8v15H6a2 2 0 0 0-2 2z" /><path d="M14 4h2a2 2 0 0 1 2 2v13H14" /></>);
const PenIco     = () => ico(<><path d="M14 4l6 6L9 21H3v-6z" /><path d="M12.5 6.5l5 5" /></>);
const ChatIco    = () => ico(<><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>);
const ReviseIco  = () => ico(<><path d="M20 11a8 8 0 1 0-1.5 5" /><path d="M20 5v5h-5" /></>);
const ReaderIco  = () => ico(<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h5" /></>);
const LayerIco   = () => ico(<><path d="M12 3l8 4-8 4-8-4z" /><path d="M4 12l8 4 8-4M4 16.5l8 4 8-4" /></>);
const PacketIco  = () => ico(<><path d="M5 4h11l3 3v13H5z" /><path d="M15 4v4h4M9 13h6M9 16h6" /></>);
const ReportIco  = () => ico(<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 15v-3M12 15V9M16 15v-5" /></>);

// ── Screenshot frame ──────────────────────────────────────────────────────────
function ScreenFrame({
  label,
  src,
  alt,
  wide = false,
  tilt = false,
  dark = false,
}: {
  label: string;
  src?: string;
  alt?: string;
  wide?: boolean;
  tilt?: boolean;
  dark?: boolean;
}) {
  return (
    <div className={`lp-frame${wide ? ' lp-frame-wide' : ''}${tilt ? ' lp-frame-tilt' : ''}${dark ? ' lp-frame-dark' : ''}`}>
      <div className="lp-frame-bar">
        <span className="lp-dot" /><span className="lp-dot" /><span className="lp-dot" />
        <span className="lp-frame-url" aria-hidden="true">vellibris</span>
      </div>
      {src ? (
        <img src={src} alt={alt ?? label} className="lp-frame-img" />
      ) : (
        <div className="lp-frame-screen">
          <div className="lp-frame-mock" aria-hidden="true">
            <div className="lp-mock-lines">
              <span /><span /><span className="lp-mock-indent" /><span />
              <span /><span className="lp-mock-indent" /><span className="lp-mock-short" />
              <span /><span /><span className="lp-mock-indent" /><span />
            </div>
            <span className="lp-frame-label">{label}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────
const STEPS = [
  {
    n: '01', icon: <BookIco />, h: 'Read',
    p: 'Open your manuscript in a focused, immersive reading environment — no cursor, no edit mode. Just the prose, chapter by chapter, the way your reader will meet it for the first time.',
  },
  {
    n: '02', icon: <PenIco />, h: 'Annotate',
    p: 'Mark continuity slips, pacing problems, and structural questions as you read. Notes live on the text — no separate document, nothing to reconcile later.',
  },
  {
    n: '03', icon: <ChatIco />, h: 'Share',
    p: 'Export an HTML reader link — with or without your annotations already visible. Beta readers, ARC readers, and editors open it in any browser, no account needed, and mark it up in the same focused environment you read in.',
  },
  {
    n: '04', icon: <ReviseIco />, h: 'Revise',
    p: 'Every note attributed and in context. Work through them chapter by chapter with the full picture in front of you, not a stack of marked-up printouts from three different drafts.',
  },
];

const COMPARE = [
  { them: 'Help you produce words',         us: 'Help you see and fix the words you have' },
  { them: 'Author alone at the keyboard',   us: 'Author + beta readers + editors, in a loop' },
  { them: 'AI = generation / autocomplete', us: 'Intelligence = surfaced patterns, not generation' },
  { them: '"Start a new project"',          us: '"Open a manuscript you\'ve already written"' },
];

const PILLARS = [
  { n: '01', h: 'Structure',   p: 'Chapter pacing, scene balance, narrative arc — surfaced from the manuscript, not imposed on it.' },
  { n: '02', h: 'Continuity',  p: 'Character names, timeline consistency, physical detail — flagged wherever they slip.' },
  { n: '03', h: 'Analysis',    p: 'Signals drawn from your text. Nothing generated. Nothing invented. Your words, read more carefully.' },
];

const CARDS = [
  { icon: <ReaderIco />, h: 'Manuscript reader',   p: 'A focused reading environment built for long-form prose. Real chapter structure. No distractions.' },
  { icon: <LayerIco />,  h: 'Annotation layer',    p: 'Typed, color-coded marks that live on the text and never alter the source file.' },
  { icon: <PacketIco />, h: 'Share links',          p: 'Export an HTML reader — with or without annotations visible. Beta readers, ARC readers, and editors annotate in their browser. Import their feedback when they\'re done.' },
  { icon: <ReportIco />, h: 'Intelligence report', p: 'Structural and continuity signals surfaced from the manuscript. Analysis, never generation.' },
];

// ── Scroll-reveal hook ────────────────────────────────────────────────────────
// Observes the section element (ref) and reveals all .lp-reveal children when
// the section enters the viewport, since lp-visible must be on the same element
// as lp-reveal for the CSS rule `.lp-reveal.lp-visible` to match.
function useReveal(threshold = 0.13) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const targets = () => Array.from(el.querySelectorAll<HTMLElement>('.lp-reveal'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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

// ── Component ─────────────────────────────────────────────────────────────────
export function LandingScreen({ onOpenApp }: LandingScreenProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const wedgeRef    = useReveal();
  const processRef  = useReveal();
  const authorsRef  = useReveal();
  const shareRef    = useReveal();
  const intelRef    = useReveal();
  const workflowRef = useReveal();
  const ctaRef      = useReveal();

  return (
    <div className="lp">

      {/* ── 1. Nav ──────────────────────────────────────────────────────────── */}
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
            <button className="lp-nav-link" onClick={() => scrollTo('lp-process')}>How it works</button>
            <button className="lp-nav-link" onClick={() => scrollTo('lp-authors')}>For authors</button>
            <button className="lp-nav-link" onClick={() => scrollTo('lp-intelligence')}>Intelligence</button>
            <button className="lp-btn lp-nav-cta" onClick={onOpenApp}>Open a manuscript</button>
          </div>
        </div>
      </nav>

      {/* ── 2. Hero ─────────────────────────────────────────────────────────── */}
      <header className="lp-hero">
        <div className="lp-container lp-hero-inner">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow lp-rise">Manuscript intelligence</span>
            <h1 className="lp-h1 lp-rise d1">
              <em>Read</em> like a reader.<br />
              Think like an editor.
            </h1>
            <p className="lp-lead lp-rise d2">
              You've revised this manuscript more times than you can count.
              Vellibris gives you the one thing revision actually needs: distance.
              A clean reading environment, annotation built in, structural signals
              surfaced from the text itself — without printing a page.
            </p>
            <div className="lp-hero-cta lp-rise d3">
              <button className="lp-btn lp-btn-lg" onClick={onOpenApp}>Open a manuscript</button>
              <button className="lp-btn lp-btn-ghost lp-btn-lg" onClick={() => scrollTo('lp-process')}>See how it works</button>
            </div>
            <p className="lp-hero-note lp-rise d4">
              For authors, beta readers, ARC readers &amp; editors &nbsp;·&nbsp; runs in your browser &nbsp;·&nbsp; your manuscript never leaves your device
            </p>
          </div>

          <div className="lp-hero-visual lp-rise d5" aria-hidden="true">
            <div className="lp-preview">
              <div className="lp-preview-bar">
                <span className="lp-dot" /><span className="lp-dot" /><span className="lp-dot" />
                <span className="lp-preview-tab">The White Procession · Ch. 01</span>
              </div>
              <img
                src="/screenshots/reader-light.png"
                alt="Vellibris manuscript reader — light mode"
                className="lp-preview-img"
              />
            </div>
            <div className="lp-hero-phone">
              <img
                src="/screenshots/reader-mobile.png"
                alt="Vellibris on mobile"
                className="lp-hero-phone-img"
              />
            </div>
          </div>
        </div>
      </header>

      {/* ── 3. Wedge band (dark) ────────────────────────────────────────────── */}
      <section className="lp-section lp-dark lp-wedge" ref={wedgeRef}>
        <div className="lp-container">
          <div className="lp-wedge-inner lp-reveal">
            <div className="lp-wedge-copy">
              <span className="lp-eyebrow lp-dark-eyebrow">The distinction</span>
              <h2 className="lp-h2 lp-dark-h">
                Software for revision,<br />not generation.
              </h2>
              <p className="lp-dark-body">
                Ulysses, Scrivener, Word — writing tools. Some have highlighting bolted on.
                Vellibris starts <em>after the draft exists</em> and owns the part those tools
                neglect: the revision loop.
              </p>
              <p className="lp-dark-body" style={{ marginTop: '1em' }}>
                The revision loop — author, beta readers, ARC readers, editors, back to the author —
                has never had a proper home. Vellibris is that home: a shared environment where
                reading, annotation, and feedback all live together.
              </p>
            </div>
            <div className="lp-compare">
              <div className="lp-compare-col lp-compare-them">
                <div className="lp-compare-head">Writing tools</div>
                {COMPARE.map(r => <div className="lp-compare-row" key={r.them}>{r.them}</div>)}
              </div>
              <div className="lp-compare-spine" aria-hidden="true" />
              <div className="lp-compare-col lp-compare-us">
                <div className="lp-compare-head">Vellibris</div>
                {COMPARE.map(r => (
                  <div className="lp-compare-row lp-compare-us-row" key={r.us}>
                    <span className="lp-compare-check" aria-hidden="true">→</span>
                    {r.us}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. Revision process loop ──────────────────────────────────────────── */}
      <section className="lp-section" id="lp-process" ref={processRef}>
        <div className="lp-container">
          <div className="lp-section-head center lp-reveal">
            <span className="lp-kicker">The revision loop, rebuilt</span>
            <h2 className="lp-h2">From first read to final pass.</h2>
            <p className="lp-sub">
              Most manuscripts still travel through PDFs, printouts, sticky notes, and
              tracked-changes chaos. There is a better loop.
            </p>
          </div>
          <div className="lp-loop lp-reveal">
            {STEPS.map((s, i) => (
              <div className={`lp-step lp-step-${i % 2 === 0 ? 'above' : 'below'}`} key={s.n}>
                <div className="lp-step-ico">{s.icon}</div>
                <div className="lp-step-body">
                  <span className="lp-step-n">{s.n}</span>
                  <h3 className="lp-step-h">{s.h}</h3>
                  <p className="lp-step-p">{s.p}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. For authors ──────────────────────────────────────────────────── */}
      <section className="lp-section lp-authors-section" id="lp-authors" ref={authorsRef}>
        <div className="lp-container">
          <div className="lp-authors-inner lp-reveal">
            <div className="lp-feature-visual lp-bleed-left">
              <ScreenFrame
                label="Vellibris reader — light mode"
                src="/screenshots/reader-light.png"
                tilt
              />
            </div>
            <div className="lp-feature-copy">
              <span className="lp-kicker">For authors</span>
              <h2 className="lp-h2">You've read it<br />too many times<br />to see it anymore.</h2>
              <p className="lp-feature-body">
                Every author knows the feeling: you read the same paragraph for the twentieth time
                and see only what you meant to write. Not what's actually on the page.
              </p>
              <p className="lp-feature-body">
                Changing the format changes what you notice. Vellibris gives you that shift
                without the paper — a true reading view, chapter by chapter, with no cursor
                blinking and no edit mode pulling your eye to last week's changes.
                Just the prose, meeting you the way a reader will.
              </p>
              <p className="lp-feature-body">
                The structure reveals itself. The continuity slips surface. The pacing problems
                that survived twelve rounds of editing finally become visible.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Share & gather feedback ──────────────────────────────────────── */}
      <section className="lp-section lp-alt" id="lp-share" ref={shareRef}>
        <div className="lp-container">
          <div className="lp-feature-row lp-feature-flip lp-reveal">
            <div className="lp-feature-copy">
              <span className="lp-kicker">Beta readers, ARC readers &amp; editors</span>
              <h2 className="lp-h2">Share a link.<br />Import the feedback.<br />All in one place.</h2>
              <p className="lp-feature-body">
                Generate an HTML share link — with or without your own annotations already visible —
                and send it to anyone: beta readers, ARC readers, co-authors, copy editors. No
                accounts, no software to install. They open it in any browser and mark it up in the
                same focused environment you read in.
              </p>
              <p className="lp-feature-body">
                Import their feedback when they're done. Notes come back attributed to the exact
                passage, chapter by chapter, from every reader at once. No PDFs, no tracked-changes
                chaos, no emailing marked-up Word documents across three drafts.
              </p>
            </div>
            <div className="lp-feature-visual lp-bleed-right">
              <ScreenFrame
                label="Vellibris reader — annotation sidebar"
                src="/screenshots/reader-annotated.png"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. Manuscript intelligence (dark) ───────────────────────────────── */}
      <section className="lp-section lp-dark" id="lp-intelligence" ref={intelRef}>
        <div className="lp-container">
          <div className="lp-intel-head lp-reveal">
            <div className="lp-intel-copy">
              <span className="lp-eyebrow lp-dark-eyebrow">Manuscript intelligence</span>
              <h2 className="lp-h2 lp-dark-h">Analysis, not generation.</h2>
              <p className="lp-dark-body lp-intel-lead">
                Your manuscript holds more information than you can hold in your head at once —
                character arcs, timeline spans, chapter pacing, recurring details. The intelligence
                report draws those patterns out from the text and from what your readers flag,
                so you can see the whole structure clearly.
              </p>
              <p className="lp-dark-body" style={{ marginTop: '1em' }}>
                Nothing generated. Nothing invented. Signals that were already there, made visible.
              </p>
            </div>
            <div className="lp-pillars">
              {PILLARS.map(p => (
                <div className="lp-pillar" key={p.n}>
                  <span className="lp-pillar-n">{p.n}</span>
                  <h3 className="lp-pillar-h">{p.h}</h3>
                  <p className="lp-pillar-p">{p.p}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="lp-intel-frame lp-reveal">
            <ScreenFrame
              label="Vellibris — dark mode reader with intelligence panel"
              src="/screenshots/reader-dark.png"
              wide
              dark
            />
          </div>
        </div>
      </section>

      {/* ── 8. Workflow cards ───────────────────────────────────────────────── */}
      <section className="lp-section lp-alt" id="lp-workflow" ref={workflowRef}>
        <div className="lp-container">
          <div className="lp-section-head lp-reveal">
            <span className="lp-kicker">What's in the box</span>
            <h2 className="lp-h2">Everything revision needs.<br />Nothing it doesn't.</h2>
          </div>
          <div className="lp-cards lp-reveal">
            {CARDS.map(c => (
              <div className="lp-card" key={c.h}>
                <div className="lp-card-ico">{c.icon}</div>
                <h3 className="lp-card-h">{c.h}</h3>
                <p className="lp-card-p">{c.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 9. Closing CTA ──────────────────────────────────────────────────── */}
      <section className="lp-section lp-cta-band" ref={ctaRef}>
        <div className="lp-container lp-reveal lp-cta-inner">
          <span className="lp-eyebrow">Open a manuscript</span>
          <h2 className="lp-h2 lp-cta-h">
            Your words.<br />A sharper way to see them.
          </h2>
          <p className="lp-sub lp-cta-sub">
            Drop in a manuscript and read it the way the world will.
            The cracks appear. Then you can fix them.
          </p>
          <button className="lp-btn lp-btn-lg" onClick={onOpenApp}>
            Open a manuscript
          </button>
        </div>
      </section>

      {/* ── 10. Footer ──────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-inner">
            <div className="lp-foot-brand">
              <button className="lp-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                <QuillIcon size={18} />
                <span className="lp-brand-name">
                  <span className="lp-brand-word">Vellibris</span>
                  <span className="lp-brand-sub">Manuscript Reader</span>
                </span>
              </button>
              <p className="lp-foot-tag">
                A manuscript intelligence platform.<br />
                Software for revision, not generation.
              </p>
            </div>
            <div className="lp-foot-col">
              <div className="lp-foot-h">Product</div>
              <a onClick={() => scrollTo('lp-process')}>How it works</a>
              <a onClick={() => scrollTo('lp-authors')}>For authors</a>
              <a onClick={() => scrollTo('lp-intelligence')}>Intelligence</a>
              <a onClick={onOpenApp}>Open the app</a>
            </div>
            <div className="lp-foot-col">
              <div className="lp-foot-h">Company</div>
              <a>About</a>
              <a>Roadmap</a>
              <a>Contact</a>
            </div>
            <div className="lp-foot-col">
              <div className="lp-foot-h">Legal</div>
              <a>Privacy</a>
              <a>Terms</a>
            </div>
          </div>
          <div className="lp-foot-bottom">
            <span>© {new Date().getFullYear()} Vellibris — placeholder name</span>
            <span>Made for authors</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
