import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
import requests
AXE = requests.get("https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js", timeout=30).text
B = "http://localhost:8080"
out = []
def log(*a): out.append(" ".join(str(x) for x in a)); print(*a, flush=True)
async def axe(page, name):
    await page.add_script_tag(content=AXE)
    r = await page.evaluate("async () => (await axe.run(document, {runOnly: ['wcag2a','wcag2aa','wcag21aa','best-practice']})).violations.map(v => v.id + ':' + v.nodes.length + ':' + v.nodes[0].target.join(' '))")
    log("AXE", name, r)
async def overflow(page, name):
    o = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    log("OVERFLOW", name, o)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        for w in (1440, 390):
            ctx = await b.new_context(viewport={"width": w, "height": 1800})
            page = await ctx.new_page()
            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)))
            page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
            await page.goto(B, wait_until="networkidle")
            log(w, "empty state", await page.get_by_text("No RFQ yet").count(), await page.get_by_role("button", name="Start in RFQ Setup").count())
            log(w, "identity", await page.get_by_text("Demo mode").count())
            await axe(page, f"{w} dashboard")
            if w == 1440:
                s = page.get_by_role("combobox", name="Global search")
                await s.fill("zzzqqq"); await page.wait_for_timeout(300)
                log("search", await page.get_by_role("status").filter(has_text="No results").count())
                await s.fill("")
            await page.goto(B + "/?view=purchase-orders", wait_until="networkidle"); await page.wait_for_timeout(500)
            log(w, "fallback url", page.url, (await page.locator("main").inner_text())[:160].replace("\n"," | "))
            await page.goto(B + "/?view=rfq-setup", wait_until="networkidle"); await page.wait_for_timeout(300)
            vol = page.locator('[data-setup-field="annualVolume"]')
            log(w, "annual volume", repr(await vol.input_value()))
            await page.locator('[data-setup-field="rfqNumber"]').fill("RFQ-DRAFT-1")
            await page.wait_for_timeout(1200)
            await page.reload(wait_until="networkidle"); await page.wait_for_timeout(800)
            log(w, "after reload url", page.url, "restored", await page.get_by_text("Draft restored").count(), await page.locator('[data-setup-field="rfqNumber"]').input_value())
            await page.get_by_role("button", name="Discard").click(); await page.wait_for_timeout(600)
            log(w, "after discard", page.url, await page.get_by_text("No RFQ yet").count())
            await page.goto(B + "/?view=rfq-setup", wait_until="networkidle")
            await page.get_by_role("button", name="Extended sample · 20 quotes").click(); await page.wait_for_timeout(500)
            await page.get_by_role("button", name="Validate sample quotes (demo)").click(); await page.wait_for_timeout(800)
            log(w, "after validate", page.url, "badge/eyebrow:", (await page.locator('[aria-label="Current RFQ"]').inner_text()).replace("\n"," | ")[:120], "|", await page.get_by_text("Stage ", exact=False).first.inner_text())
            await axe(page, f"{w} validation")
            for v in ["rfq-setup","quotations","comparison","decisions","configuration","audit-trail","investigations","release-control","history"]:
                await page.goto(B + f"/?view={v}", wait_until="networkidle"); await page.wait_for_timeout(700)
                await overflow(page, f"{w} {v}")
                await axe(page, f"{w} {v}")
                if v == "decisions" and w == 1440: 
            # back/forward
            await page.goto(B + "/?view=quotations", wait_until="networkidle"); await page.wait_for_timeout(500)
            await page.goto(B + "/?view=comparison", wait_until="networkidle"); await page.wait_for_timeout(500)
            await page.go_back(); await page.wait_for_timeout(500)
            log(w, "back ->", page.url)
            # status mismatch
            if w == 1440:
                await page.get_by_label("RFQ status").select_option("Completed"); await page.wait_for_timeout(300)
                log("mismatch note", await page.locator("#rfq-status-note").inner_text())
                await page.get_by_role("link", name="x").count()
            # user RFQ investigations
            await page.goto(B + "/?view=rfq-setup", wait_until="networkidle"); await page.wait_for_timeout(500)
            await page.get_by_role("button", name="Discard").click(); await page.wait_for_timeout(500)
            await page.goto(B + "/?view=quotations", wait_until="networkidle")
            await page.get_by_text("Paste quotation text").click()
            await page.locator("textarea").first.fill("Supplier: Test Co\nUnit price: 100 USD"); 
            btn = page.locator("textarea").first.locator("xpath=following-sibling::button[1]")
            if await btn.count(): await btn.click()
            await page.wait_for_timeout(500)
            await page.goto(B + "/?view=investigations", wait_until="networkidle"); await page.wait_for_timeout(500)
            log(w, "user investigations", await page.get_by_text("No investigations for this RFQ").count())
            await axe(page, f"{w} user-investigations")
            await page.goto(B, wait_until="networkidle"); await page.wait_for_timeout(500)
            await overflow(page, f"{w} dashboard")
            
            log(w, "page errors", errs)
            await ctx.close()
        await b.close()
asyncio.run(main())
