export default function AboutPage() {
  return (
    <main className="docs-page">
      <nav className="docs-nav"><a href="/">← EchoVault</a><span>PRODUCT / TECHNICAL NOTES</span></nav>
      <header className="docs-hero">
        <p>THE SYSTEM</p>
        <h1>Proof first.<br /><em>Memory second.</em></h1>
        <p>EchoVault is a provenance-aware cinematic interface built around Visko Orbis Stable on Reactor. It turns a verified Base transaction into a live, steerable world without pretending the generated interpretation is part of the blockchain record.</p>
      </header>
      <section className="docs-grid">
        <article><span>01</span><h2>Verify</h2><p>A Base or Base Sepolia transaction hash is read server-side through JSON-RPC. EchoVault stores only explicit chain facts: transaction, block, addresses, value, method selector, receipt status and event logs.</p></article>
        <article><span>02</span><h2>Interpret</h2><p>Claude receives those verified facts under strict instructions not to invent names, motives or unsupported actions. If Claude is unavailable, a deterministic local interpreter keeps the experience functional.</p></article>
        <article><span>03</span><h2>Direct</h2><p>The user chooses mood, camera language, world language, energy, custom direction, sound direction and an optional reference frame. The final manuscript remains editable.</p></article>
        <article><span>04</span><h2>Generate</h2><p>Reactor mints a short-lived, model-scoped JWT server-side. Orbis receives the optional image, resolution, deterministic seed, audio prompt and cinematic prompt before starting the continuous stream.</p></article>
        <article><span>05</span><h2>Steer</h2><p>While the world is live, new prompts are sent through Orbis set_prompt. They morph the existing shot at chunk boundaries rather than starting disconnected renders.</p></article>
        <article><span>06</span><h2>Preserve</h2><p>On supported browsers, EchoVault captures the live media element with MediaRecorder and downloads WebM. Saved Echoes and local video captures are stored in IndexedDB on the user’s device.</p></article>
      </section>
      <section className="docs-architecture">
        <p>ARCHITECTURE</p>
        <div className="architecture-flow">
          <span>BASE RPC<small>verified event</small></span><b>→</b>
          <span>CLAUDE<small>interpretation</small></span><b>→</b>
          <span>DIRECTOR<small>human intent</small></span><b>→</b>
          <span>ORBIS<small>live world</small></span><b>→</b>
          <span>VAULT<small>record / share</small></span>
        </div>
      </section>
      <section className="docs-principles">
        <h2>Design principles</h2>
        <div><strong>No fake provenance.</strong><p>Generated prose never overwrites verified source data.</p></div>
        <div><strong>No generic generation queue.</strong><p>Orbis is treated as a live world with continuous steering, not a render button.</p></div>
        <div><strong>No forced AI dependency.</strong><p>The core product remains usable when Claude is absent or temporarily unavailable.</p></div>
        <div><strong>No hidden media claim.</strong><p>Video download is implemented as browser-side capture of the live stream and clearly stays local unless the user shares it elsewhere.</p></div>
      </section>
      <section className="docs-usage">
        <h2>How to use EchoVault</h2>
        <ol>
          <li>Choose Base Sepolia or Base and paste a transaction hash.</li>
          <li>Review the Proof layer and confirm the verified event.</li>
          <li>Shape the memory inside Director Console.</li>
          <li>Connect the Orbis World Engine and create the Echo.</li>
          <li>Steer the live world, record the part you want to preserve, then download or seal it in your Vault.</li>
          <li>Export a poster/proof JSON, copy a portable proof page, or open a prefilled X share.</li>
        </ol>
      </section>
      <footer className="docs-footer"><a href="/">Enter EchoVault →</a><span>Visko Orbis Stable · Reactor · Base · optional Claude intelligence</span></footer>
    </main>
  );
}
