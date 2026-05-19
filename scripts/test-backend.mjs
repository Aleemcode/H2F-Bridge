import assert from "node:assert/strict";
import { buildDesignModel } from "../shared/converter.mjs";

const sampleCapture = {
  appVersion: "0.2.0",
  capture: {
    id: "sample-capture",
    sourceUrl: "https://example.com",
    title: "Example Landing Page",
    capturedAt: new Date().toISOString(),
    mode: "page",
    viewport: {
      width: 1440,
      height: 1024,
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 2
    },
    frame: {
      x: 0,
      y: 0,
      width: 1440,
      height: 980
    },
    rootNodeId: "capture-root",
    selectionBounds: null
  },
  assets: [
    {
      id: "asset-1",
      kind: "image",
      url: "https://example.com/hero.png",
      proxyUrl: "http://localhost:3210/assets/sample-capture/asset-1",
      mimeType: "image/png"
    }
  ],
  nodes: [
    node("capture-root", null, "frame", {
      x: 0, y: 0, width: 1440, height: 980, display: "block", position: "relative"
    }, {
      backgroundColor: "rgb(255, 255, 255)", borderColor: "rgba(0,0,0,0)", borderWidth: 0, boxShadow: "none", opacity: 1, overflow: "visible"
    }, "Capture Root"),
    node("nav", "capture-root", "frame", {
      x: 80, y: 48, width: 1280, height: 64, display: "flex", position: "relative",
      paddingTop: 16, paddingRight: 20, paddingBottom: 16, paddingLeft: 20,
      gap: 24, rowGap: 24, columnGap: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "center", alignContent: "stretch", flexWrap: "nowrap"
    }, {
      backgroundColor: "rgb(255, 255, 255)", borderColor: "rgba(0,0,0,0)", borderWidth: 0, boxShadow: "none", opacity: 1, overflow: "visible"
    }, "nav"),
    textNode("nav-title", "nav", 24, 20, 120, 32, "Acme", "rgb(17, 17, 17)"),
    node("nav-actions", "nav", "frame", {
      x: 1100, y: 16, width: 160, height: 32, display: "flex", position: "relative",
      paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
      gap: 12, rowGap: 12, columnGap: 12, flexDirection: "row", justifyContent: "flex-start", alignItems: "center", alignContent: "stretch", flexWrap: "nowrap"
    }, {
      backgroundColor: "rgba(0, 0, 0, 0)", borderColor: "rgba(0,0,0,0)", borderWidth: 0, boxShadow: "none", opacity: 1, overflow: "visible"
    }, "actions"),
    textNode("nav-login", "nav-actions", 0, 0, 56, 20, "Login", "rgb(17, 17, 17)"),
    textNode("nav-signup", "nav-actions", 68, 0, 92, 20, "Get Started", "rgb(17, 17, 17)"),
    node("hero", "capture-root", "frame", {
      x: 80, y: 160, width: 1280, height: 560, display: "flex", position: "relative",
      paddingTop: 48, paddingRight: 48, paddingBottom: 48, paddingLeft: 48,
      gap: 40, rowGap: 40, columnGap: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "center", alignContent: "stretch", flexWrap: "nowrap"
    }, {
      backgroundColor: "rgb(246, 244, 239)", borderColor: "rgb(230, 224, 214)", borderWidth: 1, boxShadow: "0px 20px 40px rgba(0, 0, 0, 0.08)", opacity: 1, overflow: "hidden",
      borderRadiusTopLeft: 24, borderRadiusTopRight: 24, borderRadiusBottomRight: 24, borderRadiusBottomLeft: 24
    }, "hero"),
    node("hero-copy", "hero", "frame", {
      x: 48, y: 72, width: 520, height: 360, display: "flex", position: "relative",
      paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
      gap: 18, rowGap: 18, columnGap: 18, flexDirection: "column", justifyContent: "flex-start", alignItems: "flex-start", alignContent: "stretch", flexWrap: "nowrap"
    }, {
      backgroundColor: "rgba(0, 0, 0, 0)", borderColor: "rgba(0,0,0,0)", borderWidth: 0, boxShadow: "none", opacity: 1, overflow: "visible"
    }, "hero-copy"),
    textNode("hero-headline", "hero-copy", 0, 0, 420, 100, "Turn websites into editable Figma structure.", "rgb(17, 17, 17)", 56, 700),
    textNode("hero-body", "hero-copy", 0, 118, 460, 72, "Capture layout, text, and images, then import the result as real design layers.", "rgb(95, 95, 95)", 18, 400),
    node("hero-cta", "hero-copy", "frame", {
      x: 0, y: 212, width: 172, height: 52, display: "flex", position: "relative",
      paddingTop: 14, paddingRight: 20, paddingBottom: 14, paddingLeft: 20,
      gap: 8, rowGap: 8, columnGap: 8, flexDirection: "row", justifyContent: "center", alignItems: "center", alignContent: "stretch", flexWrap: "nowrap"
    }, {
      backgroundColor: "rgb(17, 124, 242)", borderColor: "rgba(0,0,0,0)", borderWidth: 0, boxShadow: "rgba(16, 40, 255, 0.25) 0px 10px 24px 0px, rgba(0, 0, 0, 0.12) 0px 2px 6px 0px", opacity: 1, overflow: "visible",
      borderRadiusTopLeft: 16, borderRadiusTopRight: 16, borderRadiusBottomRight: 16, borderRadiusBottomLeft: 16
    }, "hero-cta"),
    textNode("hero-cta-text", "hero-cta", 20, 14, 132, 20, "Import to Figma", "rgb(255, 255, 255)", 16, 700),
    node("shadowless-button", "hero-copy", "frame", {
      x: 0, y: 284, width: 144, height: 42, display: "flex", position: "relative",
      paddingTop: 0, paddingRight: 14, paddingBottom: 0, paddingLeft: 14,
      gap: 0, rowGap: 0, columnGap: 0, flexDirection: "row", justifyContent: "center", alignItems: "center", alignContent: "stretch", flexWrap: "nowrap"
    }, {
      backgroundColor: "rgb(16, 40, 255)", borderColor: "rgba(0,0,0,0)", borderWidth: 0, boxShadow: "none", opacity: 1, overflow: "visible",
      borderRadiusTopLeft: 8, borderRadiusTopRight: 8, borderRadiusBottomRight: 8, borderRadiusBottomLeft: 8
    }, "button"),
    node("toggle-label-wrapper", "hero-copy", "frame", {
      x: 0, y: 340, width: 56, height: 20, display: "block", position: "relative"
    }, {
      backgroundColor: "rgba(0,0,0,0)", borderColor: "rgba(0,0,0,0)", borderWidth: 0, boxShadow: "none", opacity: 1, overflow: "visible"
    }, "strong"),
    textNode("toggle-label", "toggle-label-wrapper", 0, 1, 55.55, 18, "Enabled", "rgb(17, 24, 39)", 14, 700),
    {
      id: "hero-image",
      parentId: "hero",
      childIndex: 1,
      domDepth: 2,
      kind: "image",
      tagName: "img",
      name: "hero-image",
      visible: true,
      layout: {
        x: 736, y: 80, width: 456, height: 320, display: "block", position: "relative",
        paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
        gap: 0, rowGap: 0, columnGap: 0, flexDirection: "row", justifyContent: "flex-start", alignItems: "stretch", alignContent: "stretch", flexWrap: "nowrap"
      },
      style: {
        backgroundColor: "rgba(0, 0, 0, 0)", borderColor: "rgba(0,0,0,0)", borderWidth: 0, boxShadow: "none", opacity: 1, overflow: "visible",
        borderRadiusTopLeft: 20, borderRadiusTopRight: 20, borderRadiusBottomRight: 20, borderRadiusBottomLeft: 20
      },
      imageUrl: "https://example.com/hero.png",
      assetId: "asset-1"
    },
    node("feature-grid", "capture-root", "frame", {
      x: 80, y: 760, width: 600, height: 160, display: "grid", position: "relative",
      gap: 16, rowGap: 12, columnGap: 16,
      gridTemplateColumns: "1fr 1fr 1fr",
      gridTemplateRows: "72px 72px",
      gridAutoFlow: "row"
    }, {
      backgroundColor: "rgb(248, 248, 248)", borderColor: "rgba(0,0,0,0)", borderWidth: 0, boxShadow: "none", opacity: 1, overflow: "visible"
    }, "feature-grid"),
    node("grid-card", "feature-grid", "frame", {
      x: 0, y: 0, width: 184, height: 72, display: "block", position: "relative"
    }, {
      backgroundColor: "rgb(255, 255, 255)", borderColor: "rgb(220, 220, 220)", borderWidth: 1, boxShadow: "none", opacity: 1, overflow: "visible"
    }, "grid-card"),
    textNode("pseudo-badge", "grid-card", 12, 12, 60, 20, "NEW", "rgb(17, 17, 17)", 12, 700, {
      source: { kind: "pseudo-element", pseudo: "::before" },
      style: {
        mixBlendMode: "multiply"
      }
    }),
    node("filtered-card", "feature-grid", "frame", {
      x: 200, y: 0, width: 184, height: 72, display: "block", position: "relative"
    }, {
      backgroundColor: "rgba(255, 255, 255, 0.7)",
      borderColor: "rgba(0,0,0,0)",
      borderWidth: 0,
      boxShadow: "none",
      opacity: 0.9,
      overflow: "visible",
      filter: "blur(2px)",
      mixBlendMode: "multiply",
      transform: "matrix(0.984807753, 0.173648178, -0.173648178, 0.984807753, 8, 4)"
    }, "filtered-card"),
    node("sidebar", "capture-root", "frame", {
      x: 0, y: 0, width: 300, height: 980, display: "block", position: "relative"
    }, {
      backgroundColor: "rgb(0, 0, 0)",
      borderColor: "rgba(0,0,0,0)",
      borderWidth: 0,
      borderRightWidth: 1,
      borderRightColor: "rgb(36, 36, 36)",
      boxShadow: "none",
      opacity: 1,
      overflow: "hidden"
    }, "sidebar")
  ]
};

