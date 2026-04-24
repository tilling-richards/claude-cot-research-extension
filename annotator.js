(function initAnnotator(globalScope) {
  const CLASS_EXPECTED = "cot-expected";
  const CLASS_INTERESTING = "cot-interesting";

  function injectStyles() {
    if (document.getElementById("cot-research-style")) return;
    const style = document.createElement("style");
    style.id = "cot-research-style";
    style.textContent = `
      .${CLASS_EXPECTED} {
        background: rgba(88, 166, 92, 0.28);
        border-bottom: 1px dashed rgba(88, 166, 92, 0.8);
        cursor: help;
      }
      .${CLASS_INTERESTING} {
        background: rgba(245, 158, 11, 0.30);
        border-bottom: 1px dashed rgba(245, 158, 11, 0.85);
        cursor: help;
      }
    `;
    document.head.appendChild(style);
  }

  function clearAnnotations(root) {
    const spans = root.querySelectorAll(`span.${CLASS_EXPECTED}, span.${CLASS_INTERESTING}`);
    spans.forEach((span) => {
      const textNode = document.createTextNode(span.textContent || "");
      span.replaceWith(textNode);
    });
  }

  function annotateNodeText(node, signal, citation) {
    const text = node.textContent || "";
    if (!text.trim()) return;

    const snippet = pickSnippet(text, signal);
    const idx = text.indexOf(snippet);
    if (idx < 0) return;

    const cls = signal.type === "expected" ? CLASS_EXPECTED : CLASS_INTERESTING;
    const wrapper = document.createElement("span");
    wrapper.className = cls;
    wrapper.textContent = snippet;
    wrapper.dataset.cotReason = signal.reason || "";
    wrapper.dataset.cotConfidence = String(signal.confidence || 0);
    wrapper.dataset.cotLabel =
      signal.type === "expected" ? "Expected (system-card aligned)" : "Potentially Interesting (review suggested)";
    wrapper.dataset.cotSourceUrl = citation?.sourceUrl || "";

    wrapper.addEventListener("mouseenter", (event) => {
      globalScope.CotHoverCard?.showHoverCard(
        {
          label: wrapper.dataset.cotLabel,
          reason: wrapper.dataset.cotReason,
          confidence: Number(wrapper.dataset.cotConfidence),
          sourceUrl: wrapper.dataset.cotSourceUrl
        },
        event.clientX,
        event.clientY
      );
    });
    wrapper.addEventListener("mouseleave", () => {
      globalScope.CotHoverCard?.hideHoverCard(120);
    });

    const frag = document.createDocumentFragment();
    const before = text.slice(0, idx);
    const after = text.slice(idx + snippet.length);
    if (before) frag.appendChild(document.createTextNode(before));
    frag.appendChild(wrapper);
    if (after) frag.appendChild(document.createTextNode(after));
    node.replaceWith(frag);
  }

  function pickSnippet(text, signal) {
    const normalized = text.replace(/\s+/g, " ").trim();
    const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
    const keywordBySignal = {
      "expected-non-experiential-claim": /(emotion|feeling|inner life|cannot|can't|do not have)/i,
      "interesting-token-repetition": /(\b\w+\b)(\s+\1){3,}/i,
      "interesting-overcertain-fiction-claim": /(certainly|definitely|fiction|not real|real world)/i,
      "rubric-short-boundary-phrase": /(cannot|can't|do not|don't|limitations?)/i,
      "rubric-high-certainty-long-span": /(always|never|definitely|certainly)/i
    };
    const key = signal.ruleId || signal.rubricId || signal.llmId || "";
    const matcher = keywordBySignal[key] || /(cannot|can't|because|therefore|analysis|uncertain|likely)/i;
    const matched = sentences.find((s) => matcher.test(s) && s.length >= 24);
    if (matched) return matched.slice(0, 260);
    const longest = sentences.sort((a, b) => b.length - a.length)[0] || normalized;
    return longest.slice(0, 260);
  }

  function annotateBlock(root, classification, citationLookup) {
    injectStyles();
    clearAnnotations(root);

    const signal = classification.strongestInteresting || classification.strongestExpected;
    if (!signal) return;

    const citation = citationLookup?.(signal) || null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let bestNode = null;
    let bestLen = 0;
    let current = walker.nextNode();
    while (current) {
      const len = (current.textContent || "").trim().length;
      if (len > bestLen) {
        bestLen = len;
        bestNode = current;
      }
      current = walker.nextNode();
    }
    if (bestNode && bestLen >= 20) annotateNodeText(bestNode, signal, citation);
  }

  globalScope.CotAnnotator = { annotateBlock };
})(window);
