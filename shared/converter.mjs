import { APP_VERSION, clipText } from "./contracts.mjs";

export function buildDesignModel(capturePackage) {
  if (!capturePackage?.capture || !Array.isArray(capturePackage?.nodes)) {
    throw new Error("Invalid capture package.");
  }

  const nodesById = new Map(capturePackage.nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map();

  for (const node of capturePackage.nodes) {
    const bucket = childrenByParent.get(node.parentId) || [];
    bucket.push(node);
    childrenByParent.set(node.parentId, bucket);
  }

  for (const childList of childrenByParent.values()) {
    childList.sort((left, right) => (left.childIndex || 0) - (right.childIndex || 0));
  }

  const rootNode = nodesById.get(capturePackage.capture.rootNodeId) || capturePackage.nodes[0];
  if (!rootNode) {
    throw new Error("Capture package has no root node.");
  }

  return {
    version: APP_VERSION,
    generatedAt: new Date().toISOString(),
    capture: {
      ...capturePackage.capture,
      nodeCount: capturePackage.nodes.length,
      assetCount: capturePackage.assets?.length || 0
    },
    root: convertNode(rootNode, null, childrenByParent, capturePackage.assets || []),
    assets: capturePackage.assets || []
  };
}

function convertNode(node, parentNode, childrenByParent, assets) {
  const childNodes = (childrenByParent.get(node.id) || []).filter((child) => child.visible !== false);
  const relativePosition = parentNode
    ? {
        x: round(node.layout.x - parentNode.layout.x),
        y: round(node.layout.y - parentNode.layout.y)
      }
    : { x: round(node.layout.x), y: round(node.layout.y) };

  if (node.kind === "text") {
    const childSizing = inferChildSizing(node, parentNode);
    return {
      id: node.id,
      type: "text",
      name: layerName(node),
      semanticRole: node.semanticRole || node.role || "text",
      source: node.source || null,
      rawStyle: node.rawStyle || null,
      x: relativePosition.x,
      y: relativePosition.y,
      width: round(resolveTextWidth(node, parentNode, childSizing)),
      height: round(node.layout.height),
      layoutSizingHorizontal: childSizing.horizontal,
      layoutSizingVertical: childSizing.vertical,
      opacity: safeNumber(node.style.opacity, 1),
      characters: node.textContent || "",
      fontFamily: normalizeFontFamily(node.style.fontFamily),
      fontFamilies: normalizeFontFamilies(node.style.fontFamilies || node.style.fontFamily),
      fontSize: safeNumber(node.style.fontSize, 16),
      fontWeight: normalizeFontWeight(node.style.fontWeight),
      fontStyle: node.style.fontStyle || "normal",
      lineHeight: safeNumber(node.style.lineHeight, safeNumber(node.style.fontSize, 16) * 1.2),
      letterSpacing: safeNumber(node.style.letterSpacing, 0),
      textAlign: normalizeTextAlign(node.style.textAlign),
      textDecoration: node.style.textDecoration || "none",
      fills: [parseColor(node.style.color || "#111111")],
      role: node.role || "text",
      blendMode: mapBlendMode(node.style.mixBlendMode),
      transform: parseTransform(node.style.transform),
      effects: resolveEffects(node)
    };
  }

  if (node.kind === "image") {
    return {
      id: node.id,
      type: "image",
      name: layerName(node),
      semanticRole: node.semanticRole || "image",
      source: node.source || null,
      rawStyle: node.rawStyle || null,
      x: relativePosition.x,
      y: relativePosition.y,
      width: round(node.layout.width),
      height: round(node.layout.height),
      layoutSizingHorizontal: inferChildSizing(node, parentNode).horizontal,
      layoutSizingVertical: inferChildSizing(node, parentNode).vertical,
      opacity: safeNumber(node.style.opacity, 1),
      cornerRadius: normalizeCornerRadius(node.style),
      assetId: node.assetId || null,
      imageUrl: node.imageUrl || findAssetUrl(assets, node.assetId),
      proxiedImageUrl: findAssetProxyUrl(assets, node.assetId),
      fills: backgroundFills(node.style),
      blendMode: mapBlendMode(node.style.mixBlendMode),
      transform: parseTransform(node.style.transform),
      effects: resolveEffects(node)
    };
  }

  if (node.kind === "vector") {
    return {
      id: node.id,
      type: "vector",
      name: layerName(node),
      semanticRole: node.semanticRole || "vector",
      source: node.source || null,
      rawStyle: node.rawStyle || null,
      x: relativePosition.x,
      y: relativePosition.y,
      width: round(node.layout.width),
      height: round(node.layout.height),
      layoutSizingHorizontal: inferChildSizing(node, parentNode).horizontal,
      layoutSizingVertical: inferChildSizing(node, parentNode).vertical,
      opacity: safeNumber(node.style.opacity, 1),
      svgMarkup: node.svgMarkup || findAssetSvg(assets, node.assetId),
      blendMode: mapBlendMode(node.style.mixBlendMode),
      transform: parseTransform(node.style.transform),
      effects: resolveEffects(node)
    };
  }

  if (node.kind === "shape") {
    return {
      id: node.id,
      type: "shape",
      name: layerName(node),
      semanticRole: node.semanticRole || "shape",
      source: node.source || null,
      rawStyle: node.rawStyle || null,
      x: relativePosition.x,
      y: relativePosition.y,
      width: round(node.layout.width),
      height: round(node.layout.height),
      layoutSizingHorizontal: inferChildSizing(node, parentNode).horizontal,
      layoutSizingVertical: inferChildSizing(node, parentNode).vertical,
      opacity: safeNumber(node.style.opacity, 1),
      cornerRadius: normalizeCornerRadius(node.style),
      fills: backgroundFills(node.style),
      blendMode: mapBlendMode(node.style.mixBlendMode),
      transform: parseTransform(node.style.transform),
      effects: resolveEffects(node),
      isAbsolute: true
    };
  }

  const gridLayout = inferGridLayout(node, childNodes);
  const autoLayout = gridLayout?.strategy === "auto-layout-grid"
    ? null
    : inferAutoLayout(node, childNodes) || inferBlockAutoLayout(node, childNodes);
  const childSizing = inferChildSizing(node, parentNode);
  const childGridPlacement = inferChildGridPlacement(node, parentNode);
  const children = [
    ...childNodes.map((child) => convertNode(child, node, childrenByParent, assets)),
    ...createBorderLayers(node)
  ];

  return {
    id: node.id,
    type: "frame",
    name: layerName(node),
    semanticRole: node.semanticRole || "container",
    source: node.source || null,
    rawStyle: node.rawStyle || null,
    x: relativePosition.x,
    y: relativePosition.y,
    width: round(node.layout.width),
    height: round(node.layout.height),
    layoutSizingHorizontal: childSizing.horizontal,
    layoutSizingVertical: childSizing.vertical,
    gridColumnSpan: childGridPlacement.columnSpan,
    gridRowSpan: childGridPlacement.rowSpan,
    opacity: safeNumber(node.style.opacity, 1),
    cornerRadius: normalizeCornerRadius(node.style),
    fills: backgroundFills(node.style),
    strokes: hasUniformBorder(node.style) ? strokeFills(node.style) : [],
    strokeWeight: hasUniformBorder(node.style) ? safeNumber(node.style.borderWidth, 0) : 0,
    effects: resolveEffects(node),
    overflow: node.style.overflow || "visible",
    autoLayout,
    gridLayout,
    blendMode: mapBlendMode(node.style.mixBlendMode),
    transform: parseTransform(node.style.transform),
    isAbsolute: node.layout.position === "absolute" || node.layout.position === "fixed",
    children
  };
}

function inferAutoLayout(node, childNodes) {
  if (node.layout.display !== "flex") {
    return null;
  }

  const flowChildren = childNodes.filter(
    (child) => child.layout.position !== "absolute" && child.layout.position !== "fixed"
  );

  if (flowChildren.length === 0) {
    return null;
  }

  if (!shouldInferAutoLayout(node, flowChildren)) {
    return null;
  }

  const isHorizontal = node.layout.flexDirection === "row" || node.layout.flexDirection === "row-reverse";
  const spacing = safeNumber(
    node.layout.gap || (isHorizontal ? node.layout.columnGap : node.layout.rowGap),
    inferSpacing(flowChildren, isHorizontal)
  );

  return {
    mode: isHorizontal ? "HORIZONTAL" : "VERTICAL",
    paddingTop: safeNumber(node.layout.paddingTop, 0),
    paddingRight: safeNumber(node.layout.paddingRight, 0),
    paddingBottom: safeNumber(node.layout.paddingBottom, 0),
    paddingLeft: safeNumber(node.layout.paddingLeft, 0),
    itemSpacing: spacing,
    primaryAxisAlignItems: mapPrimaryAxisAlignment(node.layout.justifyContent),
    counterAxisAlignItems: mapCounterAxisAlignment(node.layout.alignItems),
    wrap: node.layout.flexWrap === "wrap"
  };
}

function shouldInferAutoLayout(node, flowChildren) {
  // flex-wrap IS valid Auto Layout (WRAP mode) — don't bail out here;
  // inferAutoLayout already sets wrap:true when flexWrap === "wrap".

  if (flowChildren.length > 32) {
    return false;
  }

  // Allow any ratio of text-to-frame children — the old 2-text cap was
  // too aggressive and dropped navbars, tag lists, and inline groups.

  const isHorizontal = node.layout.flexDirection === "row" || node.layout.flexDirection === "row-reverse";
  const sorted = [...flowChildren].sort((left, right) => {
    return isHorizontal ? left.layout.x - right.layout.x : left.layout.y - right.layout.y;
  });

  let previousEnd = null;
  let maxCrossAxisDrift = 0;

  for (const child of sorted) {
    const crossAxis = isHorizontal ? child.layout.y : child.layout.x;
    if (previousEnd !== null) {
      const currentStart = isHorizontal ? child.layout.x : child.layout.y;
      // Allow up to 4px overlap tolerance for sub-pixel rendering artefacts
      if (currentStart + 4 < previousEnd) {
        return false;
      }
    }

    previousEnd = isHorizontal
      ? child.layout.x + child.layout.width
      : child.layout.y + child.layout.height;
    maxCrossAxisDrift = Math.max(maxCrossAxisDrift, Math.abs(crossAxis - (isHorizontal ? sorted[0].layout.y : sorted[0].layout.x)));
  }

  // Be more generous on vertical containers — wide sidebars and panels
  // have natural cross-axis drift that shouldn't disqualify them.
  const crossAxisLimit = isHorizontal
    ? Math.max(node.layout.height * 0.6, 32)
    : Math.max(node.layout.width * 0.55, 32);
  return maxCrossAxisDrift <= crossAxisLimit;
}

function inferBlockAutoLayout(node, childNodes) {
  if (node.id === "capture-root" || node.layout.display === "grid" || node.layout.display === "inline-grid") {
    return null;
  }

  if (!isSemanticLayoutContainer(node) && childNodes.length < 2) {
    return null;
  }

  const flowChildren = childNodes.filter(
    (child) => child.layout.position !== "absolute" && child.layout.position !== "fixed"
  );

  if (flowChildren.length < 2 || flowChildren.length > 32) {
    return null;
  }

  const direction = inferLinearDirection(flowChildren);
  if (!direction) {
    return null;
  }

  const isHorizontal = direction === "HORIZONTAL";
  return {
    mode: direction,
    paddingTop: safeNumber(node.layout.paddingTop, 0),
    paddingRight: safeNumber(node.layout.paddingRight, 0),
    paddingBottom: safeNumber(node.layout.paddingBottom, 0),
    paddingLeft: safeNumber(node.layout.paddingLeft, 0),
    itemSpacing: inferSpacing([...flowChildren].sort((left, right) => isHorizontal ? left.layout.x - right.layout.x : left.layout.y - right.layout.y), isHorizontal),
    primaryAxisAlignItems: "MIN",
    counterAxisAlignItems: "MIN",
    wrap: false
  };
}

function createBorderLayers(node) {
  if (hasUniformBorder(node.style)) {
    return [];
  }

  const layers = [];
  const sides = [
    {
      side: "top",
      width: safeNumber(node.style.borderTopWidth, 0),
      color: node.style.borderTopColor,
      x: 0,
      y: 0,
      layerWidth: node.layout.width,
      layerHeight: safeNumber(node.style.borderTopWidth, 0)
    },
    {
      side: "right",
      width: safeNumber(node.style.borderRightWidth, 0),
      color: node.style.borderRightColor,
      x: node.layout.width - safeNumber(node.style.borderRightWidth, 0),
      y: 0,
      layerWidth: safeNumber(node.style.borderRightWidth, 0),
      layerHeight: node.layout.height
    },
    {
      side: "bottom",
      width: safeNumber(node.style.borderBottomWidth, 0),
      color: node.style.borderBottomColor,
      x: 0,
      y: node.layout.height - safeNumber(node.style.borderBottomWidth, 0),
      layerWidth: node.layout.width,
      layerHeight: safeNumber(node.style.borderBottomWidth, 0)
    },
    {
      side: "left",
      width: safeNumber(node.style.borderLeftWidth, 0),
      color: node.style.borderLeftColor,
      x: 0,
      y: 0,
      layerWidth: safeNumber(node.style.borderLeftWidth, 0),
      layerHeight: node.layout.height
    }
  ];

  for (const side of sides) {
    if (side.width <= 0 || !isMeaningfulColor(side.color)) {
      continue;
    }

    layers.push({
      id: `${node.id}-border-${side.side}`,
      type: "shape",
      name: `border ${side.side}`,
      x: round(side.x),
      y: round(side.y),
      width: round(side.layerWidth),
      height: round(side.layerHeight),
      opacity: safeNumber(node.style.opacity, 1),
      cornerRadius: 0,
      fills: [parseColor(side.color)],
      blendMode: "NORMAL",
      transform: null,
      effects: [],
      isAbsolute: true
    });
  }

  return layers;
}

function layerName(node) {
  if (node.id === "capture-root" || String(node.tagName || "").toUpperCase() === "ROOT") {
    return "Html";
  }

  if (node.kind === "text") {
    return node.role === "icon" ? "Icon" : "Text";
  }

  if (node.kind === "vector") {
    return "SVG";
  }

  if (node.kind === "image") {
    return "Image";
  }

  if (node.kind === "shape") {
    return clipText(node.name || "Background", 64);
  }

  const tagName = String(node.tagName || "").toLowerCase();
  const semanticRole = String(node.semanticRole || "").toLowerCase();
  if (semanticRole === "button") {
    return "Button";
  }
  if (semanticRole === "toggle") {
    return "Toggle";
  }
  if (semanticRole === "input") {
    return "Input";
  }
  if (semanticRole === "card") {
    return "Card";
  }
  if (semanticRole === "badge") {
    return "Badge";
  }

  const semanticNames = {
    html: "Html",
    body: "Body",
    aside: "Aside",
    main: "Main",
    nav: "Nav",
    header: "Header",
    footer: "Footer",
    section: "Section",
    article: "Article",
    form: "Form",
    button: "Button",
    ul: "List",
    ol: "List",
    li: "Item"
  };

  if (semanticNames[tagName]) {
    return semanticNames[tagName];
  }

  const parts = [];
  if (hasMeaningfulFill(node.style)) {
    parts.push("Background");
  }
  if (hasAnyBorder(node.style)) {
    parts.push("Border");
  }
  if (Array.isArray(parseEffects(node.style, node.layout)) && parseEffects(node.style, node.layout).length > 0) {
    parts.push("Shadow");
  }

  if (parts.length > 0) {
    return parts.join("+");
  }

  return "Container";
}

function hasMeaningfulFill(style) {
  return isMeaningfulColor(style.backgroundColor);
}

function hasAnyBorder(style) {
  return (
    safeNumber(style.borderTopWidth, safeNumber(style.borderWidth, 0)) > 0 ||
    safeNumber(style.borderRightWidth, safeNumber(style.borderWidth, 0)) > 0 ||
    safeNumber(style.borderBottomWidth, safeNumber(style.borderWidth, 0)) > 0 ||
    safeNumber(style.borderLeftWidth, safeNumber(style.borderWidth, 0)) > 0
  );
}

function resolveTextWidth(node, parentNode, childSizing) {
  const measured = safeNumber(node.layout.width, 0);
  const text = String(node.textContent || "");
  const fontSize = safeNumber(node.style.fontSize, 16);
  const estimated = text.length * fontSize * 0.58;
  const role = node.role || "text";
  const parentInnerWidth = parentNode ? getInnerWidth(parentNode) : null;

  if (role === "icon") {
    return Math.max(measured, fontSize * 1.25);
  }

  if (parentInnerWidth && childSizing?.horizontal === "FILL") {
    return Math.max(parentInnerWidth, fontSize * 2);
  }

  const resolved = Math.max(measured, Math.min(estimated, 720), fontSize * 2);
  return parentInnerWidth ? Math.min(resolved, parentInnerWidth) : resolved;
}

function inferGridLayout(node, childNodes) {
  if (node.layout.display !== "grid" && node.layout.display !== "inline-grid") {
    return null;
  }

  const columns = parseGridTracks(node.layout.gridTemplateColumns);
  const rows = parseGridTracks(node.layout.gridTemplateRows);
  const columnCount = columns.length || inferGridColumnCount(childNodes);
  const rowCount = rows.length || Math.max(1, Math.ceil(childNodes.length / Math.max(columnCount, 1)));
  const isSimpleGrid = columnCount > 1 && columnCount <= 8 && rowCount > 0 && childNodes.length <= columnCount * rowCount;

  return {
    columns,
    rows,
    columnCount,
    rowCount,
    columnGap: safeNumber(node.layout.columnGap, safeNumber(node.layout.gap, 0)),
    rowGap: safeNumber(node.layout.rowGap, safeNumber(node.layout.gap, 0)),
    autoFlow: node.layout.gridAutoFlow || "row",
    childCount: childNodes.length,
    strategy: isSimpleGrid ? "auto-layout-grid" : "fixed-position"
  };
}

function inferGridColumnCount(childNodes) {
  if (childNodes.length < 2) {
    return 1;
  }

  const firstRowY = Math.min(...childNodes.map((child) => child.layout.y));
  const firstRow = childNodes.filter((child) => Math.abs(child.layout.y - firstRowY) <= 2);
  return Math.max(1, firstRow.length);
}

function inferChildSizing(node, parentNode) {
  if (!parentNode) {
    return {
      horizontal: "FIXED",
      vertical: "FIXED"
    };
  }

  const parentInnerWidth = getInnerWidth(parentNode);
  const parentInnerHeight = getInnerHeight(parentNode);
  const fillsWidth = node.layout.width >= parentInnerWidth * 0.82;
  const fillsHeight = node.layout.height >= parentInnerHeight * 0.82;
  const hasTextOnlySize = node.kind === "text" || node.kind === "vector";
  const parentDisplay = parentNode.layout.display;
  const textLength = String(node.textContent || "").trim().length;
  const parentIsHorizontal = parentNode.layout.flexDirection === "row" || parentNode.layout.flexDirection === "row-reverse";
  const measuredWidth = safeNumber(node.layout.width, 0);
  const hasRoomToFillText = parentInnerWidth >= 120;
  const isParagraphLikeText =
    node.kind === "text" &&
    !parentIsHorizontal &&
    hasRoomToFillText &&
    (textLength > 28 || (textLength > 14 && measuredWidth > parentInnerWidth * 0.48));

  if (parentDisplay === "grid" || parentDisplay === "inline-grid") {
    return {
      horizontal: "FILL",
      vertical: hasTextOnlySize ? "HUG" : "HUG"
    };
  }

  const shouldFillHorizontally = (!hasTextOnlySize && fillsWidth) || isParagraphLikeText;

  return {
    horizontal: shouldFillHorizontally ? "FILL" : hasTextOnlySize ? "HUG" : "FIXED",
    vertical: fillsHeight && !hasTextOnlySize ? "FILL" : hasTextOnlySize ? "HUG" : "FIXED"
  };
}

function getInnerWidth(node) {
  return Math.max(
    1,
    safeNumber(node.layout.width, 0) - safeNumber(node.layout.paddingLeft, 0) - safeNumber(node.layout.paddingRight, 0)
  );
}

function getInnerHeight(node) {
  return Math.max(
    1,
    safeNumber(node.layout.height, 0) - safeNumber(node.layout.paddingTop, 0) - safeNumber(node.layout.paddingBottom, 0)
  );
}

function inferChildGridPlacement(node, parentNode) {
  if (!parentNode || (parentNode.layout.display !== "grid" && parentNode.layout.display !== "inline-grid")) {
    return {
      columnSpan: 1,
      rowSpan: 1
    };
  }

  return {
    columnSpan: inferGridSpan(node.layout.gridColumnStart, node.layout.gridColumnEnd),
    rowSpan: inferGridSpan(node.layout.gridRowStart, node.layout.gridRowEnd)
  };
}

function inferGridSpan(start, end) {
  const startNumber = Number.parseInt(start, 10);
  const endNumber = Number.parseInt(end, 10);
  if (Number.isFinite(startNumber) && Number.isFinite(endNumber) && endNumber > startNumber) {
    return Math.max(1, endNumber - startNumber);
  }
  return 1;
}

function inferLinearDirection(children) {
  const horizontal = [...children].sort((left, right) => left.layout.x - right.layout.x);
  const vertical = [...children].sort((left, right) => left.layout.y - right.layout.y);
  const horizontalScore = linearScore(horizontal, true);
  const verticalScore = linearScore(vertical, false);

  if (horizontalScore.valid && horizontalScore.score <= verticalScore.score) {
    return "HORIZONTAL";
  }

  if (verticalScore.valid) {
    return "VERTICAL";
  }

  return null;
}

function linearScore(children, isHorizontal) {
  let previousEnd = null;
  let crossAxisDrift = 0;
  let overlaps = 0;
  const firstCrossAxis = isHorizontal ? children[0].layout.y : children[0].layout.x;

  for (const child of children) {
    const start = isHorizontal ? child.layout.x : child.layout.y;
    const end = start + (isHorizontal ? child.layout.width : child.layout.height);
    const crossAxis = isHorizontal ? child.layout.y : child.layout.x;

    if (previousEnd !== null && start + 2 < previousEnd) {
      overlaps += 1;
    }

    previousEnd = Math.max(previousEnd || end, end);
    crossAxisDrift = Math.max(crossAxisDrift, Math.abs(crossAxis - firstCrossAxis));
  }

  const allowedDrift = isHorizontal ? 40 : 80;
  return {
    valid: overlaps === 0 && crossAxisDrift <= allowedDrift,
    score: crossAxisDrift + overlaps * 1000
  };
}

function isSemanticLayoutContainer(node) {
  return ["body", "main", "aside", "nav", "header", "footer", "section", "article", "ul", "ol"].includes(
    String(node.tagName || "").toLowerCase()
  );
}

function inferSpacing(children, isHorizontal) {
  if (children.length < 2) {
    return 0;
  }

  const axis = isHorizontal ? "x" : "y";
  const size = isHorizontal ? "width" : "height";
  let total = 0;
  let count = 0;

  for (let index = 1; index < children.length; index += 1) {
    const previous = children[index - 1];
    const current = children[index];
    const gap = current.layout[axis] - (previous.layout[axis] + previous.layout[size]);
    if (gap >= 0) {
      total += gap;
      count += 1;
    }
  }

  return count > 0 ? round(total / count) : 0;
}

function parseBoxShadow(value, layout) {
  if (!value || value === "none") {
    return [];
  }

  return splitShadowList(String(value))
    .map((shadow) => parseSingleBoxShadow(shadow, layout))
    .filter(Boolean)
    .slice(0, isCompactControl(layout) ? 4 : 2);
}

function splitShadowList(value) {
  const shadows = [];
  let current = "";
  let depth = 0;

  for (const character of value) {
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth = Math.max(0, depth - 1);
    }

    if (character === "," && depth === 0) {
      shadows.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim()) {
    shadows.push(current.trim());
  }

  return shadows;
}

function parseSingleBoxShadow(value, layout) {
  const shadow = String(value || "").trim();
  if (!shadow || shadow.includes(" inset") || shadow.startsWith("inset ")) {
    return null;
  }

  const colorMatch = shadow.match(/rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8}|\b(?:transparent|black|white|red|green|blue|gray|grey)\b/i);
  const color = colorMatch ? colorMatch[0] : "rgba(0, 0, 0, 0.18)";
  const numericPart = colorMatch
    ? shadow.replace(colorMatch[0], " ").trim()
    : shadow;
  const lengths = numericPart.match(/-?\d*\.?\d+(?:px)?/g) || [];

  if (lengths.length < 2) {
    return null;
  }

  const effect = {
    type: "DROP_SHADOW",
    color: parseColor(color),
    offsetX: parseCssLength(lengths[0], 0),
    offsetY: parseCssLength(lengths[1], 0),
    blur: parseCssLength(lengths[2], 0),
    spread: parseCssLength(lengths[3], 0)
  };

  return normalizeShadowEffect(effect, layout);
}

