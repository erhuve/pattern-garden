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


def local_route(route):
    root = args.build_dir.resolve()
    path = (root / urlparse(route.request.url).path.lstrip("/")).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        path = root / "index.html"
    route.fulfill(path=str(path), content_type=mimetypes.guess_type(path.name)[0] or "application/octet-stream")


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    context = browser.new_context(has_touch=True, reduced_motion="reduce")
    if args.build_dir:
        context.route(f"{base}/**", local_route)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    slug = "window-place"

    def load(pieces, level="window-place"):
        global slug
        slug = level
        page.goto(f"{base}/play/{slug}")
        page.wait_for_selector(".pg-workbench")
        page.evaluate("document.fonts.ready")
        page.evaluate("saved => localStorage.setItem('pattern-garden:v1', JSON.stringify(saved))", {"version": 2, "best": {slug: 100}, "layouts": {slug: pieces}})
        page.reload()
        page.wait_for_selector(".pg-workbench")
        page.evaluate("document.fonts.ready")
        expect(page.locator(".pg-celebration")).to_have_count(0)

    def saved():
        return page.evaluate("slug => JSON.parse(localStorage.getItem('pattern-garden:v1')).layouts[slug]", slug)

    def tap_art(selector, dx=0, dy=0):
        point = page.locator(selector).evaluate("(el, delta) => {const r=el.getBBox();const svg=el.ownerSVGElement;const p=svg.createSVGPoint();p.x=r.x+r.width/2+delta[0];p.y=r.y+r.height/2+delta[1];const q=p.matrixTransform(el.getScreenCTM());return {x:q.x,y:q.y}}", [dx, dy])
        page.touchscreen.tap(point["x"], point["y"])

    def tap_cell(x, y):
        point = page.locator(".pg-board").evaluate("(svg, cell) => {const p=svg.createSVGPoint();p.x=(cell[0]-cell[1])*30;p.y=(cell[0]+cell[1]+1)*15;const q=p.matrixTransform(svg.getScreenCTM());return {x:q.x,y:q.y}}", [x, y])
        page.touchscreen.tap(point["x"], point["y"])

    def shot(name):
        if args.screenshots:
            args.screenshots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(args.screenshots / f"{name}.png"))

    for width, height in [(1280, 800), (390, 700), (360, 640)]:
        page.set_viewport_size({"width": width, "height": height})
        for side, x, y in [("n", 3, 2), ("s", 3, 4), ("w", 2, 3), ("e", 5, 3)]:
            pieces = [{"kind": "window", "side": side, "pos": 1}, {"kind": "seat", "x": x, "y": y, "facing": "e"}]
            load(pieces)
            original_score = page.locator(".pg-score-value span").inner_text()
            page.get_by_role("button", name="Plant,", exact=False).tap()
            tap_art(f'[data-wall-surface="{side}1"] .pg-glass', dy=-3)
            expect(page.get_by_role("button", name="Plant, 1 of 2", exact=False)).to_be_visible()
            expect(page.locator(f'[data-sill-plant="{side}1"]')).to_have_count(1)
            assert saved() == [{**pieces[0], "sillPlant": True}, pieces[1]]
            assert page.locator(".pg-score-value span").inner_text() == original_score
            page.reload()
            expect(page.locator(f'[data-sill-plant="{side}1"]')).to_have_count(1)
            page.get_by_role("button", name="Remove", exact=True).tap()
            tap_art(f'[data-sill-plant="{side}1"] ellipse:first-of-type')
            expect(page.get_by_role("dialog")).to_contain_text("Remove from this window")
            page.get_by_role("button", name="Remove plant only", exact=True).tap()
            expect(page.locator("[data-sill-plant]")).to_have_count(0)
            assert saved() == pieces
            page.get_by_role("button", name="Plant,", exact=False).tap()
            tap_art(f'[data-wall-surface="{side}1"] .pg-glass', dy=-3)
            page.get_by_role("button", name="Remove", exact=True).tap()
            tap_art(f'[data-wall-surface="{side}1"] .pg-glass', dy=-7)
            expect(page.get_by_role("dialog")).to_contain_text("Remove from this window")
            before = saved()
            page.keyboard.press("Escape")
            assert saved() == before
            expect(page.get_by_role("button", name="Remove", exact=True)).to_be_focused()
            tap_art(f'[data-wall-surface="{side}1"] .pg-glass', dy=-7)
            page.get_by_role("button", name="Remove window and plant", exact=True).tap()
            expect(page.get_by_role("button", name="Window, 0 of 3", exact=False)).to_be_visible()
            expect(page.get_by_role("button", name="Plant, 0 of 2", exact=False)).to_be_visible()
            assert saved() == [pieces[1]]
    print("PASS: all four sills accept plants, preserve chairs, share inventory, reload, remove plant vs whole window by real touch at three sizes")

    page.set_viewport_size({"width": 390, "height": 700})
    nook = [{"kind": "window", "side": "n", "pos": 1}, {"kind": "seat", "x": 3, "y": 2}, {"kind": "shelf", "x": 2, "y": 2}]
    load(nook)
    expect(page.locator(".pg-score-value span")).to_have_text("100")
    page.get_by_role("button", name="Plant,", exact=False).tap()
    tap_art('[data-wall-surface="n1"] .pg-glass', dy=-3)
    tap_cell(4, 3)
    expect(page.get_by_role("button", name="Plant, 2 of 2", exact=False)).to_be_visible()
    original = saved()
    tap_cell(5, 3)
    expect(page.locator(".pg-toast")).to_be_visible()
    assert saved() == original
    page.locator(".pg-toast button").tap()
    shot("window-nook-planted-mobile")
    load(nook + [{"kind": "shelf", "x": 4, "y": 2}, {"kind": "table", "x": 3, "y": 3}])
    assert int(page.locator(".pg-score-value span").inner_text()) < 100
    expect(page.locator(".pg-success")).to_have_count(0)
    assert page.evaluate("JSON.parse(localStorage.getItem('pattern-garden:v1')).best['window-place']") == 100
    print("PASS: optional plants, mixed inventory cap, current nook access vs historical completion")

    for width, height in [(1280, 800), (390, 700)]:
        page.set_viewport_size({"width": width, "height": height})
        for side in ["n", "s", "e", "w"]:
            door = {"kind": "door", "side": side, "pos": 1}
            load([door], "sitting-circle")
            leaf = page.locator(f'[data-full-door="{side}1"] .pg-door')
            assert leaf.evaluate("e => e.getBBox().height") >= 40
            expect(page.locator(f'[data-full-door="{side}1"] .pg-door-knob')).to_have_count(1)
            assert page.locator(".pg-floor").count() == 42
            shot(f"full-door-{side}-{width}")
            page.get_by_role("button", name="Seat,", exact=False).tap()
            tap_art(f'[data-full-door="{side}1"] .pg-door', dy=-11)
            assert saved() == [door]
            expect(page.get_by_role("button", name="Seat, 0 of 8", exact=False)).to_be_visible()
            page.get_by_role("button", name="Remove", exact=True).tap()
            tap_art(f'[data-full-door="{side}1"] .pg-door', dy=-11)
            expect(page.locator("[data-full-door]")).to_have_count(0)
            assert saved() == []
    print("PASS: full-height doors on all four walls stay visible and erasable in the expanded 42-cell room")

    page.set_viewport_size({"width": 1280, "height": 800})
    protected = [{"kind": "door", "side": "s", "pos": 3}, {"kind": "seat", "x": 4, "y": 7}]
    load(protected, "sitting-circle")
    page.get_by_role("button", name="Remove", exact=True).click()
    points = page.locator(".pg-board").evaluate("svg => [[-91,184],[-89,184]].map(([x,y])=>{const p=svg.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(svg.getScreenCTM());return {x:q.x,y:q.y}})")
    page.mouse.move(points[0]["x"], points[0]["y"])
    page.mouse.down()
    page.mouse.move(points[1]["x"], points[1]["y"])
    page.mouse.up()
    assert {"kind": "seat", "x": 4, "y": 7} in saved(), "Short cross-wall tap erased through a door"
    load([], "sitting-circle")
    page.get_by_role("button", name="Seat,", exact=False).click()
    point = page.locator(".pg-board").evaluate("svg => {const p=svg.createSVGPoint();p.x=0;p.y=135;const q=p.matrixTransform(svg.getScreenCTM());return {x:q.x,y:q.y}}")
    page.mouse.move(point["x"], point["y"])
    page.mouse.down()
    page.mouse.move(point["x"] + 40, point["y"], steps=4)
    page.mouse.move(point["x"], point["y"], steps=4)
    page.mouse.up()
    assert saved() == [], "Out-and-back drag placed a piece"
    tap_cell(4, 4)
    expect(page.get_by_role("button", name="Seat, 1 of 8", exact=False)).to_be_visible()
    print("PASS: short cross-wall clicks respect door occlusion; out-and-back drags never commit; next tap works")

    circle = [{"kind": "door", "side": "s", "pos": 0}, {"kind": "hearth", "x": 5, "y": 3}]
    circle += [{"kind": "seat", "x": x, "y": y} for x, y in [(4, 2), (5, 2), (6, 2), (4, 3), (6, 3), (5, 4)]]
    load(circle, "sitting-circle")
    expect(page.locator(".pg-score-value span")).to_have_text("100")
    assert saved() == circle
    page.get_by_role("button", name="Shelf,", exact=False).tap()
    tap_cell(8, 7)
    expect(page.get_by_role("button", name="Shelf, 1 of 2", exact=False)).to_be_visible()
    page.set_viewport_size({"width": 390, "height": 700})
    shot("larger-sitting-circle-mobile")
    page.set_viewport_size({"width": 1280, "height": 800})
    shot("larger-sitting-circle-desktop")
    assert not errors, errors
    print("PASS: existing Sitting Circle layout preserved and new room cells are usable; no runtime errors")
    browser.close()
