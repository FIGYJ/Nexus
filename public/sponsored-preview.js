import { createSponsoredContent } from "/assets/sponsored-content.js";

const sponsored = createSponsoredContent({
  placement: {
    enabled: true,
    title: "Discover something worth exploring",
    description: "Explore an external resource selected for FIGYJ readers. Destination details have not yet been verified.",
    ctaLabel: "Visit sponsored destination",
    destinationUrl: "",
    destinationVerified: false,
    disclosure: "Sponsored content"
  }
});

sponsored.render(document.getElementById("figyj-sponsored-placement"));

document.addEventListener("figyj:sponsored-click", (event) => {
  // Demo listener only. No analytics request is sent.
  console.info("Genuine CTA interaction in preview:", event.detail);
});