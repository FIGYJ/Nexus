const placementRoot = document.getElementById("figyj-sponsored-placement");
const placementState = document.getElementById("placement-state");
const verificationDetails = document.getElementById("verification-details");
const loadedAt = document.getElementById("loaded-at");
const refreshButton = document.getElementById("refresh-preview");

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  return element;
}

function detailRow(label, value, statusClass = "") {
  const wrapper = node("div", "verification-item");
  wrapper.append(node("dt", "", label));
  const dd = node("dd");
  dd.append(node(statusClass ? "span" : "span", statusClass, value));
  wrapper.append(dd);
  return wrapper;
}

function reviewLabel(status) {
  switch (status) {
    case "reviewed-no-concern": return { label: "Reviewed — no concern recorded", className: "status-neutral" };
    case "concern-found": return { label: "Concern found — requires attention", className: "status-warning" };
    default: return { label: "Not reviewed", className: "status-muted" };
  }
}

function renderSavedPlacement(data) {
  if (!data || !data.placement || typeof data.placement !== "object") {
    throw new Error("The saved placement response is incomplete.");
  }

  const saved = data.placement;
  placementRoot.replaceChildren();

  const card = node("aside", "sponsored-card");
  card.setAttribute("aria-label", "Saved sponsored content creative");
  card.append(node("p", "sponsored-disclosure", saved.disclosure || "Sponsored content"));
  card.append(node("h3", "sponsored-title", saved.title || "Untitled sponsored placement"));
  card.append(node("p", "sponsored-description", saved.description || ""));

  const actions = node("div", "sponsored-actions");
  const cta = node("button", "sponsored-cta is-disabled", saved.ctaLabel || "Visit sponsored destination");
  cta.type = "button";
  cta.disabled = true;
  cta.setAttribute("aria-disabled", "true");
  cta.title = "Disabled in read-only preview";
  actions.append(cta);
  actions.append(node("span", "preview-disabled-label", "Outbound link disabled in preview"));
  card.append(actions);
  card.append(node("p", "sponsored-meta", "Advertisement · Preview only · No advertising events"));
  placementRoot.append(card);

  const enabled = saved.enabled === true;
  placementState.textContent = enabled ? "Placement enabled" : "Placement disabled";
  placementState.className = "status-pill " + (enabled ? "status-enabled" : "status-muted");

  const provider = saved.providerLinkConfirmed === true
    ? { label: "Confirmed in provider account", className: "status-enabled" }
    : { label: "Not confirmed", className: "status-muted" };
  const review = reviewLabel(saved.advertiserReviewStatus);

  verificationDetails.replaceChildren(
    detailRow("Provider-link confirmation", provider.label, provider.className),
    detailRow("Advertiser landing-page review", review.label, review.className),
    detailRow("Saved SmartLink destination", saved.destinationUrl || "No destination URL saved", "value-plain")
  );

  if (saved.advertiserReviewStatus && saved.advertiserReviewStatus !== "not-reviewed") {
    if (saved.reviewedDestinationUrl) {
      verificationDetails.append(detailRow("Exact landing page reviewed", saved.reviewedDestinationUrl, "value-plain"));
    }
    if (saved.advertiserReviewNotes) {
      verificationDetails.append(detailRow("Review notes", saved.advertiserReviewNotes, "value-notes"));
    }
  }

  loadedAt.textContent = "Read from saved settings: " + new Date().toLocaleString();
}

async function loadSavedPlacement() {
  refreshButton.disabled = true;
  refreshButton.textContent = "Refreshing…";
  placementState.textContent = "Loading…";
  placementState.className = "status-pill status-muted";
  placementRoot.replaceChildren(node("p", "loading", "Loading the saved placement…"));
  loadedAt.textContent = "";

  try {
    const response = await fetch("/api/sponsored-config", {
      method: "GET",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });
    if (!response.ok) {
      throw new Error("Could not load saved settings (HTTP " + response.status + ").");
    }
    const data = await response.json();
    renderSavedPlacement(data);
  } catch (error) {
    placementRoot.replaceChildren(node("p", "load-error", error.message || "Could not load the saved placement."));
    placementState.textContent = "Settings unavailable";
    placementState.className = "status-pill status-warning";
    verificationDetails.replaceChildren(
      detailRow("Provider-link confirmation", "Unavailable — configuration could not be loaded", "status-muted"),
      detailRow("Advertiser landing-page review", "Unavailable — configuration could not be loaded", "status-muted")
    );
    loadedAt.textContent = "Refresh the page after the service or storage connection is restored.";
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh saved settings";
  }
}

refreshButton.addEventListener("click", loadSavedPlacement);
loadSavedPlacement();