(function initHoverCard(globalScope) {
  let cardEl = null;
  let hideTimer = null;

  function ensureCard() {
    if (cardEl) return cardEl;
    cardEl = document.createElement("div");
    cardEl.id = "cot-research-hover-card";
    Object.assign(cardEl.style, {
      position: "fixed",
      zIndex: "2147483647",
      maxWidth: "340px",
      background: "#121212",
      color: "#ffffff",
      border: "1px solid #333",
      borderRadius: "8px",
      padding: "10px",
      fontSize: "12px",
      lineHeight: "1.4",
      display: "none",
      boxShadow: "0 8px 20px rgba(0,0,0,0.35)"
    });
    cardEl.addEventListener("mouseenter", () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    });
    cardEl.addEventListener("mouseleave", () => {
      hideHoverCard(120);
    });
    document.body.appendChild(cardEl);
    return cardEl;
  }

  function showHoverCard(payload, x, y) {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    const el = ensureCard();
    const sourceLink = payload?.sourceUrl
      ? `<a href="${payload.sourceUrl}" target="_blank" style="color:#85b7ff">System-card reference</a>`
      : "No source link configured yet.";
    el.innerHTML = `
      <div style="font-weight:600;margin-bottom:6px;">${payload.label || "Annotation"}</div>
      <div style="margin-bottom:6px;">${payload.reason || "No rationale available."}</div>
      <div style="margin-bottom:6px;">Confidence: ${Math.round((payload.confidence || 0) * 100)}%</div>
      <div>${sourceLink}</div>
    `;
    el.style.left = `${Math.min(x + 12, window.innerWidth - 360)}px`;
    el.style.top = `${Math.min(y + 12, window.innerHeight - 180)}px`;
    el.style.display = "block";
  }

  function hideHoverCard(delayMs = 0) {
    if (!cardEl) return;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      cardEl.style.display = "none";
      hideTimer = null;
    }, delayMs);
  }

  globalScope.CotHoverCard = { showHoverCard, hideHoverCard };
})(window);
