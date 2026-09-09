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
    context = browser.new_context(has_touch=True, viewport={"width": 390, "height": 700})
    if args.build_dir:
        context.route(f"{base}/**", local_route)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{base}/play/sitting-circle")
    page.wait_for_selector(".pg-workbench")

    def seed(slug, pieces, version=2):
        saved = {"version": version, "best": {slug: 0}, "layouts": {slug: pieces}}
        page.evaluate("s=>localStorage.setItem('pattern-garden:v1',JSON.stringify(s))", saved)
        page.goto(f"{base}/play/{slug}")
        page.wait_for_selector(".pg-workbench")
        page.evaluate("document.fonts.ready")

    def stored(slug):
        return page.evaluate("slug=>JSON.parse(localStorage.getItem('pattern-garden:v1')).layouts[slug]", slug)

    def glyph(x, y):
        return page.locator(f'.pg-board [data-facing-cell="{x},{y}"]')

    def cell(x, y):
        point = page.locator(".pg-board").evaluate("""(svg,c)=>{const p=svg.createSVGPoint();p.x=(c[0]-c[1])*30;p.y=(c[0]+c[1]+1)*15;const s=p.matrixTransform(svg.getScreenCTM());return {x:s.x,y:s.y}}""", [x, y])
        page.touchscreen.tap(point["x"], point["y"])

    def rotate_from_list(x, y):
        page.get_by_role("button", name="Rotate", exact=True).tap()
        expect(page.get_by_role("heading", name="Choose a piece to turn")).to_be_visible()
        page.get_by_role("button", name=f"Seat · column {x+1}, row {y+1}", exact=True).tap()
        expect(page.get_by_role("heading", name="Turn seat", exact=True)).to_be_visible()

    def close():
        page.get_by_role("button", name="Close explanation", exact=True).tap()
        expect(page.locator("dialog")).not_to_be_visible()

    def screenshot(name):
        if args.screenshots:
            args.screenshots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(args.screenshots / f"{name}.png"))

    pieces = [{"kind": "seat", "x": 4, "y": 2}, {"kind": "seat", "x": 5, "y": 3}, {"kind": "seat", "x": 4, "y": 4}, {"kind": "seat", "x": 3, "y": 3}, {"kind": "hearth", "x": 4, "y": 3}]
    seed("sitting-circle", pieces)
    for x, y, side in [(4, 2, "s"), (5, 3, "w"), (4, 4, "n"), (3, 3, "e")]:
        expect(glyph(x, y)).to_have_attribute("data-facing", side)
        expect(glyph(x, y)).to_have_attribute("data-facing-mode", "auto")
    score = page.locator(".pg-score-value span").inner_text()
    checks = page.locator(".pg-criteria").inner_text()
    assert stored("sitting-circle") == pieces
    screenshot("circle-phone-auto")
    rotate_from_list(4, 2)
    expect(page.get_by_role("button", name="Close explanation")).to_be_focused()
    page.get_by_role("button", name="Face upper right", exact=True).tap()
    expect(glyph(4, 2)).to_have_attribute("data-facing", "n")
    expect(glyph(4, 2)).to_have_attribute("data-facing-mode", "manual")
    screenshot("direction-chooser-phone")
    close()
    expect(page.get_by_role("button", name="Rotate", exact=True)).to_be_focused()
    assert page.locator(".pg-score-value span").inner_text() == score
    assert page.locator(".pg-criteria").inner_text() == checks
    assert stored("sitting-circle")[0] == {**pieces[0], "facing": "n"}
    page.reload()
    expect(glyph(4, 2)).to_have_attribute("data-facing", "n")
    expect(glyph(4, 2)).to_have_attribute("data-facing-mode", "manual")
    assert page.locator(".pg-celebration").count() == 0
    page.get_by_role("button", name="Remove", exact=True).tap()
    cell(4, 3)
    expect(page.get_by_role("button", name="Hearth, 0 of 1", exact=False)).to_be_visible()
    expect(glyph(4, 2)).to_have_attribute("data-facing", "n")
    page.get_by_role("button", name="Hearth, 0 of 1", exact=False).tap()
    cell(4, 3)
    rotate_from_list(4, 2)
    page.get_by_role("button", name="Auto", exact=False).tap()
    expect(glyph(4, 2)).to_have_attribute("data-facing", "s")
    expect(glyph(4, 2)).to_have_attribute("data-facing-mode", "auto")
    close()
    assert "facing" not in stored("sitting-circle")[0]
    assert [{k: v for k, v in piece.items() if k != "facing"} for piece in stored("sitting-circle")] == pieces
    print("PASS: auto circle, fixed direction persistence, furniture updates, Auto removal, unchanged score/checks/counts and no completion replay")

    for side, button in [("n", "Face upper right"), ("e", "Face lower right"), ("s", "Face lower left"), ("w", "Face upper left")]:
        rotate_from_list(4, 2)
        page.get_by_role("button", name=button, exact=True).tap()
        expect(glyph(4, 2)).to_have_attribute("data-facing", side)
        close()
    page.get_by_role("button", name="Rotate", exact=True).focus()
    page.keyboard.press("Enter")
    chooser = page.get_by_role("button", name="Seat · column 5, row 3", exact=True)
    chooser.focus()
    page.keyboard.press("Enter")
    expect(page.get_by_role("button", name="Close explanation")).to_be_focused()
    page.get_by_role("button", name="Face lower left").focus()
    page.keyboard.press("Enter")
    expect(glyph(4, 2)).to_have_attribute("data-facing", "s")
    page.keyboard.press("Escape")
    expect(page.get_by_role("button", name="Rotate", exact=True)).to_be_focused()
    print("PASS: four fixed directions and complete keyboard-only selection, focus containment/restoration")

    cell(4, 2)
    expect(page.get_by_role("heading", name="Turn seat", exact=True)).to_be_visible()
    close()
    before = stored("sitting-circle")
    cell(4, 3)
    expect(page.locator("dialog")).not_to_be_visible()
    expect(page.locator(".pg-toast")).to_be_visible()
    assert stored("sitting-circle") == before
    cell(0, 0)
    assert stored("sitting-circle") == before
    print("PASS: touch picking and symmetric/empty targets do not place, remove or corrupt data")

    painted = glyph(4, 2).evaluate("""el => {const r=el.getBoundingClientRect();for(let y=r.top+1;y<r.bottom;y+=1){for(let x=r.left+1;x<r.right;x+=1){const hit=document.elementFromPoint(x,y);if(hit&&el.contains(hit))return {x,y}}}throw Error('No visible painted seat pixels')}""")
    page.touchscreen.tap(painted["x"], painted["y"])
    expect(page.get_by_role("heading", name="Turn seat", exact=True)).to_be_visible()
    close()
    wall = page.locator('.pg-board [data-wall-surface="n0"]').evaluate("""el => {const r=el.getBoundingClientRect();for(let y=r.top+1;y<r.bottom;y+=2){for(let x=r.left+1;x<r.right;x+=2){const hit=document.elementFromPoint(x,y);if(hit&&el.contains(hit)&&!hit.classList.contains('pg-floor'))return {x,y}}}throw Error('No visible wall pixels')}""")
    page.touchscreen.tap(wall["x"], wall["y"])
    expect(page.locator("dialog")).not_to_be_visible()
    assert stored("sitting-circle") == before
    page.locator(".pg-board").evaluate("""(svg,p) => {for(const type of ['pointerdown','pointercancel','pointerup'])svg.dispatchEvent(new PointerEvent(type,{bubbles:true,clientX:p.x,clientY:p.y,pointerId:5,pointerType:'touch'}))}""", painted)
    expect(page.locator("dialog")).not_to_be_visible()
    assert stored("sitting-circle") == before
    print("PASS: actual chair artwork opens correct object; painted walls and canceled gestures never select through or mutate")

    for width, height in [(390, 650), (390, 680), (390, 710), (375, 667), (360, 640), (844, 390), (760, 835), (1024, 660), (1280, 665), (1440, 660), (1440, 670), (1440, 900)]:
        page.set_viewport_size({"width": width, "height": height})
        seed("sitting-circle", pieces)
        result = page.evaluate("""()=>{const stage=document.querySelector('.pg-stage').getBoundingClientRect(),board=document.querySelector('.pg-board-viewport').getBoundingClientRect();return {size:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],inside:[...document.querySelectorAll('.pg-piece-tile')].every(e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.width>=44&&r.top>=stage.top&&r.bottom<=stage.bottom&&r.right<=board.left}),clear:[...document.querySelectorAll('.pg-board [data-cell],.pg-board [data-wall]')].every(e=>{const r=e.getBoundingClientRect();return document.querySelector('.pg-board').contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})}}""")
        assert result["size"] == [width, height] and result["inside"] and result["clear"], (width, height, result)
        screenshot(f"circle-{width}x{height}")
    print("PASS: eighth palette tile and all board targets remain reachable at breakpoint-adjacent phone sizes")

    page.set_viewport_size({"width": 390, "height": 700})
    seed("alcoves", [{"kind": "alcove", "side": "n", "pos": 1}, {"kind": "seat", "x": 3, "y": 2}], version=1)
    expect(glyph(3, 1)).to_have_attribute("data-facing", "s")
    assert "facing" not in stored("alcoves")[1]
    screenshot("legacy-alcove-facing-inward")
    print("PASS: legacy alcove-seat migration composes with auto direction without new saved metadata")

    seed("entrance-transition", [{"kind": "gate", "x": 0, "y": 6}, {"kind": "path", "x": 1, "y": 6}, {"kind": "path", "x": 2, "y": 6}])
    expect(glyph(0, 6)).to_have_attribute("data-facing", "e")
    screenshot("gate-path-alignment")
    seed("window-place", [{"kind": "window", "side": "n", "pos": 1}, {"kind": "seat", "x": 3, "y": 2}, {"kind": "shelf", "x": 2, "y": 3}])
    expect(glyph(3, 2)).to_have_attribute("data-facing", "n")
    expect(glyph(2, 3)).to_have_attribute("data-facing", "e")
    screenshot("window-seat-and-shelf")
    page.get_by_role("button", name="Reset", exact=True).tap()
    expect(page.locator('.pg-board [data-facing-cell]')).to_have_count(0)
    assert stored("window-place") == []
    page.get_by_role("button", name="Rotate", exact=True).tap()
    expect(page.locator("dialog")).to_contain_text("Place a seat, bench, shelf or gate first")
    close()
    print("PASS: gate and window/shelf contexts, reset and empty chooser")
    assert not errors, errors
    browser.close()
