import React from "react";
import { createRoot } from "react-dom/client";
import { motion, useReducedMotion } from "framer-motion";

const h = React.createElement;

const features = [
  {
    accent: "blue",
    icon: "01",
    title: "Capture from the browser",
    body: "Use the extension for authenticated dashboards, selected sections, and viewport-aware page capture."
  },
  {
    accent: "green",
    icon: "02",
    title: "Convert into a design model",
    body: "The backend resolves styles, assets, and layout hints before emitting a Figma-ready node tree."
  },
  {
    accent: "yellow",
    icon: "03",
    title: "Import with the Figma plugin",
    body: "Recent captures import into the open Figma file as frames, editable text, images, and vectors."
  }
];

const roadmap = [
  "Preset viewport rendering for public URLs, including 1440x1024, tablet, and mobile captures.",
  "Stronger landing-page capture with background images, lazy assets, font reports, and responsive checks.",
  "Team beta with capture retention controls, private .h2d files, and shareable import links."
];

function App() {
  const reduceMotion = useReducedMotion();
  const reveal = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 18 },
    visible: { opacity: 1, y: 0 }
  };

  return h(React.Fragment, null,
    h(motion.div, {
      className: "stripe",
      "aria-hidden": "true",
      initial: reduceMotion ? false : { opacity: 0, y: -24 },
      animate: reduceMotion ? undefined : { opacity: 1, y: 0 },
      transition: { duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }
    }),
    h(Header),
    h("main", null,
      h("section", { className: "hero section-shell" },
        h(motion.div, {
          className: "hero-copy",
          variants: reveal,
          initial: "hidden",
          animate: "visible",
          transition: { duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }
        },
          h("p", { className: "eyebrow" }, "Native import for designers"),
          h("h1", null, "Turn live HTML into editable Figma structure."),
          h("p", { className: "hero-lede" },
            "Capture web apps and landing pages from the browser, send them through a local converter, and import native Figma frames, text, images, SVG vectors, and auto-layout candidates."
          ),
          h("div", { className: "hero-actions", id: "beta" },
            h("a", { className: "button button-primary", href: "https://html-to-figma-backend.onrender.com/health" }, "Check hosted backend"),
            h("a", { className: "button button-secondary", href: "#roadmap" }, "See v2 roadmap")
          ),
          h("div", { className: "keyline" },
            ["1440 x 1024", "Native text", "Image fills", "Auto layout"].map((item) =>
              h("span", { className: "keycap", key: item }, item)
            )
          )
        ),
        h(CommandCard, { reduceMotion })
      ),
      h(WorkflowSection, { reveal }),
      h(FidelitySection),
      h(RoadmapSection),
      h(PrivacySection)
    ),
    h("footer", { className: "site-footer" },
      h("span", null, "HTML to Figma Bridge"),
      h("span", null, "Local alpha · built for editable design imports"),
      h("span", { className: "footer-links" },
        h("a", { href: "/privacy" }, "Privacy"),
        h("a", { href: "/terms" }, "Terms")
      )
    )
  );
}

function Header() {
  return h("header", { className: "site-nav" },
    h("a", { className: "brand", href: "/", "aria-label": "HTML to Figma Bridge home" },
      h("span", { className: "brand-mark" }, "⌘"),
      h("span", null, "HTML to Figma Bridge")
    ),
    h("nav", { "aria-label": "Main navigation" },
      h("a", { href: "#workflow" }, "Workflow"),
      h("a", { href: "#fidelity" }, "Fidelity"),
      h("a", { href: "#privacy" }, "Privacy"),
      h("a", { className: "nav-cta", href: "#beta" }, "Join beta")
    )
  );
}

