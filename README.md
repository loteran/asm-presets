# ASM Presets

Community preset & theme sharing site for [Arctis Sound Manager](https://github.com/loteran/Arctis-Sound-Manager).

Users can browse, upvote, and import EQ presets **and UI color themes** shared by the community directly into ASM via the `arctis-asm://` deep link protocol. Both are submitted from inside ASM (Share button) and land on this page pre-filled. Presets and themes live side by side on the same page, share the same Supabase project and the same GitHub login, but use entirely separate tables/votes — sharing one does not affect the other.

---

## Setup

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (free tier is sufficient).
2. Click **New project**, choose a name (e.g. `asm-presets`) and a region close to your users.
3. Wait for the project to finish provisioning (~2 minutes).

---

### 2. Run the database schema

1. In your Supabase project, open **SQL Editor** (left sidebar).
2. Paste the entire contents of `supabase_schema.sql` into the editor.
3. Click **Run** (or press `Ctrl+Enter`).

This creates:
- `presets` table with RLS policies
- `votes` table with RLS policies
- `toggle_vote()` stored function (security definer, so vote counts are consistent)
- `themes` table with RLS policies (same pattern as `presets`, but stores a `colors` jsonb object instead of EQ `data`, and has no `channel` constraint)
- `theme_votes` table with RLS policies (same pattern as `votes`)
- `toggle_theme_vote()` stored function (security definer, mirrors `toggle_vote()` for the `themes` table)
- Indexes for fast filtering and sorting on both preset and theme tables

The theme part of the script (from the `ASM Themes` header onward) uses `create table if not exists`, `create index if not exists`, `create or replace function`, and `drop policy if exists` before each `create policy`, so it is safe to re-run — e.g. if you're adding theme sharing to a project that already has the `presets`/`votes` tables from an earlier run of this file.

---

### 3. Enable GitHub OAuth

ASM Presets uses GitHub as the sole login provider via Supabase Auth.

#### a. Create a GitHub OAuth App

1. Go to [github.com/settings/developers](https://github.com/settings/developers) → **OAuth Apps** → **New OAuth App**.
2. Fill in:
   - **Application name**: `ASM Presets`
   - **Homepage URL**: `https://loteran.github.io/asm-presets/`
   - **Authorization callback URL**:
     ```
     https://YOUR_PROJECT.supabase.co/auth/v1/callback
     ```
     Replace `YOUR_PROJECT` with your actual Supabase project reference (visible in Project Settings → General).
3. Click **Register application**.
4. Copy the **Client ID** and generate a **Client Secret**.

#### b. Configure Supabase

1. In Supabase, go to **Authentication → Providers**.
2. Find **GitHub** and enable it.
3. Paste the **Client ID** and **Client Secret** from the OAuth App.
4. Save.

---

### 4. Set the site URL in Supabase

1. In Supabase, go to **Authentication → URL Configuration**.
2. Set **Site URL** to:
   ```
   https://loteran.github.io/asm-presets/
   ```
3. Under **Redirect URLs**, add the same URL (required for OAuth redirects after login):
   ```
   https://loteran.github.io/asm-presets/
   ```
4. Save.

---

### 5. Configure `index.html`

Open `index.html` and replace the three placeholder constants near the top of the `<script>` block:

```js
const SUPABASE_URL      = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
const SITE_URL          = 'https://loteran.github.io/asm-presets/';
```

- **SUPABASE_URL**: Project Settings → General → Reference ID → `https://<ref>.supabase.co`
- **SUPABASE_ANON_KEY**: Project Settings → API → `anon` `public` key
- **SITE_URL**: the GitHub Pages URL (or your custom domain if you set one)

The anon key is safe to expose in client-side code — all access is controlled by Row-Level Security policies.

---

### 6. Create the GitHub repository and enable Pages

```bash
cd /home/loteran/asm-presets

git init
git add index.html supabase_schema.sql README.md
git commit -m "Initial commit: ASM Presets community site"

# Create repo on GitHub (requires gh CLI)
gh repo create loteran/asm-presets --public --source=. --remote=origin --push

# Enable Pages from the main branch root
gh api repos/loteran/asm-presets/pages \
  -X POST \
  -f source.branch=main \
  -f source.path=/
```

GitHub Pages will be live at `https://loteran.github.io/asm-presets/` within a minute or two.

Alternatively, enable Pages manually in the repository **Settings → Pages → Source → Deploy from a branch → main / (root)**.

---

## How the submit flow works

When ASM generates a Share link it can open the browser at:

```
https://loteran.github.io/asm-presets/?submit=1
  &data=<arctis-asm-deep-link>
  &name=<preset-name>
  &channel=<Game|Chat|Mic|Media>
  &device=<device-name>
  &game=<game-name>
```

The site reads these URL params, switches to Submit mode, and pre-fills the form. The user only needs to click **Submit Preset** (after logging in with GitHub).

---

## How theme sharing works

The site adds a **Presets / Themes** toggle at the top of the page (`contentType` in `app.js`). Everything below it — the browse grid, the search/sort bar, and the submit form — swaps between the preset flow and the theme flow. The preset state (`presets`, `myVotes`, `form`, …) and the theme state (`themes`, `myThemeVotes`, `themeForm`, …) are fully independent, so sharing a theme can never affect a preset's votes or vice versa.

### Deep link contract

ASM generates a theme deep link of the form:

```
arctis-asm://import-theme?data=<base64url(json, no padding)>
json = {"v":1,"name":<string>,"colors":{ ...15 keys... }}
```

The 15 `colors` keys (values are `"#rrggbb"` or `"#rgb"` strings):

```
BG_MAIN, BG_SIDEBAR, BG_CARD, BG_BUTTON, BG_BUTTON_HOVER, BG_SIDEBAR_ACTIVE,
ACCENT, ACCENT2, TEXT_PRIMARY, TEXT_SECONDARY, BORDER,
COLOR_GAME, COLOR_CHAT, COLOR_AUX, COLOR_HDMI
```

### Submission URL

ASM opens the browser at:

```
https://loteran.github.io/asm-presets/?submit=1&type=theme
  &data=<url-encoded arctis-asm://import-theme deep link>
  &name=<url-encoded theme name>
```

`app.js`'s `init()` checks for `type=theme` to switch into theme-submit mode (as opposed to the default preset-submit mode used when `type` is absent/`preset`), and pre-fills `themeForm.name` / `themeForm.link` from the `name` / `data` params.

### Decoding the deep link (base64url → JSON)

`themeForm.link` holds the **full** deep link (`arctis-asm://import-theme?data=...`), not just the inner payload. The site extracts the inner base64url string via `new URL(link).searchParams.get('data')`, then decodes it:

1. Convert base64url to base64: replace `-` → `+`, `_` → `/`, then re-pad with `=` to a multiple of 4 characters.
2. `atob()` the result to get a binary string.
3. Convert to UTF-8 text (values can contain accented/non-ASCII theme names): map the binary string to a `Uint8Array` and run it through `TextDecoder('utf-8')` before `JSON.parse`. Naive `atob()` alone would mangle any non-ASCII characters.

This logic lives in `decodeBase64UrlJson()` / `decodeThemeLink()` in `app.js`. On submit, the decoded `colors` object (not the raw link) is what gets stored in the `themes.colors` jsonb column — the `link` column keeps the original deep link so "Import in ASM" and "Copy link" keep working unchanged.

Each theme card renders a row of 15 color swatches (`themeSwatches()` / `.theme-swatches` / `.swatch` in `index.html`) built from `colors` in the fixed key order above, so browsing gives an at-a-glance preview before importing.

---

## Official presets

Rows with `official = true` get an ⭐ badge and a colored left border. These can only be inserted directly via the Supabase SQL Editor or dashboard (no UI flow for it), keeping the designation trustworthy.

---

## Local development

No build step is required. Open `index.html` directly in a browser, or serve it with any static server:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

Note: GitHub OAuth redirects will still land on the configured `SITE_URL`, so for local testing you can temporarily add `http://localhost:8080/` to the Supabase redirect URL list.

---

## Files

| File | Purpose |
|---|---|
| `index.html` | Self-contained single-page app (Alpine.js + Supabase JS, no build step) |
| `supabase_schema.sql` | Full database schema — run once in Supabase SQL Editor |
| `README.md` | This setup guide |