const designModel = buildDesignModel(sampleCapture);

assert.equal(designModel.root.type, "frame");
assert.equal(designModel.root.name, "Html");
assert.equal(designModel.root.children[0].autoLayout.mode, "HORIZONTAL");
assert.equal(designModel.root.children[1].autoLayout.mode, "HORIZONTAL");
assert.equal(designModel.root.children[1].children[0].autoLayout.mode, "VERTICAL");
assert.equal(designModel.root.children[1].children[0].children[2].autoLayout.mode, "HORIZONTAL");
assert.equal(designModel.root.children[1].children[1].type, "image");
assert.equal(designModel.root.children[1].children[1].proxiedImageUrl, "http://localhost:3210/assets/sample-capture/asset-1");
assert.equal(designModel.root.children[1].children[0].children[0].type, "text");
assert.equal(designModel.root.children[1].children[0].children[1].layoutSizingHorizontal, "FILL");
assert.equal(designModel.root.children[1].children[0].children[1].width, 520);
assert.equal(designModel.root.children[1].children[0].children[2].effects.length, 2);
assert.equal(designModel.root.children[1].children[0].children[2].effects[0].offsetY, 10);
assert.equal(Math.round(designModel.root.children[1].children[0].children[2].effects[0].color.b * 255), 255);
assert.equal(designModel.root.children[1].children[0].children[2].effects[0].color.a, 0.25);
assert.equal(designModel.root.children[1].effects[0].offsetY, 7);
assert.equal(designModel.root.children[1].effects[0].blur, 12);
assert.equal(designModel.root.autoLayout, null);
assert.equal(
  designModel.root.children[1].children[0].children[2].autoLayout.counterAxisAlignItems,
  "CENTER"
);

