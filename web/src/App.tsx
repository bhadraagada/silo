type ThemeId = 'one' | 'two' | 'three' | 'four' | 'five' | 'six' | 'seven' | 'eight' | 'nine' | 'ten'
type LayoutId = 'standard' | 'split' | 'sidebar' | 'card' | 'minimal' | 'grid' | 'focused' | 'stack' | 'canvas' | 'manifest'

type Variant = {
  path: string
  label: string
  theme: ThemeId
  layout: LayoutId
  eyebrow: string
  title: string
  subtitle: string
  ctaPrimary: string
  ctaSecondary: string
  narrativeTitle: string
  narrativeBody: string
}

const variants: Variant[] = [
  {
    path: '/1',
    label: 'Signal Brutalist',
    theme: 'one',
    layout: 'standard',
    eyebrow: 'Silo / Raw Control',
    title: 'Build In Parallel Without Losing Context',
    subtitle:
      'Silo turns project chaos into deterministic workspaces. Every task gets one stable identity across git, browser, terminal, and agent runs.',
    ctaPrimary: 'Start With Silo',
    ctaSecondary: 'Read Architecture',
    narrativeTitle: 'One Task. One Workspace. One Mental Model.',
    narrativeBody:
      'No more tab roulette and localhost collisions. Silo binds branch, worktree, profile, queue, and timeline under a single slug that you can always jump back to.',
  },
  {
    path: '/2',
    label: 'Neon Terminal',
    theme: 'two',
    layout: 'split',
    eyebrow: 'Kernel-Style Runtime',
    title: 'Operator Grade Agent Orchestration For Real Teams',
    subtitle:
      'Schedule multi-provider jobs, throttle expensive runs, replay timeline events, and execute action links instantly from notifications.',
    ctaPrimary: 'Launch Runtime',
    ctaSecondary: 'See Timeline',
    narrativeTitle: 'A Control Plane, Not A Prompt Toy.',
    narrativeBody:
      'Silo is for sustained shipping speed. The queue, profile system, and event log are built for long-running, parallel development under pressure.',
  },
  {
    path: '/3',
    label: 'Editorial Atlas',
    theme: 'three',
    layout: 'sidebar',
    eyebrow: 'Context Discipline',
    title: 'Your Agentic Workflow Needs Structure, Not More Tabs',
    subtitle:
      'Silo introduces a project-centric surface where switching contexts is deterministic and traceability is automatic.',
    ctaPrimary: 'Try Workspace Flow',
    ctaSecondary: 'Review Features',
    narrativeTitle: 'When Everything Is Running, Nothing Should Feel Random.',
    narrativeBody:
      'You should always know what finished, where it ran, and how to jump to it. Silo enforces that as a product invariant.',
  },
  {
    path: '/4',
    label: 'Blueprint Ops',
    theme: 'four',
    layout: 'card',
    eyebrow: 'Infrastructure Thinking',
    title: 'Deterministic Local Domains, Queue Control, Review Intelligence',
    subtitle:
      'Built for people who run multiple code paths in parallel and still want safety, observability, and clean handoff to shipping.',
    ctaPrimary: 'Open Playbook',
    ctaSecondary: 'Run Validation',
    narrativeTitle: 'Hard Guarantees Over Vibes.',
    narrativeBody:
      'Silo captures reality: what changed, what ran, what failed, and what to do next. That is how parallel dev scales responsibly.',
  },
  {
    path: '/5',
    label: 'Soft Machine',
    theme: 'five',
    layout: 'minimal',
    eyebrow: 'Calm Interface, Strict Core',
    title: 'Feel Calm While Your Agents Run Hot',
    subtitle:
      'The visual layer is soft. The runtime is not. Silo gives deterministic identity and replayable history to every task.',
    ctaPrimary: 'Get Started',
    ctaSecondary: 'Explore Docs',
    narrativeTitle: 'Gentle UX, Uncompromising Runtime.',
    narrativeBody:
      'A workspace should be a stable object, not a temporary guess. Silo makes that true across your entire local development loop.',
  },
  {
    path: '/6',
    label: 'System Grid',
    theme: 'six',
    layout: 'grid',
    eyebrow: 'Grid Logic / Raw Steel',
    title: 'Perfect Alignment Through Modular Brutality',
    subtitle:
      'No compromise. No curves. Silo enforces grid discipline—every element snaps to the system. Determinism through rigid structure.',
    ctaPrimary: 'Align Now',
    ctaSecondary: 'See Grid',
    narrativeTitle: 'When Perfection Is The Only Option.',
    narrativeBody:
      'Silo treats your workspace as a node in a deterministic grid. Predictable layouts, predictable outcomes. Perfect alignment is not a feature—it is a guarantee.',
  },
  {
    path: '/7',
    label: 'Concrete Void',
    theme: 'seven',
    layout: 'focused',
    eyebrow: 'Sparse Form',
    title: 'Subtract Everything That Does Not Matter',
    subtitle:
      'Empty space is not wasted. It is intentional. Silo strips away noise so your workflow can breathe and scale without friction.',
    ctaPrimary: 'Clear The Clutter',
    ctaSecondary: 'Minimal Docs',
    narrativeTitle: 'Silence As A Feature.',
    narrativeBody:
      'Less visual noise. Less cognitive load. Silo minimalist surface hides powerful infrastructure. What you see is exactly what you need to know.',
  },
  {
    path: '/8',
    label: 'Chrome Pulse',
    theme: 'eight',
    layout: 'stack',
    eyebrow: 'Mechanical Precision',
    title: 'High-Tension Workflow For Uncompromising Developers',
    subtitle:
      'Industrial aesthetic meets modern urgency. Silo is built for sustained intensity—queue pressure, parallel runs, clean handoff to production.',
    ctaPrimary: 'Engage Systems',
    ctaSecondary: 'Queue Status',
    narrativeTitle: 'Tension Without Fragility.',
    narrativeBody:
      'Your agents run hard. Your workspace should run harder. Silo throttles expensive operations, replays failed runs, and holds your hand through shipping.',
  },
  {
    path: '/9',
    label: 'Archive Black',
    theme: 'nine',
    layout: 'canvas',
    eyebrow: 'Deep Documentation',
    title: 'Pure Monochrome For Hyper-Focused Work',
    subtitle:
      'Black and white and text. No color to distract. Silo gives you the plaintext truth about what ran, what failed, and what comes next.',
    ctaPrimary: 'Read Archive',
    ctaSecondary: 'Trace Events',
    narrativeTitle: 'The Truth In Black And White.',
    narrativeBody:
      'Every workspace. Every run. Every event. Recorded without filter. Silo is a permanent archive of your development decisions, queryable and replayable forever.',
  },
  {
    path: '/10',
    label: 'Modular Stack',
    theme: 'ten',
    layout: 'manifest',
    eyebrow: 'Layered Protocol',
    title: 'Build And Recombine Without Losing Context',
    subtitle:
      'Silo stacks providers, profiles, and queues in explicit layers. No hidden magic. Recombine them however you need. Your dependencies are always visible.',
    ctaPrimary: 'Stack Profiles',
    ctaSecondary: 'Layer View',
    narrativeTitle: 'What You Build Stays Under Your Control.',
    narrativeBody:
      'Provider layers. Queue tiers. Workspace boundaries. Silo makes every boundary explicit so you can reason about your entire stack without guessing.',
  },
]

