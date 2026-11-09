"""Browser regression test: accepting PO discrepancies across every demo PO.
Run against the dev server:  python3 tests/browser/po_acceptance.py
Uses the extended 20-quote sample (pre-extracted, no AI calls). Exits non-zero on any failure."""
import asyncio, re, sys
from pathlib import Path
from playwright.async_api import async_playwright

URL = "http://localhost:8080"
SHOTS = Path("/tmp/browser/po-accept"); SHOTS.mkdir(parents=True, exist_ok=True)
JUST = "Reviewed against the synthetic purchase policy and accepted (demo)."
# scenario -> (expected status after load, has acceptable review items, releasable once all review items accepted)
EXPECT = {
  "Correct PO": ("PO checked, awaiting release", False, True),
  "Within tolerance": ("PO checked, awaiting release", False, True),
  "Non-critical discrepancy": ("PO with discrepancies", True, True),
  "Blocked PO": ("PO blocked", False, False),
  "Wrong supplier": ("PO blocked", False, False),
  "Previous drawing revision": ("PO blocked", False, False),
}
STATUSES = ["PO checked and released", "PO checked, awaiting release", "PO with discrepancies", "PO blocked", "PO awaiting check"]
STATUS = re.compile("|".join(map(re.escape, STATUSES)), re.I)
results = []
def check(name, ok, detail=""):
  results.append((name, bool(ok))); print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(headless=True); pg = await (await b.new_context(viewport={"width": 1280, "height": 1800})).new_page()
    errors = []; pg.on("pageerror", lambda e: errors.append(str(e)))
    btn = lambda n: pg.get_by_role("button", name=n, exact=True)
    main_text = lambda: pg.locator("main").inner_text()
    async def status():
      m = STATUS.search(await pg.get_by_role("heading", name="Purchase Order Check", exact=True).locator("xpath=ancestor::section[1]").inner_text()); return next((x for x in STATUSES if m and x.lower() == m.group(0).lower()), None)  # badges render uppercase
    await pg.goto(URL, wait_until="networkidle")
    await btn("Load extended sample (20 quotes)").click(); await btn("Validate sample quotes (demo)").click()
    await btn("Compare & Decide").last.click()
    await btn("Record decision").first.click(); await btn("Approve decision").click()
    await pg.get_by_role("button", name="Continue to PO Check").click()
    await pg.get_by_role("heading", name="Purchase Order Check", exact=True).wait_for()
    release = btn("Release purchase")
    accepted_labels = []; po_numbers = set()

    for sc, (expected, has_review, releasable) in EXPECT.items():
      await pg.get_by_label("Load demo PO").select_option(sc); await btn("Load demo PO").click(); await pg.wait_for_timeout(300)
      check(f"{sc}: status after load is '{expected}'", await status() == expected, str(await status()))
      section = pg.get_by_role("heading", name="Blockers and discrepancies", exact=True).locator("xpath=..")
      items = section.locator("details")
      n = await items.count(); review_rows = []
      for i in range(n):
        row = items.nth(i); await row.locator("summary").click()
        accept = row.get_by_role("button", name="Accept with justification", exact=True)
        if await accept.count(): review_rows.append(row)
        else: check(f"{sc}: blocker row offers no 'Accept' (only correction)", await row.get_by_role("button", name="Request correction", exact=True).count() == 1)
      check(f"{sc}: review items present = {has_review}", (len(review_rows) > 0) == has_review, f"{len(review_rows)} found")
      if not has_review:
        check(f"{sc}: release enabled = {releasable}", await release.is_enabled() == releasable)
      for k, row in enumerate(review_rows):
        label = (await row.locator("summary span.font-medium").first.inner_text()).strip()
        await row.get_by_role("button", name="Accept with justification", exact=True).click()
        d = pg.get_by_role("dialog")
        await d.get_by_role("button", name="Accept discrepancy", exact=True).click()
        check(f"{sc}: '{label}' rejects empty justification", await d.get_by_text("A written justification is required.", exact=True).is_visible())
        await d.get_by_label("Buyer justification").fill("   ")
        await d.get_by_role("button", name="Accept discrepancy", exact=True).click()
        check(f"{sc}: '{label}' rejects blank justification", await d.is_visible())
        await d.get_by_label("Buyer justification").fill(JUST); await d.get_by_role("button", name="Accept discrepancy", exact=True).click()
        await d.wait_for(state="hidden")
        check(f"{sc}: '{label}' shows accepted note with actor and justification", await row.get_by_text(re.compile(r"Accepted · .*Demo buyer.* · " + re.escape(JUST))).count() == 1)
        accepted_labels.append(label)
        if k < len(review_rows) - 1:
          check(f"{sc}: partial acceptance ({k+1}/{len(review_rows)}) keeps release disabled", await release.is_disabled())
          check(f"{sc}: partial acceptance keeps 'PO with discrepancies'", await status() == "PO with discrepancies")
      if has_review:
        await pg.screenshot(path=str(SHOTS / "all-accepted.png"))
        check(f"{sc}: all accepted -> release enabled = {releasable}", await release.is_enabled() == releasable)
        check(f"{sc}: all accepted -> awaiting release", await status() == "PO checked, awaiting release")
        po_numbers.add((await main_text()).split("PO number")[1].split("\n")[1].strip())
      if releasable:
        await release.click(); await pg.wait_for_timeout(200)
        check(f"{sc}: released", await status() == "PO checked and released")
        check(f"{sc}: release button disabled after release", await release.is_disabled())
      else:
        check(f"{sc}: blocked PO cannot be released", await release.is_disabled())

    # Reloading the same PO resets acceptances — no stale exception carries over.
    await pg.get_by_label("Load demo PO").select_option("Non-critical discrepancy"); await btn("Load demo PO").click(); await pg.wait_for_timeout(300)
    check("reloaded PO starts without acceptances", await status() == "PO with discrepancies" and await release.is_disabled())

    await pg.get_by_role("button", name="Audit Trail").first.click(); await pg.wait_for_timeout(500)
    t = await main_text(); await pg.screenshot(path=str(SHOTS / "audit.png"))
    entries = [l for l in t.split("\n") if f"Justification: {JUST}" in l]
    check("audit trail has one 'PO discrepancy accepted' entry per acceptance", t.count("PO discrepancy accepted") >= len(accepted_labels) and len(entries) == len(accepted_labels), f"{len(entries)} vs {len(accepted_labels)}")
    for label in accepted_labels: check(f"audit entry names check '{label}'", any(f"Check {label}" in l for l in entries))
    check("audit entries name the PO number", all(any(f"PO {n}" in l for l in entries) for n in po_numbers if n))
    check("audit entries carry the demo buyer", "Demo buyer" in t)
    check("audit trail records the release", re.search(r"(PO released|Purchase released|released)", t, re.I) is not None)
    check("no internal field names in audit entries", not any(re.search(r"\b[a-z]+[A-Z][a-zA-Z]+\b|[{}]", l) for l in entries))
    check("no page errors", not errors, "; ".join(errors))
    await b.close()
  failed = [n for n, ok in results if not ok]
  print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
  sys.exit(1 if failed else 0)
asyncio.run(main())
