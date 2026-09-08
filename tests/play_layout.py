import argparse
import json
import mimetypes
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument("--build-dir", type=Path)
parser.add_argument("--base-url", default="http://localhost:57563")
parser.add_argument("--screenshots", type=Path)
args = parser.parse_args()
base = "http://pattern-garden.test" if args.build_dir else args.base_url.rstrip("/")
levels = ["light-on-two-sides", "entrance-transition", "window-place", "alcoves", "sitting-circle"]
viewports = [(1440, 900), (1280, 720), (1024, 768), (820, 1180), (768, 1024), (390, 844), (390, 700), (375, 667), (360, 640), (844, 390)]


def local_route(route):
    root = args.build_dir.resolve()
    path = (root / urlparse(route.request.url).path.lstrip("/")).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        path = root / "index.html"
    route.fulfill(path=str(path), content_type=mimetypes.guess_type(path.name)[0] or "application/octet-stream")


measure = """() => {
  const visible = e => e.getClientRects().length > 0;
  const targets = [...document.querySelectorAll('.pg-tool,.pg-criterion,.pg-board-actions button,.pg-play-head button,.pg-back')].filter(visible);
  const rect = e => e.getBoundingClientRect();
  const criteria = document.querySelector('.pg-criteria');
  return {
    page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    outside: targets.filter(e => {const r=rect(e);return r.bottom>innerHeight+1||r.right>innerWidth+1||r.left<0||r.top<0}).map(e=>e.textContent),
    tiny: targets.filter(e => rect(e).width<43||rect(e).height<43).map(e=>e.textContent),
    clipped: [...document.querySelectorAll('.pg-tool,.pg-criterion,.pg-play-title')].filter(e => e.scrollWidth>e.clientWidth+2||e.scrollHeight>e.clientHeight+2).map(e=>e.textContent),
    criteriaScroll: criteria.scrollHeight>criteria.clientHeight+1,
    board: [rect(document.querySelector('.pg-board')).width, rect(document.querySelector('.pg-board')).height],
    rail: (() => {
      const stage = rect(document.querySelector('.pg-stage'));
      const viewport = rect(document.querySelector('.pg-board-viewport'));
      const tiles = [...document.querySelectorAll('.pg-piece-tile')];
      const controls = [...document.querySelectorAll('.pg-board-palette button,.pg-board-actions button')];
      const contains = (a,b) => b.left>=a.left && b.top>=a.top && b.right<=a.right && b.bottom<=a.bottom;
      const intersects = (a,b) => a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top;
      return {
        trayGone: !document.querySelector('.pg-tray'),
        inside: controls.every(e => contains(stage,rect(e))),
        clearBoard: controls.every(e => !intersects(rect(e),viewport)),
        square: tiles.every(e => Math.abs(rect(e).width-rect(e).height)<1),
        hittable: controls.every(e => {const r=rect(e);return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),
        counters: tiles.filter(e=>e.querySelector('.pg-tool-count')).every(e => {
          const tile=rect(e), count=rect(e.querySelector('.pg-tool-count'));
          return contains(tile,count) && count.top>tile.top+tile.height/2 && tile.right-count.right<=8 && tile.bottom-count.bottom<=8;
        }),
        icons: tiles.every(e=>e.querySelector('svg[aria-hidden=true]')),
        fullHeight: innerWidth<=760 || Math.abs(stage.bottom-rect(criteria).bottom)<2
      };
    })()
  };
}"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    context = browser.new_context(has_touch=True)
    if args.build_dir:
        context.route(f"{base}/**", local_route)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    def open_level(slug):
        page.goto(f"{base}/play/{slug}")
        page.wait_for_selector(".pg-workbench")
        page.evaluate("document.fonts.ready")

    def screenshot(name):
        if args.screenshots:
            args.screenshots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(args.screenshots / f"{name}.png"))

    for width, height in viewports:
        page.set_viewport_size({"width": width, "height": height})
        for slug in levels:
            open_level(slug)
            result = page.evaluate(measure)
            assert result["page"] == [width, height], (slug, width, height, result)
            assert not result["outside"] and not result["tiny"] and not result["clipped"], (slug, width, height, result)
            assert not result["criteriaScroll"], (slug, width, height, result)
            assert result["board"][1] >= 140, (slug, width, height, result)
            assert all(result["rail"].values()), (slug, width, height, result)
            assert page.locator('.pg-board').evaluate("svg => [...svg.querySelectorAll('[data-cell],[data-wall]')].every(el => {const b=el.getBBox(), p=svg.createSVGPoint();p.x=b.x+b.width/2;p.y=b.y+b.height/2;const q=p.matrixTransform(svg.getScreenCTM());return svg.contains(document.elementFromPoint(q.x,q.y))})"), (slug, width, height, "Board covered")
            if slug in ["light-on-two-sides", "entrance-transition", "sitting-circle"] and (width, height) in [(1440, 900), (390, 700), (360, 640), (844, 390)]:
                screenshot(f"{slug}-{width}x{height}")
    print(f"PASS: {len(levels) * len(viewports)} viewport/level combinations without scrolling, clipping or undersized controls")

    page.set_viewport_size({"width": 320, "height": 568})
    for slug in levels:
        open_level(slug)
        result = page.evaluate(measure)
        assert result["page"][0] == 320 and not result["clipped"] and not result["tiny"], (slug, result)
        for check in page.locator(".pg-criterion").all():
            check.scroll_into_view_if_needed()
            check.tap()
            expect(page.locator("dialog")).to_be_visible()
            page.get_by_role("button", name="Close explanation").tap()
    print("PASS: 320px fallback preserves readable, reachable criteria")

    page.set_viewport_size({"width": 390, "height": 700})
    for slug in levels:
        open_level(slug)
        initial = page.evaluate("JSON.parse(localStorage.getItem('pattern-garden:v1')).layouts")
        for tile in page.locator(".pg-piece-tile").all():
            label = tile.get_attribute("aria-label").split(",")[0]
            tile.tap()
            if label == "Rotate":
                expect(page.locator("dialog")).to_be_visible()
                page.get_by_role("button", name="Close explanation").tap()
            expect(tile).to_have_attribute("aria-pressed", "true")
            expect(page.locator(".pg-piece-tile[aria-pressed=true]")).to_have_count(1)
            expect(page.locator(".pg-placement-hint strong")).to_have_text(label)
            expect(page.locator(".pg-toast")).to_have_count(0)
            assert page.evaluate("JSON.parse(localStorage.getItem('pattern-garden:v1')).layouts") == initial
        tile = page.locator(".pg-piece-tile").first
        tile.focus()
        page.keyboard.press("Enter")
        expect(tile).to_have_attribute("aria-pressed", "true")
        expect(tile).to_be_focused()
        assert page.evaluate("JSON.parse(localStorage.getItem('pattern-garden:v1')).layouts") == initial
    print("PASS: all icon tools select by touch and keyboard without placing or erasing through the palette")

    page.set_viewport_size({"width": 1280, "height": 720})
    open_level("entrance-transition")
    check = page.locator(".pg-criterion").nth(4)
    check.click()
    expect(page.locator(".pg-check-explanation")).to_contain_text("Plant beside the path")
    page.get_by_role("button", name="About this pattern").click()
    expect(page.locator("dialog")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.locator("dialog")).not_to_be_visible()
    expect(page.get_by_role("button", name="About this pattern")).to_be_focused()
    print("PASS: desktop criterion selection and modal Escape/focus restoration")

    page.set_viewport_size({"width": 390, "height": 700})
    open_level("entrance-transition")
    check = page.locator(".pg-criterion").nth(4)
    check.tap()
    expect(page.locator("dialog")).to_contain_text("Plant beside the path")
    expect(page.get_by_role("button", name="Close explanation")).to_be_focused()
    page.keyboard.press("Tab")
    assert page.evaluate("document.activeElement === document.body || document.querySelector('dialog').contains(document.activeElement)")
    page.get_by_role("button", name="Close explanation").tap()
    expect(check).to_be_focused()
    expect(page.locator("dialog")).not_to_be_visible()
    print("PASS: touch explanations, modal focus containment and close restoration")

    windows = [{"kind": "window", "side": "n", "pos": pos} for pos in [0, 1, 2]] + [{"kind": "window", "side": "e", "pos": 0}]
    one_seat = windows + [{"kind": "seat", "x": 3, "y": 2}]
    saved = {"version": 2, "best": {"light-on-two-sides": 100}, "layouts": {"light-on-two-sides": one_seat}}
    page.evaluate("saved => localStorage.setItem('pattern-garden:v1', JSON.stringify(saved))", saved)
    open_level("light-on-two-sides")
    assert int(page.locator(".pg-score-value span").inner_text()) < 100
    expect(page.locator(".pg-success")).to_have_count(0)
    expect(page.get_by_role("button", name="Window,", exact=False).locator(".pg-tool-count")).to_have_text("4/4")
    expect(page.get_by_role("button", name="Seat,", exact=False).locator(".pg-tool-count")).to_have_text("1/2")

    def tap_svg(x, y):
        point = page.locator(".pg-board").evaluate("(svg, point) => {const p=svg.createSVGPoint();p.x=point[0];p.y=point[1];const q=p.matrixTransform(svg.getScreenCTM());return {x:q.x,y:q.y}}", [x, y])
        page.touchscreen.tap(point["x"], point["y"])

    def tap_cell(x, y):
        tap_svg((x - y) * 30, (x + y + 1) * 15)

    page.get_by_role("button", name="Seat,", exact=False).tap()
    tap_cell(4, 2)
    expect(page.get_by_role("button", name="Seat,", exact=False).locator(".pg-tool-count")).to_have_text("2/2")
    expect(page.locator(".pg-score-value span")).to_have_text("100")
    expect(page.locator(".pg-success")).to_contain_text("The pattern is alive")
    assert not page.evaluate(measure)["outside"]
    screenshot("play-mobile-complete")
    page.locator(".pg-criterion").first.tap()
    expect(page.locator("dialog")).to_be_visible()
    page.get_by_role("button", name="Close explanation").tap()
    page.get_by_role("button", name="Remove", exact=True).tap()
    tap_cell(4, 2)
    expect(page.get_by_role("button", name="Seat,", exact=False).locator(".pg-tool-count")).to_have_text("1/2")
    assert page.get_by_role("button", name="Window,", exact=False).evaluate("el => getComputedStyle(el).opacity") == "1"
    expect(page.locator(".pg-success")).to_have_count(0)
    assert int(page.locator(".pg-score-value span").inner_text()) < 100
    page.reload()
    expect(page.get_by_role("button", name="Seat, 1 of 2", exact=False)).to_be_visible()
    assert int(page.locator(".pg-score-value span").inner_text()) < 100
    print("PASS: real touch placement/removal, one-seat regression, current completion vs saved best, reload persistence")

    page.get_by_role("button", name="Reset", exact=True).tap()
    expect(page.get_by_role("button", name="Seat, 0 of 2", exact=False)).to_be_visible()
    page.get_by_role("button", name="Window,", exact=False).tap()
    tap_svg(0, 59)
    expect(page.get_by_role("button", name="Window, 1 of 4", exact=False)).to_be_visible()
    expect(page.locator(".pg-toast")).to_have_count(0)
    page.get_by_role("button", name="Daylight", exact=True).tap()
    expect(page.get_by_role("button", name="Daylight", exact=True)).to_have_attribute("aria-pressed", "false")
    print("PASS: reset, resized wall touch target and daylight toggle")

    page.set_viewport_size({"width": 1280, "height": 720})
    page.get_by_role("button", name="Next pattern", exact=True).tap()
    expect(page.locator("h1")).to_have_text("Entrance Transition")
    expect(page.get_by_role("button", name="Door, 0 of 1", exact=False)).to_be_visible()
    page.get_by_role("button", name="Previous pattern", exact=True).tap()
    expect(page.get_by_role("button", name="Window, 1 of 4", exact=False)).to_be_visible()
    print("PASS: navigation never copies one level's pieces to another")

    path_cells = [(2, 7), (3, 7), (4, 7), (5, 7), (5, 6), (5, 5), (5, 4)]
    entrance = [{"kind": "door", "side": "s", "pos": 0}, {"kind": "gate", "x": 1, "y": 7}]
    entrance += [{"kind": "path", "x": x, "y": y} for x, y in path_cells]
    entrance += [{"kind": "tree", "x": 4, "y": 6}, {"kind": "plant", "x": 4, "y": 5}]
    circle = [{"kind": "door", "side": "s", "pos": 0}, {"kind": "hearth", "x": 5, "y": 3}]
    circle += [{"kind": "seat", "x": x, "y": y} for x, y in [(4, 2), (5, 2), (6, 2), (4, 3), (6, 3), (5, 4)]]
    for width, height in [(360, 640), (375, 667), (844, 390), (1280, 720)]:
        page.set_viewport_size({"width": width, "height": height})
        for slug, pieces in [("entrance-transition", entrance), ("sitting-circle", circle)]:
            page.evaluate("saved => localStorage.setItem('pattern-garden:v1', JSON.stringify(saved))", {"version": 2, "best": {}, "layouts": {slug: pieces}})
            open_level(slug)
            expect(page.locator(".pg-score-value span")).to_have_text("100")
            result = page.evaluate(measure)
            assert result["page"] == [width, height] and not result["outside"] and not result["criteriaScroll"], (slug, width, height, result)
            if width == 375:
                screenshot(f"{slug}-complete-375x667")
    print("PASS: six-criterion completion states fit small phones and landscape")

    page.set_viewport_size({"width": 390, "height": 700})
    open_level("entrance-transition")
    page.get_by_role("button", name="About this pattern").tap()
    expect(page.get_by_role("navigation", name="Browse patterns")).to_have_count(1)
    page.get_by_role("link", name="Next pattern", exact=True).tap()
    expect(page.locator("h1")).to_have_text("Window Place")
    expect(page.locator("dialog")).not_to_be_visible()
    print("PASS: mobile navigation remains accessible from About")

    open_level("entrance-transition")
    page.set_viewport_size({"width": 640, "height": 500})
    page.add_style_tag(content="html { font-size: 24px; }")
    assert page.evaluate("document.documentElement.scrollWidth") == 640
    for check in page.locator(".pg-criterion").all():
        check.scroll_into_view_if_needed()
        check.click()
        expect(page.locator("dialog")).to_be_visible()
        page.get_by_role("button", name="Close explanation").click()
    assert not errors, errors
    print("PASS: enlarged-text scroll fallback, no runtime errors")
    browser.close()
