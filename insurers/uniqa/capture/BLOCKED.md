# UNIQA – direct calculator blocked by anti-bot protection

The online.uniqa.sk / www.uniqa.sk/online/poistenie-majetku/ calculator was
explored and a full Playwright flow was built (type selection, property
details, address autocomplete, sum insured). All form steps fill and
validate correctly, but the final submit to
`POST /rest/public/v1/calculator/household/calculate` always returns:

    {"errors":[{"error":"Ochrana proti spamu"}],"result":false}

This is an invisible reCAPTCHA v3 anti-spam check tied to IP reputation /
browser-automation fingerprint scoring, not to any specific form field.
Tried: realistic desktop Chrome UA, `--disable-blink-features=AutomationControlled`,
sk-SK locale/timezone, human-paced typing and real mouse movement/click
sequences instead of JS-dispatched clicks — all filled the form correctly
but the backend score check still rejects the request every time.

## Workaround in use: broker comparison widget

`scripts/collect-uniqa.js` collects UNIQA's price through a different route:
a licensed insurance broker's live multi-insurer comparison widget
(`netfinancie.sk`, run by Klik.cz & ePojisteni.cz s.r.o., embedded e.g. on
`financnykompas.sk/poistenie-nehnutelnosti-domacnosti`). That widget fetches
real quotes from several insurers — including UNIQA ("Domov & bezpečie",
tiers PLUS/EXTRA) — via its own server-to-server integration with each
insurer, so it is not subject to UNIQA's own client-facing bot check.

Caveats, recorded as a `doplnujuce_info` note on every collected row:
- The broker's wizard applies its own default risk/coverage selection,
  which may not exactly match the coverage scope requested on the other
  insurers' direct calculators — treat this as a good-faith proxy for
  UNIQA's pricing, not a byte-for-byte equivalent collection method.
- For the two house profiles, the broker requires a floor-by-floor area
  breakdown we don't otherwise track; the total living area is split evenly
  between ground floor and upper floor(s) as a reasonable approximation.
- Only UNIQA's own offer cards are kept from that comparison; the other
  insurers shown there are collected directly instead, through their own
  calculators, to keep each insurer's number coming from its primary source.
