import asyncio,re
from pathlib import Path
from playwright.async_api import async_playwright
O=Path('/tmp/browser/round3')
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);pg=await (await b.new_context(viewport={'width':1280,'height':1800})).new_page()
  errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
  await pg.goto('http://localhost:8080',wait_until='networkidle')
  await pg.get_by_role('button',name=re.compile('Extended sample')).click()
  await pg.get_by_role('button',name='Validate sample quotes (demo)',exact=True).click()
  await pg.get_by_role('button',name='Continue to compare',exact=True).click()
  panel=pg.get_by_role('heading',name='Scenario analysis',exact=True).locator('xpath=ancestor::section[1]')
  print('default',await panel.locator('[aria-live]').inner_text())
  await pg.get_by_label('Scenario annual quantity',exact=True).fill('24')
  await pg.get_by_label('Scenario annual freight per supplier (USD)',exact=True).fill('1000')
  await pg.get_by_label('Scenario NRE amortization (years)',exact=True).fill('4')
  await pg.get_by_text('Scenario scoring weights',exact=True).click()
  for label,value in [('Total Cost',0),('Lead Time',0),('Supplier Risk',100),('Payment Terms',0),('Certification / Compliance',0),('Commercial Conditions',0)]:
   await pg.get_by_label(f'Scenario {label} (%)',exact=True).fill(str(value))
  print('simulated',await panel.locator('[aria-live]').inner_text())
  assert 'replaces Horizon' in await panel.inner_text()
  for w in [320,360,390,430,768,1024,1280,1440]:
   await pg.set_viewport_size({'width':w,'height':1800});assert await pg.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'scenario overflow {w}'
   if w in [390,1280]:
    await panel.scroll_into_view_if_needed();await pg.screenshot(path=str(O/f'scenario-{w}.png'))
  await pg.get_by_label('Scenario annual quantity',exact=True).fill('0')
  assert await panel.get_by_role('alert').is_visible()
  await pg.get_by_role('button',name='Reset scenario',exact=True).click()
  await pg.get_by_role('button',name='Continue to decision',exact=True).click()
  assert 'Horizon Precision LLC' in await pg.get_by_role('heading',name='Procurement Recommendation',exact=True).locator('xpath=ancestor::section[1]').inner_text()
  await pg.get_by_role('button',name='Record decision',exact=True).click();await pg.get_by_role('button',name='Approve decision',exact=True).click()
  await pg.get_by_role('button',name='Continue to PO & Release',exact=True).click()
  await pg.get_by_label('Load demo PO').select_option('Correct PO');await pg.get_by_role('button',name='Load demo PO',exact=True).click();await pg.get_by_role('button',name='Release purchase',exact=True).click()
  await pg.get_by_role('button',name='Traceability',exact=True).click();await pg.get_by_role('menuitem',name='Configuration and revisions',exact=True).click()
  await pg.get_by_label('Effective date',exact=True).fill('2026-11-15')
  await pg.get_by_role('button',name='Publish synthetic revision',exact=True).click()
  diff=pg.get_by_text('Revision diff · C → D',exact=True)
  await diff.click()
  assert 'Port thread changed to MJ12.' in await pg.locator('main').inner_text()
  assert 'Checks requiring re-evaluation' in await pg.locator('main').inner_text()
  for w in [320,360,390,430,768,1024,1280]:
   await pg.set_viewport_size({'width':w,'height':1800});assert await pg.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'revision overflow {w}'
   if w==390:await diff.scroll_into_view_if_needed();await pg.screenshot(path=str(O/'revision-390.png'))
  await pg.set_viewport_size({'width':1280,'height':1800})
  await pg.get_by_role('button',name=re.compile('RFQ Setup')).first.click()
  op=pg.get_by_role('region',name='Operational dashboard')
  print('operations',await op.inner_text())
  assert 'Blocked PO' in await op.inner_text()
  for w in [320,360,390,430,768,1024,1280,1440]:
   await pg.set_viewport_size({'width':w,'height':1800});assert await pg.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'operations overflow {w}'
   if w in [390,1280]:await op.scroll_into_view_if_needed();await pg.screenshot(path=str(O/f'operations-{w}.png'))
  await pg.set_viewport_size({'width':640,'height':900});assert await pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
  await pg.get_by_role('button',name='Review PO & release',exact=True).click()
  assert await pg.get_by_role('button',name='Release purchase',exact=True).is_disabled()
  print('scenario, unchanged approval, revision diff, operational actions and configuration block PASS; errors',errors);assert not errors
  await b.close()
asyncio.run(main())
