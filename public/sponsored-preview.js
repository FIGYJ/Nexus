import { createSponsoredContent } from "/assets/sponsored-content.js";

const sponsored = createSponsoredContent({
  placement: {
    enabled: true,
    title: "Discover something worth exploring",
    description: "Explore an external resource selected for FIGYJ readers. Destination details may vary by SmartLink offer.",
    ctaLabel: "Visit sponsored destination",
    destinationUrl: "",
    providerLinkConfirmed: false,
    advertiserReviewStatus: "not-reviewed",
    reviewedDestinationUrl: "",
    advertiserReviewNotes: "",
    disclosure: "Sponsored content"
  }
});

sponsored.render(document.getElementById("figyj-sponsored-placement"));

document.addEventListener("figyj:sponsored-click", (event) => {
  // Demo listener only. No analytics request is sent.
  console.info("Genuine CTA interaction in preview:", event.detail);
});