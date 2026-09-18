// ==========================================================================
// Go-Tegs — Footer social icons, managed from admin/admin-social
// Auto-runs after the footer partial injects, on every page. Uses the
// same Supabase project as updates/store/lesson-notes.
// ==========================================================================

(function () {
  const ICONS = {
    facebook: '<svg viewBox="0 0 24 24"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12Z"/></svg>',
    twitter: '<svg viewBox="0 0 24 24"><path d="M18.9 3H21l-6.4 7.3L22 21h-5.9l-4.6-6-5.3 6H3l6.8-7.8L2.3 3h6l4.2 5.5L18.9 3Zm-1 16h1.2L7.2 4.9H5.9L17.9 19Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24"><path d="M12 2c2.7 0 3.1 0 4.1.1 1.1 0 1.8.2 2.4.4a5 5 0 0 1 2.9 2.9c.2.6.4 1.3.4 2.4.1 1 .1 1.4.1 4.1s0 3.1-.1 4.1c0 1.1-.2 1.8-.4 2.4a5 5 0 0 1-2.9 2.9c-.6.2-1.3.4-2.4.4-1 .1-1.4.1-4.1.1s-3.1 0-4.1-.1c-1.1 0-1.8-.2-2.4-.4a5 5 0 0 1-2.9-2.9c-.2-.6-.4-1.3-.4-2.4C2 15.1 2 14.7 2 12s0-3.1.1-4.1c0-1.1.2-1.8.4-2.4a5 5 0 0 1 2.9-2.9c.6-.2 1.3-.4 2.4-.4C8.9 2 9.3 2 12 2Zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4Zm5.2-8.4a1.2 1.2 0 1 0 0-2.3 1.2 1.2 0 0 0 0 2.3Z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.4c.1-.1.2-.3.2-.4 0-.2 0-.3 0-.5-.1-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.2-.9.9-.9 2.2s1 2.6 1.1 2.7c.1.2 2 3 4.7 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.6-.3Z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24"><path d="M14 2h3a5 5 0 0 0 4 4v3a8 8 0 0 1-4-1.1V15a6 6 0 1 1-6-6c.3 0 .7 0 1 .1v3.1a3 3 0 1 0 2 2.8V2Z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24"><path d="M22 12s0-3.2-.4-4.7a3 3 0 0 0-2.1-2.1C18 5 12 5 12 5s-6 0-7.5.2A3 3 0 0 0 2.4 7.3C2 8.8 2 12 2 12s0 3.2.4 4.7a3 3 0 0 0 2.1 2.1C6 19 12 19 12 19s6 0 7.5-.2a3 3 0 0 0 2.1-2.1C22 15.2 22 12 22 12ZM10 15.5v-7l6 3.5-6 3.5Z"/></svg>',
  };

  async function loadSocialIcons() {
    const container = document.getElementById("footer-social");
    if (!container) return;

    try {
      await loadScriptIfNeeded("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");
      await loadScriptIfNeeded("/assets/js/supabase-config.js");

      const { data, error } = await supabaseClient
        .from("social_links")
        .select("*")
        .order("display_order", { ascending: true });

      if (error || !data || !data.length) return; // fail quietly — footer looks fine without it

      container.innerHTML = data
        .map((row) => {
          const icon = ICONS[row.platform.toLowerCase()] || ICONS.facebook;
          return `<a href="${row.url}" target="_blank" rel="noopener" aria-label="${row.platform}">${icon}</a>`;
        })
        .join("");
    } catch (err) {
      console.error("Social icons failed to load:", err);
    }
  }

  function loadScriptIfNeeded(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  window.__gotegsLoadSocialIcons = loadSocialIcons;
})();