const stretchCapture = structuredClone(sampleCapture);
stretchCapture.nodes[1].layout.alignItems = "stretch";
const stretchModel = buildDesignModel(stretchCapture);
assert.equal(stretchModel.root.children[0].autoLayout.counterAxisAlignItems, "MIN");

const nodesById = flattenDesignNodes(designModel.root);
assert.equal(nodesById.get("shadowless-button").effects[0].offsetY, 8);
assert.equal(nodesById.get("shadowless-button").effects[0].blur, 20);
assert.equal(nodesById.get("shadowless-button").effects[0].color.a, 0.2);
assert.equal(nodesById.get("toggle-label").layoutSizingHorizontal, "HUG");
assert.ok(nodesById.get("toggle-label").width >= 55);
assert.equal(nodesById.get("feature-grid").gridLayout.columns.length, 3);
assert.equal(nodesById.get("feature-grid").gridLayout.strategy, "auto-layout-grid");
assert.equal(nodesById.get("feature-grid").gridLayout.columnCount, 3);
assert.equal(nodesById.get("feature-grid").gridLayout.rowCount, 2);
assert.equal(nodesById.get("grid-card").layoutSizingHorizontal, "FILL");
assert.equal(nodesById.get("grid-card").layoutSizingVertical, "HUG");
assert.equal(nodesById.get("pseudo-badge").type, "text");
assert.equal(nodesById.get("pseudo-badge").name, "Text");
assert.equal(nodesById.get("pseudo-badge").blendMode, "MULTIPLY");
assert.equal(nodesById.get("filtered-card").blendMode, "MULTIPLY");
assert.equal(nodesById.get("filtered-card").effects[0].type, "LAYER_BLUR");
assert.equal(Math.round(nodesById.get("filtered-card").transform.rotation), 10);
assert.equal(nodesById.get("filtered-card").transform.translateX, 8);
assert.equal(nodesById.get("sidebar-border-right").type, "shape");
assert.equal(nodesById.get("sidebar-border-right").width, 1);

