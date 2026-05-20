# ASM Presets

Community preset sharing site for [Arctis Sound Manager](https://github.com/loteran/Arctis-Sound-Manager).

Users can browse, upvote, and import EQ presets shared by the community directly into ASM via the `arctis-asm://` deep link protocol. Presets are submitted from inside ASM (Share button) and land on this page pre-filled.

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
- Indexes for fast filtering and sorting

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
