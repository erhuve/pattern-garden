import argparse
import json
import mimetypes
import re
import subprocess
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--build-dir', type=Path)
parser.add_argument('--base-url', default='http://localhost:57563')
parser.add_argument('--screenshots', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
fixtures = json.loads(subprocess.check_output(['bun', '-e', 'import {LIVING_LEVELS} from "./src/game/living-levels";import {LIVING_SOLUTIONS,LIVING_BUILD_SEQUENCES} from "./src/game/living-solutions";console.log(JSON.stringify(LIVING_LEVELS.map(l=>({slug:l.slug,title:l.title,palette:l.palette,starting:l.starting,solution:LIVING_SOLUTIONS[l.slug],sequence:LIVING_BUILD_SEQUENCES[l.slug]}))))'], cwd=root))
base = 'http://pattern-garden.test' if args.build_dir else args.base_url.rstrip('/')

def local_route(route):
    build = args.build_dir.resolve()
    path = (build / urlparse(route.request.url).path.lstrip('/')).resolve()
    if not path.is_relative_to(build) or not path.is_file():
        path = build / 'index.html'
    route.fulfill(path=str(path), content_type=mimetypes.guess_type(path.name)[0] or 'application/octet-stream')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
    context = browser.new_context(has_touch=True, reduced_motion='reduce')
    if args.build_dir:
        context.route(f'{base}/**', local_route)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))

    def open_level(slug):
        page.goto(f'{base}/play/{slug}')
        page.wait_for_selector('.pg-workbench')
        page.evaluate('document.fonts.ready')

    def screenshot(name):
        if args.screenshots:
            args.screenshots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(args.screenshots / f'{name}.png'))

    def tap_cell(x, y):
        point = page.evaluate('''([x,y])=>{let svg=document.querySelector('.pg-board'),p=svg.createSVGPoint();p.x=(x-y)*30;p.y=(x+y+1)*15;let c=p.matrixTransform(svg.getScreenCTM());return [c.x,c.y]}''', [x,y])
        page.touchscreen.tap(*point)

    def tap_painted(selector):
        point = page.locator(selector).first.evaluate('''e=>{const s=e.ownerSVGElement,p=s.createSVGPoint(),r=e.getBBox();p.x=r.x+r.width/2;p.y=r.y+r.height/2;const c=p.matrixTransform(e.getScreenCTM());return [c.x,c.y]}''')
        page.touchscreen.tap(*point)

    def tap_wall(side, pos):
        point = page.locator(f'[data-wall-surface="{side}{pos}"] > polygon').first.evaluate('''e=>{let s=e.ownerSVGElement,p=s.createSVGPoint(),points=[...e.points];p.x=points.reduce((v,q)=>v+q.x,0)/points.length;p.y=points.reduce((v,q)=>v+q.y,0)/points.length;let c=p.matrixTransform(s.getScreenCTM());return [c.x,c.y]}''')
        page.touchscreen.tap(*point)

    def select(kind):
        page.locator(f'.pg-board-palette .pg-piece-tile').nth([e['kind'] for e in fixture['palette']].index(kind)).click()

    def score():
        return int(page.locator('.pg-score-value span').inner_text())

    def saved():
        return page.evaluate('(slug)=>JSON.parse(localStorage.getItem("pattern-garden:v1")).layouts[slug]', fixture['slug'])

    def ensure_saved():
        page.wait_for_timeout(150)

    open_level(fixtures[0]['slug'])
    for size in [(1440,900),(1280,660),(1024,670),(768,1024),(760,835),(390,844),(390,700),(375,667),(360,640),(844,390)]:
        page.set_viewport_size(dict(zip(['width','height'],size)))
        for fixture in fixtures:
            open_level(fixture['slug'])
            result = page.evaluate('''() => {
              const targets=[...document.querySelectorAll('.pg-piece-tile,.pg-criterion,.pg-board-actions button')].filter(e=>e.getClientRects().length);
              return {overflow:document.documentElement.scrollHeight>innerHeight+1||document.documentElement.scrollWidth>innerWidth+1,
              outside:targets.filter(e=>{let r=e.getBoundingClientRect();return r.top<0||r.left<0||r.bottom>innerHeight+1||r.right>innerWidth+1}).map(e=>e.textContent),
              clipped:targets.filter(e=>e.scrollWidth>e.clientWidth+2||e.scrollHeight>e.clientHeight+2).map(e=>({text:e.textContent,aria:e.getAttribute('aria-label'),size:[e.clientWidth,e.clientHeight,e.scrollWidth,e.scrollHeight]})),
              tiny:targets.filter(e=>e.getBoundingClientRect().width<43||e.getBoundingClientRect().height<43).map(e=>e.textContent)};
            }''')
            assert not any(result.values()), (size,fixture['slug'],result)
    print('PASS: 40 new-level viewport combinations, visible checks and 44px controls', flush=True)

    for size in [(1440,900),(390,844)]:
        page.set_viewport_size(dict(zip(['width','height'],size)))
        for fixture in fixtures:
            open_level(fixture['slug'])
            page.get_by_role('button', name='Reset', exact=True).click()
            assert score() < 100
            for action in fixture['sequence']:
                select(action['kind'])
                t = action['target']
                if t['type'] == 'wall':
                    tap_wall(t['side'], t['pos'])
                else:
                    tap_cell(t['x'],t['y'])
                assert page.locator('.pg-toast').count() == 0, (fixture['slug'],action,page.locator('.pg-toast').all_text_contents())
            expect(page.locator('.pg-score-value span')).to_have_text('100')
            ensure_saved()
            assert saved() == fixture['solution'], (fixture['slug'],saved(),fixture['solution'])
            page.reload()
            expect(page.locator('.pg-score-value span')).to_have_text('100')
            assert saved() == fixture['solution']
            screenshot(f"{fixture['slug']}-{size[0]}")
            page.locator('.pg-criterion').first.click()
            if page.locator('dialog[open]').count():
                b = page.get_by_role('button',name='Show highlighted tiles on board')
                if b.count(): b.click()
                else: page.get_by_role('button',name='Close explanation',exact=True).click()
            assert page.locator('[data-diagnostic-check]').get_attribute('data-diagnostic-check')
            assert page.locator('[data-diagnostic-cell]').count() > 0
            if fixture['slug'] == 'eating-atmosphere':
                table = next(p for p in fixture['solution'] if p['kind']=='table')
                page.get_by_role('button',name='Remove',exact=True).click()
                tap_cell(table['x'],table['y'])
                page.get_by_role('button',name=re.compile('Remove (lamp|light) only',re.I)).click()
                ensure_saved()
                assert score() < 100
                assert any(p['kind']=='table' and not p.get('lamp') for p in saved())
                select('lamp')
                tap_painted(f'.pg-piece[data-piece-cell="{table["x"]},{table["y"]}"] .pg-wood')
                expect(page.locator('.pg-score-value span')).to_have_text('100')
                assert page.locator('[data-lamp-pool]').count() == 9
                page.get_by_role('button',name='Remove',exact=True).click()
                tap_painted('[data-wall-surface="n3"] .pg-door-panel')
                expect(page.locator('.pg-toast')).to_contain_text('stays in place')
                page.get_by_role('button',name='Dismiss',exact=True).click()
                expect(page.locator('.pg-score-value span')).to_have_text('100')
                ensure_saved()
                assert any(p['kind']=='door' and p['side']=='n' and p['pos']==3 for p in saved())
                select('plant');tap_cell(table['x']+2,table['y'])
                assert score() < 100
                page.locator('.pg-criterion').last.click()
                reasons = page.locator('dialog[open] .pg-tile-reasons') if page.locator('dialog[open]').count() else page.locator('.pg-tile-reasons')
                expect(reasons).to_contain_text('Column')
                expect(reasons).to_contain_text('Pullback')
                if page.locator('dialog[open]').count(): page.get_by_role('button',name='Close explanation',exact=True).click()
            if fixture['slug'] == 'trellised-walk':
                page.get_by_role('button',name='Remove',exact=True).click()
                tap_cell(4,3)
                page.get_by_role('button',name=re.compile('Remove (climbing plant|vine).*only',re.I)).click()
                ensure_saved()
                assert score() < 100
                assert any(p['kind']=='path' and p['x']==4 and p.get('trellis') and not p.get('climbingPlant') for p in saved())
                select('plant')
                tap_painted('[data-attachment-cell="4,3"] .pg-trellis-post-side')
                expect(page.locator('.pg-score-value span')).to_have_text('100')
                page.get_by_role('button',name='Remove',exact=True).click();tap_cell(4,3)
                page.get_by_role('button',name=re.compile('Remove trellis',re.I)).click()
                ensure_saved()
                assert any(p['kind']=='path' and p['x']==4 and not p.get('trellis') and not p.get('climbingPlant') for p in saved())
                select('trellis');tap_cell(4,3);select('plant');tap_cell(4,3)
                expect(page.locator('.pg-score-value span')).to_have_text('100')
            if fixture['slug'] == 'garden-seat':
                assert page.locator('[data-sun-cell="4,3"]').get_attribute('data-sunny') == 'true'
            page.get_by_role('button',name='Reset',exact=True).click()
            assert score() < 100
            ensure_saved()
            assert saved() == fixture['starting']
            print(f"PASS: {fixture['slug']} touch build/reload/reset/diagnostics/layers at {size[0]}px", flush=True)
    assert not errors, errors
    print('PASS: no browser runtime errors', flush=True)
    browser.close()
