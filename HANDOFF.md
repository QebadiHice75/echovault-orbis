# EchoVault handoff

## Before the first run

1. Copy `.env.example` to `.env.local`.
2. Set `REACTOR_API_KEY`.
3. Set `CLAUDE_API_KEY` if you want Claude-powered interpretation/direction. EchoVault still works with its deterministic fallback when Claude is absent.
4. Keep `CLAUDE_MODEL=claude-sonnet-5-5` unless your Anthropic account requires a different available model.
5. Optional: set private Base RPC URLs in `BASE_SEPOLIA_RPC_URL` and `BASE_RPC_URL`.

## Verification commands

```bash
npm install
rm -rf .next
npm run typecheck
npm run build
npm run dev
```

## Demo checklist

Run these in order before pushing/deploying:

- Open the landing page and verify the vault object responds to pointer movement.
- Click **Explore a demo memory** or paste a real Base/Base Sepolia transaction.
- Confirm Proof data appears: hash, network, block, addresses, event type and status.
- Confirm the Director Console gets a manuscript. With Claude configured, use **Refine with Claude**.
- Optionally upload a 16:9 reference image.
- Click **Create Echo** and confirm Reactor connects and actual `main_video` renders.
- Confirm available resolutions populate from the model state.
- Try **Past / Evolve / Observe / Descend** and one custom steering instruction.
- Toggle sound.
- Click **Record clip**, let it run several seconds, then **Stop recording** and **Download video**.
- Switch between **Memory** and **Proof** modes.
- **Seal in Vault**, refresh the page, and confirm the saved Echo remains in the local Vault.
- Open a saved local video if one was captured.
- **Remix** a saved Echo and confirm it gets a new Echo ID while retaining the original verified transaction.
- Copy the proof link and open it in a new tab. Confirm the page reports a live verification state.
- Test **Share on X** and confirm the composer is prefilled with the Echo + proof link.
- Download the poster and proof JSON.
- Open `/about` and verify the documentation page.

## Browser note

Chrome or Edge is recommended for recording because EchoVault uses `captureStream()` plus `MediaRecorder` to turn the live WebRTC playback into a downloadable WebM. EchoVault also attempts to merge a separate Reactor audio media track into that recording when the player exposes one. Claude Sonnet 5.5 is called without custom temperature/top-p/top-k overrides, matching the current API requirements.

## Truth model

- **Verified:** transaction data comes from Base/Base Sepolia JSON-RPC.
- **Generated:** titles, summaries, prompts and video are creative interpretation.
- **Claude:** can improve interpretation/direction but never supplies the verified chain facts.
- **Shared proof:** the encoded metadata is rechecked against the chain when the page opens; a mismatch is surfaced instead of being called verified.