console.log("Backend conversion test passed.");

function flattenDesignNodes(root) {
  const map = new Map();
  const visit = (node) => {
    map.set(node.id, node);
    for (const child of node.children || []) {
      visit(child);
    }
  };
  visit(root);
  return map;
}

function node(id, parentId, kind, layout, style, name) {
  return {
    id,
    parentId,
    childIndex: 0,
    domDepth: 1,
    kind,
    tagName: kind === "frame" ? "div" : kind,
    name,
    semanticRole: inferSampleSemanticRole(id, name, kind),
    source: {
      kind: "test-node"
    },
    visible: true,
    layout: {
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
      zIndex: 0,
      ...layout
    },
    style: {
      borderStyle: "solid",
      borderRadiusTopLeft: 0,
      borderRadiusTopRight: 0,
      borderRadiusBottomRight: 0,
      borderRadiusBottomLeft: 0,
      color: "rgb(17, 17, 17)",
      fontFamily: "Inter",
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 20,
      letterSpacing: 0,
      textAlign: "left",
      textTransform: "none",
      ...style
    },
    rawStyle: {
      boxShadow: style.boxShadow || "none",
      webkitBoxShadow: style.webkitBoxShadow || "",
      filter: style.filter || "none",
      backdropFilter: style.backdropFilter || "none"
    }
  };
}

function inferSampleSemanticRole(id, name, kind) {
  const value = `${id} ${name} ${kind}`.toLowerCase();
  if (value.includes("button") || value.includes("cta")) {
    return "button";
  }
  if (value.includes("card")) {
    return "card";
  }
  return kind === "text" ? "text" : "container";
}

function textNode(id, parentId, x, y, width, height, value, color, fontSize = 16, fontWeight = 400, overrides = {}) {
  const base = {
    id,
    parentId,
    childIndex: 0,
    domDepth: 2,
    kind: "text",
    tagName: "#text",
    name: value,
    textContent: value,
    semanticRole: "text",
    source: {
      kind: "test-text-node"
    },
    visible: true,
    layout: {
      x,
      y,
      width,
      height,
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
      backgroundColor: "rgba(0, 0, 0, 0)",
      borderColor: "rgba(0, 0, 0, 0)",
      borderWidth: 0,
      borderStyle: "solid",
      borderRadiusTopLeft: 0,
      borderRadiusTopRight: 0,
      borderRadiusBottomRight: 0,
      borderRadiusBottomLeft: 0,
      boxShadow: "none",
      opacity: 1,
      overflow: "visible",
      color,
      fontFamily: "Inter",
      fontSize,
      fontWeight,
      lineHeight: fontSize * 1.2,
      letterSpacing: 0,
      textAlign: "left",
      textTransform: "none"
    },
    rawStyle: {
      boxShadow: "none",
      filter: "none",
      backdropFilter: "none"
    }
  };

  return {
    ...base,
    ...overrides,
    style: {
      ...base.style,
      ...(overrides.style || {})
    }
  };
}
