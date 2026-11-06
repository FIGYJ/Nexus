/* FIGYJ Sponsored Content Module
 * Exactly one configurable sponsored-content placement.
 * No automatic navigation, popups, impressions, or background requests.
 */
const DEFAULT_SETTINGS = {
  enabled: false,
  title: "Discover something worth exploring",
  description: "Explore an external resource selected for FIGYJ readers. Destination details have not yet been verified.",
  ctaLabel: "Visit sponsored destination",
  destinationUrl: "",
  destinationVerified: false,
  disclosure: "Sponsored content"
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
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(options.placement || {})
  };
  settings.enabled = settings.enabled === true;
  settings.destinationVerified = settings.destinationVerified === true;

  function render(mount) {
    if (!(mount instanceof Element)) throw new TypeError("A valid mount element is required.");
    mount.replaceChildren();
    if (!settings.enabled) {
      mount.hidden = true;
      return false;
    }
    mount.hidden = false;
    const hasDestination = validDestination(settings.destinationUrl);
    const title = escapeHTML(settings.title);
    const description = escapeHTML(settings.description);
    const cta = escapeHTML(settings.ctaLabel);
    const disclosure = escapeHTML(settings.disclosure);
    const destinationMarkup = hasDestination
      ? `<a class="figyj-sponsored-cta" data-figyj-sponsored-cta href="${escapeHTML(settings.destinationUrl)}" target="_blank" rel="sponsored noopener noreferrer">${cta}</a>`
      : `<span class="figyj-sponsored-cta" aria-disabled="true">${cta}</span>`;
    const verification = settings.destinationVerified && hasDestination
      ? "Destination details verified"
      : "Destination details not verified";
    mount.innerHTML = `<aside class="figyj-sponsored-card" aria-label="Sponsored content">
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
          detail: { destinationHost: new URL(settings.destinationUrl).hostname, occurredAt: new Date().toISOString() }
        }));
      });
    }
    return true;
  }

  function configure(patch = {}) {
    const allowed = ["enabled", "title", "description", "ctaLabel", "destinationUrl", "destinationVerified", "disclosure"];
    for (const key of allowed) {
      if (Object.hasOwn(patch, key)) settings[key] = patch[key];
    }
    settings.enabled = settings.enabled === true;
    settings.destinationVerified = settings.destinationVerified === true;
    return { ...settings };
  }

  function getSettings() {
    return { ...settings };
  }

  return Object.freeze({ render, configure, getSettings });
}