function CommandCard({ reduceMotion }) {
  return h(motion.div, {
    className: "command-card",
    "aria-label": "Product workflow preview",
    initial: reduceMotion ? false : { opacity: 0, scale: 0.96, y: 24 },
    animate: reduceMotion ? undefined : { opacity: 1, scale: 1, y: 0 },
    transition: { duration: 0.75, delay: 0.1, ease: [0.2, 0.8, 0.2, 1] }
  },
    h("div", { className: "palette-header" },
      h("span", { className: "dot dot-red" }),
      h("span", { className: "dot dot-yellow" }),
      h("span", { className: "dot dot-green" }),
      h("span", { className: "palette-title" }, "Capture command"),
      h("span", { className: "keycap" }, "⌘ K")
    ),
    h("div", { className: "search-row" },
      h("span", { className: "search-icon" }, "⌕"),
      h("span", null, "Capture current page at 1440 x 1024")
    ),
    h("div", { className: "command-list" },
      features.map((feature, index) =>
        h(motion.div, {
          className: `command-row ${index === 0 ? "active" : ""}`,
          key: feature.title,
          initial: reduceMotion ? false : { opacity: 0, x: 18 },
          animate: reduceMotion ? undefined : { opacity: 1, x: 0 },
          transition: { duration: 0.48, delay: 0.22 + index * 0.08 }
        },
          h("span", { className: `tile tile-${feature.accent}` }, feature.icon),
          h("div", null,
            h("strong", null, feature.title),
            h("small", null, feature.body)
          ),
          h("span", { className: `status ${index === 0 ? "" : "muted"}` }, index === 0 ? "Ready" : "Beta")
        )
      )
    )
  );
}

function WorkflowSection({ reveal }) {
  return h(motion.section, {
    className: "section-shell split",
    id: "workflow",
    variants: reveal,
    initial: "hidden",
    whileInView: "visible",
    viewport: { once: true, margin: "-120px" },
    transition: { duration: 0.55 }
  },
    h("div", null,
      h("p", { className: "eyebrow" }, "Workflow"),
      h("h2", null, "Built as a bridge, not a flattened screenshot.")
    ),
    h("div", { className: "feature-grid" },
      features.map((feature) =>
        h("article", { className: "feature-card", key: feature.title },
          h("span", { className: `feature-icon accent-${feature.accent}` }, feature.icon),
          h("h3", null, feature.title),
          h("p", null, feature.body)
        )
      )
    )
  );
}

function FidelitySection() {
  return h("section", { className: "section-shell product-shot", id: "fidelity" },
    h("div", { className: "shot-copy" },
      h("p", { className: "eyebrow" }, "Fidelity targets"),
      h("h2", null, "Designed for app shells, dashboards, cards, navs, and landing pages."),
      h("p", null,
        "Version 1 focuses on editable structure with strong visual parity: text remains editable, images become fills, inline SVG stays vector-based, and common flex layouts become auto-layout frames when confidence is high enough."
      )
    ),
    h("div", { className: "metrics-grid" },
      h(Metric, { label: "Viewport", value: "1440x1024", detail: "Designer-first capture preset" }),
      h(Metric, { label: "Layers", value: "Native", detail: "Frames, text, vectors, fills" }),
      h(Metric, { label: "Privacy", value: "Local beta", detail: "User-triggered capture only" })
    )
  );
}

function Metric({ label, value, detail }) {
  return h("div", { className: "metric-card" },
    h("span", null, label),
    h("strong", null, value),
    h("small", null, detail)
  );
}

function RoadmapSection() {
  return h("section", { className: "section-shell roadmap", id: "roadmap" },
    h("div", null,
      h("p", { className: "eyebrow" }, "Roadmap"),
      h("h2", null, "What v2 should unlock.")
    ),
    h("div", { className: "roadmap-list" },
      roadmap.map((item, index) =>
        h("div", { className: "roadmap-item", key: item },
          h("span", null, index + 1),
          h("p", null, item)
        )
      )
    )
  );
}

function PrivacySection() {
  return h("section", { className: "section-shell privacy-panel", id: "privacy" },
    h("div", null,
      h("p", { className: "eyebrow" }, "Privacy posture"),
      h("h2", null, "Explicit capture. Short retention. No training by default.")
    ),
    h("p", null,
      "This beta is designed around consent: captures are user-triggered, sensitive form fields should be excluded, and private-mode export can keep the conversion local. Before public distribution, the product should ship with deletion controls, a plain-language privacy policy, and capture retention limits."
    )
  );
}

createRoot(document.getElementById("root")).render(h(App));
