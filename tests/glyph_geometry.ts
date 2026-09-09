import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DirectionalGlyph, orderedModel, rotateXY, type DirectionalKind } from "../src/game/DirectionalGlyph";
import { FACINGS } from "../src/game/orientation";

const output = [];
for (const kind of ["seat", "shelf", "gate", "bench"] as DirectionalKind[]) {
  for (const facing of FACINGS) {
    const boxes = orderedModel(kind, facing).map((box) => {
      const corners = [rotateXY(box.x, box.y, facing), rotateXY(box.x + box.w, box.y + box.d, facing)];
      return {
        min: [Math.min(...corners.map(p => p.x)), Math.min(...corners.map(p => p.y)), box.z],
        max: [Math.max(...corners.map(p => p.x)), Math.max(...corners.map(p => p.y)), box.z + box.h],
      };
    });
    output.push({ kind, facing, boxes, svg: renderToStaticMarkup(createElement(DirectionalGlyph, { kind, facing })) });
  }
}
console.log(JSON.stringify(output));
