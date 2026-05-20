// ============================================================
// ASM Presets — Alpine.js application
// Loaded as external file to avoid inline-script CSP blocking
// ============================================================

// Défini EN PREMIER — si le fichier charge, ce symbole existe
window.__asmLoaded = true;

// Login standalone défini immédiatement, avant tout code risqué
window.asmLogin = async function () {
  var url = 'https://pdvfjlxlsltsozmqsxek._sb.co';
  var key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkdmZqbHhsc2x0c296bXFzeGVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyODk5NTMsImV4cCI6MjA5NDg2NTk1M30.JRoXwQY5xPl1SM86fKcEm0D06hFa1QsNSmZkdBN7K5U';
  var site = 'https://loteran.github.io/asm-presets/';
  try {
    var sb = window.supabase
      ? window._sb.createClient(url, key, { auth: { persistSession: true } })
      : null;
    if (!sb) { alert('Supabase not available — reload the page.'); return; }
    var result = await sb.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: site },
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

const SUPABASE_URL      = 'https://pdvfjlxlsltsozmqsxek._sb.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkdmZqbHhsc2x0c296bXFzeGVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyODk5NTMsImV4cCI6MjA5NDg2NTk1M30.JRoXwQY5xPl1SM86fKcEm0D06hFa1QsNSmZkdBN7K5U';
const SITE_URL          = 'https://loteran.github.io/asm-presets/';

let _sb;
try {
  _sb = window._sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true },
  });
} catch (e) {
  console.error('Supabase init failed:', e);
}

