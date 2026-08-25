(function () {
  "use strict";

  const app = document.getElementById("app");
  const params = new URLSearchParams(window.location.search);
  const slug = (params.get("client") || "").trim().toLowerCase();

  const state = {
    client: null,
    customerType: "first",
    selectedIndex: 0,
    name: "",
    phone: "",
  };

  boot();

  async function boot() {
    if (!slug) {
      renderMissingSlug();
      return;
    }
    try {
      const res = await fetch(`clients/${encodeURIComponent(slug)}.json`, {
        cache: "no-store",
      });
      if (!res.ok) {
        renderUnknownClient(slug);
        return;
      }
      const data = await res.json();
      const client = normalizeClient(data);
      if (!client) {
        renderBadConfig(slug);
        return;
      }
      state.client = client;
      applyBranding(client);
      renderTool();
    } catch (err) {
      console.warn("Client config failed to load:", err);
      renderBadConfig(slug);
    }
  }

  function normalizeClient(raw) {
    if (!raw || typeof raw !== "object") return null;
    const drafts = raw.draftTemplates || {};
    const first = Array.isArray(drafts.first) ? drafts.first.filter(Boolean) : [];
    const repeat = Array.isArray(drafts.repeat) ? drafts.repeat.filter(Boolean) : [];
    const bizName = String(raw.bizName || "").trim();
    const ownerName = String(raw.ownerName || "").trim();
    const reviewLink = String(raw.reviewLink || "").trim();
    if (!bizName || !ownerName || !reviewLink || (!first.length && !repeat.length)) {
      return null;
    }
    return {
      slug: String(raw.slug || slug),
      bizName,
      ownerName,
      reviewLink,
      phone: String(raw.phone || "").trim(),
      accentColor: String(raw.accentColor || "").trim(),
      tagline: String(raw.tagline || "").trim(),
      draftTemplates: { first, repeat },
    };
  }

  function applyBranding(client) {
    document.title = `Review request — ${client.bizName}`;
    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) appleTitle.setAttribute("content", client.bizName);
    if (client.accentColor) {
      document.documentElement.style.setProperty("--accent", client.accentColor);
      const theme = document.querySelector('meta[name="theme-color"]');
      if (theme) theme.setAttribute("content", client.accentColor);
    }
  }

  function draftsForType() {
    const list = state.client.draftTemplates[state.customerType] || [];
    return list.length ? list : fallbackDrafts();
  }

  function fallbackDrafts() {
    return [
      "Hey {cust} — thanks for having us out today. We'd really appreciate a quick Google review: {link}\n\n—{owner}, {biz}",
    ];
  }

  function replaceTokens(template) {
    const cust = state.name.trim() || "there";
    return String(template || "")
      .replaceAll("{cust}", cust)
      .replaceAll("{biz}", state.client.bizName)
      .replaceAll("{owner}", state.client.ownerName)
      .replaceAll("{link}", state.client.reviewLink)
      .replace(/\{[a-z]+\}/gi, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function currentMessage() {
    const drafts = draftsForType();
    const idx = Math.min(state.selectedIndex, drafts.length - 1);
    return replaceTokens(drafts[idx] || "");
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function toE164(value) {
    let digits = digitsOnly(value);
    if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    if (digits.length !== 10) return "";
    return `+1${digits}`;
  }

  function isIOS() {
    const ua = navigator.userAgent || "";
    const iOSDevice = /iPad|iPhone|iPod/.test(ua);
    const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    return iOSDevice || iPadOS;
  }

  function buildSmsUrl(phone, body) {
    const sep = isIOS() ? "&" : "?";
    return `sms:${phone}${sep}body=${encodeURIComponent(body)}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function linkify(text) {
    return escapeHtml(text).replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener">$1</a>'
    );
  }

  function renderMissingSlug() {
    app.innerHTML = `
      <div class="state">
        <p class="eyebrow">Digital Dynamic Solution</p>
        <h1>Client link required</h1>
        <p>Open this tool with a client slug in the URL, like <code>?client=toby</code>.</p>
      </div>`;
  }

  function renderUnknownClient(name) {
    app.innerHTML = `
      <div class="state">
        <h1>Client not configured</h1>
        <p>No config file for <code>${escapeHtml(name)}</code>. Add <code>clients/${escapeHtml(name)}.json</code> to onboard them — no code change needed.</p>
      </div>`;
  }

  function renderBadConfig(name) {
    app.innerHTML = `
      <div class="state">
        <h1>Couldn't load this client</h1>
        <p>The file for <code>${escapeHtml(name)}</code> is missing required fields (bizName, ownerName, reviewLink, and at least one draft).</p>
      </div>`;
  }

  function renderTool() {
    const client = state.client;
    const drafts = draftsForType();
    if (state.selectedIndex >= drafts.length) state.selectedIndex = 0;
    const phoneOk = Boolean(toE164(state.phone));
    const message = currentMessage();

    app.innerHTML = `
      <header class="topbar">
        <div class="eyebrow">Review request</div>
        <h1>${escapeHtml(client.bizName)}</h1>
        ${client.tagline ? `<p class="tagline">${escapeHtml(client.tagline)}</p>` : ""}
      </header>
      <main class="sheet">
        <section>
          <div class="block-label">Customer</div>
          <div class="grid-2">
            <div class="field">
              <label for="cust-name">First name</label>
              <input id="cust-name" type="text" autocomplete="given-name" inputmode="text"
                placeholder="Alex" value="${escapeHtml(state.name)}" />
            </div>
            <div class="field">
              <label for="cust-phone">Phone</label>
              <input id="cust-phone" type="tel" autocomplete="tel" inputmode="tel"
                placeholder="555-123-4567" value="${escapeHtml(state.phone)}" />
            </div>
          </div>
          <p class="field-error" id="phone-error">${phoneOk || !state.phone ? "" : "Enter a 10-digit US number"}</p>
        </section>

        <section>
          <div class="block-label">Customer type</div>
          <div class="toggle" role="group" aria-label="Customer type">
            <button type="button" data-type="first" aria-pressed="${state.customerType === "first"}">First-time</button>
            <button type="button" data-type="repeat" aria-pressed="${state.customerType === "repeat"}">Repeat</button>
          </div>
        </section>

        <section>
          <div class="block-label">Pick a message</div>
          <div class="drafts">
            ${drafts
              .map((draft, i) => {
                const preview = replaceTokens(draft);
                return `
                  <button type="button" class="draft"
                    data-index="${i}" aria-pressed="${i === state.selectedIndex}">
                    <div class="draft-meta">Draft ${i + 1}</div>
                    <div class="draft-body">${escapeHtml(preview)}</div>
                  </button>`;
              })
              .join("")}
          </div>
        </section>

        <section>
          <div class="block-label">Preview</div>
          <div class="preview-wrap">
            ${message ? `<div class="bubble">${linkify(message)}</div>` : `<p class="preview-empty">Pick a draft to preview.</p>`}
          </div>
        </section>
        <p class="notice">Nothing sends from this page. Open Messages, then hit send on your phone.</p>
      </main>
      <div class="dock">
        <button type="button" class="btn btn-primary" id="open-messages">${phoneOk ? "Open Messages" : "Add a phone number"}</button>
        <button type="button" class="btn btn-ghost" id="copy-text">Copy text</button>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    const nameInput = document.getElementById("cust-name");
    const phoneInput = document.getElementById("cust-phone");
    const copyBtn = document.getElementById("copy-text");
    const sendBtn = document.getElementById("open-messages");

    nameInput.addEventListener("input", (e) => {
      state.name = e.target.value;
      refreshLivePreview();
    });
    phoneInput.addEventListener("input", (e) => {
      state.phone = e.target.value;
      const ok = Boolean(toE164(state.phone));
      const err = document.getElementById("phone-error");
      if (err) err.textContent = ok || !state.phone ? "" : "Enter a 10-digit US number";
      updateSendButton(ok);
    });

    document.querySelectorAll(".toggle button").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (state.customerType === btn.dataset.type) return;
        state.customerType = btn.dataset.type;
        state.selectedIndex = 0;
        renderTool();
      });
    });

    document.querySelectorAll(".draft").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedIndex = Number(btn.dataset.index);
        document.querySelectorAll(".draft").forEach((card, i) => {
          card.setAttribute("aria-pressed", String(i === state.selectedIndex));
        });
        const bubble = document.querySelector(".bubble");
        if (bubble) bubble.innerHTML = linkify(currentMessage());
        updateSendButton(Boolean(toE164(state.phone)));
      });
    });

    sendBtn.addEventListener("click", () => {
      const e164 = toE164(state.phone);
      if (!e164) {
        document.getElementById("cust-phone")?.focus();
        return;
      }
      window.location.href = buildSmsUrl(e164, currentMessage());
    });

    copyBtn.addEventListener("click", async () => {
      const text = currentMessage();
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const area = document.createElement("textarea");
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      copyBtn.classList.add("copied");
      copyBtn.textContent = "Copied";
      setTimeout(() => {
        copyBtn.classList.remove("copied");
        copyBtn.textContent = "Copy text";
      }, 1600);
    });
  }

  function updateSendButton(ok) {
    const sendBtn = document.getElementById("open-messages");
    if (!sendBtn) return;
    sendBtn.textContent = ok ? "Open Messages" : "Add a phone number";
  }

  function refreshLivePreview() {
    const drafts = draftsForType();
    document.querySelectorAll(".draft").forEach((btn, i) => {
      const body = btn.querySelector(".draft-body");
      if (body) body.textContent = replaceTokens(drafts[i]);
    });
    const bubble = document.querySelector(".bubble");
    const message = currentMessage();
    if (bubble) bubble.innerHTML = linkify(message);
    updateSendButton(Boolean(toE164(state.phone)));
  }
})();
