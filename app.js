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

  // ── Alpine component factory ────────────────────────────────────────────────
  window.app = function () {
    return {
      user: null,
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

      async init() {
        if (!sb) return;
        const { data: { session } } = await sb.auth.getSession();
        this.user = session ? session.user : null;

        sb.auth.onAuthStateChange((event, session) => {
          this.user = session ? session.user : null;
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
        var saved = localStorage.getItem('asm_pending_form');
        if (!saved) return;
        try {
          var f = JSON.parse(saved);
          if (Date.now() - (f._ts || 0) < 10 * 60 * 1000) {
            delete f._ts;
            Object.assign(this.form, f);
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

      async loginWithGitHub() {
        if (!sb) return;
        localStorage.setItem('asm_pending_form', JSON.stringify({
          link: this.form.link, name: this.form.name,
          game: this.form.game, channel: this.form.channel,
          device: this.form.device, _ts: Date.now(),
        }));
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

      isNew(createdAt) {
        return new Date(createdAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;
      },

      async submitPreset() {
        this.form.error = '';
        if (!this.user) { this.loginWithGitHub(); return; }
        if (!this.form.name.trim()) { this.form.error = 'Please enter a preset name.'; return; }
        if (!this.form.link.trim()) { this.form.error = 'No preset data. Use "Publish to community" from ASM.'; return; }
        this.submitting = true;

        var decodedData = {};
        try {
          var url  = new URL(this.form.link);
          var b64  = url.searchParams.get('data') || '';
          var padded = b64.replace(/-/g, '+').replace(/_/g, '/');
          var pad  = '=='.slice((padded.length + 3) % 4);
          decodedData = JSON.parse(atob(padded + pad));
        } catch (_) {}

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

      formatDate(d) {
        return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      },
    };
  };

})();
