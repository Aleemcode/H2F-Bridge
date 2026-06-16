const DEFAULT_BACKEND_URL = "https://html-to-figma-backend-qrnq.onrender.com";
const PLUGIN_VERSION = "0.3.0";
const FALLBACK_FONTS = [
  { family: "Inter", style: "Regular" },
  { family: "Roboto", style: "Regular" }
];

figma.showUI(__html__, {
  width: 420,
  height: 560,
  themeColors: true
});

boot();

async function boot() {
  const backendUrl = (await figma.clientStorage.getAsync("backendUrl")) || DEFAULT_BACKEND_URL;
  await refreshCaptures(backendUrl);
}

figma.ui.onmessage = async (message) => {
  if (message.type === "refresh-captures") {
    const backendUrl = message.backendUrl || DEFAULT_BACKEND_URL;
    await figma.clientStorage.setAsync("backendUrl", backendUrl);
    await refreshCaptures(backendUrl);
    return;
  }

  if (message.type === "import-capture") {
    const backendUrl = message.backendUrl || DEFAULT_BACKEND_URL;
    await figma.clientStorage.setAsync("backendUrl", backendUrl);
    await importCapture(backendUrl, message.captureId);
  }
};

async function refreshCaptures(backendUrl) {
  try {
    const response = await fetch(`${backendUrl}/captures/recent`);
    const payload = await response.json();
    const backendVersion = await fetchBackendVersion(backendUrl);
    figma.ui.postMessage({
      type: "captures-loaded",
      backendUrl,
      pluginVersion: PLUGIN_VERSION,
      backendVersion,
      captures: payload.captures || []
    });
  } catch (error) {
    figma.ui.postMessage({
      type: "captures-error",
      backendUrl,
      error: error.message
    });
  }
}

// Best-effort backend version probe so the UI can flag a stale deploy.
async function fetchBackendVersion(backendUrl) {
  try {
    const response = await fetch(`${backendUrl}/health`);
    const payload = await response.json();
    return payload.appVersion || null;
  } catch (error) {
    return null;
  }
}

async function importCapture(backendUrl, captureId) {
  try {
    const response = await fetch(`${backendUrl}/captures/${captureId}/design-model`);
    const designModel = await response.json();
    const rootNode = await materializeNode(designModel.root, figma.currentPage);

    if ("appendChild" in figma.currentPage) {
      figma.currentPage.appendChild(rootNode);
    }

    lockScreenshotBackdrop(rootNode);

    figma.currentPage.selection = [rootNode];
    figma.viewport.scrollAndZoomIntoView([rootNode]);

    figma.ui.postMessage({
      type: "import-complete",
      captureId,
      name: designModel.capture.title
    });
    figma.notify(`Imported ${designModel.capture.title}`);
  } catch (error) {
    figma.ui.postMessage({
      type: "captures-error",
      backendUrl,
      error: error.message
    });
    figma.notify(`Import failed: ${error.message}`, { error: true });
  }
}

// Lock the pixel-perfect screenshot backdrop so it acts as a non-interactive
// reference layer. Users can unlock or hide it from the Layers panel.
function lockScreenshotBackdrop(rootNode) {
  try {
    if (!rootNode || !("children" in rootNode)) {
      return;
    }
    for (const child of rootNode.children) {
      if (child.name === "Reference (pixel-perfect)") {
        child.locked = true;
        return;
      }
    }
  } catch (error) {
    // Non-fatal — the backdrop just stays unlocked.
  }
}

async function materializeNode(modelNode, parent) {
  try {
    return await materializeNodeUnsafe(modelNode, parent);
  } catch (error) {
    console.error(
      "Failed to materialize node",
      modelNode && modelNode.id,
      modelNode && modelNode.name,
      error
    );
    return createFallbackNode(modelNode, error);
  }
}