function parseCssLength(value, fallback) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseEffects(style, layout, rawStyle = {}) {
  return [
    ...parseBoxShadow(resolveStyleValue(style, rawStyle, ["boxShadow", "webkitBoxShadow", "WebkitBoxShadow"]), layout),
    ...parseFilterEffects(resolveStyleValue(style, rawStyle, ["filter"]), "LAYER_BLUR"),
    ...parseFilterEffects(resolveStyleValue(style, rawStyle, ["backdropFilter", "webkitBackdropFilter", "WebkitBackdropFilter"]), "BACKGROUND_BLUR")
  ];
}

function resolveEffects(node) {
  const effects = parseEffects(node.style, node.layout, node.rawStyle);
  if (shouldUseControlShadowFallback(node, effects)) {
    return [controlShadowFromFill(node.style.backgroundColor)];
  }
  return effects;
}

function resolveStyleValue(style, rawStyle, keys) {
  for (const key of keys) {
    const normalizedValue = style?.[key];
    if (normalizedValue && normalizedValue !== "none" && normalizedValue !== "normal") {
      return normalizedValue;
    }

    const rawValue = rawStyle?.[key];
    if (rawValue && rawValue !== "none" && rawValue !== "normal") {
      return rawValue;
    }
  }

  return "";
}

