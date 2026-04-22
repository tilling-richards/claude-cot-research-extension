(function initCotObserver(globalScope) {
  const SELECTOR_CANDIDATES = [
    "[data-testid*='thought']",
    "[class*='thought']",
    "[class*='cot']",
    "[class*='reason']",
    "[data-testid*='message']",
    "[class*='message']",
    "article",
    "main div"
  ];

  const processedHashes = new Set();
  let settingsCache = null;
  let citationIndex = [];

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

    const resp = await chrome.runtime.sendMessage({
      type: "cot-research:fetch-json",
      url: `${base}/index/manifest.json`
    });
    if (!resp?.ok) return;
    citationIndex = resp.data?.citations || [];
  }

  function lookupCitation(signal) {
    if (!signal) return null;
    const key = signal.ruleId || signal.rubricId || signal.llmId;
    return citationIndex.find((c) => c.behaviorTags?.includes(key)) || null;
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
        const text = (el.textContent || "").trim();
        if (!text || text.length < 80) return;
        if (seen.has(el)) return;
        seen.add(el);
        list.push(el);
      });
    }
    return list.slice(0, 150);
  }

  function observeDom() {
    const observer = new MutationObserver(() => {
      const nodes = candidateNodes();
      nodes.forEach((node) => analyzeNode(node));
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  async function boot() {
    await refreshCitationIndex();
    const nodes = candidateNodes();
    console.info("[cot-research] candidate nodes:", nodes.length);
    await Promise.all(nodes.map((node) => analyzeNode(node)));
    observeDom();
  }

  boot().catch((err) => {
    console.warn("CoT observer boot failed:", err);
  });
})(window);
