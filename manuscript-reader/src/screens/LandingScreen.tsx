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
    p: 'Open your manuscript in a focused reading environment — no cursor, no edit mode. Just the prose, chapter by chapter, the way a reader will meet it.',
  },
  {
    n: '02', icon: <PenIco />, h: 'Annotate',
    p: 'Mark continuity slips, pacing problems, and structural questions as you go. Notes live on the text — nothing to reconcile later.',
  },
  {
    n: '03', icon: <ChatIco />, h: 'Share',
    p: 'Send a link. Beta readers, ARC readers, and editors open it in any browser — no account, no software — and mark it up in the same focused environment you read in.',
  },
  {
    n: '04', icon: <ReviseIco />, h: 'Revise',
    p: 'Every note attributed and in context. Work through annotations chapter by chapter with the full picture in front of you.',
  },
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

  const processRef  = useReveal();
  const intelRef    = useReveal();
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
              A clean reading environment that lets you meet your manuscript like a reader again.
              Collaborate with beta readers and editors — without printing a page.
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

      {/* ── 3. Revision process loop ──────────────────────────────────────────── */}
      <section className="lp-section lp-section-bridge" id="lp-process" ref={processRef}>
        <div className="lp-container">
          <div className="lp-section-head center lp-reveal">
            <span className="lp-kicker">The revision loop, rebuilt</span>
            <h2 className="lp-h2">From first read to final pass.</h2>
            <p className="lp-sub">Your manuscript deserves better than PDFs, printouts, and tracked-changes chaos.</p>
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

      {/* ── 4. Manuscript intelligence (dark) ───────────────────────────────── */}
      <section className="lp-section lp-dark" id="lp-intelligence" ref={intelRef}>
        <div className="lp-container">
          <div className="lp-intel-head lp-reveal">
            <div className="lp-intel-copy">
              <span className="lp-eyebrow lp-dark-eyebrow">Manuscript intelligence</span>
              <h2 className="lp-h2 lp-dark-h">Analysis, not generation.</h2>
              <p className="lp-dark-body lp-intel-lead">
                Your manuscript holds more signal than you can keep in your head — pacing curves,
                continuity breaks, the chapters where readers cluster and the ones they pass through
                without reacting. The intelligence report surfaces it all, drawn from your text
                and your readers' annotations.
              </p>
              <p className="lp-dark-body" style={{ marginTop: '1em' }}>
                Nothing generated. Nothing invented. Signals that were already there, made visible.
              </p>
            </div>
            <div className="lp-intel-visual">
              <ScreenFrame
                label="Vellibris — dark mode reader with intelligence panel"
                src="/screenshots/reader-dark.png"
                dark
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. Closing nudge ────────────────────────────────────────────────── */}
      <section className="lp-section lp-cta-band" ref={ctaRef}>
        <div className="lp-container lp-reveal lp-cta-inner">
          <button className="lp-btn lp-btn-lg lp-btn-arrow" onClick={onOpenApp}>
            Open a manuscript
            <svg className="lp-arrow-ico" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 10h12M12 5l5 5-5 5" />
            </svg>
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
