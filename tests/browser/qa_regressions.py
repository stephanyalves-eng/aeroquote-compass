"""Regression checks: save state, beforeunload, setup errors, demo scope, axe AA."""
import asyncio
from playwright.async_api import async_playwright
URL = "http://localhost:8080"
results = []
def check(name, ok, info=""):
    results.append(ok); print(("PASS" if ok else "FAIL"), name, info)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        page = await (await b.new_context(viewport={"width": 1280, "height": 1800})).new_page()
        dialogs = []
        page.on("dialog", lambda d: (dialogs.append(d.type), asyncio.ensure_future(d.dismiss())))
        await page.goto(URL); await page.wait_for_timeout(2500)
        region = page.get_by_role("region", name="Current RFQ")
        txt = await region.inner_text()
        check("pristine shows Not saved", "Not saved" in txt and "Unsaved" not in txt, txt.replace("\n", " | "))
        await page.reload(); await page.wait_for_timeout(1500)
        check("no prompt on pristine reload", "beforeunload" not in dialogs)
        # go to setup
        await page.get_by_role("button", name="RFQ Setup").first.click(); await page.wait_for_timeout(500)
        vol = page.locator('[data-setup-field="annualVolume"]')
        await vol.fill("1.5")
        txt = await region.inner_text()
        check("edit shows Unsaved changes", "Unsaved changes" in txt)
        await page.get_by_role("button", name="Continue to quotes").first.click(); await page.wait_for_timeout(400)
        focused = await page.evaluate("document.activeElement?.getAttribute('data-setup-field')")
        inv = await page.locator('[aria-invalid="true"]').count()
        desc = await page.evaluate("(()=>{const e=document.activeElement;const id=e?.getAttribute('aria-describedby');return id&&document.getElementById(id)?.textContent})()")
        check("first invalid field focused & described", inv > 0 and focused is not None and bool(desc), f"{focused} {desc}")
        page.once("dialog", lambda d: None)
        try:
            await page.reload(timeout=3000)
        except Exception:
            pass
        await page.wait_for_timeout(500)
        check("prompt on reload with unsaved work", "beforeunload" in dialogs, str(dialogs))
        # fresh page: paste one user quote -> investigations 0
        page2 = await (await b.new_context(viewport={"width": 1280, "height": 1800})).new_page()
        page2.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await page2.goto(URL); await page2.wait_for_timeout(2500)
        await page2.get_by_role("button", name="Quotations").first.click(); await page2.wait_for_timeout(500)
        ta = page2.locator("textarea").first
        if await ta.count():
            await ta.fill("Supplier: My Supplier Ltd\nUnit price USD 100")
            add = page2.get_by_role("button", name="Add pasted quotation")
            if await add.count(): await add.first.click()
            await page2.wait_for_timeout(500)
        await page2.get_by_role("button", name="Dashboard").first.click(); await page2.wait_for_timeout(500)
        body = await page2.inner_text("main")
        import re
        m = re.search(r"Open investigations\s*\n?\s*(\d+)", body)
        check("user RFQ has 0 open investigations", m is not None and m.group(1) == "0", m.group(0) if m else body[:300])
        # axe contrast / regions across steps after loading demo
        await page2.add_script_tag(url="https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js")
        r = await page2.evaluate("axe.run(document,{runOnly:['color-contrast','scrollable-region-focusable','region','aria-valid-attr-value']}).then(r=>r.violations.map(v=>v.id+':'+v.nodes.length))")
        check("axe dashboard clean", not r, str(r))
        for name in ["RFQ Setup", "Configuration", "Audit Trail", "Investigations"]:
            btn = page2.get_by_role("button", name=name).first
            if await btn.count() and await btn.is_enabled():
                await btn.click(); await page2.wait_for_timeout(600)
                r = await page2.evaluate("axe.run(document,{runOnly:['color-contrast','scrollable-region-focusable','region']}).then(r=>r.violations.map(v=>v.id+':'+v.nodes.length+' '+v.nodes.slice(0,2).map(n=>n.target.join(' ')).join(',')))")
                check(f"axe {name} clean", not r, str(r))
        await b.close()
    print(f"{sum(results)}/{len(results)} passed")
asyncio.run(main())
