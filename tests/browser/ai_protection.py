"""AI protection regression: anonymous denial and authenticated live extraction.

Requires a session minted with lovable auth-session. Uses one paid AI request.
Screenshots stay under /tmp/browser/ai-protection.
"""
import asyncio,json,os,re
from playwright.async_api import async_playwright

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':1280,'height':1800})
  page=await context.new_page(); errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://localhost:8080',wait_until='networkidle')
  denied=await page.evaluate('''async()=>{const {extractQuote}=await import('/src/lib/rfq/extract.functions.ts');try {await extractQuote({data:{text:'quote',today:'2026-11-10'}});return false;}catch{return true;}}''')
  assert denied,'Anonymous server call was not rejected'
  await page.get_by_role('button',name='RFQ Setup',exact=True).click()
  await page.get_by_role('button',name=re.compile('Classic sample')).click()
  await page.get_by_role('button',name=re.compile('Reprocess')).first.wait_for()
  await page.get_by_role('button',name=re.compile('Reprocess')).first.click()
  await page.get_by_role('button',name='Continue with Google',exact=True).wait_for()
  await page.screenshot(path='/tmp/browser/ai-protection/anonymous.png')
  print('Anonymous endpoint rejected and UI opens sign-in: PASS')
  with open(os.path.expanduser('~/.cache/lovable-auth/session.json')) as f: minted=json.load(f)
  await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[minted['storage_key'],json.dumps(minted['session'])])
  await page.goto('http://localhost:8080',wait_until='networkidle')
  await page.get_by_role('button',name='RFQ Setup',exact=True).click()
  await page.get_by_role('button',name=re.compile('Classic sample')).click()
  await page.get_by_role('button',name=re.compile('Reprocess')).first.wait_for()
  await page.get_by_role('button',name=re.compile('Reprocess')).first.click()
  await page.get_by_text('Needs Review',exact=True).first.wait_for(timeout=180000)
  await page.screenshot(path='/tmp/browser/ai-protection/authenticated.png')
  print('Authenticated actual sample extraction reaches Needs Review: PASS')
  for width in [390,883,1280,1440]:
   await page.set_viewport_size({'width':width,'height':1800})
   assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  assert not errors,errors
  await browser.close()
asyncio.run(main())
