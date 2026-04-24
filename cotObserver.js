(function initCotObserver(globalScope) {
  const SELECTOR_CANDIDATES = [
    "[data-testid*='thought']",
    "[class*='thought']",
    "[class*='cot']",
    "[class*='reason']",
    "[data-testid*='message']",
    "[class*='message']",
    "[data-testid*='assistant']",
    "[class*='assistant']",
    "div[dir='auto']",
    "p",
    "li",
    "article",
    "main div"
  ];

  const processedHashes = new Set();
  let settingsCache = null;
  let citationIndex = [];
  let citationSourceStatus = "uninitialized";
  let scanTimer = null;
  const LOCAL_CITATION_FALLBACKS = [
    {
      citationId: "fallback-non-experiential-boundary",
      behaviorTags: ["expected-non-experiential-claim", "rubric-short-boundary-phrase"],
      sourceUrl: "https://www.anthropic.com/research",
      sourceAnchor: "#model-system-cards"
    },
    {
      citationId: "fallback-repetition-investigation",
      behaviorTags: ["interesting-token-repetition"],
      sourceUrl: "https://www.anthropic.com/research",
      sourceAnchor: "#safety"
    }
  ];

  function hashText(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    return String(hash);
  }

  function likelyCoTText(text) {
    if (!text) return false;
    if (text.length < 80) return false;
    return /\b(i|reason|because|therefore|cannot|can't|likely|uncertain|analysis)\b/i.test(text);
  }

  function scoreNode(el, selector, text) {
    let score = text.length;
    if (selector.includes("thought") || selector.includes("cot") || selector.includes("reason")) score += 6000;
    if (selector.includes("assistant")) score += 2000;
    if (selector === "main div") score -= 500;
    const cls = String(el.className || "").toLowerCase();
    const testId = String(el.getAttribute("data-testid") || "").toLowerCase();
    if (/thought|reason|analysis/.test(cls) || /thought|reason|analysis/.test(testId)) score += 3000;
    return score;
  }

  function isInteractiveOrInputNode(el) {
    if (!(el instanceof HTMLElement)) return true;
    if (el.isContentEditable) return true;
    if (el.closest("[contenteditable='true']")) return true;
    if (el.matches("input, textarea, button, nav, header, footer, aside")) return true;
    if (el.closest("input, textarea, button, nav, header, footer, aside")) return true;
    const aria = (el.getAttribute("aria-label") || "").toLowerCase();
    if (aria.includes("message") || aria.includes("prompt") || aria.includes("input")) return true;
    const cls = String(el.className || "").toLowerCase();
    const testId = String(el.getAttribute("data-testid") || "").toLowerCase();
    if (/\b(user|human|composer|prompt)\b/.test(cls) || /\b(user|human|composer|prompt)\b/.test(testId)) return true;
    return false;
  }

  async function getSettings() {
    if (settingsCache) return settingsCache;
    const response = await chrome.runtime.sendMessage({ type: "cot-research:get-settings" });
    settingsCache = response?.settings || {};
    return settingsCache;
  }

  async function refreshCitationIndex() {
    const settings = await getSettings();
    const base = settings.githubPagesBaseUrl?.replace(/\/$/, "");
    if (!base) return;

    const manifestResp = await chrome.runtime.sendMessage({
      type: "cot-research:fetch-json",
      url: `${base}/index/manifest.json`
    });
    if (manifestResp?.ok && Array.isArray(manifestResp.data?.citations) && manifestResp.data.citations.length > 0) {
      citationIndex = manifestResp.data.citations;
      citationSourceStatus = "manifest";
      console.info("[cot-research] citation source: manifest", citationIndex.length);
      return;
    }

    const indexResp = await chrome.runtime.sendMessage({
      type: "cot-research:fetch-json",
      url: `${base}/index/systemCardIndex.json`
    });
    if (indexResp?.ok && Array.isArray(indexResp.data?.citations) && indexResp.data.citations.length > 0) {
      citationIndex = indexResp.data.citations;
      citationSourceStatus = "systemCardIndex";
      console.info("[cot-research] citation source: systemCardIndex", citationIndex.length);
      return;
    }

    citationIndex = LOCAL_CITATION_FALLBACKS;
    citationSourceStatus = "localFallback";
    console.warn("[cot-research] citation source: localFallback", citationIndex.length);
  }

  function lookupCitation(signal) {
    if (!signal) return null;
    const key = signal.ruleId || signal.rubricId || signal.llmId;
    return (
      citationIndex.find((c) => c.behaviorTags?.includes(key)) ||
      LOCAL_CITATION_FALLBACKS.find((c) => c.behaviorTags?.includes(key)) ||
      {
        citationId: `generic-${signal.type || "unknown"}`,
        sourceUrl: "https://www.anthropic.com/research",
        sourceAnchor: "#model-system-cards"
      }
    );
  }

  async function analyzeNode(node) {
    const text = node.textContent || "";
    if (!likelyCoTText(text)) return;
    if (text.length > 12000) return;

    const hash = hashText(text);
    if (processedHashes.has(hash)) return;
    processedHashes.add(hash);

    const settings = await getSettings();
    const classification = await globalScope.CotHybridClassifier.classifySpan(text, { settings });
    if (!classification?.signals?.length) return;
    globalScope.CotAnnotator.annotateBlock(node, classification, lookupCitation);
  }

  function candidateNodes() {
    const list = [];
    const seen = new Set();
    for (const selector of SELECTOR_CANDIDATES) {
      document.querySelectorAll(selector).forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        if (isInteractiveOrInputNode(el)) return;
        const text = (el.textContent || "").trim();
        if (!text || text.length < 90) return;
        if (text.length > 12000) return;
        // Prefer assistant response-like blocks over broad layout containers.
        const assistantHint = /assistant|claude|response|reason|analysis|thought/i.test(
          `${el.className || ""} ${(el.getAttribute("data-testid") || "")}`
        );
        if (
          !assistantHint &&
          (selector === "main div" || selector === "p" || selector === "li" || selector === "div[dir='auto']") &&
          text.length < 260
        )
          return;
        if (seen.has(el)) return;
        seen.add(el);
        list.push({ el, selector, score: scoreNode(el, selector, text) });
      });
    }
    list.sort((a, b) => b.score - a.score);
    return list.slice(0, 60).map((x) => x.el);
  }

  function scheduleScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      const nodes = candidateNodes();
      nodes.forEach((node) => analyzeNode(node));
    }, 150);
  }

  function observeDom() {
    const observer = new MutationObserver(() => {
      scheduleScan();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(() => scheduleScan(), 2500);
    window.addEventListener("popstate", scheduleScan);
    window.addEventListener("hashchange", scheduleScan);
  }

  async function boot() {
    await refreshCitationIndex();
    const nodes = candidateNodes();
    console.info("[cot-research] candidate nodes:", nodes.length);
    await Promise.all(nodes.map((node) => analyzeNode(node)));
    globalScope.__cotResearchDebug = {
      getCitationSourceStatus: () => citationSourceStatus,
      getCitationCount: () => citationIndex.length,
      getCandidateNodeCount: () => candidateNodes().length
    };
    observeDom();
  }

  boot().catch((err) => {
    console.warn("CoT observer boot failed:", err);
  });
})(window);
