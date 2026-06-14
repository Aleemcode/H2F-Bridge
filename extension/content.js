(function bootstrapHtmlToFigma() {
  const CONTENT_SCRIPT_VERSION = "0.3.0";
  const runtimeState = window.__htmlToFigmaRuntimeState || {};

  if (runtimeState.messageListener) {
    chrome.runtime.onMessage.removeListener(runtimeState.messageListener);
  }

  if (typeof runtimeState.selectionCleanup === "function") {
    runtimeState.selectionCleanup();
  }

  window.__htmlToFigmaLoaded = true;
  window.__htmlToFigmaLoadedVersion = CONTENT_SCRIPT_VERSION;
  window.__htmlToFigmaRuntimeState = runtimeState;

  const APP_VERSION = "0.3.0";
  const MESSAGE_CAPTURE_PAGE = "html-to-figma/capture-page";
  const MESSAGE_START_SELECTION = "html-to-figma/start-selection";
  const MESSAGE_CAPTURE_READY = "html-to-figma/capture-ready";
  const MESSAGE_CONTENT_PING = "html-to-figma/content-ping";
  const MESSAGE_FETCH_IMAGE = "html-to-figma/fetch-image";

  let selectionCleanup = null;
  let toastTimeoutId = null;
  let idCounter = 0;

  const messageListener = (message, _sender, sendResponse) => {
    if (!message?.type) {
      return false;
    }

    if (message.type === MESSAGE_CONTENT_PING) {
      sendResponse({ ok: true, version: CONTENT_SCRIPT_VERSION });
      return false;
    }

    if (message.type === MESSAGE_CAPTURE_PAGE) {
      captureCurrentPage()
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message.type === MESSAGE_START_SELECTION) {
      startSelectionMode();
      sendResponse({ ok: true });
      return false;
    }

    return false;
  };

  runtimeState.messageListener = messageListener;
  runtimeState.version = CONTENT_SCRIPT_VERSION;
  chrome.runtime.onMessage.addListener(messageListener);

  async function captureCurrentPage() {
    const frame = getDocumentFrame();
    const capture = await createCapturePackage({
      mode: "page",
      frame,
      rootElement: document.body
    });

    const upload = await notifyBackground(capture);
    showToast(
      upload?.record?.backend?.status === "ready"
        ? `Captured page and uploaded ${capture.nodes.length} nodes for Figma import.`
        : uploadFailureMessage("Captured page", upload)
    );

    return {
      captureId: capture.capture.id,
      nodeCount: capture.nodes.length,
      backendStatus: upload?.record?.backend?.status || "error"
    };
  }

  function startSelectionMode() {
    if (selectionCleanup) {
      return;
    }

    const overlay = ensureOverlay();
    const highlight = overlay.querySelector("#html-to-design-highlight");
    const tooltip = overlay.querySelector("#html-to-design-tooltip");
    let hoveredElement = null;

    const updateHover = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || overlay.contains(target)) {
        return;
      }

      hoveredElement = target;
      const rect = target.getBoundingClientRect();
      positionHighlight(highlight, tooltip, rect, describeElement(target));
    };

    const commitSelection = async (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || overlay.contains(target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      teardownSelectionMode();

      try {
        const frame = rectToAbsolute(target.getBoundingClientRect());
        const capture = await createCapturePackage({
          mode: "selection",
          frame,
          rootElement: target
        });
        const upload = await notifyBackground(capture);
        showToast(
          upload?.record?.backend?.status === "ready"
            ? `Selection uploaded for Figma import. Reopen the extension to continue.`
            : uploadFailureMessage("Selection captured", upload)
        );
      } catch (error) {
        showToast(`Capture failed: ${error.message}`);
      }
    };

    const cancelSelection = (event) => {
      if (event.key !== "Escape") {
        return;
      }
      teardownSelectionMode();
      showToast("Selection cancelled.");
    };

    function teardownSelectionMode() {
      window.removeEventListener("mousemove", updateHover, true);
      window.removeEventListener("click", commitSelection, true);
      window.removeEventListener("keydown", cancelSelection, true);
      overlay.remove();
      selectionCleanup = null;
      runtimeState.selectionCleanup = null;
    }

    window.addEventListener("mousemove", updateHover, true);
    window.addEventListener("click", commitSelection, true);
    window.addEventListener("keydown", cancelSelection, true);
    selectionCleanup = teardownSelectionMode;
    runtimeState.selectionCleanup = teardownSelectionMode;

    showToast("Selection mode is active. Click any element to capture it for Figma.");

    if (hoveredElement) {
      const rect = hoveredElement.getBoundingClientRect();
      positionHighlight(highlight, tooltip, rect, describeElement(hoveredElement));
    }
  }

  async function createCapturePackage({ mode, frame, rootElement }) {
    idCounter = 0;
    const assetMap = new Map();
    const fontSet = new Set();
    const state = {
      nodes: [],
      assets: [],
      imageTasks: []
    };

    const rootNode = {
      id: "capture-root",
      parentId: null,
      childIndex: 0,
      domDepth: 0,
      kind: "frame",
      tagName: "ROOT",
      name: document.title || "Capture Root",
      visible: true,
      layout: {
        x: 0,
        y: 0,
        width: round(frame.width),
        height: round(frame.height),
        display: "block",
        position: "relative",
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        gap: 0,
        rowGap: 0,
        columnGap: 0,
        flexDirection: "column",
        justifyContent: "flex-start",
        alignItems: "stretch",
        alignContent: "stretch",
        flexWrap: "nowrap",
        zIndex: 0
      },
      style: {
        backgroundColor: resolveCanvasBackground(rootElement),
        borderColor: "rgba(0, 0, 0, 0)",
        borderWidth: 0,
        borderStyle: "solid",
        borderRadiusTopLeft: 0,
        borderRadiusTopRight: 0,
        borderRadiusBottomRight: 0,
        borderRadiusBottomLeft: 0,
        boxShadow: "none",
        opacity: 1,
        overflow: "visible"
      }
    };

    state.nodes.push(rootNode);
    registerFont(fontSet, state.assets, assetMap, "Inter");

    captureElementTree(rootElement, "capture-root", 1, frame, state, assetMap, fontSet, 0, true);

    // Phase 1: bake image pixels into the capture so they can never crash later.
    await embedImageAssets(state);

    const captureId = `capture-${Date.now()}`;
    const capturePackage = {
      appVersion: APP_VERSION,
      capture: {
        id: captureId,
        sourceUrl: location.href,
        title: document.title || "Untitled page",
        capturedAt: new Date().toISOString(),
        mode,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          devicePixelRatio: window.devicePixelRatio || 1
        },
        frame: {
          x: 0,
          y: 0,
          width: round(frame.width),
          height: round(frame.height)
        },
        rootNodeId: "capture-root",
        selectionBounds: mode === "selection" ? { ...frame } : null
      },
      nodes: state.nodes,
      assets: state.assets,
      debug: {}
    };

    capturePackage.debug.svg = buildDebugSvg(capturePackage);
    return capturePackage;
  }

  function captureElementTree(
    element,
    parentId,
    depth,
    frame,
    state,
    assetMap,
    fontSet,
    childIndex,
    forceInclude
  ) {
    if (!(element instanceof Element)) {
      return;
    }

    if (shouldIgnoreElement(element)) {
      return;
    }

    const style = window.getComputedStyle(element);
    if (!isVisibleElement(element, style)) {
      return;
    }

    const rect = rectToRelative(element.getBoundingClientRect(), frame);
    if (!intersectsFrame(rect, frame)) {
      return;
    }

    const node = createElementNode(
      element,
      parentId,
      depth,
      childIndex,
      rect,
      style,
      state,
      assetMap,
      fontSet,
      frame,
      forceInclude
    );

    const effectiveParentId = node ? node.id : parentId;
    let nextChildIndex = 0;

    for (const childNode of element.childNodes) {
      if (childNode.nodeType === Node.TEXT_NODE) {
        const textNode = createTextNode(
          childNode,
          effectiveParentId,
          depth + (node ? 1 : 0),
          nextChildIndex,
          frame,
          fontSet,
          state,
          assetMap
        );

        if (textNode) {
          state.nodes.push(textNode);
          nextChildIndex += 1;
        }
        continue;
      }

      if (childNode.nodeType === Node.ELEMENT_NODE) {
        captureElementTree(
          childNode,
          effectiveParentId,
          depth + (node ? 1 : 0),
          frame,
          state,
          assetMap,
          fontSet,
          nextChildIndex,
          false
        );
        nextChildIndex += 1;
      }
    }
  }

  function createElementNode(
    element,
    parentId,
    depth,
    childIndex,
    rect,
    style,
    state,
    assetMap,
    fontSet,
    frame,
    forceInclude
  ) {
    const tagName = element.tagName.toLowerCase();
    const keepNode = forceInclude || shouldKeepElementNode(element, style);
    if (!keepNode) {
      return null;
    }

    const kind = determineElementKind(element);
    const node = {
      id: nextId(kind),
      parentId,
      childIndex,
      domDepth: depth,
      kind,
      tagName,
      name: describeNodeName(element),
      semanticRole: inferSemanticRole(element, style),
      source: describeElementSource(element),
      visible: true,
      layout: extractLayout(rect, style),
      style: extractStyle(style),
      rawStyle: extractRawStyle(style)
    };

    if (kind === "image") {
      const imageUrl = extractImageSource(element);
      node.imageUrl = imageUrl;
      node.assetId = registerAsset(assetMap, state.assets, {
        kind: "image",
        url: imageUrl,
        mimeType: guessMimeType(imageUrl)
      });
      // Phase 1: remember the live <img> so we can bake its pixels in later.
      state.imageTasks.push({ node, element, assetId: node.assetId, url: imageUrl });
    }

    if (kind === "media") {
      const snapshot = captureMediaSnapshot(element);
      if (snapshot) {
        node.kind = "image";
        node.imageUrl = snapshot;
        node.assetId = registerAsset(assetMap, state.assets, {
          kind: "image",
          url: snapshot,
          mimeType: "image/png",
          sourceKind: tagName
        });
      }
    }

    if (kind === "vector") {
      const svgMarkup = serializeSvgElement(element, style, rect);
      node.svgMarkup = svgMarkup;
      node.assetId = registerAsset(assetMap, state.assets, {
        kind: "svg",
        content: svgMarkup,
        mimeType: "image/svg+xml"
      });
    }

    registerFont(fontSet, state.assets, assetMap, style.fontFamily);
    state.nodes.push(node);
    capturePseudoElement(element, node.id, depth + 1, 0, frame, state, assetMap, fontSet, "::before");
    capturePseudoElement(element, node.id, depth + 1, 9999, frame, state, assetMap, fontSet, "::after");
    return node;
  }

  function capturePseudoElement(element, parentId, depth, childIndex, frame, state, assetMap, fontSet, pseudo) {
    const style = window.getComputedStyle(element, pseudo);
    const content = normalizePseudoContent(style.content);
    const hasVisual =
      content ||
      hasMeaningfulColor(style.backgroundColor) ||
      hasBorder(style) ||
      style.boxShadow !== "none";

    if (!hasVisual || style.display === "none" || style.visibility === "hidden") {
      return;
    }

    const parentRect = rectToRelative(element.getBoundingClientRect(), frame);
    const width = safeNumber(style.width, parentRect.width);
    const height = safeNumber(style.height, content ? safeNumber(style.lineHeight, safeNumber(style.fontSize, 16) * 1.2) : parentRect.height);
    const offsetX = style.position === "absolute" ? safeNumber(style.left, 0) : 0;
    const offsetY = style.position === "absolute" ? safeNumber(style.top, 0) : 0;
    const rect = {
      x: round(parentRect.x + offsetX),
      y: round(parentRect.y + offsetY),
      width: round(width),
      height: round(height)
    };

    registerFont(fontSet, state.assets, assetMap, style.fontFamily);

    state.nodes.push({
      id: nextId(content ? "pseudo-text" : "pseudo-frame"),
      parentId,
      childIndex,
      domDepth: depth,
      kind: content ? "text" : "frame",
      tagName: pseudo,
      name: pseudo,
      textContent: content || "",
      visible: true,
      layout: extractLayout(rect, style),
      style: extractStyle(style),
      rawStyle: extractRawStyle(style),
      semanticRole: content ? "pseudo-text" : "pseudo-visual",
      source: {
        kind: "pseudo-element",
        pseudo
      }
    });
  }

  function createTextNode(textNode, parentId, depth, childIndex, frame, fontSet, state, assetMap) {
    if (!textNode.parentElement) {
      return null;
    }

    const value = collapseWhitespace(textNode.textContent || "");
    if (!value) {
      return null;
    }

    const style = window.getComputedStyle(textNode.parentElement);
    if (style.visibility === "hidden" || style.display === "none") {
      return null;
    }

    const range = document.createRange();
    range.selectNodeContents(textNode);
    const rangeRect = range.getBoundingClientRect();
    const rect = rectToRelative(rangeRect, frame);
    if (rect.width < 1 || rect.height < 1) {
      return null;
    }

    registerFont(fontSet, state.assets, assetMap, style.fontFamily);
    const isIcon = isIconTextNode(textNode.parentElement, style, value);
    // Apply the CSS text-transform so captured text matches what's rendered
    // (e.g. "Library" → "LIBRARY" when text-transform: uppercase is set).
    const displayValue = applyTextTransform(value, style.textTransform);

    return {
      id: nextId("text"),
      parentId,
      childIndex,
      domDepth: depth,
      kind: "text",
      tagName: "#text",
      name: displayValue.slice(0, 48),
      textContent: displayValue,
      role: isIcon ? "icon" : "text",
      semanticRole: isIcon ? "icon" : "text",
      visible: true,
      layout: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        display: "inline",
        position: "static",
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        gap: 0,
        rowGap: 0,
        columnGap: 0,
        flexDirection: "row",
        justifyContent: "flex-start",
        alignItems: "stretch",
        alignContent: "stretch",
        flexWrap: "nowrap",
        zIndex: 0
      },
      style: {
        backgroundColor: "transparent",
        borderColor: "rgba(0, 0, 0, 0)",
        borderWidth: 0,
        borderStyle: "solid",
        borderRadiusTopLeft: 0,
        borderRadiusTopRight: 0,
        borderRadiusBottomRight: 0,
        borderRadiusBottomLeft: 0,
        boxShadow: "none",
        opacity: safeNumber(style.opacity, 1),
        overflow: "visible",
        color: style.color,
        fontFamily: style.fontFamily,
        fontFamilies: parseFontFamilies(style.fontFamily),
        fontSize: safeNumber(style.fontSize, 16),
        fontWeight: style.fontWeight,
        lineHeight: resolveLineHeight(style),
        letterSpacing: style.letterSpacing === "normal" ? 0 : safeNumber(style.letterSpacing, 0),
        textAlign: style.textAlign,
        textTransform: style.textTransform
      },
      rawStyle: extractRawStyle(style),
      source: {
        kind: "text-node",
        parentTagName: textNode.parentElement.tagName.toLowerCase(),
        parentSemanticRole: inferSemanticRole(textNode.parentElement, style)
      }
    };
  }

  function determineElementKind(element) {
    if (element.tagName === "IMG") {
      return "image";
    }

    if (element.tagName === "CANVAS" || element.tagName === "VIDEO") {
      return "media";
    }

    if (element.tagName.toLowerCase() === "svg") {
      return "vector";
    }

    return "frame";
  }

  function shouldKeepElementNode(element, style) {
    const tag = element.tagName.toLowerCase();
    const elementChildren = Array.from(element.children);
    const visibleText = collapseWhitespace(element.textContent || "");
    const hasVisualStyle =
      hasMeaningfulColor(style.backgroundColor) ||
      hasBorder(style) ||
      style.boxShadow !== "none";
    const isLayoutContainer = style.display === "flex" || style.display === "grid";
    const isControl = /^(button|input|textarea|select|label|a)$/.test(tag);
    const isSemanticContainer = /^(section|article|nav|header|footer|main|aside|form|ul|ol|li)$/.test(tag);
    const hasSizedChildren = elementChildren.length > 0;

    return (
      hasVisualStyle ||
      isLayoutContainer ||
      isControl ||
      isSemanticContainer ||
      hasSizedChildren ||
      (tag === "img" || tag === "svg" || tag === "canvas" || tag === "video") ||
      Boolean(visibleText && tag !== "span")
    );
  }

  function shouldIgnoreElement(element) {
    return ["script", "style", "noscript", "meta", "link", "iframe"].includes(element.tagName.toLowerCase());
  }

  function extractLayout(rect, style) {
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      display: style.display,
      position: style.position,
      paddingTop: safeNumber(style.paddingTop, 0),
      paddingRight: safeNumber(style.paddingRight, 0),
      paddingBottom: safeNumber(style.paddingBottom, 0),
      paddingLeft: safeNumber(style.paddingLeft, 0),
      gap: safeNumber(style.gap, 0),
      rowGap: safeNumber(style.rowGap, 0),
      columnGap: safeNumber(style.columnGap, 0),
      flexDirection: style.flexDirection,
      justifyContent: style.justifyContent,
      alignItems: style.alignItems,
      alignContent: style.alignContent,
      flexWrap: style.flexWrap,
      zIndex: safeNumber(style.zIndex, 0),
      gridTemplateColumns: style.gridTemplateColumns,
      gridTemplateRows: style.gridTemplateRows,
      gridAutoFlow: style.gridAutoFlow,
      gridAutoColumns: style.gridAutoColumns,
      gridAutoRows: style.gridAutoRows,
      gridColumnStart: style.gridColumnStart,
      gridColumnEnd: style.gridColumnEnd,
      gridRowStart: style.gridRowStart,
      gridRowEnd: style.gridRowEnd
    };
  }

  function extractStyle(style) {
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderTopColor,
      borderWidth: safeNumber(style.borderTopWidth, 0),
      borderStyle: style.borderTopStyle,
      borderTopColor: style.borderTopColor,
      borderRightColor: style.borderRightColor,
      borderBottomColor: style.borderBottomColor,
      borderLeftColor: style.borderLeftColor,
      borderTopWidth: safeNumber(style.borderTopWidth, 0),
      borderRightWidth: safeNumber(style.borderRightWidth, 0),
      borderBottomWidth: safeNumber(style.borderBottomWidth, 0),
      borderLeftWidth: safeNumber(style.borderLeftWidth, 0),
      borderTopStyle: style.borderTopStyle,
      borderRightStyle: style.borderRightStyle,
      borderBottomStyle: style.borderBottomStyle,
      borderLeftStyle: style.borderLeftStyle,
      borderRadiusTopLeft: safeNumber(style.borderTopLeftRadius, 0),
      borderRadiusTopRight: safeNumber(style.borderTopRightRadius, 0),
      borderRadiusBottomRight: safeNumber(style.borderBottomRightRadius, 0),
      borderRadiusBottomLeft: safeNumber(style.borderBottomLeftRadius, 0),
      boxShadow: style.boxShadow,
      webkitBoxShadow: getCssProperty(style, "-webkit-box-shadow") || style.webkitBoxShadow || "",
      opacity: safeNumber(style.opacity, 1),
      overflow: style.overflow,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      color: style.color,
      fontFamily: style.fontFamily,
      fontFamilies: parseFontFamilies(style.fontFamily),
      fontStyle: style.fontStyle,
      fontSize: safeNumber(style.fontSize, 16),
      fontWeight: style.fontWeight,
      lineHeight: resolveLineHeight(style),
      letterSpacing: style.letterSpacing === "normal" ? 0 : safeNumber(style.letterSpacing, 0),
      textAlign: style.textAlign,
      textTransform: style.textTransform,
      textDecoration: style.textDecorationLine,
      transform: style.transform,
      transformOrigin: style.transformOrigin,
      filter: style.filter,
      backdropFilter: style.backdropFilter,
      webkitBackdropFilter: getCssProperty(style, "-webkit-backdrop-filter") || style.webkitBackdropFilter || "",
      outlineColor: style.outlineColor,
      outlineWidth: safeNumber(style.outlineWidth, 0),
      outlineStyle: style.outlineStyle,
      cursor: style.cursor,
      appearance: style.appearance || getCssProperty(style, "appearance"),
      webkitAppearance: getCssProperty(style, "-webkit-appearance") || style.webkitAppearance || "",
      mixBlendMode: style.mixBlendMode,
      backgroundBlendMode: style.backgroundBlendMode
    };
  }

  function extractRawStyle(style) {
    const properties = [
      "display",
      "position",
      "box-shadow",
      "-webkit-box-shadow",
      "filter",
      "backdrop-filter",
      "-webkit-backdrop-filter",
      "background",
      "background-color",
      "background-image",
      "border",
      "border-top",
      "border-right",
      "border-bottom",
      "border-left",
      "border-radius",
      "outline",
      "outline-color",
      "outline-width",
      "outline-style",
      "color",
      "font",
      "font-family",
      "font-size",
      "font-weight",
      "line-height",
      "letter-spacing",
      "text-align",
      "text-decoration",
      "transform",
      "transform-origin",
      "opacity",
      "cursor",
      "appearance",
      "-webkit-appearance",
      "clip-path",
      "mask",
      "-webkit-mask",
      "mix-blend-mode",
      "background-blend-mode"
    ];
    const raw = {};

    for (const property of properties) {
      const value = getCssProperty(style, property);
      if (value) {
        raw[toCamelCase(property)] = value;
      }
    }

    return raw;
  }

  function buildDebugSvg(capturePackage) {
    const frame = capturePackage.capture.frame;
    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${round(frame.width)}" height="${round(frame.height)}" viewBox="0 0 ${round(frame.width)} ${round(frame.height)}">`
    ];

    for (const node of capturePackage.nodes) {
      if (node.id === "capture-root") {
        parts.push(
          `<rect x="0" y="0" width="${round(frame.width)}" height="${round(frame.height)}" fill="${escapeAttribute(node.style.backgroundColor || "#ffffff")}" />`
        );
        continue;
      }

      if (node.kind === "frame" && hasMeaningfulColor(node.style.backgroundColor)) {
        parts.push(
          `<rect x="${round(node.layout.x)}" y="${round(node.layout.y)}" width="${round(node.layout.width)}" height="${round(node.layout.height)}" rx="${round(node.style.borderRadiusTopLeft)}" fill="${escapeAttribute(node.style.backgroundColor)}" opacity="${round(node.style.opacity, 3)}" />`
        );
      }

      if (node.kind === "text") {
        parts.push(
          `<text x="${round(node.layout.x)}" y="${round(node.layout.y)}" fill="${escapeAttribute(node.style.color)}" font-family="${escapeAttribute(node.style.fontFamily)}" font-size="${round(node.style.fontSize)}" opacity="${round(node.style.opacity, 3)}" dominant-baseline="hanging">${escapeText(node.textContent)}</text>`
        );
      }

      if (node.kind === "image" && node.imageUrl) {
        parts.push(
          `<image href="${escapeAttribute(node.imageUrl)}" x="${round(node.layout.x)}" y="${round(node.layout.y)}" width="${round(node.layout.width)}" height="${round(node.layout.height)}" preserveAspectRatio="none" />`
        );
      }
    }

    parts.push("</svg>");
    return parts.join("");
  }

  async function notifyBackground(capture) {
    return chrome.runtime.sendMessage({
      type: MESSAGE_CAPTURE_READY,
      capture
    });
  }

  function uploadFailureMessage(prefix, upload) {
    const detail = upload?.record?.backend?.error || upload?.error || "";
    if (!detail) {
      return `${prefix}, but backend upload failed.`;
    }
    return `${prefix}, but backend upload failed: ${detail}`;
  }

  function ensureOverlay() {
    const existing = document.getElementById("html-to-design-overlay");
    if (existing) {
      return existing;
    }

    const overlay = document.createElement("div");
    overlay.id = "html-to-design-overlay";

    const highlight = document.createElement("div");
    highlight.id = "html-to-design-highlight";

    const tooltip = document.createElement("div");
    tooltip.id = "html-to-design-tooltip";

    overlay.append(highlight, tooltip);
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function positionHighlight(highlight, tooltip, rect, label) {
    highlight.style.opacity = "1";
    highlight.style.transform = `translate(${Math.round(rect.left)}px, ${Math.round(rect.top)}px)`;
    highlight.style.width = `${Math.max(0, Math.round(rect.width))}px`;
    highlight.style.height = `${Math.max(0, Math.round(rect.height))}px`;

    tooltip.textContent = label;
    tooltip.style.opacity = "1";
    const tooltipLeft = Math.min(window.innerWidth - 340, Math.max(16, rect.left + 8));
    const tooltipTop = rect.top > 72 ? rect.top - 56 : rect.bottom + 12;
    tooltip.style.transform = `translate(${Math.round(tooltipLeft)}px, ${Math.round(tooltipTop)}px)`;
  }

  function getDocumentFrame() {
    const doc = document.documentElement;
    const body = document.body;
    const width = Math.max(doc.scrollWidth, doc.clientWidth, body ? body.scrollWidth : 0, body ? body.clientWidth : 0);
    const height = Math.max(doc.scrollHeight, doc.clientHeight, body ? body.scrollHeight : 0, body ? body.clientHeight : 0);

    return {
      left: 0,
      top: 0,
      width,
      height
    };
  }

  function isVisibleElement(element, style) {
    if (!element.isConnected) {
      return false;
    }
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    if (safeNumber(style.opacity, 1) === 0) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0.5 && rect.height > 0.5;
  }

  function rectToAbsolute(rect) {
    return {
      left: rect.left + window.scrollX,
      top: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height
    };
  }

  function rectToRelative(rect, frame) {
    const absolute = rectToAbsolute(rect);
    return {
      x: round(absolute.left - frame.left),
      y: round(absolute.top - frame.top),
      width: round(absolute.width),
      height: round(absolute.height)
    };
  }

  function intersectsFrame(rect, frame) {
    return rect.x + rect.width >= 0 && rect.y + rect.height >= 0 && rect.x <= frame.width && rect.y <= frame.height;
  }

  function resolveCanvasBackground(rootElement) {
    const colors = [
      window.getComputedStyle(document.body).backgroundColor,
      window.getComputedStyle(document.documentElement).backgroundColor,
      window.getComputedStyle(rootElement).backgroundColor
    ];

    return colors.find((color) => hasMeaningfulColor(color)) || "#ffffff";
  }

  function registerAsset(assetMap, assets, asset) {
    const key = `${asset.kind}:${asset.url || asset.content || ""}`;
    if (assetMap.has(key)) {
      return assetMap.get(key);
    }

    const assetId = `asset-${assets.length + 1}`;
    assetMap.set(key, assetId);
    assets.push({
      id: assetId,
      ...asset
    });
    return assetId;
  }

  function registerFont(fontSet, assets, assetMap, fontFamily) {
    for (const family of parseFontFamilies(fontFamily || "Inter")) {
      if (!family || fontSet.has(family)) {
        continue;
      }

      fontSet.add(family);
      registerAsset(assetMap, assets, {
        kind: "font",
        family
      });
    }
  }

  function isIconTextNode(element, style, value) {
    const fontFamily = String(style.fontFamily || "").toLowerCase();
    const className = String(element.className || "").toLowerCase();
    const ariaHidden = element.getAttribute("aria-hidden") === "true";
    const dataIcon = element.hasAttribute("data-icon") || element.hasAttribute("icon");
    const compactGlyph = value.length <= 3 && safeNumber(style.fontSize, 16) >= 12;

    return (
      fontFamily.includes("material icons") ||
      fontFamily.includes("fontawesome") ||
      fontFamily.includes("font awesome") ||
      fontFamily.includes("icomoon") ||
      fontFamily.includes("iconfont") ||
      className.includes("icon") ||
      className.includes("fa-") ||
      dataIcon ||
      (ariaHidden && compactGlyph)
    );
  }

  function parseFontFamilies(value) {
    return String(value || "")
      .split(",")
      .map((font) => font.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }

  function serializeSvgElement(element, style, rect) {
    const clone = element.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    if (!clone.getAttribute("width")) {
      clone.setAttribute("width", String(Math.max(round(rect.width), 1)));
    }
    if (!clone.getAttribute("height")) {
      clone.setAttribute("height", String(Math.max(round(rect.height), 1)));
    }
    if (!clone.getAttribute("viewBox")) {
      clone.setAttribute("viewBox", `0 0 ${Math.max(round(rect.width), 1)} ${Math.max(round(rect.height), 1)}`);
    }

    for (const useElement of clone.querySelectorAll("use")) {
      const reference = useElement.getAttribute("href") || useElement.getAttribute("xlink:href");
      if (!reference || !reference.startsWith("#")) {
        continue;
      }

      const source = document.querySelector(reference);
      if (!source) {
        continue;
      }

      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      for (const attribute of useElement.attributes) {
        if (attribute.name !== "href" && attribute.name !== "xlink:href") {
          group.setAttribute(attribute.name, attribute.value);
        }
      }

      for (const child of source.childNodes) {
        group.appendChild(child.cloneNode(true));
      }

      useElement.replaceWith(group);
      if (!clone.getAttribute("viewBox") && source.getAttribute("viewBox")) {
        clone.setAttribute("viewBox", source.getAttribute("viewBox"));
      }
    }

    const resolvedColor = normalizeCssColor(style.color || "rgb(255, 255, 255)");
    clone.setAttribute("color", resolvedColor);

    // Phase 2: bake the COMPUTED paint of every graphic element onto the clone.
    // getComputedStyle() already resolves currentColor, var(), and CSS-class
    // styling into concrete rgb() values — so this captures multi-color icons,
    // CSS-styled SVGs, and <style>-block rules cleanly without string hacks.
    inlineComputedSvgPaint(element, clone);

    preserveSvgStrokePresentation(element, clone);
    applySvgColorFallbacks(clone, resolvedColor);
    let markup = clone.outerHTML;
    // Final safety net for any paint we couldn't resolve via computed styles
    // (e.g. inside <use>/<symbol> expansions that have no live computed value).
    markup = markup.replace(/currentColor/g, resolvedColor);
    markup = markup.replace(/var\([^)]+\)/g, resolvedColor);
    return markup;
  }

  // Walk the live source SVG and its fresh clone in parallel (they are 1:1
  // before any mutation) and copy resolved paint/geometry onto the clone.
  function inlineComputedSvgPaint(sourceSvg, cloneSvg) {
    const sourceNodes = [sourceSvg, ...sourceSvg.querySelectorAll("*")];
    const cloneNodes = [cloneSvg, ...cloneSvg.querySelectorAll("*")];
    const limit = Math.min(sourceNodes.length, cloneNodes.length);
    const paintableTags = new Set([
      "path", "circle", "rect", "line", "polyline", "polygon",
      "ellipse", "g", "text", "tspan", "use", "svg"
    ]);

    for (let index = 0; index < limit; index += 1) {
      const sourceNode = sourceNodes[index];
      const cloneNode = cloneNodes[index];
      if (!(sourceNode instanceof Element) || !(cloneNode instanceof Element)) {
        continue;
      }

      const tag = sourceNode.tagName.toLowerCase();
      if (!paintableTags.has(tag)) {
        continue;
      }

      const computed = window.getComputedStyle(sourceNode);

      // Resolved fill — bake unless explicitly none. Computed value has already
      // turned currentColor / var() / class rules into a literal rgb().
      const fill = normalizeCssColor(computed.fill);
      if (fill && fill !== "none") {
        cloneNode.setAttribute("fill", fill);
        const fillOpacity = computed.fillOpacity;
        if (fillOpacity && fillOpacity !== "1") {
          cloneNode.setAttribute("fill-opacity", fillOpacity);
        }
      } else if (fill === "none") {
        cloneNode.setAttribute("fill", "none");
      }

      // Resolved stroke — only bake a real, drawable stroke.
      const stroke = normalizeCssColor(computed.stroke);
      const strokeWidth = computed.strokeWidth;
      if (stroke && stroke !== "none" && strokeWidth && strokeWidth !== "0px" && strokeWidth !== "0") {
        cloneNode.setAttribute("stroke", stroke);
        cloneNode.setAttribute("stroke-width", normalizeSvgLength(strokeWidth));
        if (computed.strokeLinecap && computed.strokeLinecap !== "butt") {
          cloneNode.setAttribute("stroke-linecap", computed.strokeLinecap);
        }
        if (computed.strokeLinejoin && computed.strokeLinejoin !== "miter") {
          cloneNode.setAttribute("stroke-linejoin", computed.strokeLinejoin);
        }
        if (computed.strokeDasharray && computed.strokeDasharray !== "none") {
          cloneNode.setAttribute("stroke-dasharray", computed.strokeDasharray);
        }
        if (computed.strokeOpacity && computed.strokeOpacity !== "1") {
          cloneNode.setAttribute("stroke-opacity", computed.strokeOpacity);
        }
      }

      // Element-level opacity and fill-rules.
      if (computed.opacity && computed.opacity !== "1") {
        cloneNode.setAttribute("opacity", computed.opacity);
      }
      if (computed.fillRule && computed.fillRule !== "nonzero") {
        cloneNode.setAttribute("fill-rule", computed.fillRule);
      }
      // Strip any inline style/class so the baked attributes win and no
      // unresolved var()/currentColor leaks through the class cascade.
      cloneNode.removeAttribute("style");
      cloneNode.removeAttribute("class");
    }
  }

  function applySvgColorFallbacks(svgElement, resolvedColor) {
    const resolvedFill = resolveSvgPaint(svgElement.getAttribute("fill"), resolvedColor);
    const resolvedStroke = resolveSvgPaint(svgElement.getAttribute("stroke"), resolvedColor);
    const graphicSelector = "path,circle,rect,line,polyline,polygon,ellipse,g";

    for (const node of svgElement.querySelectorAll(graphicSelector)) {
      const fill = node.getAttribute("fill");
      const stroke = node.getAttribute("stroke");

      if (isUnresolvedSvgPaint(fill)) {
        const hasDrawableStroke = stroke && stroke !== "none";
        const looksLikeStrokeIcon = stroke === "currentColor" || hasDrawableStroke || node.tagName.toLowerCase() !== "path";
        node.setAttribute("fill", looksLikeStrokeIcon ? "none" : resolvedFill);
      }

      if (isUnresolvedSvgPaint(stroke) || (stroke === null && node.getAttribute("fill") === "none")) {
        node.setAttribute("stroke", resolvedStroke);
      }

      const styleAttribute = node.getAttribute("style");
      if (styleAttribute) {
        node.setAttribute(
          "style",
          styleAttribute
            .replace(/currentColor/g, resolvedColor)
            .replace(/var\([^)]+\)/g, resolvedColor)
        );
      }
    }
  }

  function resolveSvgPaint(value, fallbackColor) {
    if (isUnresolvedSvgPaint(value)) {
      return fallbackColor;
    }

    const normalized = normalizeCssColor(value || "");
    if (!normalized || normalized === "none" || normalized === "transparent" || normalized === "rgb(0, 0, 0)" || normalized === "#000" || normalized === "#000000") {
      return fallbackColor;
    }
    return normalized;
  }

  function isUnresolvedSvgPaint(value) {
    const normalized = normalizeCssColor(value || "");
    return !normalized || normalized === "currentColor" || normalized.startsWith("var(");
  }

  function preserveSvgStrokePresentation(sourceSvg, cloneSvg) {
    const sourceGraphics = [sourceSvg, ...sourceSvg.querySelectorAll("*")];
    const cloneGraphics = [cloneSvg, ...cloneSvg.querySelectorAll("*")];
    const limit = Math.min(sourceGraphics.length, cloneGraphics.length);

    for (let index = 0; index < limit; index += 1) {
      const sourceNode = sourceGraphics[index];
      const cloneNode = cloneGraphics[index];
      if (!(sourceNode instanceof Element) || !(cloneNode instanceof Element)) {
        continue;
      }

      const style = window.getComputedStyle(sourceNode);
      const stroke = sourceNode.getAttribute("stroke") || style.stroke;
      const strokeWidth = sourceNode.getAttribute("stroke-width") || style.strokeWidth;
      const strokeLinecap = sourceNode.getAttribute("stroke-linecap") || style.strokeLinecap;
      const strokeLinejoin = sourceNode.getAttribute("stroke-linejoin") || style.strokeLinejoin;
      const fillRule = sourceNode.getAttribute("fill-rule") || style.fillRule;
      const clipRule = sourceNode.getAttribute("clip-rule") || style.clipRule;

      if (stroke && stroke !== "none") {
        cloneNode.setAttribute("stroke", stroke);
      }

      if (strokeWidth && strokeWidth !== "0px" && strokeWidth !== "0") {
        cloneNode.setAttribute("stroke-width", normalizeSvgLength(strokeWidth));
      }

      if (strokeLinecap && strokeLinecap !== "butt") {
        cloneNode.setAttribute("stroke-linecap", strokeLinecap);
      }

      if (strokeLinejoin && strokeLinejoin !== "miter") {
        cloneNode.setAttribute("stroke-linejoin", strokeLinejoin);
      }

      if (fillRule && fillRule !== "nonzero") {
        cloneNode.setAttribute("fill-rule", fillRule);
      }

      if (clipRule && clipRule !== "nonzero") {
        cloneNode.setAttribute("clip-rule", clipRule);
      }
    }
  }

  function normalizeSvgLength(value) {
    const numeric = safeNumber(value, null);
    return numeric === null ? String(value) : String(round(numeric, 3));
  }

  function normalizeCssColor(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function extractImageSource(element) {
    if (element.tagName === "IMG") {
      return element.currentSrc || element.src || "";
    }
    return "";
  }

  // Phase 1: convert every captured <img> into baked-in base64 pixels.
  // Strategy: rasterize the already-loaded element in-page first (exact rendered
  // resolution, no network). If the canvas is tainted by cross-origin pixels,
  // fall back to fetching the bytes through the extension background script,
  // which is not subject to page-origin CORS.
  async function embedImageAssets(state) {
    if (!Array.isArray(state.imageTasks) || state.imageTasks.length === 0) {
      return;
    }

    const resolvedByUrl = new Map();

    await Promise.all(
      state.imageTasks.map(async (task) => {
        try {
          let dataUrl = task.url && resolvedByUrl.get(task.url);

          if (!dataUrl) {
            dataUrl = rasterizeImageElement(task.element);
            if (!dataUrl && task.url) {
              dataUrl = await fetchImageAsDataUrl(task.url);
            }
            if (dataUrl && task.url) {
              resolvedByUrl.set(task.url, dataUrl);
            }
          }

          if (!dataUrl) {
            return;
          }

          task.node.imageUrl = dataUrl;
          const asset = state.assets.find((candidate) => candidate.id === task.assetId);
          if (asset) {
            asset.url = dataUrl;
            asset.mimeType = dataUrlMimeType(dataUrl) || asset.mimeType;
            asset.embedded = true;
          }
        } catch (error) {
          // Leave the original URL in place as a graceful fallback.
        }
      })
    );
  }

  // Draw an already-loaded image element to a canvas at its natural resolution.
  // Returns a data URL, or null if the element isn't ready or the canvas is
  // tainted (cross-origin without CORS headers).
  function rasterizeImageElement(element) {
    try {
      if (!element || element.tagName !== "IMG") {
        return null;
      }
      const naturalWidth = element.naturalWidth || element.width || 0;
      const naturalHeight = element.naturalHeight || element.height || 0;
      if (naturalWidth < 1 || naturalHeight < 1) {
        return null;
      }

      const canvas = document.createElement("canvas");
      canvas.width = naturalWidth;
      canvas.height = naturalHeight;
      const context = canvas.getContext("2d");
      context.drawImage(element, 0, 0, naturalWidth, naturalHeight);
      // Throws a SecurityError if the canvas was tainted — caught below.
      return canvas.toDataURL("image/png");
    } catch (error) {
      return null;
    }
  }

  // Ask the background service worker to fetch the image bytes (CORS-exempt with
  // host_permissions) and return them as a base64 data URL.
  function fetchImageAsDataUrl(url) {
    if (!url || url.startsWith("data:")) {
      return Promise.resolve(url || null);
    }

    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: MESSAGE_FETCH_IMAGE, url },
          (response) => {
            if (chrome.runtime.lastError || !response?.ok || !response.dataUrl) {
              resolve(null);
              return;
            }
            resolve(response.dataUrl);
          }
        );
      } catch (error) {
        resolve(null);
      }
    });
  }

  function dataUrlMimeType(dataUrl) {
    const match = String(dataUrl || "").match(/^data:([^;,]+)/);
    return match ? match[1] : null;
  }

  function captureMediaSnapshot(element) {
    try {
      if (element.tagName === "CANVAS") {
        return element.toDataURL("image/png");
      }

      if (element.tagName === "VIDEO" && element.readyState >= 2) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, element.videoWidth || element.clientWidth || 1);
        canvas.height = Math.max(1, element.videoHeight || element.clientHeight || 1);
        const context = canvas.getContext("2d");
        context.drawImage(element, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  function normalizePseudoContent(value) {
    if (!value || value === "none" || value === "normal") {
      return "";
    }

    return value
      .replace(/^['"]|['"]$/g, "")
      .replace(/\\A/g, "\n")
      .trim();
  }

  function describeElement(element) {
    const rect = element.getBoundingClientRect();
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : "";
    const classes = element.classList.length ? `.${Array.from(element.classList).slice(0, 2).join(".")}` : "";
    return `${tag}${id}${classes}  ${Math.round(rect.width)} x ${Math.round(rect.height)}`;
  }

  function describeNodeName(element) {
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : "";
    return `${tag}${id}`.slice(0, 64);
  }

  function describeElementSource(element) {
    return {
      kind: "element",
      id: element.id || "",
      className: typeof element.className === "string" ? element.className : "",
      role: element.getAttribute("role") || "",
      ariaLabel: element.getAttribute("aria-label") || "",
      type: element.getAttribute("type") || "",
      dataAttributes: extractDataAttributes(element)
    };
  }

  function inferSemanticRole(element, style) {
    const tag = element.tagName.toLowerCase();
    const role = String(element.getAttribute("role") || "").toLowerCase();
    const type = String(element.getAttribute("type") || "").toLowerCase();
    const className = String(element.className || "").toLowerCase();
    const ariaPressed = element.hasAttribute("aria-pressed");
    const ariaChecked = element.hasAttribute("aria-checked");
    const hasClickHandler = typeof element.onclick === "function";
    const pointerCursor = style.cursor === "pointer";

    if (tag === "button" || role === "button" || type === "button" || type === "submit" || type === "reset") {
      return "button";
    }

    if (
      role === "switch" ||
      role === "checkbox" ||
      type === "checkbox" ||
      ariaPressed ||
      ariaChecked ||
      className.includes("toggle") ||
      className.includes("switch")
    ) {
      return "toggle";
    }

    if (tag === "input" || tag === "textarea" || tag === "select" || role === "textbox" || role === "searchbox") {
      return "input";
    }

    if (tag === "a" || role === "link") {
      return "link";
    }

    if (tag === "nav") {
      return "navigation";
    }

    if (tag === "aside") {
      return "sidebar";
    }

    if (tag === "main") {
      return "main";
    }

    if (className.includes("card") || className.includes("panel") || className.includes("tile")) {
      return "card";
    }

    if (className.includes("badge") || className.includes("pill") || className.includes("tag")) {
      return "badge";
    }

    if ((hasClickHandler || pointerCursor) && element.childElementCount <= 3) {
      return "interactive";
    }

    return "container";
  }

  function extractDataAttributes(element) {
    const entries = {};
    for (const attribute of element.attributes) {
      if (attribute.name.startsWith("data-")) {
        entries[attribute.name] = attribute.value;
      }
    }
    return entries;
  }

  function getCssProperty(style, property) {
    try {
      return style.getPropertyValue(property) || "";
    } catch (error) {
      return "";
    }
  }

  function toCamelCase(property) {
    const camel = String(property).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    return camel ? camel.charAt(0).toLowerCase() + camel.slice(1) : camel;
  }

  function hasMeaningfulColor(value) {
    return Boolean(value && value !== "transparent" && value !== "rgba(0, 0, 0, 0)");
  }

  function hasBorder(style) {
    return safeNumber(style.borderTopWidth, 0) > 0 && hasMeaningfulColor(style.borderTopColor);
  }

  function resolveLineHeight(style) {
    if (style.lineHeight === "normal") {
      return safeNumber(style.fontSize, 16) * 1.2;
    }
    return safeNumber(style.lineHeight, safeNumber(style.fontSize, 16) * 1.2);
  }

  function collapseWhitespace(value) {
    return String(value).replace(/\s+/g, " ").trim();
  }

  // Mirror CSS text-transform so captured characters match the rendered output.
  function applyTextTransform(value, textTransform) {
    const transform = String(textTransform || "none").toLowerCase();
    if (transform === "uppercase") {
      return value.toUpperCase();
    }
    if (transform === "lowercase") {
      return value.toLowerCase();
    }
    if (transform === "capitalize") {
      return value.replace(/\b\p{L}/gu, (character) => character.toUpperCase());
    }
    return value;
  }

  function safeNumber(value, fallback) {
    const numeric = Number.parseFloat(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function guessMimeType(value) {
    const lower = String(value || "").toLowerCase();
    if (lower.endsWith(".png")) {
      return "image/png";
    }
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
      return "image/jpeg";
    }
    if (lower.endsWith(".webp")) {
      return "image/webp";
    }
    if (lower.startsWith("data:image/")) {
      return lower.slice(5, lower.indexOf(";"));
    }
    return "image/*";
  }

  function nextId(kind) {
    idCounter += 1;
    return `${kind}-${idCounter}`;
  }

  function showToast(message) {
    let toast = document.getElementById("html-to-design-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "html-to-design-toast";
      document.documentElement.appendChild(toast);
    }

    toast.textContent = message;
    toast.setAttribute("data-visible", "true");

    if (toastTimeoutId) {
      window.clearTimeout(toastTimeoutId);
    }

    toastTimeoutId = window.setTimeout(() => {
      toast.setAttribute("data-visible", "false");
    }, 3400);
  }

  function round(value, precision = 2) {
    const factor = 10 ** precision;
    return Math.round(Number(value) * factor) / factor;
  }

  function escapeText(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttribute(value) {
    return escapeText(String(value)).replace(/"/g, "&quot;");
  }
})();