function shouldUseControlShadowFallback(node, effects) {
  if (node.kind !== "frame" || !isCompactControl(node.layout) || effects.length > 0) {
    return false;
  }

  const tagName = String(node.tagName || "").toLowerCase();
  const semanticRole = String(node.semanticRole || "").toLowerCase();
  const fill = parseColor(node.style.backgroundColor);
  const radius = Math.max(
    safeNumber(node.style.borderRadiusTopLeft, 0),
    safeNumber(node.style.borderRadiusTopRight, 0),
    safeNumber(node.style.borderRadiusBottomRight, 0),
    safeNumber(node.style.borderRadiusBottomLeft, 0)
  );
  const isButtonLike = semanticRole === "button" || semanticRole === "toggle" || tagName === "button";
  const hasSaturatedFill = fill.a > 0.9 && Math.max(fill.r, fill.g, fill.b) - Math.min(fill.r, fill.g, fill.b) > 0.35;

  return isButtonLike && hasSaturatedFill && radius >= 6;
}

function controlShadowFromFill(backgroundColor) {
  const fill = parseColor(backgroundColor);
  return {
    type: "DROP_SHADOW",
    color: {
      r: fill.r,
      g: fill.g,
      b: fill.b,
      a: 0.2
    },
    offsetX: 0,
    offsetY: 8,
    blur: 20,
    spread: 0
  };
}

