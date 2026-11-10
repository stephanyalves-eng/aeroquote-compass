"""Supplier acknowledgement and PO analytics browser regression. Run python3 tests/browser/po_confirmation.py.
Optional: VERIFY_PRIVATE_HISTORY=1 with a locally minted session for save/reopen.
All screenshots and downloads remain under /tmp/browser/erp-po.
"""
import asyncio,re,json,os
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True); pg=await b.new_page(viewport={"width":1280,"height":1800}); errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
  btn=lambda n:pg.get_by_role('button',name=n,exact=True)
  await pg.goto('http://localhost:8080',wait_until='networkidle')
  private = os.environ.get('VERIFY_PRIVATE_HISTORY') == '1'
  if private:
   with open(os.path.expanduser('~/.cache/lovable-auth/session.json')) as f: minted=json.load(f)
   await pg.evaluate('([k,v])=>localStorage.setItem(k,v)',[minted['storage_key'],json.dumps(minted['session'])])
   await pg.reload(wait_until='networkidle')
  await pg.evaluate("window.__testPoEvents=[];window.__lovableEvents={track:(name,properties)=>{window.__testPoEvents.push({name,properties});return null}}")
  await btn('RFQ Setup').click();await pg.get_by_role('button',name=re.compile('Extended sample')).click()
  buyer_count=lambda:pg.evaluate("window.__testPoEvents.filter(e=>e.name==='project.rfq_recommended_after_buyer_confirmation').length")
  assert await buyer_count()==0
  await btn('Validate sample quotes (demo)').click()
  assert await buyer_count()==1
  # Navigation and the later PO acknowledgement must not recount the RFQ.
  await btn('Continue to compare').click();await btn('Continue to decision').click();await btn('Record decision').first.click();await btn('Approve decision').click();await btn('Continue to PO & Release').click()
  await btn('Create PO from approved decision').click();await btn('Generate PO').wait_for()
  assert await btn('Check purchase order').is_disabled();assert await btn('Release purchase').is_disabled()
  await pg.locator('summary',has_text='Edit purchase order').click();await pg.get_by_label('Description',exact=True).fill('Hydraulic actuator Y8 – saved draft')
  assert await btn('Generate PO').is_disabled();await btn('Save PO draft').click();await btn('Generate PO').click();await btn('Issue PO').click();await btn('Confirm issue').click()
  assert await pg.get_by_text('Issued document locked.',exact=False).is_visible()
  assert await pg.evaluate("window.__testPoEvents.filter(e=>e.name==='project.rfq_recommended_after_supplier_confirmation').length") == 0
  await pg.get_by_label('Supplier confirmation date',exact=True).fill('2026-10-26');await pg.get_by_label('Supplier expected delivery date',exact=True).fill('2027-03-15');await pg.get_by_label('Supplier confirmation reference',exact=True).fill('ACK-DEMO-123');await btn('Save supplier confirmation').click()
  confirmation=pg.get_by_role('region',name='Supplier confirmation',exact=True)
  assert await confirmation.get_by_text('2027-03-15',exact=True).is_visible()
  assert await pg.evaluate("window.__testPoEvents.filter(e=>e.name==='project.rfq_recommended_after_supplier_confirmation').length") == 1
  await btn('Update supplier confirmation').click();await pg.get_by_label('Supplier expected delivery date',exact=True).fill('2027-03-20');await btn('Save supplier confirmation').click()
  assert await confirmation.get_by_text('2027-03-20',exact=True).is_visible()
  assert await pg.evaluate("window.__testPoEvents.filter(e=>e.name==='project.rfq_recommended_after_supplier_confirmation').length") == 1
  await pg.screenshot(path='/tmp/browser/po-confirmation/recorded.png')
  await btn('Start verification').click();await btn('Check purchase order').click()
  # Description differs intentionally; accept the noncritical discrepancy.
  sec=pg.get_by_role('heading',name='Blockers and discrepancies',exact=True).locator('xpath=..')
  for row in await sec.locator('details').all():
   await row.locator('summary').click()
   if await row.get_by_role('button',name='Accept with justification').count():
    await row.get_by_role('button',name='Accept with justification').click();await pg.get_by_label('Buyer justification').fill('Verified synthetic document description against approved requirement.');await btn('Accept discrepancy').click()
  await btn('Confirm verification').click();await btn('Prepare release').click();await btn('Release purchase').click()
  assert await pg.get_by_text('Released · Revision 1',exact=True).is_visible()
  await btn('View issued PO').click();await pg.get_by_role('article',name='Purchase order document').wait_for()
  await btn('Zoom in').click();assert await pg.get_by_text('125%',exact=True).is_visible()
  async with pg.expect_download() as d:await btn('Download PO PDF').click()
  await (await d.value).save_as('/tmp/browser/erp-po/issued.pdf')
  await pg.screenshot(path='/tmp/browser/erp-po/issued.png')
  await btn('Fullscreen document').click();await pg.get_by_role('dialog').wait_for();await pg.keyboard.press('Escape')
  events=await pg.evaluate('window.__testPoEvents')
  assert sum(e['name']=='project.po_issued' for e in events)==1,events
  assert sum(e['name']=='project.po_validated' for e in events)==1,events
  assert sum(e['name']=='project.po_released' for e in events)==1,events
  assert not any(e['name']=='project.po_blocked' for e in events),events
  await btn('Audit Trail').click();await pg.screenshot(path='/tmp/browser/po-confirmation/audit.png');assert await pg.get_by_text('RFQ recommendation after buyer quotation confirmation measured',exact=True).count()==1;assert await pg.get_by_text('PO supplier confirmation recorded',exact=True).count() >= 2;assert await pg.get_by_text('2027-03-15',exact=False).count()>0;assert await pg.get_by_text('2027-03-20',exact=False).count()>0;await btn('Purchase Orders').click()
  await btn('Create amendment').click();await btn('Confirm amend').click();assert await pg.get_by_text('Draft · Revision 2',exact=True).is_visible();assert await btn('Release purchase').is_disabled()
  assert await pg.get_by_role('region',name='Supplier confirmation',exact=True).get_by_text('Not yet recorded',exact=True).is_visible()
  await btn('PO list').click();await pg.get_by_label('PO RFQ').select_option('RFQ-24410');await pg.get_by_label('PO status').select_option('Superseded');assert await btn('Open PO').count()==1
  await btn('Open PO').click();assert await pg.get_by_text('Superseded PO',exact=True).is_visible();await pg.get_by_role('article',name='Purchase order document').get_by_text('2027-03-20',exact=True).wait_for()
  for w in [320,360,390,430,768,1024,1280,1440]:
   await pg.set_viewport_size({'width':w,'height':1800});await pg.wait_for_timeout(80)
   
   if not await pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth'):
    print('overflow',w,await pg.evaluate("Array.from(document.querySelectorAll('main *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>[e.tagName,e.className,e.getBoundingClientRect().width]).filter(e=>e[0]==='ARTICLE'||e[0]==='DIV'||e[0]==='P'||e[0]==='TABLE').slice(-25)"));await pg.screenshot(path='/tmp/browser/erp-po/overflow.png');raise AssertionError(f'overflow {w}')
  await pg.set_viewport_size({'width':390,'height':1800});await pg.screenshot(path='/tmp/browser/erp-po/mobile.png')
  if private:
   await btn('Save RFQ').click();await pg.get_by_role('status').filter(has_text=re.compile('^Saved$')).wait_for();await pg.wait_for_timeout(500);await pg.set_viewport_size({'width':1280,'height':1800});await btn('RFQ History').click()
   await pg.screenshot(path='/tmp/browser/po-confirmation/history.png')
   card=pg.locator('article').filter(has=pg.get_by_role('heading',name='RFQ-24410',exact=True)).first
   await card.get_by_role('button',name='Open saved RFQ',exact=True).click();await btn('Purchase Orders').click();assert await pg.get_by_text('Draft · Revision 2',exact=True).is_visible();await btn('PO list').click();await pg.get_by_label('PO status').select_option('Superseded');assert await btn('Open PO').count()==1
   await btn('Open PO').click();await pg.get_by_role('article',name='Purchase order document').wait_for();await pg.screenshot(path='/tmp/browser/po-confirmation/reopened.png');await pg.get_by_role('article',name='Purchase order document').get_by_text('2027-03-20',exact=True).wait_for();await pg.set_viewport_size({'width':390,'height':1800});await pg.get_by_role('article',name='Purchase order document').scroll_into_view_if_needed();await pg.screenshot(path='/tmp/browser/erp-po/mobile.png')
  await pg.set_viewport_size({'width':1280,'height':1800});await btn('PO workflow').click();await pg.get_by_label('Load demo PO',exact=True).select_option('Blocked PO');await btn('Load demo PO').click()
  assert await btn('Release purchase').is_disabled()
  events=await pg.evaluate('window.__testPoEvents');blocked=[e for e in events if e['name']=='project.po_blocked'];assert len(blocked)==1 and blocked[0]['properties']['reason']=='verification' and blocked[0]['properties']['blockers']>0,events
  assert sum(e['name']=='project.po_validated' for e in events)==2,events
  if await btn('Update supplier confirmation').count(): await btn('Update supplier confirmation').click()
  await pg.get_by_label('Supplier confirmation date',exact=True).fill('2026-10-26');await pg.get_by_label('Supplier expected delivery date',exact=True).fill('2027-03-25');await btn('Save supplier confirmation').click()
  events=await pg.evaluate('window.__testPoEvents')
  weekly=[e for e in events if e['name']=='project.rfq_recommended_after_supplier_confirmation']
  assert len(weekly)==1 and weekly[0]['properties']=={'synthetic':True},events
  buyer_weekly=[e for e in events if e['name']=='project.rfq_recommended_after_buyer_confirmation']
  assert len(buyer_weekly)==1 and buyer_weekly[0]['properties']=={'synthetic':True},events
  for e in events: assert set(e['properties']) <= {'synthetic','blockers','discrepancies','valid','reason'}
  print('PASS supplier acknowledgement and delivery, correction audit, immutable old version, analytics issue/check/block/release; draft save → generate → issue → verify → accept → release; PDF, zoom/fullscreen; amendment, superseded details, RFQ/status filters; widths 320–1440; errors:',errors)
  assert not errors;await b.close()
asyncio.run(main())
