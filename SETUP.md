# ClawbackAgent — VS Code Insiders Setup

Open **this file** (`SETUP.md`) first inside the project folder once you've done the steps below — but do the steps in order, outside VS Code, before you open it.

You're on Windows 11 + WSL2. Build inside WSL2, not on the Windows filesystem — Foundry/Node tooling behaves better there and it matches your existing Basewagon setup.

---

## Step 1 — Create the project folder in WSL2

Open your WSL2 terminal (Ubuntu):
```bash
mkdir -p ~/clawbackagent
cd ~/clawbackagent
```

## Step 2 — Copy in the two files from this chat

Download `mcp.json` (attached) and `SETUP.md` (this file) from the chat, then move them into place:
```bash
mkdir -p ~/clawbackagent/.vscode
mv ~/Downloads/mcp.json ~/clawbackagent/.vscode/mcp.json     # adjust path if WSL sees Windows Downloads differently:
# e.g. mv "/mnt/c/Users/bhupi/Downloads/mcp.json" ~/clawbackagent/.vscode/mcp.json
mv ~/Downloads/SETUP.md ~/clawbackagent/SETUP.md
```
(If you'd rather I just generate the whole Next.js scaffold with these files already in place, say so — Claude Code can do that in one shot once you're inside the folder.)

## Step 3 — Open the folder in VS Code Insiders, via WSL

From the WSL2 terminal, **not** from Windows Explorer:
```bash
cd ~/clawbackagent
code-insiders .
```
This launches VS Code Insiders in **WSL Remote mode** (bottom-left corner will show `WSL: Ubuntu`). If `code-insiders` isn't on your WSL PATH yet, install the WSL extension from the Windows side first (next step), then retry.

## Step 4 — Install required VS Code extensions

Inside VS Code Insiders, open the Extensions panel (`Ctrl+Shift+X`) and install:
1. **WSL** (`ms-vscode-remote.remote-wsl`) — if not already present, since your whole dev setup already lives in WSL2
2. **Claude Code** (Anthropic) — gives you the Code tab / sidebar agent
3. **Solidity** (Juan Blanco or Nomic Foundation's) — syntax + inline compile errors for the contracts
4. Optional: **Tailwind CSS IntelliSense**, **Prisma** (if you add it later) — skip for now

## Step 5 — Confirm the Arc Docs MCP is picked up

The `.vscode/mcp.json` file you placed in Step 2 auto-registers the Arc documentation MCP server for this workspace — no login needed. Open the Command Palette (`Ctrl+Shift+P`) → `MCP: List Servers` → you should see `arc-docs` listed as available. If it's not there, reload the window (`Ctrl+Shift+P` → `Developer: Reload Window`).

If you're driving this from the Claude Code extension/terminal specifically (not Copilot), also register it at the CLI level so it persists across projects:
```bash
claude mcp add --transport http arc-docs https://docs.arc.io/mcp
```

## Step 6 — Set up secrets (don't skip — nothing runs without these)

Still in the WSL2 terminal, inside `~/clawbackagent`:
```bash
touch .env
```
Open `.env` in VS Code and add (fill in after Console setup):
```
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```
Get `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` from console.circle.com → Keys, and the Entity Secret registration flow, as covered in the build guide.

Add `.env` to `.gitignore` before your first commit — it isn't there by default:
```bash
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
```

## Step 7 — You're ready

At this point, from inside VS Code Insiders (WSL Remote, `~/clawbackagent` open), open the Claude Code panel and say something like:

> "Scaffold the Next.js app per the ClawbackAgent build guide: Circle wallet SDKs, Supabase client, and the login/wallet-generation/funding page first."

That's the actual build — this file was just the runway.