function normalizeShadowEffect(effect, layout) {
  if (!layout || isCompactControl(layout)) {
    return effect;
  }

  return {
    ...effect,
    color: {
      ...effect.color,
      a: Math.min(effect.color.a, 0.12)
    },
    offsetX: round(effect.offsetX * 0.35),
    offsetY: round(effect.offsetY * 0.35),
    blur: round(Math.min(effect.blur * 0.45, 12)),
    spread: round(Math.min(effect.spread, 0))
  };
}

function isCompactControl(layout) {
  const width = safeNumber(layout?.width, 0);
  const height = safeNumber(layout?.height, 0);
  return width > 0 && height > 0 && width <= 260 && height <= 72;
}

function parseFilterEffects(value, type) {
  if (!value || value === "none") {
    return [];
  }

  const blurMatch = String(value).match(/blur\(([-\d.]+)px\)/);
  if (!blurMatch) {
    return [];
  }

  return [
    {
      type,
      radius: safeNumber(blurMatch[1], 0)
    }
  ];
}

function backgroundFills(style) {
  const color = style.backgroundColor;
  if (!color || color === "transparent" || color === "rgba(0, 0, 0, 0)") {
    return [];
  }
  return [parseColor(color)];
}

function strokeFills(style) {
  if (!safeNumber(style.borderWidth, 0)) {
    return [];
  }
  return [parseColor(style.borderColor || "rgba(0,0,0,0)")];
}

