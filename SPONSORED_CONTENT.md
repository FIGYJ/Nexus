# FIGYJ Sponsored Content Module

## Files
- `public/sponsored-content.js`: reusable browser module.
- `public/sponsored-content.css`: responsive card styling.
- `public/sponsored-preview.html`: four-placement visual preview.
- Assets are served by the Nexus service under `/assets/`.

## Preview
After the Render deployment finishes, open:

`https://YOUR-SERVICE.onrender.com/sponsored-preview.html`

The preview intentionally contains no destination URL. Its buttons are disabled, so opening the page cannot open a SmartLink or create advertising activity.

## Four independent placements
The module supports:
- `article-body`
- `after-article`
- `related-articles`
- `homepage`

Each placement has its own `enabled`, `title`, `description`, `ctaLabel`, `destinationUrl`, `destinationVerified`, and `disclosure` settings.

## Browser integration example

Load the module and stylesheet from the same-origin Nexus service:

```html
<link rel="stylesheet" href="https://YOUR-SERVICE.onrender.com/assets/sponsored-content.css">
<div id="figyj-sponsored-article-body"></div>
<script type="module">
  import { createSponsoredContent } from "https://YOUR-SERVICE.onrender.com/assets/sponsored-content.js";

  const sponsored = createSponsoredContent({
    placements: {
      "article-body": {
        enabled: true,
        title: "Discover something worth exploring",
        description: "Explore this sponsored external resource.",
        ctaLabel: "Visit sponsored destination",
        destinationUrl: "PASTE_THE_PUBLIC_MONETAG_SMARTLINK_HERE",
        destinationVerified: false
      },
      "after-article": { enabled: false },
      "related-articles": { enabled: false },
      "homepage": { enabled: false }
    }
  });

  sponsored.render(
    "article-body",
    document.getElementById("figyj-sponsored-article-body")
  );
</script>
```

Replace the placeholder destination string only when you are ready to publish the link. The SmartLink configuration check in the admin service does not supply a verified destination title or description. Keep `destinationVerified: false` unless the destination details have actually been verified.

For the other placements, create a separate mount element and call `render` with that placement name. Their settings are not coupled.

## Genuine outbound-click event hook
The card dispatches a bubbling `figyj:sponsored-click` browser event only when a reader activates its enabled CTA anchor:

```js
document.addEventListener("figyj:sponsored-click", (event) => {
  const { placement, destinationHost, occurredAt } = event.detail;
  // Send to a FIGYJ-owned analytics endpoint only after that endpoint
  // has been implemented and its privacy/retention rules are defined.
});
```

The module itself sends no analytics request, creates no impression event, and does not auto-open or prefetch advertising destinations. The event is an interaction hook, not a persisted analytics system. Keep its metrics separate from pageviews, Mondiad reporting, and simulated lab data.

## Security and editorial notes
- Keep the Monetag URL out of server environment-variable responses and never expose admin tokens in Blogger.
- A CTA is an ordinary reader-initiated HTTPS link with `rel="sponsored noopener noreferrer"`.
- No destination URL means the CTA is disabled.
- Use clear sponsored disclosure. Do not present paid placements as editorial recommendations.
- Destination metadata is placeholder copy until independently verified.
- The module does not inspect or follow Monetag redirect destinations.