async function materializeNodeUnsafe(modelNode, parent) {
  if (modelNode.type === "text") {
    const textNode = figma.createText();
    textNode.name = modelNode.name;
    const fontName = await resolveFont(
      modelNode.fontFamilies || [modelNode.fontFamily],
      modelNode.fontWeight,
      modelNode.fontStyle,
      modelNode.role
    );
    textNode.fontName = fontName;
    textNode.fontSize = modelNode.fontSize;
    textNode.lineHeight = {
      unit: "PIXELS",
      value: modelNode.lineHeight
    };
    textNode.letterSpacing = {
      unit: "PIXELS",
      value: modelNode.letterSpacing
    };
    textNode.textAlignHorizontal = modelNode.textAlign;
    textNode.characters = modelNode.characters;
    applyTextDecoration(textNode, modelNode.textDecoration);
    textNode.fills = toPaints(modelNode.fills);
    textNode.opacity = modelNode.opacity;
    applyBlendMode(textNode, modelNode.blendMode);
    applyEffects(textNode, modelNode.effects);
    applyTransform(textNode, modelNode.transform);
    applyTextSizing(textNode, modelNode);
    setNodePosition(textNode, modelNode, parent);
    return textNode;
  }

  if (modelNode.type === "image") {
    const rectangle = figma.createRectangle();
    rectangle.name = modelNode.name;
    rectangle.resize(Math.max(modelNode.width, 1), Math.max(modelNode.height, 1));
    rectangle.opacity = modelNode.opacity;
    applyCornerRadius(rectangle, modelNode.cornerRadius);
    if (Array.isArray(modelNode.fills) && modelNode.fills.length > 0) {
      rectangle.fills = toPaints(modelNode.fills);
    }

    applyBlendMode(rectangle, modelNode.blendMode);
    applyEffects(rectangle, modelNode.effects);
    applyTransform(rectangle, modelNode.transform);

    const bytes = await fetchImageBytes(modelNode.proxiedImageUrl || modelNode.imageUrl);
    if (bytes) {
      const image = figma.createImage(bytes);
      rectangle.fills = [
        {
          type: "IMAGE",
          scaleMode: "FILL",
          imageHash: image.hash
        }
      ];
    }

    setNodePosition(rectangle, modelNode, parent);
    return rectangle;
  }

  if (modelNode.type === "shape") {
    const rectangle = figma.createRectangle();
    rectangle.name = modelNode.name;
    rectangle.resize(Math.max(modelNode.width, 1), Math.max(modelNode.height, 1));
    rectangle.opacity = modelNode.opacity;
    rectangle.fills = toPaints(modelNode.fills);
    applyCornerRadius(rectangle, modelNode.cornerRadius);
    applyBlendMode(rectangle, modelNode.blendMode);
    applyEffects(rectangle, modelNode.effects);
    applyTransform(rectangle, modelNode.transform);
    setNodePosition(rectangle, modelNode, parent);
    return rectangle;
  }

  if (modelNode.type === "vector") {
    const vectorNode = figma.createNodeFromSvg(modelNode.svgMarkup || emptySvg(modelNode));
    vectorNode.name = modelNode.name;
    vectorNode.opacity = modelNode.opacity;
    applyBlendMode(vectorNode, modelNode.blendMode);
    applyEffects(vectorNode, modelNode.effects);
    applyTransform(vectorNode, modelNode.transform);
    setNodePosition(vectorNode, modelNode, parent);
    return vectorNode;
  }

  const frame = figma.createFrame();
  frame.name = modelNode.name;
  frame.resize(Math.max(modelNode.width, 1), Math.max(modelNode.height, 1));
  frame.opacity = modelNode.opacity;
  frame.clipsContent = modelNode.overflow === "hidden";
  frame.fills = toPaints(modelNode.fills);
  frame.strokes = toPaints(modelNode.strokes);
  frame.strokeWeight = modelNode.strokeWeight || 0;
  applyCornerRadius(frame, modelNode.cornerRadius);
  applyEffects(frame, modelNode.effects);
  applyLayout(frame, modelNode);
  applyBlendMode(frame, modelNode.blendMode);
  applyTransform(frame, modelNode.transform);
  setNodePosition(frame, modelNode, parent);

  for (const child of modelNode.children || []) {
    const childNode = await materializeNode(child, frame);
    frame.appendChild(childNode);
    applyChildLayout(childNode, child, frame);

    if (frame.layoutMode !== "NONE" && child.isAbsolute) {
      childNode.layoutPositioning = "ABSOLUTE";
      childNode.x = child.x;
      childNode.y = child.y;
    }
  }

  return frame;
}

function createFallbackNode(modelNode, error) {
  const fallback = figma.createFrame();
  const fallbackName = (modelNode && (modelNode.name || modelNode.id)) || "node";
  const fallbackWidth = (modelNode && modelNode.width) || 160;
  const fallbackHeight = (modelNode && modelNode.height) || 40;
  fallback.name = `Unsupported: ${fallbackName}`;
  fallback.resize(Math.max(fallbackWidth, 1), Math.max(fallbackHeight, 1));
  fallback.fills = [
    {
      type: "SOLID",
      color: { r: 1, g: 0.91, b: 0.83 },
      opacity: 1
    }
  ];
  fallback.strokes = [
    {
      type: "SOLID",
      color: { r: 0.92, g: 0.25, b: 0.12 },
      opacity: 1
    }
  ];
  fallback.strokeWeight = 1;
  fallback.setPluginData("htmlToFigmaError", (error && error.message) || "Node import failed.");
  setNodePosition(fallback, modelNode || {}, null);
  return fallback;
}