function hasUniformBorder(style) {
  const topWidth = safeNumber(style.borderTopWidth, safeNumber(style.borderWidth, 0));
  const rightWidth = safeNumber(style.borderRightWidth, safeNumber(style.borderWidth, 0));
  const bottomWidth = safeNumber(style.borderBottomWidth, safeNumber(style.borderWidth, 0));
  const leftWidth = safeNumber(style.borderLeftWidth, safeNumber(style.borderWidth, 0));
  const topColor = style.borderTopColor || style.borderColor;
  const rightColor = style.borderRightColor || style.borderColor;
  const bottomColor = style.borderBottomColor || style.borderColor;
  const leftColor = style.borderLeftColor || style.borderColor;

  return (
    topWidth > 0 &&
    topWidth === rightWidth &&
    topWidth === bottomWidth &&
    topWidth === leftWidth &&
    topColor === rightColor &&
    topColor === bottomColor &&
    topColor === leftColor
  );
}

function isMeaningfulColor(value) {
  return Boolean(value && value !== "transparent" && value !== "rgba(0, 0, 0, 0)");
}

function normalizeCornerRadius(style) {
  const values = [
    safeNumber(style.borderRadiusTopLeft, 0),
    safeNumber(style.borderRadiusTopRight, 0),
    safeNumber(style.borderRadiusBottomRight, 0),
    safeNumber(style.borderRadiusBottomLeft, 0)
  ];

  return values.every((value) => value === values[0]) ? values[0] : values;
}

