"""Blocked storage: demo, comparison, export, AI extraction and save stay error-free at 1440 and 390px."""
import asyncio, re
from playwright.async_api import async_playwright
B = "http://localhost:8080"
MSG = "Your browser is blocking site storage, so sign-in is unavailable. The demo, comparison and exports keep working."
BLOCKED = "Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });"
results = []
def check(name, ok, extra=""): results.append(ok); print(("PASS" if ok else "FAIL"), name, extra, flush=True)
async def view(page, slug):
    await page.evaluate("slug => { history.pushState({}, '', '/?view=' + slug); window.dispatchEvent(new PopStateEvent('popstate')); }", slug)
    await page.wait_for_timeout(700)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        for w in (1440, 390):
            ctx = await b.new_context(viewport={"width": w, "height": 1800}, accept_downloads=True)
            page = await ctx.new_page(); errs = []
            page.on("pageerror", lambda e: errs.append("page: " + str(e)))
            page.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
            page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
            await page.add_init_script(BLOCKED)
            await page.goto(B + "/?view=rfq-setup", wait_until="networkidle")
            await page.get_by_role("button", name=re.compile("Classic sample")).click(); await page.wait_for_timeout(500)
            await view(page, "quotations")
            extract = page.get_by_role("button", name="Extract quotations")
            if await extract.count(): await extract.first.click(); await page.wait_for_timeout(500)
            check(f"{w} AI extraction shows storage explanation", await page.get_by_text(MSG, exact=True).first.is_visible())
            await page.get_by_role("button", name="Save RFQ").click(); await page.wait_for_timeout(500)
            check(f"{w} Save shows storage explanation", await page.get_by_text(MSG, exact=True).first.is_visible())
            await view(page, "rfq-setup")
            await page.get_by_role("button", name=re.compile("Extended sample")).click(); await page.wait_for_timeout(500)
            await page.get_by_role("button", name="Validate sample quotes (demo)").click(); await page.wait_for_timeout(800)
            await view(page, "comparison")
            check(f"{w} comparison works", await page.get_by_role("heading", name="Supplier Comparison").count() > 0)
            async with page.expect_download() as d: await page.get_by_role("button", name="CSV", exact=True).first.click()
            check(f"{w} CSV export works", (await d.value).suggested_filename.endswith(".csv"))
            check(f"{w} zero console/page errors", not errs, errs[:2])
            await ctx.close()
        await b.close()
    print(f"{sum(results)}/{len(results)} passed")
    if not all(results): raise SystemExit(1)
asyncio.run(main())
