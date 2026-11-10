"""Regression: global search keyboard selection and pre-validation phone overflow."""
import asyncio
import re
from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 1800})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto("http://localhost:8080", wait_until="networkidle")
        await page.get_by_role("button", name="RFQ Setup", exact=True).click()
        await page.get_by_role("button", name=re.compile("Extended sample")).click()
        for width in [320, 360, 390, 430, 768, 883, 1024, 1280, 1440]:
            await page.set_viewport_size({"width": width, "height": 1800})
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), width
        search = page.get_by_role("combobox", name=re.compile("Global search"))
        await search.fill("RFQ-24410")
        await page.get_by_role("listbox", name="Search results").wait_for()
        await search.press("ArrowDown")
        assert await page.get_by_role("option", selected=True).count() == 1
        await search.press("Enter")
        await page.get_by_role("heading", name="RFQ Setup", exact=True).wait_for()
        assert await search.input_value() == ""
        await search.fill("RFQ-24410")
        await search.press("Escape")
        assert await page.get_by_role("listbox", name="Search results").count() == 0
        assert not errors, errors
        await browser.close()
        print("PASS keyboard search, Escape, and pre-validation layouts at 320–1440px")


asyncio.run(main())