function normalizeTextAlign(value) {
  const lower = String(value || "left").toLowerCase();
  if (lower === "center") {
    return "CENTER";
  }
  if (lower === "right" || lower === "end") {
    return "RIGHT";
  }
  if (lower === "justify") {
    return "JUSTIFIED";
  }
  return "LEFT";
}

function mapPrimaryAxisAlignment(value) {
  switch (String(value || "").toLowerCase()) {
    case "center":
      return "CENTER";
    case "flex-end":
    case "end":
      return "MAX";
    case "space-between":
      return "SPACE_BETWEEN";
    default:
      return "MIN";
  }
}

function mapCounterAxisAlignment(value) {
  switch (String(value || "").toLowerCase()) {
    case "center":
      return "CENTER";
    case "flex-end":
    case "end":
      return "MAX";
    case "stretch":
      return "MIN";
    default:
      return "MIN";
  }
}

function parseGridTracks(value) {
  if (!value || value === "none") {
    return [];
  }

  return String(value)
    .trim()
    .split(/\s+/)
    .map((track) => ({
      raw: track,
      pixels: track.endsWith("px") ? safeNumber(track, 0) : null,
      fraction: track.endsWith("fr") ? safeNumber(track, 0) : null
    }));
}

function parseTransform(value) {
  if (!value || value === "none") {
    return null;
  }

  const matrix = String(value).match(/^matrix\(([^)]+)\)$/);
  if (matrix) {
    const [a, b, c, d, tx, ty] = matrix[1].split(",").map((part) => safeNumber(part.trim(), 0));
    const rotation = Math.atan2(b, a) * (180 / Math.PI);
    const scaleX = Math.sqrt(a * a + b * b);
    const scaleY = Math.sqrt(c * c + d * d);
    return {
      raw: value,
      rotation: round(rotation, 3),
      scaleX: round(scaleX || 1, 3),
      scaleY: round(scaleY || 1, 3),
      translateX: round(tx || 0),
      translateY: round(ty || 0)
    };
  }

  return {
    raw: value,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    translateX: 0,
    translateY: 0
  };
}

