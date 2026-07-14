(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────────
  var SUPABASE_URL      = 'https://pdvfjlxlsltsozmqsxek.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkdmZqbHhsc2x0c296bXFzeGVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyODk5NTMsImV4cCI6MjA5NDg2NTk1M30.JRoXwQY5xPl1SM86fKcEm0D06hFa1QsNSmZkdBN7K5U';
  var SITE_URL          = 'https://loteran.github.io/asm-presets/';

  // ── Supabase client (local var — no conflict with window.supabase) ──────────
  var sb = window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true } })
    : null;

  // ── Standalone login (native onclick, no Alpine needed) ────────────────────
  window.asmLogin = async function () {
    if (!sb) { alert('Supabase not loaded — reload the page.'); return; }
    try {
      var result = await sb.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: SITE_URL },
      });
      if (result.error) {
        alert('OAuth error: ' + result.error.message);
      } else if (result.data && result.data.url) {
        window.location.href = result.data.url;
      } else {
        alert('No redirect URL from Supabase.');
      }
    } catch (e) {
      alert('Login error: ' + e.message);
    }
  };

  // The 15 color keys shared with ASM's deep-link contract, in a stable
  // display order. See arctis-asm://import-theme?data=<base64url(json)>.
  var THEME_COLOR_KEYS = [
    'BG_MAIN', 'BG_SIDEBAR', 'BG_CARD', 'BG_BUTTON', 'BG_BUTTON_HOVER',
    'BG_SIDEBAR_ACTIVE', 'ACCENT', 'ACCENT2', 'TEXT_PRIMARY', 'TEXT_SECONDARY',
    'BORDER', 'COLOR_GAME', 'COLOR_CHAT', 'COLOR_AUX', 'COLOR_HDMI',
  ];

  // base64url -> JS object (UTF-8 safe). Returns null on any failure.
  function decodeBase64UrlJson(b64url) {
    try {
      var padded = String(b64url).replace(/-/g, '+').replace(/_/g, '/');
      // ASM strips base64 padding, so we restore it: a length of 4n+2 needs '==',
      // 4n+3 needs '='. Getting this wrong makes atob() throw InvalidCharacterError
      // and the link looks corrupt even though it is perfectly valid.
      var pad = '=='.slice(0, (4 - padded.length % 4) % 4);
      var binary = atob(padded + pad);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      var json = new TextDecoder('utf-8').decode(bytes);
      return JSON.parse(json);
    } catch (_) {
      return null;
    }
  }

  // ── Alpine component factory ────────────────────────────────────────────────
  window.app = function () {
    return {
      user: null,
      contentType: 'presets', // 'presets' | 'themes' — which section is active

      presets: [],
      loading: true,
      mode: 'browse',
      search: '',
      filterChannel: '',
      filterDevice: '',
      sortBy: 'votes',
      myVotes: new Set(),
      deletingId: null,
      form: { name: '', game: '', channel: 'Game', device: '', link: '', error: '' },
      submitting: false,
      submitted: false,
      copiedId: null,

      themes: [],
      themesLoading: true,
      themeSearch: '',
      themeSortBy: 'votes',
      myThemeVotes: new Set(),
      deletingThemeId: null,
      themeForm: { name: '', link: '', error: '' },
      themeSubmitting: false,
      themeSubmitted: false,
      copiedThemeId: null,

      async init() {
        if (!sb) return;
        const { data: { session } } = await sb.auth.getSession();
        this.user = session ? session.user : null;

        sb.auth.onAuthStateChange((event, session) => {
          this.user = session ? session.user : null;
          if (this.user) { this.loadMyVotes(); this.loadMyThemeVotes(); }
          if (event === 'SIGNED_IN') this._restorePendingForm();
        });

        const params = new URLSearchParams(window.location.search);
        if (params.get('submit') === '1' && params.get('type') === 'theme') {
          this.contentType    = 'themes';
          this.mode           = 'submit';
          this.themeForm.link = params.get('data') || '';
          this.themeForm.name = params.get('name') || '';
        } else if (params.get('submit') === '1') {
          this.contentType  = 'presets';
          this.mode         = 'submit';
          this.form.link    = params.get('data')    || '';
          this.form.name    = params.get('name')    || '';
          this.form.channel = params.get('channel') || 'Game';
          this.form.device  = params.get('device')  || '';
          this.form.game    = params.get('game')    || this.form.name;
        } else {
          this._restorePendingForm();
        }

        if (this.user) { await this.loadMyVotes(); await this.loadMyThemeVotes(); }
        await this.loadPresets();
        await this.loadThemes();
      },

      _restorePendingForm() {
        var saved = localStorage.getItem('asm_pending_form');
        if (!saved) return;
        try {
          var f = JSON.parse(saved);
          if (Date.now() - (f._ts || 0) < 10 * 60 * 1000) {
            var type = f._type || 'preset';
            delete f._ts;
            delete f._type;
            if (type === 'theme') {
              Object.assign(this.themeForm, f);
              this.contentType = 'themes';
            } else {
              Object.assign(this.form, f);
              this.contentType = 'presets';
            }
            this.mode = 'submit';
          }
        } catch (_) {}
        localStorage.removeItem('asm_pending_form');
      },

      async loadMyVotes() {
        if (!this.user || !sb) return;
        var res = await sb.from('votes').select('preset_id').eq('user_id', this.user.id);
        this.myVotes = new Set((res.data || []).map(function (v) { return v.preset_id; }));
      },

      async loadMyThemeVotes() {
        if (!this.user || !sb) return;
        var res = await sb.from('theme_votes').select('theme_id').eq('user_id', this.user.id);
        this.myThemeVotes = new Set((res.data || []).map(function (v) { return v.theme_id; }));
      },

      async loadPresets() {
        if (!sb) { this.loading = false; return; }
        this.loading = true;
        var query = sb.from('presets').select('*');
        if (this.search)        query = query.ilike('name',   '%' + this.search + '%');
        if (this.filterChannel) query = query.eq('channel',   this.filterChannel);
        if (this.filterDevice)  query = query.ilike('device', '%' + this.filterDevice + '%');
        query = this.sortBy === 'votes'
          ? query.order('vote_count', { ascending: false })
          : query.order('created_at', { ascending: false });
        var res = await query.limit(60);
        this.presets = res.data || [];
        this.loading = false;
      },

      async loadThemes() {
        if (!sb) { this.themesLoading = false; return; }
        this.themesLoading = true;
        var query = sb.from('themes').select('*');
        if (this.themeSearch) query = query.ilike('name', '%' + this.themeSearch + '%');
        query = this.themeSortBy === 'votes'
          ? query.order('vote_count', { ascending: false })
          : query.order('created_at', { ascending: false });
        var res = await query.limit(60);
        this.themes = res.data || [];
        this.themesLoading = false;
      },

      async loginWithGitHub() {
        if (!sb) return;
        var pending = this.contentType === 'themes'
          ? {
              name: this.themeForm.name, link: this.themeForm.link,
              _type: 'theme', _ts: Date.now(),
            }
          : {
              link: this.form.link, name: this.form.name,
              game: this.form.game, channel: this.form.channel,
              device: this.form.device, _type: 'preset', _ts: Date.now(),
            };
        localStorage.setItem('asm_pending_form', JSON.stringify(pending));
        var result = await sb.auth.signInWithOAuth({
          provider: 'github',
          options: { redirectTo: SITE_URL },
        });
        if (result.error) {
          alert('OAuth error: ' + result.error.message);
        } else if (result.data && result.data.url) {
          window.location.href = result.data.url;
        } else {
          alert('No redirect URL from Supabase.');
        }
      },

      async logout() {
        if (sb) await sb.auth.signOut();
      },

      hasVoted(preset) {
        return this.myVotes.has(preset.id);
      },

      async toggleVote(preset) {
        if (!this.user) { this.loginWithGitHub(); return; }
        var res = await sb.rpc('toggle_vote', { p_preset_id: preset.id });
        if (!res.error && res.data) {
          preset.vote_count = res.data.vote_count;
          if (res.data.voted) this.myVotes.add(preset.id);
          else                this.myVotes.delete(preset.id);
        }
      },

      channelColor(channel) {
        var colors = { Game: '#3b82f6', Chat: '#22c55e', Mic: '#eab308', Media: '#a855f7' };
        return colors[channel] || '#8D96AA';
      },

      hasVotedTheme(theme) {
        return this.myThemeVotes.has(theme.id);
      },

      async toggleThemeVote(theme) {
        if (!this.user) { this.loginWithGitHub(); return; }
        var res = await sb.rpc('toggle_theme_vote', { p_theme_id: theme.id });
        if (!res.error && res.data) {
          theme.vote_count = res.data.vote_count;
          if (res.data.voted) this.myThemeVotes.add(theme.id);
          else                this.myThemeVotes.delete(theme.id);
        }
      },

      // Ordered hex list (BG_MAIN, BG_SIDEBAR, ... COLOR_HDMI) from a raw
      // colors object, falling back to black for any missing key.
      themeSwatchesFromColors(colors) {
        if (!colors) return [];
        return THEME_COLOR_KEYS.map(function (k) { return colors[k] || '#000000'; });
      },

      // Same, but reading from a `themes` row (theme.colors is jsonb).
      themeSwatches(theme) {
        return this.themeSwatchesFromColors(theme && theme.colors);
      },

      // Extract the `colors` object from a full arctis-asm://import-theme
      // deep link: arctis-asm://import-theme?data=<base64url(json)>.
      // Returns null if the link is missing/malformed.
      decodeThemeLink(link) {
        if (!link) return null;
        try {
          var url = new URL(link);
          var b64 = url.searchParams.get('data') || '';
          if (!b64) return null;
          var obj = decodeBase64UrlJson(b64);
          return (obj && obj.colors) || null;
        } catch (_) {
          return null;
        }
      },

      isNew(createdAt) {
        return new Date(createdAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;
      },

      async submitPreset() {
        this.form.error = '';
        if (!this.user) { this.loginWithGitHub(); return; }
        if (!this.form.name.trim()) { this.form.error = 'Please enter a preset name.'; return; }
        if (!this.form.link.trim()) { this.form.error = 'No preset data. Use "Publish to community" from ASM.'; return; }
        this.submitting = true;

        // Same decoder as the themes path — this used to carry its own copy of the
        // base64 padding logic (with a bug), and silently swallowed the failure:
        // the preset was published with an empty `data`, with no error shown.
        var decodedData = null;
        try {
          var url = new URL(this.form.link);
          decodedData = decodeBase64UrlJson(url.searchParams.get('data') || '');
        } catch (_) {}

        if (!decodedData) {
          this.submitting = false;
          this.form.error = 'Could not read the preset link — make sure it was generated by ASM.';
          return;
        }

        var res = await sb.from('presets').insert({
          name:          this.form.name.trim(),
          game:          (this.form.game || this.form.name).trim(),
          channel:       this.form.channel,
          device:        this.form.device.trim(),
          data:          decodedData,
          link:          this.form.link.trim(),
          author_id:     this.user.id,
          author_name:   (this.user.user_metadata && this.user.user_metadata.user_name) || 'Anonymous',
          author_avatar: (this.user.user_metadata && this.user.user_metadata.avatar_url) || '',
        });

        this.submitting = false;
        if (res.error) {
          this.form.error = res.error.message || 'Submission failed.';
        } else {
          this.submitted = true;
          var self = this;
          setTimeout(function () {
            self.submitted = false;
            self.mode = 'browse';
            window.history.replaceState({}, '', window.location.pathname);
            self.loadPresets();
          }, 2000);
        }
      },

      importPreset(preset) {
        window.location.href = preset.link;
      },

      async copyLink(preset) {
        try {
          await navigator.clipboard.writeText(preset.link);
        } catch (_) {
          var ta = document.createElement('textarea');
          ta.value = preset.link;
          ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        this.copiedId = preset.id;
        var self = this;
        setTimeout(function () { self.copiedId = null; }, 2000);
      },

      async deletePreset(preset) {
        if (!confirm('Delete "' + preset.name + '"? This cannot be undone.')) return;
        this.deletingId = preset.id;
        await sb.from('presets').delete().eq('id', preset.id).eq('author_id', this.user.id);
        this.deletingId = null;
        this.presets = this.presets.filter(function (p) { return p.id !== preset.id; });
      },

      async submitTheme() {
        this.themeForm.error = '';
        if (!this.user) { this.loginWithGitHub(); return; }
        if (!this.themeForm.name.trim()) { this.themeForm.error = 'Please enter a theme name.'; return; }
        if (!this.themeForm.link.trim()) { this.themeForm.error = 'No theme data. Use "Publish to community" from ASM.'; return; }

        var colors = this.decodeThemeLink(this.themeForm.link.trim());
        if (!colors) {
          this.themeForm.error = 'Could not read the theme link — make sure it was generated by ASM.';
          return;
        }

        this.themeSubmitting = true;

        var res = await sb.from('themes').insert({
          name:          this.themeForm.name.trim(),
          colors:        colors,
          link:          this.themeForm.link.trim(),
          author_id:     this.user.id,
          author_name:   (this.user.user_metadata && this.user.user_metadata.user_name) || 'Anonymous',
          author_avatar: (this.user.user_metadata && this.user.user_metadata.avatar_url) || '',
        });

        this.themeSubmitting = false;
        if (res.error) {
          this.themeForm.error = res.error.message || 'Submission failed.';
        } else {
          this.themeSubmitted = true;
          var self = this;
          setTimeout(function () {
            self.themeSubmitted = false;
            self.mode = 'browse';
            window.history.replaceState({}, '', window.location.pathname);
            self.loadThemes();
          }, 2000);
        }
      },

      importTheme(theme) {
        window.location.href = theme.link;
      },

      async copyThemeLink(theme) {
        try {
          await navigator.clipboard.writeText(theme.link);
        } catch (_) {
          var ta = document.createElement('textarea');
          ta.value = theme.link;
          ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        this.copiedThemeId = theme.id;
        var self = this;
        setTimeout(function () { self.copiedThemeId = null; }, 2000);
      },

      async deleteTheme(theme) {
        if (!confirm('Delete "' + theme.name + '"? This cannot be undone.')) return;
        this.deletingThemeId = theme.id;
        await sb.from('themes').delete().eq('id', theme.id).eq('author_id', this.user.id);
        this.deletingThemeId = null;
        this.themes = this.themes.filter(function (t) { return t.id !== theme.id; });
      },

      formatDate(d) {
        return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      },
    };
  };

})();
