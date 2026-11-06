/* FIGYJ Sponsored Content Module
 * Exactly one configurable sponsored-content placement.
 * SmartLink destinations may rotate; no universal advertiser approval is implied.
 * No automatic navigation, popups, impressions, or background requests.
 */
const DEFAULT_SETTINGS = {
  enabled: false,
  title: "Discover something worth exploring",
  description: "Explore an external resource selected for FIGYJ readers.",
  ctaLabel: "Visit sponsored destination",
  destinationUrl: "",
  providerLinkConfirmed: false,
  advertiserReviewStatus: "not-reviewed",
  reviewedDestinationUrl: "",
  advertiserReviewNotes: "",
  disclosure: "Sponsored content"
};
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
function validDestination(value) { try { const url = new URL(value); return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password; } catch { return false; } }
export function createSponsoredContent(options = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...(options.placement || {}) };
  settings.enabled = settings.enabled === true;
  function render(mount) {
    if (!(mount instanceof Element)) throw new TypeError("A valid mount element is required.");
    mount.replaceChildren();
    if (!settings.enabled) { mount.hidden = true; return false; }
    mount.hidden = false;
    const hasDestination = validDestination(settings.destinationUrl);
    const destinationMarkup = hasDestination
      ? `<a class="figyj-sponsored-cta" data-figyj-sponsored-cta href="${escapeHTML(settings.destinationUrl)}" target="_blank" rel="sponsored noopener noreferrer">${escapeHTML(settings.ctaLabel)}</a>`
      : `<span class="figyj-sponsored-cta" aria-disabled="true">${escapeHTML(settings.ctaLabel)}</span>`;
    mount.innerHTML = `<aside class="figyj-sponsored-card" aria-label="Sponsored content"><p class="figyj-sponsored-label">${escapeHTML(settings.disclosure)}</p><h2 class="figyj-sponsored-title">${escapeHTML(settings.title)}</h2><p class="figyj-sponsored-description">${escapeHTML(settings.description)}</p><div class="figyj-sponsored-actions">${destinationMarkup}</div><p class="figyj-sponsored-meta">Advertisement · External link</p></aside>`;
    const link = mount.querySelector("[data-figyj-sponsored-cta]");
    if (link) link.addEventListener("click", () => mount.dispatchEvent(new CustomEvent("figyj:sponsored-click", {bubbles:true,detail:{destinationHost:new URL(settings.destinationUrl).hostname,occurredAt:new Date().toISOString()}})));
    return true;
  }
  function configure(patch = {}) {
    const allowed = ["enabled","title","description","ctaLabel","destinationUrl","providerLinkConfirmed","advertiserReviewStatus","reviewedDestinationUrl","advertiserReviewNotes","disclosure"];
    for (const key of allowed) if (Object.hasOwn(patch,key)) settings[key]=patch[key];
    settings.enabled=settings.enabled===true;
    return {...settings};
  }
  function getSettings(){return {...settings};}
  return Object.freeze({render,configure,getSettings});
}