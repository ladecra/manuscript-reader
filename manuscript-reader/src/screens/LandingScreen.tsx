import { useEffect, useState, useRef, type ReactNode } from 'react';
import { QuillIcon } from '../components/ui/Icons';
import './landing.css';

interface LandingScreenProps {
  onOpenApp: () => void;
}

// ── Marketing icons (kept separate from app-chrome Icons.tsx) ─────────────────
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

// ── Screenshot frame placeholder ──────────────────────────────────────────────
// Swap the contents of .lp-frame-screen for a real <img> when you have one.
function ScreenFrame({ label, wide = false, tilt = false }: { label: string; wide?: boolean; tilt?: boolean }) {
  return (
    <div className={`lp-frame${wide ? ' lp-frame-wide' : ''}${tilt ? ' lp-frame-tilt' : ''}`}>
      <div className="lp-frame-bar">
        <span className="lp-dot" /><span className="lp-dot" /><span className="lp-dot" />
        <span className="lp-frame-url" aria-hidden="true">vellibris</span>
      </div>
      {/* ↓ Replace this div's contents with <img src="..." alt="..." /> */}
      <div className="lp-frame-screen">
        <span className="lp-frame-label">{label}</span>
      </div>
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────
const STEPS = [
  { n: '01', icon: <BookIco />,   h: 'Read',             role: 'Author',   p: 'Drop into a focused, immersive reading view — the exact experience your readers will have. Distance reveals what closeness hides.' },
  { n: '02', icon: <PenIco />,    h: 'Annotate',         role: 'Author',   p: 'Mark continuity slips, pacing problems, structural questions. Notes travel with the text, not a stack of sticky notes or tracked-changes chaos.' },
  { n: '03', icon: <ChatIco />,   h: 'Gather feedback',  role: 'Exchange', p: 'Send a self-contained reader file to an editor or beta reader. Their annotations come back attributed and in context — no accounts, no software to install.' },
  { n: '04', icon: <ReviseIco />, h: 'Revise',           role: 'Author',   p: 'Every note in context. Resolve them chapter by chapter with the full picture in front of you instead of a marked-up printout.' },
];

const COMPARE = [
  { them: 'Help you produce words',          us: 'Help you see and fix the words you have' },
  { them: 'Author alone at the keyboard',    us: 'Author + editors + beta readers, in a loop' },
  { them: 'AI = generation / autocomplete',  us: 'AI = analysis only — structure, continuity' },
  { them: '"Start a new project"',           us: '"Open a manuscript you\'ve already written"' },
];

const PILLARS = [
  { n: '01', h: 'Structure',    p: 'Chapter pacing, scene balance, narrative arc — surfaced from the manuscript, not imposed on it.' },
  { n: '02', h: 'Continuity',   p: 'Character names, timeline consistency, physical detail — flagged chapter by chapter, wherever they slip.' },
  { n: '03', h: 'Analysis',     p: 'Signals drawn from the text itself. Nothing generated. Nothing invented. Your words, read more carefully.' },
];

const CARDS = [
  { icon: <ReaderIco />,  h: 'Manuscript reader',   p: 'A focused reading environment built for long-form prose and real chapter structure.' },
  { icon: <LayerIco />,   h: 'Annotation layer',    p: 'Typed, color-coded marks that live on top of the text and never alter the source.' },
  { icon: <PacketIco />,  h: 'Reader packets',      p: 'Shareable reader files that travel without an export–import dance. No accounts required.' },
  { icon: <ReportIco />,  h: 'Intelligence report', p: 'Structural and continuity signals surfaced from the manuscript — analysis, never generation.' },
];

// ── Scroll-reveal hook ────────────────────────────────────────────────────────
function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('lp-visible');
      return;
    }
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add('lp-visible'); obs.disconnect(); } },
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

  // Scroll-reveal refs
  const wedgeRef     = useReveal();
  const processRef   = useReveal();
  const authorsRef   = useReveal();
  const editorsRef   = useReveal();
  const intelRef     = useReveal();
  const workflowRef  = useReveal();
  const ctaRef       = useReveal();

  return (
    <div className="lp">

      {/* ── 1. Nav ─────────────────────────────────────────────────────────── */}
      <nav className={`lp-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="lp-container lp-nav-inner">
          <button className="lp-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <QuillIcon size={18} />
            <span className="lp-brand-word">VELLIBRIS</span>
          </button>
          <div className="lp-nav-links">
            <button className="lp-nav-link" onClick={() => scrollTo('lp-process')}>Process</button>
            <button className="lp-nav-link" onClick={() => scrollTo('lp-authors')}>For authors</button>
            <button className="lp-nav-link" onClick={() => scrollTo('lp-editors')}>For editors</button>
            <button className="lp-nav-link" onClick={() => scrollTo('lp-intelligence')}>Intelligence</button>
            <button className="lp-btn lp-nav-cta" onClick={onOpenApp}>Open a manuscript</button>
          </div>
        </div>
      </nav>

      {/* ── 2. Hero ────────────────────────────────────────────────────────── */}
      <header className="lp-hero">
        <div className="lp-container lp-hero-inner">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow lp-rise">Manuscript intelligence</span>
            <h1 className="lp-h1 lp-rise d1">
              <em>Read</em> like a reader.<br />
              Revise like an editor.<br />
              Think like an author.
            </h1>
            <p className="lp-lead lp-rise d2">
              Software for serious revision. Open your manuscript in a focused reading
              environment, annotate with intent, gather beta-reader feedback, and act
              on structural signals — without printing a page.
            </p>
            <div className="lp-hero-cta lp-rise d3">
              <button className="lp-btn lp-btn-lg" onClick={onOpenApp}>Open a manuscript</button>
              <button className="lp-btn lp-btn-ghost lp-btn-lg" onClick={() => scrollTo('lp-process')}>See how it works</button>
            </div>
            <p className="lp-hero-note lp-rise d4">
              Runs in your browser &nbsp;·&nbsp; your manuscript never leaves your device
            </p>
          </div>

          {/* Faux reader — replace with a real screenshot when you have one */}
          <div className="lp-hero-visual lp-rise d5" aria-hidden="true">
            <div className="lp-preview">
              <div className="lp-preview-bar">
                <span className="lp-dot" /><span className="lp-dot" /><span className="lp-dot" />
                <span className="lp-preview-tab">The Long Road Home · Ch. 07</span>
              </div>
              <div className="lp-preview-page">
                <span className="lp-preview-marker">Chapter 07</span>
                <div className="lp-preview-title">The Ridge at Dusk</div>
                <div className="lp-pp-text">
                  <p className="lp-dropcap">
                    The lamps were not yet lit when she reached the ridge, and the valley
                    below held its breath. <mark className="lp-hl">She had walked this road in
                    another life</mark>, before the war took the orchards and the quiet with them.
                  </p>
                  <p>
                    Somewhere past the river a bell counted the hour, slow and uncertain,
                    as if it too had forgotten the way home.
                  </p>
                </div>
              </div>
            </div>
            <div className="lp-ann-card">
              <div className="lp-ann-type">Continuity</div>
              <div className="lp-ann-text">Was it dusk or dawn in Ch. 3? The light here should match.</div>
            </div>
          </div>
        </div>
      </header>

      {/* ── 3. Wedge band (dark) ───────────────────────────────────────────── */}
      <section className="lp-section lp-dark lp-wedge" ref={wedgeRef}>
        <div className="lp-container">
          <div className="lp-wedge-inner lp-reveal">
            <div className="lp-wedge-copy">
              <span className="lp-eyebrow lp-dark-eyebrow">The wedge</span>
              <h2 className="lp-h2 lp-dark-h">
                Software for revision,<br />not generation.
              </h2>
              <p className="lp-dark-body">
                Ulysses, Scrivener, Word — writing tools, all of them.
                Some have highlighting bolted on. Vellibris starts <em>after the
                draft exists</em> and owns the part those tools neglect: the revision loop.
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

      {/* ── 4. Revision process loop ───────────────────────────────────────── */}
      <section className="lp-section" id="lp-process" ref={processRef}>
        <div className="lp-container">
          <div className="lp-section-head center lp-reveal">
            <span className="lp-kicker">The revision loop, rebuilt</span>
            <h2 className="lp-h2">From first read to final pass</h2>
            <p className="lp-sub">
              Most manuscripts still travel through PDFs, printouts, sticky notes, and
              tracked-changes chaos. One purpose-built space for the whole loop.
            </p>
          </div>
          <div className="lp-loop lp-reveal">
            {STEPS.map((s, i) => (
              <div className={`lp-step lp-step-${i % 2 === 0 ? 'above' : 'below'}`} key={s.n}>
                <div className="lp-step-ico">{s.icon}</div>
                <div className="lp-step-body">
                  {s.role === 'Exchange' && (
                    <span className="lp-step-exchange" aria-label="Editor handoff">⇄ via editor</span>
                  )}
                  <span className="lp-step-n">{s.n}</span>
                  <h3 className="lp-step-h">{s.h}</h3>
                  <p className="lp-step-p">{s.p}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. For authors ────────────────────────────────────────────────── */}
      <section className="lp-section lp-alt" id="lp-authors" ref={authorsRef}>
        <div className="lp-container">
          <div className="lp-feature-row lp-reveal">
            <div className="lp-feature-copy">
              <span className="lp-kicker">For authors</span>
              <h2 className="lp-h2">Read your own book<br />the way the world will.</h2>
              <p className="lp-feature-body">
                Changing the format changes what you notice. A printed page, a new
                font, a different room — each one breaks the spell of the draft you've
                read a hundred times. Vellibris gives you that shift without the paper:
                a true reading view, chapter by chapter, where pacing problems, continuity
                slips, and structural cracks finally stand out.
              </p>
              <blockquote className="lp-pull">
                "The first time I read my own book in the reader, I found three plot
                holes I'd been editing right past for a year."
                <cite>Placeholder — replace with a real quote</cite>
              </blockquote>
            </div>
            <div className="lp-feature-visual lp-bleed-right">
              <ScreenFrame label="reader · light mode" tilt />
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. For editors / beta readers ─────────────────────────────────── */}
      <section className="lp-section" id="lp-editors" ref={editorsRef}>
        <div className="lp-container">
          <div className="lp-feature-row lp-feature-flip lp-reveal">
            <div className="lp-feature-visual lp-bleed-left">
              <ScreenFrame label="annotation sidebar" />
            </div>
            <div className="lp-feature-copy">
              <span className="lp-kicker">For editors &amp; beta readers</span>
              <h2 className="lp-h2">Their notes come back<br />attributed, in context.</h2>
              <p className="lp-feature-body">
                Send a self-contained reader file — no accounts, no software to install.
                Your editor or beta reader opens it in any browser, reads the manuscript
                exactly as written, and marks it up with typed, color-coded annotations.
                Their packet comes back ready to weigh, chapter by chapter.
              </p>
              <p className="lp-feature-body">
                No PDFs. No tracked-changes chaos. No emailing marked-up Word documents
                back and forth across three drafts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. Manuscript intelligence (dark) ─────────────────────────────── */}
      <section className="lp-section lp-dark" id="lp-intelligence" ref={intelRef}>
        <div className="lp-container">
          <div className="lp-section-head lp-reveal">
            <span className="lp-eyebrow lp-dark-eyebrow">Manuscript intelligence</span>
            <h2 className="lp-h2 lp-dark-h">Analysis, not generation.</h2>
            <p className="lp-dark-body lp-intel-lead">
              The engine reads your manuscript the way a structural editor would — then
              surfaces what it finds. Nothing written, nothing invented, nothing generated.
              This is the moat: intelligence that serves revision, not production.
            </p>
          </div>
          <div className="lp-pillars lp-reveal">
            {PILLARS.map(p => (
              <div className="lp-pillar" key={p.n}>
                <span className="lp-pillar-n">{p.n}</span>
                <h3 className="lp-pillar-h">{p.h}</h3>
                <p className="lp-pillar-p">{p.p}</p>
              </div>
            ))}
          </div>
          <div className="lp-intel-frame lp-reveal">
            <ScreenFrame label="intelligence report" wide />
          </div>
        </div>
      </section>

      {/* ── 8. Workflow cards ──────────────────────────────────────────────── */}
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

      {/* ── 9. Closing CTA (dark — merges with footer) ─────────────────────── */}
      <section className="lp-section lp-dark lp-cta-band" ref={ctaRef}>
        <div className="lp-container lp-reveal">
          <span className="lp-eyebrow lp-dark-eyebrow">Open a manuscript</span>
          <h2 className="lp-h2 lp-dark-h lp-cta-h">
            Your words.<br />A sharper way to see them.
          </h2>
          <p className="lp-dark-body lp-cta-sub">
            Drop in a manuscript and read it the way the world will.
            The cracks appear. Then you can fix them.
          </p>
          <button className="lp-btn lp-btn-lg lp-btn-cream" onClick={onOpenApp}>
            Open a manuscript
          </button>
        </div>
      </section>

      {/* ── 10. Footer ─────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-inner">
            <div className="lp-foot-brand">
              <button className="lp-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                <QuillIcon size={18} />
                <span className="lp-brand-word">VELLIBRIS</span>
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
              <a onClick={() => scrollTo('lp-editors')}>For editors</a>
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
            <span>Made for authors and editors</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
