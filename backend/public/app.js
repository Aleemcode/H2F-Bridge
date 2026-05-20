const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

document.documentElement.classList.remove("no-js");

if (!reduceMotion) {
  const revealTargets = document.querySelectorAll("[data-reveal]");
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    {
      rootMargin: "0px 0px -12% 0px",
      threshold: 0.16
    }
  );

  for (const target of revealTargets) {
    observer.observe(target);
  }

  const heroPanel = document.querySelector(".hero-panel");
  if (heroPanel) {
    window.addEventListener("pointermove", (event) => {
      const x = (event.clientX / window.innerWidth - 0.5) * 10;
      const y = (event.clientY / window.innerHeight - 0.5) * 10;
      heroPanel.style.setProperty("--tilt-x", `${y * -1}deg`);
      heroPanel.style.setProperty("--tilt-y", `${x}deg`);
    });
  }
}