const metrics = [
  { value: '1:1', label: 'Task to workspace mapping' },
  { value: '<5s', label: 'Jump back to context' },
  { value: '100%', label: 'Run traceability by id' },
  { value: '0', label: 'Localhost identity roulette' },
]

const features = [
  {
    title: 'Workspace Isolation',
    body: 'Deterministic branch, worktree, profile, and domain per task.',
  },
  {
    title: 'Queue And Concurrency',
    body: 'Priority scheduling with expensive-provider throttling and pause/resume controls.',
  },
  {
    title: 'Provider Profiles',
    body: 'Per-provider commands, models, and health validation without ad-hoc env juggling.',
  },
  {
    title: 'Review Intelligence',
    body: 'Risk hotspots, regressions, tests, and commit/PR drafts from real workspace state.',
  },
]

const loop = [
  { title: 'Up', body: 'Create isolated workspace with deterministic identity.' },
  { title: 'Run', body: 'Queue agent tasks with profile + priority selection.' },
  { title: 'Review', body: 'Replay timeline, inspect events, generate insight.' },
  { title: 'Ship', body: 'Run checks, commit safely, and open PR.' },
]

const faq = [
  {
    q: 'Is Silo only for one provider?',
    a: 'No. Silo supports API and CLI providers with profile-level settings and validation.',
  },
  {
    q: 'Can I run multiple projects safely?',
    a: 'Yes. Silo uses one-task-one-workspace isolation and deterministic routing to prevent collision drift.',
  },
  {
    q: 'How do I debug failed runs?',
    a: 'Use timeline replay and action links to jump directly to logs, workspace, or rerun flows.',
  },
]