async function resolveFont(families, weight, style, role) {
  const candidates = Array.isArray(families) ? families : [families];
  const requested = [];
  const isItalic = String(style || "").toLowerCase().includes("italic");

  for (const family of candidates) {
    if (!family) {
      continue;
    }
    requested.push(fontRequest(family, weight, isItalic));
    requested.push({ family, style: "Regular" });
  }

  if (role === "icon") {
    requested.push({ family: "Material Icons", style: "Regular" });
    requested.push({ family: "Font Awesome 6 Free", style: "Solid" });
    requested.push({ family: "Font Awesome 5 Free", style: "Solid" });
  }

  requested.push(...FALLBACK_FONTS);

  for (const font of requested) {
    try {
      await figma.loadFontAsync(font);
      return font;
    } catch (error) {
      continue;
    }
  }

  throw new Error("No supported font available.");
}

function applyTextSizing(textNode, modelNode) {
  safelySet(() => {
    textNode.textAutoResize = "HEIGHT";
  });
  safelySet(() => {
    textNode.resize(Math.max(modelNode.width || 1, 1), Math.max(modelNode.height || 1, 1));
  });
}

function fontRequest(family, weight, isItalic) {
  let style = "Regular";
  if (weight >= 700) {
    style = "Bold";
  } else if (weight >= 600) {
    style = "Semi Bold";
  } else if (weight >= 500) {
    style = "Medium";
  }

  return {
    family,
    style: isItalic ? `${style} Italic` : style
  };
}

function applyTextDecoration(textNode, textDecoration) {
  if (String(textDecoration || "").includes("underline")) {
    safelySet(() => {
      textNode.textDecoration = "UNDERLINE";
    });
    return;
  }

  if (String(textDecoration || "").includes("line-through")) {
    safelySet(() => {
      textNode.textDecoration = "STRIKETHROUGH";
    });
  }
}

function applyLayout(frame, modelNode) {
  if (modelNode.gridLayout && modelNode.gridLayout.strategy === "auto-layout-grid") {
    applyGridLayout(frame, modelNode.gridLayout);
    return;
  }

  applyAutoLayout(frame, modelNode.autoLayout);
}

function applyGridLayout(frame, gridLayout) {
  safelySet(() => {
    frame.layoutMode = "GRID";
  });
  safelySet(() => {
    frame.gridColumnCount = Math.max(gridLayout.columnCount || 1, 1);
  });
  safelySet(() => {
    frame.gridRowCount = Math.max(gridLayout.rowCount || 1, 1);
  });
  safelySet(() => {
    frame.gridColumnGap = gridLayout.columnGap || 0;
  });
  safelySet(() => {
    frame.gridRowGap = gridLayout.rowGap || 0;
  });
  setGridTrackSizes(frame.gridColumnSizes, gridLayout.columns);
  setGridTrackSizes(frame.gridRowSizes, gridLayout.rows);
}

function setGridTrackSizes(trackSizes, tracks) {
  if (!Array.isArray(trackSizes) || !Array.isArray(tracks)) {
    return;
  }

  const limit = Math.min(trackSizes.length, tracks.length);
  for (let index = 0; index < limit; index += 1) {
    const trackSize = trackSizes[index];
    const track = tracks[index];
    if (!trackSize || !track) {
      continue;
    }

    if (track.pixels) {
      safelySet(() => {
        trackSize.type = "FIXED";
        trackSize.value = Math.max(track.pixels, 1);
      });
    } else if (track.fraction) {
      safelySet(() => {
        trackSize.type = "FLEX";
        trackSize.value = Math.max(track.fraction, 1);
      });
    }
  }
}

function applyAutoLayout(frame, autoLayout) {
  if (!autoLayout) {
    frame.layoutMode = "NONE";
    return;
  }

  frame.layoutMode = autoLayout.mode;
  frame.primaryAxisSizingMode = "FIXED";
  frame.counterAxisSizingMode = "FIXED";
  frame.itemSpacing = autoLayout.itemSpacing;
  frame.paddingTop = autoLayout.paddingTop;
  frame.paddingRight = autoLayout.paddingRight;
  frame.paddingBottom = autoLayout.paddingBottom;
  frame.paddingLeft = autoLayout.paddingLeft;
  frame.primaryAxisAlignItems = autoLayout.primaryAxisAlignItems;
  frame.counterAxisAlignItems = autoLayout.counterAxisAlignItems;
  if (autoLayout.wrap && "layoutWrap" in frame) {
    frame.layoutWrap = "WRAP";
    // Cross-axis gap between wrapped rows/columns (matches CSS row/column-gap).
    if ("counterAxisSpacing" in frame && Number.isFinite(autoLayout.counterAxisSpacing)) {
      safelySet(() => {
        frame.counterAxisSpacing = autoLayout.counterAxisSpacing;
      });
    }
  }
}

