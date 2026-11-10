"""Presentation regression: selected-quotation follow-up filter and mobile layout."""
import asyncio
import re
from pathlib import Path
from playwright.async_api import async_playwright


async def main():
    screenshots = Path("/tmp/browser/review-flag-filter")
    screenshots.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 1800})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto("http://localhost:8080", wait_until="networkidle")
        await page.get_by_role("button", name="RFQ Setup", exact=True).click()
        await page.get_by_role("button", name=re.compile("Extended sample")).click()
        toggle = page.get_by_role("button", name="Flagged fields only", exact=True)
        rows = page.locator(".review-fields tbody tr")
        assert await rows.count() == 30
        await toggle.click()
        assert await toggle.get_attribute("aria-pressed") == "true"
        assert await rows.count() == 0
        await page.get_by_text("No flagged fields in this quotation.", exact=True).wait_for()
        await page.get_by_role("button", name="Flag all fields", exact=True).click()
        assert await rows.count() == 30
        await page.get_by_role("button", name="Clear follow-up for Supplier name", exact=True).click()
        assert await rows.count() == 29
        assert await page.get_by_label("Supplier name", exact=True).count() == 0
        await toggle.click()
        assert await rows.count() == 30
        await toggle.click()
        selection = page.get_by_label("Quote to review")
        options = await selection.locator("option").evaluate_all("xs => xs.map(x => x.value)")
        await selection.select_option(options[1])
        assert await rows.count() == 0
        await selection.select_option(options[0])
        assert await rows.count() == 29
        assert await page.get_by_role("button", name="Confirm quotation", exact=True).is_disabled()
        for width in [320, 390, 883, 1280, 1440]:
            await page.set_viewport_size({"width": width, "height": 1800})
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), width
            await toggle.evaluate("el => el.scrollIntoView({block: 'center'})")
            if width in [390, 1280]:
                await toggle.screenshot(path=str(screenshots / f"filter-{width}.png"))
        await page.get_by_role("button", name="Flag all fields", exact=True).click()
        await page.get_by_role("button", name="Clear all flags", exact=True).click()
        assert await rows.count() == 0
        await toggle.click()
        assert await rows.count() == 30
        assert not errors, errors
        await browser.close()
        print("PASS flagged-only filter, empty state, individual clear, quotation isolation, unchanged gates, 320–1440px")


asyncio.run(main())