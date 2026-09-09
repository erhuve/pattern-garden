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
fixtures = json.loads(subprocess.check_output(['bun', '-e', 'import {EXPANDED_SOLUTIONS} from "./src/game/expanded-solutions";import {EXPANDED_LEVELS} from "./src/game/expanded-levels"; console.log(JSON.stringify(EXPANDED_LEVELS.map(l=>({slug:l.slug,title:l.title,palette:l.palette,starting:l.starting,solution:EXPANDED_SOLUTIONS[l.slug]}))))'], cwd=root))
base = 'http://pattern-garden.test' if args.build_dir else args.base_url.rstrip('/')


def local_route(route):
    build = args.build_dir.resolve()
    path = (build / urlparse(route.request.url).path.lstrip('/')).resolve()
    if not path.is_relative_to(build) or not path.is_file():
        path = build / 'index.html'
    route.fulfill(path=str(path), content_type=mimetypes.guess_type(path.name)[0] or 'application/octet-stream')


measure = """() => {
 const rect=e=>e.getBoundingClientRect(), visible=e=>e.getClientRects().length;
 const targets=[...document.querySelectorAll('.pg-piece-tile,.pg-criterion,.pg-board-actions button')].filter(visible);
 const stage=rect(document.querySelector('.pg-stage')), board=rect(document.querySelector('.pg-board-viewport'));
 const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
 return {overflow:document.documentElement.scrollHeight>innerHeight+1||document.documentElement.scrollWidth>innerWidth+1,
 outside:targets.filter(e=>{let r=rect(e);return r.top<0||r.left<0||r.bottom>innerHeight+1||r.right>innerWidth+1}).map(e=>e.textContent),
 clipped:targets.filter(e=>e.scrollWidth>e.clientWidth+2||e.scrollHeight>e.clientHeight+2).map(e=>e.textContent),
 tiny:targets.filter(e=>rect(e).width<43||rect(e).height<43).map(e=>e.textContent),
 overlap:[...document.querySelectorAll('.pg-board-palette button,.pg-board-actions button')].some(e=>intersects(rect(e),board)),
 scroll:document.querySelector('.pg-criteria').scrollHeight>document.querySelector('.pg-criteria').clientHeight+1};
}"""

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

    def saved(slug):
        return page.evaluate('(slug)=>JSON.parse(localStorage.getItem("pattern-garden:v1")).layouts[slug]', slug)

    def screenshot(name):
        if args.screenshots:
            args.screenshots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(args.screenshots / f'{name}.png'))

    def tap_cell(x, y):
        point = page.evaluate('''([x,y])=>{let svg=document.querySelector('.pg-board'),p=svg.createSVGPoint();p.x=(x-y)*30;p.y=(x+y+1)*15;let c=p.matrixTransform(svg.getScreenCTM());return [c.x,c.y]}''', [x,y])
        page.touchscreen.tap(*point)

    def tap_wall(side, pos):
        point = page.locator(f'[data-wall-surface="{side}{pos}"] > polygon').first.evaluate('''e=>{let s=e.ownerSVGElement,p=s.createSVGPoint(),points=[...e.points];p.x=points.reduce((v,q)=>v+q.x,0)/points.length;p.y=points.reduce((v,q)=>v+q.y,0)/points.length;let c=p.matrixTransform(s.getScreenCTM());return [c.x,c.y]}''')
        page.touchscreen.tap(*point)

    open_level(fixtures[0]['slug'])
    page.evaluate('localStorage.removeItem("pattern-garden:v1")')
    for size in [(1440,900),(1280,660),(1024,670),(768,1024),(760,835),(390,844),(390,700),(375,667),(360,640),(844,390)]:
        page.set_viewport_size(dict(zip(['width','height'],size)))
        for fixture in fixtures:
            open_level(fixture['slug'])
            result = page.evaluate(measure)
            assert not any(result.values()), (size, fixture['slug'], result)
    print('PASS: 40 new-level viewport combinations, visible criteria, 44px controls and clear board')

    for size in [(1280,800),(390,700)]:
        page.set_viewport_size(dict(zip(['width','height'],size)))
        for fixture in fixtures:
            slug = fixture['slug']
            open_level(slug)
            page.get_by_role('button', name='Reset', exact=True).click()
            assert int(page.locator('.pg-score-value span').inner_text()) < 100
            if slug in ['tree-places','outdoor-room']:
                assert page.locator('[data-wall-surface]').count() == 0
                assert page.locator('.pg-floor').count() == 0
                assert page.locator('[data-ground-cell]').count() == 81
            if slug == 'front-door-bench':
                assert page.locator('.pg-street').count() == 9
            for piece in fixture['solution']:
                if piece in fixture['starting']:
                    continue
                kind = piece['kind']
                label = {'bench':'Bench','desk':'Desk','hedge':'Hedge','path':'Path stone'}.get(kind,kind.title())
                page.get_by_role('button', name=re.compile('^'+label+',')).click()
                if 'side' in piece:
                    tap_wall(piece['side'],piece['pos'])
                else:
                    tap_cell(piece['x'],piece['y'])
                page.wait_for_timeout(60)
                assert any(all(p.get(k)==v for k,v in piece.items()) for p in saved(slug)), (size,slug,piece,saved(slug),page.locator('.pg-toast').all_text_contents())
            expect(page.locator('.pg-score-value span')).to_have_text('100')
            expect(page.locator('.pg-celebration')).to_have_count(1)
            page.wait_for_timeout(3800)
            assert not any(page.evaluate(measure).values()), (size,slug,page.evaluate(measure))
            screenshot(f'{slug}-{size[0]}x{size[1]}')
            if slug == 'front-door-bench':
                page.get_by_role('button', name='Remove', exact=True).click()
                surface = page.evaluate('''()=>{const s=document.querySelector('.pg-board'),p=s.createSVGPoint();p.x=-37.429;p.y=101.083;const q=p.matrixTransform(s.getScreenCTM());return document.elementFromPoint(q.x,q.y)?.closest('[data-piece-cell]')?.getAttribute('data-piece-cell')}''')
                assert surface == '3,4', ('exterior bench painted behind facade', surface)
                page.get_by_role('button', name='Rotate', exact=True).click()
                page.get_by_role('button', name=re.compile('^Bench · column')).click()
                page.get_by_role('button', name='Face upper right', exact=True).click()
                page.get_by_role('button', name='Close explanation', exact=True).click()
                expect(page.locator('.pg-score-value span')).to_have_text('100')
                expect(page.locator('[data-facing-cell="3,4"]')).to_have_attribute('data-facing', 'n')
            if slug == 'tree-places':
                assert page.locator('[data-shade-cell]').count() > 0
                page.get_by_role('button', name='Daylight', exact=True).click()
                assert page.locator('[data-shade-cell]').count() == 0
                expect(page.locator('.pg-score-value span')).to_have_text('100')
                page.get_by_role('button', name='Daylight', exact=True).click()
            solution = saved(slug)
            page.reload()
            expect(page.locator('.pg-score-value span')).to_have_text('100')
            expect(page.locator('.pg-celebration')).to_have_count(0)
            assert saved(slug) == solution
            page.get_by_role('button', name='About this pattern', exact=True).click()
            expect(page.locator('.pg-adaptation')).to_be_visible()
            page.get_by_role('button', name='Close explanation', exact=True).click()
            page.get_by_role('button', name='Reset', exact=True).click()
            assert int(page.locator('.pg-score-value span').inner_text()) < 100
            expect(page.locator('.pg-celebration')).to_have_count(0)
            assert saved(slug) == fixture['starting']
    print('PASS: all four built from scratch by real touch on desktop and phone, completion, reload, reset and adaptation context')
    page.goto(base)
    expect(page.locator('.pg-level')).to_have_count(9)
    for fixture in fixtures:
        assert page.locator(f'a[href="/play/{fixture["slug"]}"]').count() >= 2
    assert not errors, errors
    print('PASS: nine playable levels indexed; no runtime errors')
    browser.close()