function app() {
  const _component = {
    // ── Auth
    user: null,

    // ── Data
    presets: [],
    loading: true,

    // ── Navigation
    mode: 'browse',

    // ── Filters
    search: '',
    filterChannel: '',
    filterDevice: '',
    sortBy: 'votes',

    // ── Votes
    myVotes: new Set(),

    // ── Delete
    deletingId: null,

    // ── Submit form
    form: { name: '', game: '', channel: 'Game', device: '', link: '', error: '' },
    submitting: false,
    submitted: false,

    // ── UI state
    copiedId: null,

    // ──────────────────────────────────────────────────────
    async init() {
      window.__app = this;

      const { data: { session } } = await _sb.auth.getSession();
      this.user = session?.user ?? null;

      _sb.auth.onAuthStateChange((event, session) => {
        this.user = session?.user ?? null;
        if (this.user) this.loadMyVotes();
        if (event === 'SIGNED_IN') this._restorePendingForm();
      });

      const params = new URLSearchParams(window.location.search);
      if (params.get('submit') === '1') {
        this.mode = 'submit';
        this.form.link    = params.get('data')    || '';
        this.form.name    = params.get('name')    || '';
        this.form.channel = params.get('channel') || 'Game';
        this.form.device  = params.get('device')  || '';
        this.form.game    = params.get('game')    || this.form.name;
      } else {
        this._restorePendingForm();
      }

      if (this.user) await this.loadMyVotes();
      await this.loadPresets();
    },

    _restorePendingForm() {
      const saved = localStorage.getItem('asm_pending_form');
      if (!saved) return;
      try {
        const f = JSON.parse(saved);
        if (Date.now() - (f._ts || 0) < 10 * 60 * 1000) {
          delete f._ts;
          Object.assign(this.form, f);
          this.mode = 'submit';
        }
      } catch (_) {}
      localStorage.removeItem('asm_pending_form');
    },

    // ──────────────────────────────────────────────────────
    async loadMyVotes() {
      if (!this.user) return;
      const { data } = await _sb
        .from('votes')
        .select('preset_id')
        .eq('user_id', this.user.id);
      this.myVotes = new Set((data || []).map(v => v.preset_id));
    },

    // ──────────────────────────────────────────────────────
    async loadPresets() {
      this.loading = true;
      let query = _sb.from('presets').select('*');
      if (this.search)        query = query.ilike('name',   `%${this.search}%`);
      if (this.filterChannel) query = query.eq('channel',   this.filterChannel);
      if (this.filterDevice)  query = query.ilike('device', `%${this.filterDevice}%`);
      if (this.sortBy === 'votes')
        query = query.order('vote_count', { ascending: false });
      else
        query = query.order('created_at', { ascending: false });
      const { data } = await query.limit(60);
      this.presets = data || [];
      this.loading = false;
    },

    // ──────────────────────────────────────────────────────
    async loginWithGitHub() {
      localStorage.setItem('asm_pending_form', JSON.stringify({
        link: this.form.link, name: this.form.name,
        game: this.form.game, channel: this.form.channel,
        device: this.form.device, _ts: Date.now(),
      }));
      const { data, error } = await _sb.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: SITE_URL },
      });
      if (error) {
        alert('OAuth error: ' + error.message);
      } else if (data?.url) {
        window.location.href = data.url;
      } else {
        alert('No redirect URL from Supabase — check GitHub OAuth config.');
      }
    },

    async logout() {
      await _sb.auth.signOut();
    },

    // ──────────────────────────────────────────────────────
    hasVoted(preset) {
      return this.myVotes.has(preset.id);
    },

    async toggleVote(preset) {
      if (!this.user) { this.loginWithGitHub(); return; }
      const { data, error } = await _sb.rpc('toggle_vote', { p_preset_id: preset.id });
      if (!error && data) {
        preset.vote_count = data.vote_count;
        if (data.voted) this.myVotes.add(preset.id);
        else            this.myVotes.delete(preset.id);
      }
    },

    // ──────────────────────────────────────────────────────
    channelColor(channel) {
      const colors = { Game: '#3b82f6', Chat: '#22c55e', Mic: '#eab308', Media: '#a855f7' };
      return colors[channel] || '#8D96AA';
    },

    isNew(createdAt) {
      return new Date(createdAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;
    },

    // ──────────────────────────────────────────────────────
    async submitPreset() {
      this.form.error = '';
      if (!this.user) { this.loginWithGitHub(); return; }
      if (!this.form.name.trim()) {
        this.form.error = 'Please enter a preset name.'; return;
      }
      if (!this.form.link.trim()) {
        this.form.error = 'No preset data. Use "Publish to community" from ASM.'; return;
      }
      this.submitting = true;

      let decodedData = {};
      try {
        const url    = new URL(this.form.link);
        const b64    = url.searchParams.get('data') || '';
        const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
        const pad    = '=='.slice((padded.length + 3) % 4);
        decodedData  = JSON.parse(atob(padded + pad));
      } catch (_) {}

      const { error } = await _sb.from('presets').insert({
        name:          this.form.name.trim(),
        game:          (this.form.game || this.form.name).trim(),
        channel:       this.form.channel,
        device:        this.form.device.trim(),
        data:          decodedData,
        link:          this.form.link.trim(),
        author_id:     this.user.id,
        author_name:   this.user.user_metadata?.user_name   || 'Anonymous',
        author_avatar: this.user.user_metadata?.avatar_url  || '',
      });

      this.submitting = false;
      if (error) {
        this.form.error = error.message || 'Submission failed — check your connection.';
      } else {
        this.form.error = '';
        this.submitted = true;
        setTimeout(() => {
          this.submitted = false;
          this.mode = 'browse';
          window.history.replaceState({}, '', window.location.pathname);
          this.loadPresets();
        }, 2000);
      }
    },

    // ──────────────────────────────────────────────────────
    importPreset(preset) {
      window.location.href = preset.link;
    },

    async copyLink(preset) {
      try {
        await navigator.clipboard.writeText(preset.link);
      } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = preset.link;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      this.copiedId = preset.id;
      setTimeout(() => { this.copiedId = null; }, 2000);
    },

    async deletePreset(preset) {
      if (!confirm(`Delete "${preset.name}"? This cannot be undone.`)) return;
      this.deletingId = preset.id;
      const { error } = await _sb
        .from('presets')
        .delete()
        .eq('id', preset.id)
        .eq('author_id', this.user.id);
      this.deletingId = null;
      if (!error) {
        this.presets = this.presets.filter(p => p.id !== preset.id);
      }
    },

    formatDate(d) {
      return new Date(d).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    },
  };

  return _component;
}

// Standalone login function — callable from native onclick without Alpine
window.asmLogin = async function () {
  if (!_sb) {
    alert('Supabase not loaded — check your network connection and reload.');
    return;
  }
  try {
    const { data, error } = await _sb.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: SITE_URL },
    });
    if (error) {
      alert('OAuth error: ' + error.message);
    } else if (data?.url) {
      window.location.href = data.url;
    } else {
      alert('No redirect URL from Supabase — check GitHub OAuth config.');
    }
  } catch (e) {
    alert('Login error: ' + e.message);
  }
};