function mapBlendMode(value) {
  switch (String(value || "normal").toLowerCase()) {
    case "multiply":
      return "MULTIPLY";
    case "screen":
      return "SCREEN";
    case "overlay":
      return "OVERLAY";
    case "darken":
      return "DARKEN";
    case "lighten":
      return "LIGHTEN";
    case "color-dodge":
      return "COLOR_DODGE";
    case "color-burn":
      return "COLOR_BURN";
    case "hard-light":
      return "HARD_LIGHT";
    case "soft-light":
      return "SOFT_LIGHT";
    case "difference":
      return "DIFFERENCE";
    case "exclusion":
      return "EXCLUSION";
    case "hue":
      return "HUE";
    case "saturation":
      return "SATURATION";
    case "color":
      return "COLOR";
    case "luminosity":
      return "LUMINOSITY";
    default:
      return "NORMAL";
  }
}

function normalizeFontFamily(value) {
  return String(value || "Inter")
    .split(",")[0]
    .trim()
    .replace(/^["']|["']$/g, "") || "Inter";
}

function normalizeFontFamilies(value) {
  if (Array.isArray(value)) {
    return value.map((font) => normalizeFontFamily(font)).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((font) => normalizeFontFamily(font))
    .filter(Boolean);
}

function normalizeFontWeight(value) {
  const numeric = safeNumber(value, 400);
  if (numeric >= 700) {
    return 700;
  }
  if (numeric >= 600) {
    return 600;
  }
  if (numeric >= 500) {
    return 500;
  }
  return 400;
}

function parseColor(input) {
  const color = String(input || "").trim().toLowerCase();
  if (color.startsWith("#")) {
    return fromHex(color);
  }

  const rgbaMatch = color.match(/rgba?\(([^)]+)\)/);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(",").map((piece) => piece.trim());
    return {
      r: clampColor(parts[0] / 255),
      g: clampColor(parts[1] / 255),
      b: clampColor(parts[2] / 255),
      a: parts[3] === undefined ? 1 : clampNumber(Number(parts[3]), 0, 1)
    };
  }

  if (color === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  return { r: 0.067, g: 0.067, b: 0.067, a: 1 };
}

function fromHex(color) {
  const value = color.slice(1);
  const normalized = value.length === 3
    ? value.split("").map((piece) => piece + piece).join("")
    : value;

  const alphaReady = normalized.length === 6 ? `${normalized}ff` : normalized;

  return {
    r: parseInt(alphaReady.slice(0, 2), 16) / 255,
    g: parseInt(alphaReady.slice(2, 4), 16) / 255,
    b: parseInt(alphaReady.slice(4, 6), 16) / 255,
    a: parseInt(alphaReady.slice(6, 8), 16) / 255
  };
}

function findAssetUrl(assets, assetId) {
  return assets.find((asset) => asset.id === assetId)?.url || null;
}

function findAssetProxyUrl(assets, assetId) {
  return assets.find((asset) => asset.id === assetId)?.proxyUrl || null;
}

function findAssetSvg(assets, assetId) {
  return assets.find((asset) => asset.id === assetId)?.content || null;
}

function safeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampColor(value) {
  return clampNumber(Number(value), 0, 1);
}

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(safeNumber(value, 0) * factor) / factor;
}