function applyChildLayout(node, modelNode, parent) {
  if (!parent || !("layoutMode" in parent) || parent.layoutMode === "NONE" || modelNode.isAbsolute) {
    return;
  }

  if (modelNode.layoutSizingHorizontal) {
    safelySet(() => {
      node.layoutSizingHorizontal = modelNode.layoutSizingHorizontal;
    });
  }

  if (modelNode.layoutSizingVertical) {
    safelySet(() => {
      node.layoutSizingVertical = modelNode.layoutSizingVertical;
    });
  }

  if (parent.layoutMode === "GRID") {
    safelySet(() => {
      node.gridColumnSpan = Math.max(modelNode.gridColumnSpan || 1, 1);
    });
    safelySet(() => {
      node.gridRowSpan = Math.max(modelNode.gridRowSpan || 1, 1);
    });
  }
}

function applyCornerRadius(node, cornerRadius) {
  if (Array.isArray(cornerRadius)) {
    safelySet(() => {
      node.topLeftRadius = cornerRadius[0];
      node.topRightRadius = cornerRadius[1];
      node.bottomRightRadius = cornerRadius[2];
      node.bottomLeftRadius = cornerRadius[3];
    });
    return;
  }

  safelySet(() => {
    node.cornerRadius = cornerRadius || 0;
  });
}

function applyEffects(node, effects) {
  if (!Array.isArray(effects) || effects.length === 0) {
    return;
  }

  const nextEffects = effects
    .map((effect) => {
      if (effect.type === "LAYER_BLUR" || effect.type === "BACKGROUND_BLUR") {
        return {
          type: effect.type,
          radius: effect.radius,
          visible: true
        };
      }

      return {
        type: effect.type,
        color: toFigmaColor(effect.color),
        offset: {
          x: effect.offsetX,
          y: effect.offsetY
        },
        radius: effect.blur,
        spread: effect.spread,
        visible: true,
        blendMode: "NORMAL"
      };
    })
    .filter(Boolean);

  safelySet(() => {
    node.effects = nextEffects;
  });
}

function applyBlendMode(node, blendMode) {
  if (!blendMode || blendMode === "NORMAL") {
    return;
  }

  safelySet(() => {
    node.blendMode = blendMode;
  });
}

function applyTransform(node, transform) {
  if (!transform) {
    return;
  }

  if (Number.isFinite(transform.rotation)) {
    safelySet(() => {
      node.rotation = transform.rotation;
    });
  }
}

function toPaints(fills) {
  if (!Array.isArray(fills) || fills.length === 0) {
    return [];
  }

  return fills.map((fill) => {
    // Pillar 1a: native gradient paints (linear/radial) from the converter.
    if (fill && (fill.type === "GRADIENT_LINEAR" || fill.type === "GRADIENT_RADIAL")) {
      return {
        type: fill.type,
        gradientTransform: fill.gradientTransform || [[1, 0, 0], [0, 1, 0]],
        gradientStops: (fill.gradientStops || []).map((stop) => ({
          position: stop.position,
          color: {
            r: stop.color.r,
            g: stop.color.g,
            b: stop.color.b,
            a: stop.color.a === undefined ? 1 : stop.color.a
          }
        }))
      };
    }

    return {
      type: "SOLID",
      color: {
        r: fill.r,
        g: fill.g,
        b: fill.b
      },
      opacity: fill.a
    };
  });
}

function toFigmaColor(fill) {
  return {
    r: fill.r,
    g: fill.g,
    b: fill.b,
    a: fill.a
  };
}

function setNodePosition(node, modelNode, parent) {
  if (parent && "layoutMode" in parent && parent.layoutMode !== "NONE" && !modelNode.isAbsolute) {
    return;
  }

  const transform = modelNode.transform || {};
  node.x = (modelNode.x || 0) + (transform.translateX || 0);
  node.y = (modelNode.y || 0) + (transform.translateY || 0);
}

function safelySet(setter) {
  try {
    setter();
  } catch (error) {
    console.warn("Skipped unsupported Figma property", error);
  }
}

async function fetchImageBytes(imageUrl) {
  if (!imageUrl) {
    return null;
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return null;
    }
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (error) {
    return null;
  }
}

function emptySvg(modelNode) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${modelNode.width}" height="${modelNode.height}" viewBox="0 0 ${modelNode.width} ${modelNode.height}"></svg>`;
}
