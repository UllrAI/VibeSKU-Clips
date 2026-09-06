# vibesku-clips-cli

`vibesku-clips-cli` is the first-party command-line interface for VibeSKU Clips.

It is designed for local developer tools, scripts, and agent-friendly workflows that need to authenticate without reusing browser session cookies.

## What it does

- starts browser-approved device login
- stores CLI tokens in `~/.vibesku-clips-cli/config.json`
- supports API key auth through `VIBESKU_CLIPS_CLI_API_KEY`
- verifies access against `/api/v1/auth/verify`

## Current commands

```bash
pnpm vibesku-clips-cli -- auth login --base-url http://localhost:3000
pnpm vibesku-clips-cli -- auth status --base-url http://localhost:3000
pnpm vibesku-clips-cli -- auth refresh --base-url http://localhost:3000
pnpm vibesku-clips-cli -- auth logout
```

## Security notes

- browser login uses a device authorization flow
- access tokens and refresh tokens are stored locally with restrictive file permissions
- the browser launcher only opens `http` and `https` URLs
- API keys and CLI tokens are validated by the app's machine auth layer, not by the CLI itself