function App() {
  const path = window.location.pathname === '/' ? '/1' : window.location.pathname
  const active = variants.find((variant) => variant.path === path)
  if (!active) return <NotFound />

  const layoutClass = `layout-${active.layout}`

  return (
    <main className={`site theme-${active.theme} ${layoutClass}`}>
      <div className="noise" aria-hidden />
      <VariantNav current={active.path} />

      {active.layout === 'standard' && <StandardLayout active={active} metrics={metrics} features={features} loop={loop} faq={faq} />}
      {active.layout === 'split' && <SplitLayout active={active} metrics={metrics} features={features} loop={loop} faq={faq} />}
      {active.layout === 'sidebar' && <SidebarLayout active={active} metrics={metrics} features={features} loop={loop} faq={faq} />}
      {active.layout === 'card' && <CardLayout active={active} metrics={metrics} features={features} loop={loop} faq={faq} />}
      {active.layout === 'minimal' && <MinimalLayout active={active} metrics={metrics} features={features} loop={loop} faq={faq} />}
      {active.layout === 'grid' && <GridLayout active={active} metrics={metrics} features={features} loop={loop} faq={faq} />}
      {active.layout === 'focused' && <FocusedLayout active={active} metrics={metrics} features={features} loop={loop} faq={faq} />}
      {active.layout === 'stack' && <StackLayout active={active} metrics={metrics} features={features} loop={loop} faq={faq} />}
      {active.layout === 'canvas' && <CanvasLayout active={active} metrics={metrics} features={features} loop={loop} faq={faq} />}
      {active.layout === 'manifest' && <ManifestLayout active={active} metrics={metrics} features={features} loop={loop} faq={faq} />}
    </main>
  )
}

