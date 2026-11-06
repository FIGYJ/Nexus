import { createSponsoredContent } from "/assets/sponsored-content.js";

const sponsored = createSponsoredContent({
  placements: {
    "article-body": { enabled: true },
    "after-article": { enabled: true, title: "A resource for curious readers" },
    "related-articles": { enabled: true },
    "homepage": { enabled: true, description: "A sponsored resource presented separately from editorial recommendations." }
  }
});

for (const placement of sponsored.placements) {
  sponsored.render(placement, document.getElementById("figyj-" + placement));
}

document.addEventListener("figyj:sponsored-click", (event) => {
  // Demo listener only. No analytics request is sent.
  console.info("Genuine CTA interaction in preview:", event.detail);
});
