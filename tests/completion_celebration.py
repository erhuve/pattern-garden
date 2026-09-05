import argparse
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


windows = [{"kind": "window", "side": "n", "pos": pos} for pos in [0, 1, 2]]
windows += [{"kind": "window", "side": "e", "pos": 0}]
one_seat = windows + [{"kind": "seat", "x": 3, "y": 2}]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    context = browser.new_context(has_touch=True)
    if args.build_dir:
        context.route(f"{base}/**", local_route)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    overlay = page.locator(".pg-celebration")

    def load(pieces, slug="light-on-two-sides"):
        page.goto(f"{base}/play/{slug}")
        page.wait_for_selector(".pg-workbench")
        page.evaluate("document.fonts.ready")
        saved = {"version": 2, "best": {slug: 100}, "layouts": {slug: pieces}}
        page.evaluate("saved => localStorage.setItem('pattern-garden:v1', JSON.stringify(saved))", saved)
        page.reload()
        page.wait_for_selector(".pg-workbench")
        page.evaluate("document.fonts.ready")
        expect(overlay).to_have_count(0)

    def cell(x, y):
        point = page.locator(".pg-board").evaluate("(svg, cell) => {const p=svg.createSVGPoint();p.x=(cell[0]-cell[1])*30;p.y=(cell[0]+cell[1]+1)*15;const q=p.matrixTransform(svg.getScreenCTM());return {x:q.x,y:q.y}}", [x, y])
        page.touchscreen.tap(point["x"], point["y"])

    def complete():
        page.get_by_role("button", name="Seat,", exact=False).tap()
        cell(4, 2)
        expect(page.locator(".pg-score-value span")).to_have_text("100")
        expect(overlay).to_be_visible()
        expect(overlay).to_contain_text("100% · pattern fulfilled")
        expect(overlay).to_have_attribute("aria-hidden", "true")
        expect(page.locator(".pg-success[role=status]")).to_contain_text("The pattern is alive")

    def remove():
        page.get_by_role("button", name="Remove", exact=True).tap()
        cell(4, 2)
        expect(overlay).to_have_count(0)
        assert int(page.locator(".pg-score-value span").inner_text()) < 100

    def fits():
        assert overlay.evaluate("e => {const a=e.querySelector('.pg-celebration-banner').getBoundingClientRect();const b=e.closest('.pg-stage').getBoundingClientRect();return a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom}"), "Banner exceeds board"
        assert overlay.evaluate("e => getComputedStyle(e).pointerEvents") == "none"
        assert page.evaluate("document.documentElement.scrollWidth === innerWidth && document.documentElement.scrollHeight === innerHeight"), "Celebration changes page layout"
        assert not page.evaluate("document.activeElement.closest('.pg-celebration')"), "Celebration steals focus"

    def screenshot(name):
        if args.screenshots:
            args.screenshots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(args.screenshots / f"{name}.png"))

    for width, height in [(1440, 900), (390, 700), (360, 640), (844, 390)]:
        page.set_viewport_size({"width": width, "height": height})
        load(one_seat)
        assert int(page.locator(".pg-score-value span").inner_text()) < 100
        complete()
        page.wait_for_timeout(650)
        fits()
        assert overlay.evaluate("e => e.getAnimations({subtree:true}).length") > 0
        screenshot(f"celebration-{width}x{height}")
        page.evaluate("window.activeCelebration = document.querySelector('.pg-celebration')")
        page.get_by_role("button", name="Daylight", exact=True).tap()
        assert page.evaluate("window.activeCelebration === document.querySelector('.pg-celebration')"), "Rerender restarts animation"
        page.get_by_role("button", name="Plant,", exact=False).tap()
        cell(5, 3)
        expect(page.get_by_role("button", name="Plant, 1 of 2", exact=False)).to_be_visible()
        assert page.evaluate("window.activeCelebration === document.querySelector('.pg-celebration')"), "Still-complete edit restarts animation"
        expect(overlay).to_have_count(0, timeout=4200)
        page.wait_for_timeout(100)
        expect(overlay).to_have_count(0)
        screenshot(f"after-celebration-{width}x{height}")
        page.reload()
        expect(page.locator(".pg-score-value span")).to_have_text("100")
        expect(overlay).to_have_count(0)
        remove()
        complete()
        remove()
    print("PASS: desktop, phone and landscape completion, fit, fade, no replay on rerender/edit/reload, pointer passthrough and recompletion")

    page.set_viewport_size({"width": 1280, "height": 720})
    load(one_seat)
    complete()
    page.get_by_role("button", name="Reset", exact=True).tap()
    expect(overlay).to_have_count(0)
    expect(page.locator(".pg-score-value span")).to_have_text("0")
    load(one_seat)
    complete()
    page.get_by_role("button", name="Next pattern", exact=True).first.tap()
    expect(page.locator("h1")).to_have_text("Entrance Transition")
    expect(overlay).to_have_count(0)
    page.get_by_role("button", name="Previous pattern", exact=True).tap()
    expect(page.locator(".pg-score-value span")).to_have_text("100")
    expect(overlay).to_have_count(0)
    remove()
    complete()
    page.wait_for_timeout(2400)
    remove()
    complete()
    page.wait_for_timeout(1500)
    expect(overlay).to_be_visible()
    expect(overlay).to_have_count(0, timeout=3000)
    print("PASS: reset and navigation cancel celebration; old timers never dismiss a fresh completion")

    page.set_viewport_size({"width": 390, "height": 700})
    page.emulate_media(reduced_motion="reduce")
    load(one_seat)
    complete()
    fits()
    assert overlay.evaluate("e => e.getAnimations({subtree:true}).length") == 0
    expect(page.locator(".pg-celebration-petals")).not_to_be_visible()
    expect(page.locator(".pg-celebration-rings")).not_to_be_visible()
    screenshot("celebration-reduced-motion")
    expect(overlay).to_have_count(0, timeout=4200)
    expect(page.locator(".pg-success")).to_be_visible()
    print("PASS: reduced motion keeps clear static confirmation and persistent success summary")

    page.emulate_media(reduced_motion="no-preference")
    page.set_viewport_size({"width": 360, "height": 640})
    path = [(2, 7), (3, 7), (4, 7), (5, 7), (5, 6), (5, 5), (5, 4)]
    entrance = [{"kind": "door", "side": "s", "pos": 0}, {"kind": "gate", "x": 1, "y": 7}]
    entrance += [{"kind": "path", "x": x, "y": y} for x, y in path if (x, y) != (4, 7)]
    entrance += [{"kind": "tree", "x": 4, "y": 6}]
    load(entrance, "entrance-transition")
    assert int(page.locator(".pg-score-value span").inner_text()) < 100
    page.get_by_role("button", name="Path stone,", exact=False).tap()
    cell(4, 7)
    expect(page.locator(".pg-score-value span")).to_have_text("100")
    expect(overlay).to_be_visible()
    page.wait_for_timeout(650)
    fits()
    screenshot("celebration-entrance-mobile")
    assert not errors, errors
    print("PASS: shared celebration works on six-criterion level and leaves layout unchanged; no runtime errors")
    browser.close()