function StandardLayout({ active, metrics, features, loop, faq }: any) {
  return (
    <>
      <section className="container hero">
        <p className="eyebrow">{active.eyebrow}</p>
        <h1>{active.title}</h1>
        <p className="subtitle">{active.subtitle}</p>
        <div className="cta-row">
          <a href="#" className="btn btn-primary">{active.ctaPrimary}</a>
          <a href="#" className="btn btn-secondary">{active.ctaSecondary}</a>
        </div>
      </section>

      <section className="container stats-grid">
        {metrics.map((item: any) => (
          <article key={item.label} className="stat-card">
            <p className="stat-value">{item.value}</p>
            <p className="stat-label">{item.label}</p>
          </article>
        ))}
      </section>

      <section className="container split">
        <article className="narrative">
          <h2>{active.narrativeTitle}</h2>
          <p>{active.narrativeBody}</p>
        </article>
        <aside className="manifesto">
          <h3>Silo Invariants</h3>
          <ul>
            <li>One task = one workspace = one worktree</li>
            <li>Every run is traceable by workspace and run id</li>
            <li>Notifications always include jump targets</li>
            <li>Switching context should be deterministic and fast</li>
          </ul>
        </aside>
      </section>

      <section className="container feature-grid">
        {features.map((feature: any) => (
          <article key={feature.title} className="feature-card">
            <h3>{feature.title}</h3>
            <p>{feature.body}</p>
          </article>
        ))}
      </section>

      <section className="container workflow">
        <h2>Workflow Loop</h2>
        <div className="workflow-grid">
          {loop.map((step: any, index: number) => (
            <article key={step.title} className="step-card">
              <p className="step-index">0{index + 1}</p>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container faq-block">
        <h2>FAQ</h2>
        <div className="faq-list">
          {faq.map((item: any) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="container site-footer">
        <span>Silo — deterministic agentic development for modern teams.</span>
        <div>
          <a href="#">Docs</a>
          <a href="#">GitHub</a>
          <a href="#">Roadmap</a>
        </div>
      </footer>
    </>
  )
}

function SplitLayout({ active, metrics, features }: any) {
  return (
    <>
      <section className="split-hero">
        <div className="container hero-left">
          <p className="eyebrow">{active.eyebrow}</p>
          <h1>{active.title}</h1>
          <p className="subtitle">{active.subtitle}</p>
          <div className="cta-row">
            <a href="#" className="btn btn-primary">{active.ctaPrimary}</a>
            <a href="#" className="btn btn-secondary">{active.ctaSecondary}</a>
          </div>
        </div>
        <div className="hero-right">
          <div className="terminal">
            <p>$ silo up myproject --task "build feature"</p>
            <p>Creating workspace...</p>
            <p className="success">✓ workspace ready</p>
          </div>
        </div>
      </section>

      <section className="container narrative-block">
        <h2>{active.narrativeTitle}</h2>
        <p>{active.narrativeBody}</p>
      </section>

      <section className="container stats-grid">
        {metrics.map((item: any) => (
          <article key={item.label} className="stat-card">
            <p className="stat-value">{item.value}</p>
            <p className="stat-label">{item.label}</p>
          </article>
        ))}
      </section>

      <section className="container feature-grid">
        {features.map((feature: any) => (
          <article key={feature.title} className="feature-card">
            <h3>{feature.title}</h3>
            <p>{feature.body}</p>
          </article>
        ))}
      </section>

      <footer className="container site-footer">
        <span>Silo — deterministic agentic development for modern teams.</span>
        <div>
          <a href="#">Docs</a>
          <a href="#">GitHub</a>
          <a href="#">Roadmap</a>
        </div>
      </footer>
    </>
  )
}

function SidebarLayout({ active, features, loop }: any) {
  return (
    <>
      <section className="sidebar-wrapper">
        <aside className="sidebar">
          <h2>Navigation</h2>
          <ul>
            <li><a href="#overview">Overview</a></li>
            <li><a href="#features">Features</a></li>
            <li><a href="#workflow">Workflow</a></li>
            <li><a href="#docs">Documentation</a></li>
          </ul>
        </aside>
        <div className="sidebar-content">
          <section className="hero">
            <p className="eyebrow">{active.eyebrow}</p>
            <h1>{active.title}</h1>
            <p className="subtitle">{active.subtitle}</p>
            <div className="cta-row">
              <a href="#" className="btn btn-primary">{active.ctaPrimary}</a>
              <a href="#" className="btn btn-secondary">{active.ctaSecondary}</a>
            </div>
          </section>

          <section className="feature-grid">
            {features.map((feature: any) => (
              <article key={feature.title} className="feature-card">
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </section>

          <section className="workflow">
            <h2>Workflow</h2>
            <div className="workflow-list">
              {loop.map((step: any, idx: number) => (
                <div key={step.title} className="workflow-item">
                  <span className="workflow-number">{idx + 1}</span>
                  <div>
                    <h4>{step.title}</h4>
                    <p>{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      <footer className="container site-footer">
        <span>Silo — deterministic agentic development for modern teams.</span>
        <div>
          <a href="#">Docs</a>
          <a href="#">GitHub</a>
          <a href="#">Roadmap</a>
        </div>
      </footer>
    </>
  )
}

function CardLayout({ active, metrics, features }: any) {
  return (
    <>
      <section className="card-hero">
        <div className="card-container">
          <div className="card hero-card">
            <p className="eyebrow">{active.eyebrow}</p>
            <h1>{active.title}</h1>
          </div>
          <div className="card subtitle-card">
            <p>{active.subtitle}</p>
          </div>
          <div className="card cta-card">
            <a href="#" className="btn btn-primary">{active.ctaPrimary}</a>
            <a href="#" className="btn btn-secondary">{active.ctaSecondary}</a>
          </div>
        </div>
      </section>

      <section className="container">
        <div className="cards-grid">
          {metrics && metrics.map((item: any) => (
            <div key={item.label} className="card metric-card">
              <p className="card-value">{item.value}</p>
              <p className="card-label">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container">
        <div className="cards-grid">
          {features.map((feature: any) => (
            <div key={feature.title} className="card feature-card">
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="container site-footer">
        <span>Silo — deterministic agentic development for modern teams.</span>
        <div>
          <a href="#">Docs</a>
          <a href="#">GitHub</a>
          <a href="#">Roadmap</a>
        </div>
      </footer>
    </>
  )
}

function MinimalLayout({ active, _metrics: metrics }: any) {
  return (
    <>
      <section className="minimal-hero">
        <div className="container">
          <p className="eyebrow">{active.eyebrow}</p>
          <h1>{active.title}</h1>
          <p className="subtitle">{active.subtitle}</p>
          <div className="cta-row">
            <a href="#" className="btn btn-primary">{active.ctaPrimary}</a>
            <a href="#" className="btn btn-secondary">{active.ctaSecondary}</a>
          </div>
        </div>
      </section>

      <section className="minimal-narrative">
        <div className="container">
          <h2>{active.narrativeTitle}</h2>
          <p>{active.narrativeBody}</p>
        </div>
      </section>

      <section className="minimal-metrics">
        <div className="container">
          {metrics.map((item: any) => (
            <div key={item.label} className="minimal-stat">
              <span className="value">{item.value}</span>
              <span className="label">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="container site-footer">
        <span>Silo</span>
        <div>
          <a href="#">Docs</a>
          <a href="#">GitHub</a>
        </div>
      </footer>
    </>
  )
}

function GridLayout({ active, features, loop }: any) {
  return (
    <>
      <section className="grid-hero">
        <div className="grid-container">
          <div className="grid-item title-item">
            <p className="eyebrow">{active.eyebrow}</p>
            <h1>{active.title}</h1>
          </div>
          <div className="grid-item subtitle-item">
            <p>{active.subtitle}</p>
          </div>
          <div className="grid-item cta-item">
            <a href="#" className="btn btn-primary">{active.ctaPrimary}</a>
          </div>
          <div className="grid-item secondary-cta-item">
            <a href="#" className="btn btn-secondary">{active.ctaSecondary}</a>
          </div>
        </div>
      </section>

      <section className="container">
        <div className="feature-grid">
          {features.map((feature: any) => (
            <article key={feature.title} className="feature-card">
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container">
        <h2>Process</h2>
        <div className="workflow-grid">
          {loop.map((step: any, index: number) => (
            <article key={step.title} className="step-card">
              <p className="step-index">0{index + 1}</p>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="container site-footer">
        <span>Silo</span>
        <div>
          <a href="#">Docs</a>
          <a href="#">GitHub</a>
          <a href="#">Roadmap</a>
        </div>
      </footer>
    </>
  )
}

function FocusedLayout({ active }: any) {
  return (
    <>
      <section className="focused-container">
        <div className="focused-hero">
          <h1>{active.title}</h1>
          <p className="subtitle">{active.subtitle}</p>
          <div className="cta-row">
            <a href="#" className="btn btn-primary">{active.ctaPrimary}</a>
            <a href="#" className="btn btn-secondary">{active.ctaSecondary}</a>
          </div>
        </div>

        <div className="focused-narrative">
          <h2>{active.narrativeTitle}</h2>
          <p>{active.narrativeBody}</p>
        </div>

        <div className="focused-cta">
          <p>Ready to get started?</p>
          <a href="#" className="btn btn-primary">{active.ctaPrimary}</a>
        </div>
      </section>

      <footer className="container site-footer">
        <span>Silo</span>
        <div>
          <a href="#">Docs</a>
          <a href="#">GitHub</a>
        </div>
      </footer>
    </>
  )
}

function StackLayout({ active, metrics, loop }: any) {
  return (
    <>
      <section className="stack-section hero-stack">
        <div className="container">
          <p className="eyebrow">{active.eyebrow}</p>
          <h1>{active.title}</h1>
          <p className="subtitle">{active.subtitle}</p>
          <div className="cta-row">
            <a href="#" className="btn btn-primary">{active.ctaPrimary}</a>
            <a href="#" className="btn btn-secondary">{active.ctaSecondary}</a>
          </div>
        </div>
      </section>

      <section className="stack-section metrics-stack">
        <div className="container">
          <div className="metrics-list">
            {metrics.map((item: any) => (
              <div key={item.label} className="metric-stack-item">
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="stack-section features-stack">
        <div className="container">
          <h2>{active.narrativeTitle}</h2>
          <p>{active.narrativeBody}</p>
        </div>
      </section>

      <section className="stack-section workflow-stack">
        <div className="container">
          <h2>Workflow</h2>
          {loop.map((step: any, _idx: number) => (
            <div key={step.title} className="stack-item">
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="container site-footer">
        <span>Silo</span>
        <div>
          <a href="#">Docs</a>
          <a href="#">GitHub</a>
        </div>
      </footer>
    </>
  )
}

function CanvasLayout({ active, _features: features }: any) {
  return (
    <>
      <section className="canvas-section">
        <div className="container">
          <div className="canvas-text">
            <p className="eyebrow">{active.eyebrow}</p>
            <h1>{active.title}</h1>
            <p className="subtitle">{active.subtitle}</p>
            <div className="cta-row">
              <a href="#" className="btn btn-primary">{active.ctaPrimary}</a>
              <a href="#" className="btn btn-secondary">{active.ctaSecondary}</a>
            </div>
          </div>

          <div className="canvas-text">
            <h2>{active.narrativeTitle}</h2>
            <p>{active.narrativeBody}</p>
          </div>

          <div className="canvas-grid">
            {features && features.map((feature: any) => (
              <div key={feature.title} className="canvas-item">
                <strong>{feature.title}</strong>
                <span>{feature.body}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="container site-footer">
        <span>Silo</span>
        <div>
          <a href="#">Docs</a>
          <a href="#">GitHub</a>
        </div>
      </footer>
    </>
  )
}

function ManifestLayout({ active, loop }: any) {
  return (
    <>
      <section className="manifest-header">
        <div className="container">
          <h1>{active.title}</h1>
          <p className="subtitle">{active.subtitle}</p>
        </div>
      </section>

      <section className="manifest-content">
        <div className="container">
          <div className="manifest-block">
            <h2>Core Principle</h2>
            <p>{active.narrativeBody}</p>
          </div>

          <div className="manifest-block">
            <h2>Philosophy</h2>
            <ul className="manifest-list">
              {loop.map((step: any, _idx: number) => (
                <li key={step.title}>
                  <strong>{step.title}</strong> — {step.body}
                </li>
              ))}
            </ul>
          </div>

          <div className="manifest-block">
            <h2>Action</h2>
            <div className="cta-row">
              <a href="#" className="btn btn-primary">{active.ctaPrimary}</a>
              <a href="#" className="btn btn-secondary">{active.ctaSecondary}</a>
            </div>
          </div>
        </div>
      </section>

      <footer className="container site-footer">
        <span>Silo</span>
        <div>
          <a href="#">Docs</a>
          <a href="#">GitHub</a>
        </div>
      </footer>
    </>
  )
}

function VariantNav({ current }: { current: string }) {
  return (
    <nav className="container variant-nav" aria-label="Design variants">
      {variants.map((variant) => (
        <a key={variant.path} href={variant.path} className={variant.path === current ? 'active' : ''}>
          {variant.label}
        </a>
      ))}
    </nav>
  )
}

function NotFound() {
  return (
    <main className="site theme-one not-found">
      <div className="container">
        <h1>Route Not Found</h1>
        <p>Try one of these routes: {variants.map((variant) => variant.path).join(', ')}</p>
      </div>
    </main>
  )
}

export default App
