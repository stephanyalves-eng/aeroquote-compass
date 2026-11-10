import asyncio,re
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True);pg=await b.new_page(viewport={'width':1280,'height':1800});errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
  await pg.goto('http://localhost:8080',wait_until='networkidle')
  chart=pg.get_by_role('region',name='Weekly RFQ recommendations');await chart.wait_for()
  await chart.get_by_role('button',name='Demo RFQs',exact=True).click()
  await chart.locator('summary',has_text='Weekly counts').click()
  before=int(await chart.locator('tbody tr').last.locator('td').nth(1).inner_text());print('before',before)
  milestones=[]
  pg.on('request',lambda r: milestones.append(r.post_data_json) if 'rpc/record_buyer_recommendation' in r.url else None)
  await pg.get_by_role('button',name='RFQ Setup',exact=True).click();await pg.get_by_role('button',name=re.compile('Extended sample')).click();await pg.get_by_role('button',name='Validate sample quotes (demo)',exact=True).click();await pg.wait_for_timeout(1000)
  await pg.get_by_role('button',name='Dashboard',exact=True).click()
  await chart.get_by_role('button',name='Demo RFQs',exact=True).click();await chart.locator('summary',has_text='Weekly counts').click();await pg.wait_for_timeout(500)
  after=int(await chart.locator('tbody tr').last.locator('td').nth(1).inner_text());print('after',after);assert after==before+1
  assert 'Automatic updates' in await chart.inner_text()
  await chart.get_by_role('combobox',name='Recommendation period').click();await pg.get_by_role('option',name='Last 8 weeks',exact=True).click();await pg.wait_for_timeout(200);assert await chart.locator('tbody tr').count()==8
  await chart.get_by_role('combobox',name='Recommendation period').click();await pg.get_by_role('option',name='Last 12 weeks',exact=True).click();await pg.wait_for_timeout(200);await pg.wait_for_timeout(200);assert await chart.locator('tbody tr').count()==12
  await chart.get_by_role('combobox',name='Recommendation period').click();await pg.get_by_role('option',name='Custom dates',exact=True).click()
  await chart.get_by_label('Recommendation start date').fill('2026-11-09');await chart.get_by_label('Recommendation end date').fill('2026-11-09');await pg.wait_for_timeout(200);assert await chart.locator('tbody tr').count()==1
  await chart.get_by_label('Recommendation start date').fill('2026-11-10');await pg.wait_for_timeout(200);assert await chart.get_by_role('alert').is_visible()
  await chart.get_by_label('Recommendation start date').fill('2026-11-09')
  await pg.screenshot(path='/tmp/browser/weekly/desktop.png')
  for width in [390,883,1280,1440]:
   await pg.set_viewport_size({'width':width,'height':1800});await pg.wait_for_timeout(200)
   
   if not await pg.evaluate('document.documentElement.scrollWidth<=innerWidth'):
    print('overflow',width,await pg.evaluate("Array.from(document.querySelectorAll('main *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>[e.tagName,e.className,e.getBoundingClientRect().right]).slice(-20)"));await pg.screenshot(path='/tmp/browser/weekly/mobile.png');raise AssertionError(width)
   if width==390: await chart.scroll_into_view_if_needed();await pg.screenshot(path='/tmp/browser/weekly/mobile.png')
  assert milestones
  payload=milestones[0]
  await pg.evaluate('(row)=>localStorage.setItem("aeroquote-weekly-recommendations-outbox",JSON.stringify([row]))',{'id':payload['p_milestone_id'],'synthetic':payload['p_synthetic']})
  await pg.reload(wait_until='networkidle');await chart.get_by_role('button',name='Demo RFQs',exact=True).click();await chart.locator('summary',has_text='Weekly counts').click();assert int(await chart.locator('tbody tr').last.locator('td').nth(1).inner_text())==after
  print('PASS live confirmation +1, persists reload, 4/8/12/custom, validation, widths 390/883/1280/1440; errors:',errors);assert not errors;await b.close()
asyncio.run(main())
