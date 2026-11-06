/* FIGYJ Sponsored Content Module
 * Four independent placement configurations.
 * No automatic navigation, popups, impressions, or background requests.
 */
const PLACEMENTS = ["article-body", "after-article", "related-articles", "homepage"];
const DEFAULT_COPY = {
  title: "Discover something worth exploring",
  description: "Explore an external resource selected for FIGYJ readers. Destination details have not yet been verified.",
  ctaLabel: "Visit sponsored destination"
};

const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

function validDestination(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function createSponsoredContent(options = {}) {
  const settings = Object.fromEntries(PLACEMENTS.map((placement) => {
    const supplied = options.placements?.[placement] || {};
    return [placement, {
      enabled: supplied.enabled === true,
      title: supplied.title || options.title || DEFAULT_COPY.title,
      description: supplied.description || options.description || DEFAULT_COPY.description,
      ctaLabel: supplied.ctaLabel || options.ctaLabel || DEFAULT_COPY.ctaLabel,
      destinationUrl: supplied.destinationUrl || options.destinationUrl || "",
      destinationVerified: supplied.destinationVerified === true,
      disclosure: supplied.disclosure || "Sponsored content"
    }];
  }));

  function render(placement, mount) {
    if (!PLACEMENTS.includes(placement)) throw new Error("Unknown FIGYJ sponsored placement.");
    if (!(mount instanceof Element)) throw new TypeError("A valid mount element is required.");
    const config = settings[placement];
    mount.replaceChildren();
    if (!config.enabled) {
      mount.hidden = true;
      return false;
    }
    mount.hidden = false;
    const hasDestination = validDestination(config.destinationUrl);
    const title = escapeHTML(config.title);
    const description = escapeHTML(config.description);
    const cta = escapeHTML(config.ctaLabel);
    const disclosure = escapeHTML(config.disclosure);
    const destinationMarkup = hasDestination
      ? `<a class="figyj-sponsored-cta" data-figyj-sponsored-cta href="${escapeHTML(config.destinationUrl)}" target="_blank" rel="sponsored noopener noreferrer">${cta}</a>`
      : `<span class="figyj-sponsored-cta" aria-disabled="true">${cta}</span>`;
    const verification = config.destinationVerified
      ? "Destination details verified"
      : "Destination details not verified";
    mount.innerHTML = `<aside class="figyj-sponsored-card" data-placement="${placement}" aria-label="Sponsored content">
        <p class="figyj-sponsored-label">${disclosure}</p>
        <h2 class="figyj-sponsored-title">${title}</h2>
        <p class="figyj-sponsored-description">${description}</p>
        <div class="figyj-sponsored-actions">${destinationMarkup}<span class="figyj-sponsored-disclosure">${verification}</span></div>
        <p class="figyj-sponsored-meta">Advertisement · External link</p>
      </aside>`;
    const link = mount.querySelector("[data-figyj-sponsored-cta]");
    if (link) {
      link.addEventListener("click", () => {
        mount.dispatchEvent(new CustomEvent("figyj:sponsored-click", {
          bubbles: true,
          detail: { placement, destinationHost: new URL(config.destinationUrl).hostname, occurredAt: new Date().toISOString() }
        }));
      }, { once: false });
    }
    return true;
  }

  function configure(placement, patch = {}) {
    if (!PLACEMENTS.includes(placement)) throw new Error("Unknown FIGYJ sponsored placement.");
    const allowed = ["enabled", "title", "description", "ctaLabel", "destinationUrl", "destinationVerified", "disclosure"];
    for (const key of allowed) {
      if (Object.hasOwn(patch, key)) settings[placement][key] = patch[key];
    }
    return { ...settings[placement] };
  }

  function getSettings(placement) {
    if (!PLACEMENTS.includes(placement)) throw new Error("Unknown FIGYJ sponsored placement.");
    return { ...settings[placement] };
  }

  return Object.freeze({ render, configure, getSettings, placements: [...PLACEMENTS] });
}

export { PLACEMENTS };
