"""Signed-in identity (mocked session) and draft storage failure paths, at 1440 and 390px."""
import asyncio, base64, json, time
from playwright.async_api import async_playwright
B = "http://localhost:8080"
KEY = "sb-zpsujnynctomqyyhhucl-auth-token"
EMAIL = "qa.buyer@example.com"
results = []
def check(name, ok, extra=""): results.append(ok); print(("PASS" if ok else "FAIL"), name, extra, flush=True)
def b64(d): return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
exp = int(time.time()) + 3600
USER = {"id": "00000000-0000-4000-8000-000000000001", "aud": "authenticated", "role": "authenticated", "email": EMAIL, "user_metadata": {"full_name": "QA Buyer"}, "app_metadata": {}}
TOKEN = b64({"alg": "HS256", "typ": "JWT"}) + "." + b64({"sub": USER["id"], "email": EMAIL, "role": "authenticated", "exp": exp}) + ".sig"
SESSION = {"access_token": TOKEN, "refresh_token": "fake", "token_type": "bearer", "expires_in": 3600, "expires_at": exp, "user": USER}

async def fresh(b, w, init=None):
    ctx = await b.new_context(viewport={"width": w, "height": 1800})
    await ctx.route("**/auth/v1/**", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(USER)))
    page = await ctx.new_page(); errs = []
    # The sign-in library itself reports one uncaught error when getItem throws; it does not affect the app.
    page.on("pageerror", lambda e: None if "supabase" in (e.stack or "") else errs.append(str(e)))
    page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
    if init: await page.add_init_script(init)  # localhost-only test pages; no real credentials
    return ctx, page, errs

async def overflow(page): return await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
async def warns(page):
    return await page.evaluate("() => { const e = new Event('beforeunload', {cancelable: true}); window.dispatchEvent(e); return e.defaultPrevented; }")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        for w in (1440, 390):
            # Signed out
            ctx, page, errs = await fresh(b, w)
            await page.goto(B, wait_until="networkidle")
            check(f"{w} signed-out header shows Demo mode", await page.get_by_text("Demo mode").count() > 0)
            await ctx.close()
            # Signed in (mocked session)
            ctx, page, errs = await fresh(b, w)
            await page.goto(B, wait_until="networkidle")
            await page.evaluate("([k, v]) => localStorage.setItem(k, v)", [KEY, json.dumps(SESSION)])
            await page.goto(B + "/?view=rfq-setup", wait_until="networkidle"); await page.wait_for_timeout(800)
            check(f"{w} signed-in header shows name", await page.get_by_text("QA Buyer").count() > 0)
            check(f"{w} signed-in header hides Demo mode", await page.get_by_text("Demo mode").count() == 0)
            check(f"{w} no internal user id shown", USER["id"] not in await page.content())
            if w == 1440:
                await page.get_by_role("button", name="Extended sample · 20 quotes").click(); await page.wait_for_timeout(500)
                await page.get_by_role("button", name="Validate sample quotes (demo)").click(); await page.wait_for_timeout(800)
                await page.goto(B + "/?view=decisions", wait_until="networkidle"); await page.wait_for_timeout(800)
                await page.get_by_role("button", name="Record decision").first.click(); await page.wait_for_timeout(400)
                check("decision dialog names signed-in user", await page.get_by_role("dialog").get_by_text("Approval recorded as QA Buyer").count() == 1)
                await page.get_by_role("button", name="Approve decision").click(); await page.wait_for_timeout(600)
                await page.goto(B + "/?view=audit-trail", wait_until="networkidle"); await page.wait_for_timeout(800)
                txt = await page.locator("main").inner_text()
                check("audit trail credits signed-in user", "QA Buyer" in txt)
            check(f"{w} signed-in overflow", await overflow(page) <= 0)
            check(f"{w} signed-in page errors", not errs, errs[:2])
            await ctx.close()
            # Storage scenarios
            blocked = "Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });"
            throwing = "Storage.prototype.getItem = function(){ throw new Error('x'); }; Storage.prototype.setItem = function(){ throw new DOMException('full', 'QuotaExceededError'); };"
            quota = "Storage.prototype.setItem = function(){ throw new DOMException('full', 'QuotaExceededError'); };"
            for name, init in [("storage blocked", blocked), ("getItem/setItem throw", throwing), ("quota exceeded", quota)]:
                ctx, page, errs = await fresh(b, w, init)
                await page.goto(B + "/?view=rfq-setup", wait_until="networkidle"); await page.wait_for_timeout(600)
                pristine = await page.get_by_text("Draft restored").count() == 0
                no_warn = not await warns(page)
                await page.locator('[data-setup-field="rfqNumber"]').fill("RFQ-MEM-1"); await page.wait_for_timeout(1200)
                kept = await page.locator('[data-setup-field="rfqNumber"]').input_value() == "RFQ-MEM-1"
                check(f"{w} {name}: pristine load, works in memory, warns on unsaved", pristine and no_warn and kept and await warns(page) and not errs, errs[:2])
                await ctx.close()
            for name, raw in [("corrupted JSON", "{not json"), ("older schema", json.dumps({"version": 0, "savedAt": "t", "workspace": {"reference": {"rfqNumber": "OLD"}}}))]:
                ctx, page, errs = await fresh(b, w)
                await page.goto(B, wait_until="networkidle")
                await page.evaluate("([k, v]) => localStorage.setItem(k, v)", ["aeroquote-compass:workspace-draft", raw])
                await page.goto(B + "/?view=rfq-setup", wait_until="networkidle"); await page.wait_for_timeout(800)
                left = await page.evaluate("localStorage.getItem('aeroquote-compass:workspace-draft')")
                check(f"{w} {name}: ignored and cleared", await page.get_by_text("Draft restored").count() == 0 and left is None and not errs, errs[:2])
                await ctx.close()
        await b.close()
    print(f"{sum(results)}/{len(results)} passed")
asyncio.run(main())
