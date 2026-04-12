import { E as Edge, B as Bounds, R as Rectangle, F as FlexDirection, C as Container, G as Graphics$1, a as BigPool } from "./PixiApp-DkMtmIVU.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./index-BU-6pTuc.js";
import "./main-BbV5VyEH.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
import "./DJVideoCapture-DWBKuoDP.js";
import "./ChannelRadar-CV3ojpWt.js";
import "./useCMIPanel-BZl1VcVm.js";
import "./GTVisualMapping-BkrLaqE6.js";
import "./gtultraPresets-B_La0BBT.js";
import "./DJActions-Ap2A5JjP.js";
import "./parseModuleToSong-B-Yqzlmn.js";
import "./useDeckStateSync-BIQewTIw.js";
import "./defaultKitLoader-C9x_oOIb.js";
import "./samplePack-DtORUwJS.js";
import "./VJView-BzfaTAbN.js";
import "./AudioDataBus-DGyOo1ms.js";
import "./sendBusPresets-DSruMUC1.js";
import "./DrawbarSlider-Dq9geM4g.js";
import "./UADEChipEditor-DnALwiXS.js";
import "./amigaPeriodToNote-Dr2cuqKk.js";
import "./tips-D9dh4Ad6.js";
import "./useHelpDialog-WXGDnzpi.js";
import "./useExportDialog-BsJBFWkX.js";
import "./FurnaceFileOps-c7uBibmq.js";
import "./instrumentFactory-Cy6PK_Jx.js";
import "./TD3PatternExporter-CTOfWZKO.js";
import "./TD3PatternTranslator-C2Ot5Q0Y.js";
import "./TD3PatternLoader-DQDKRwGq.js";
import "./wobbleBass-Bz7KhM6S.js";
import "./tfmxNative-CJLFLWrB.js";
import "./detailOffsets-DlJBo0KQ.js";
import "./chipRamEncoders-CC3pCIsG.js";
import "./waveformDraw-Qi2V4aQb.js";
import "./BeatSyncProcessor-CdaxBjrC.js";
import "./SpectralFilter-Dxe-YniK.js";
import "./HarmonicBarsCanvas-tCyue1dW.js";
import "./NeuralParameterMapper-BKFi47j3.js";
import "./guitarMLRegistry-CdfjBfrw.js";
import "./unifiedEffects-Cd2Pk46Y.js";
import "./instrumentFxPresets-BJjRgkOl.js";
var DebugRegionType = /* @__PURE__ */ ((DebugRegionType2) => {
  DebugRegionType2["Margin"] = "margin";
  DebugRegionType2["Padding"] = "padding";
  DebugRegionType2["Border"] = "border";
  DebugRegionType2["Flex"] = "flex";
  DebugRegionType2["Content"] = "content";
  return DebugRegionType2;
})(DebugRegionType || {});
function getEdgeValues(layout, type) {
  const method = `getComputed${type.charAt(0).toUpperCase() + type.slice(1)}`;
  return {
    top: layout.yoga[method](Edge.Top),
    right: layout.yoga[method](Edge.Right),
    bottom: layout.yoga[method](Edge.Bottom),
    left: layout.yoga[method](Edge.Left)
  };
}
function calculateRegions(layout, regions) {
  const { width, height } = layout.computedLayout;
  const margin = getEdgeValues(layout, "margin");
  const border = getEdgeValues(layout, "border");
  const padding = getEdgeValues(layout, "padding");
  const marginRegion = regions.get(
    "margin"
    /* Margin */
  );
  marginRegion.outer.x = -margin.left;
  marginRegion.outer.y = -margin.top;
  marginRegion.outer.width = width + margin.left + margin.right;
  marginRegion.outer.height = height + margin.top + margin.bottom;
  marginRegion.inner.x = 0;
  marginRegion.inner.y = 0;
  marginRegion.inner.width = width;
  marginRegion.inner.height = height;
  const borderRegion = regions.get(
    "border"
    /* Border */
  );
  borderRegion.outer.x = 0;
  borderRegion.outer.y = 0;
  borderRegion.outer.width = width;
  borderRegion.outer.height = height;
  borderRegion.inner.x = border.left;
  borderRegion.inner.y = border.top;
  borderRegion.inner.width = width - border.left - border.right;
  borderRegion.inner.height = height - border.top - border.bottom;
  const paddingRegion = regions.get(
    "padding"
    /* Padding */
  );
  paddingRegion.outer.copyFrom(borderRegion.inner);
  paddingRegion.inner.x = padding.left + border.left;
  paddingRegion.inner.y = padding.top + border.top;
  paddingRegion.inner.width = width - padding.left - padding.right - border.left - border.right;
  paddingRegion.inner.height = height - padding.top - padding.bottom - border.top - border.bottom;
  calculateFlexRegion(layout, regions);
}
function calculateFlexRegion(layout, regions) {
  var _a;
  const flexRegion = regions.get(
    "flex"
    /* Flex */
  );
  const paddingRegion = regions.get(
    "padding"
    /* Padding */
  );
  flexRegion.outer.copyFrom(paddingRegion.inner);
  const bounds = new Bounds();
  const children = layout.yoga.getChildCount();
  for (let i = 0; i < children; i++) {
    const child = layout.yoga.getChild(i);
    const computedBounds = child.getComputedLayout();
    bounds.addRect(
      new Rectangle(computedBounds.left, computedBounds.top, computedBounds.width, computedBounds.height)
    );
  }
  const flexDir = layout.yoga.getFlexDirection();
  if (flexDir === FlexDirection.Column || flexDir === FlexDirection.ColumnReverse) {
    bounds.width = flexRegion.outer.width;
    bounds.x = flexRegion.outer.x;
  } else {
    bounds.height = flexRegion.outer.height;
    bounds.y = flexRegion.outer.y;
  }
  (_a = flexRegion.inner) == null ? void 0 : _a.copyFrom(bounds.rectangle);
  regions.get(
    "content"
    /* Content */
  ).outer.copyFrom(bounds.rectangle);
}
var __defProp$1 = Object.defineProperty;
var __defNormalProp$1 = (obj, key, value) => key in obj ? __defProp$1(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$1 = (obj, key, value) => __defNormalProp$1(obj, typeof key !== "symbol" ? key + "" : key, value);
function lerpColor(start, end, t) {
  const r = Math.round(start[0] + (end[0] - start[0]) * t);
  const g = Math.round(start[1] + (end[1] - start[1]) * t);
  const b = Math.round(start[2] + (end[2] - start[2]) * t);
  return `rgb(${r},${g},${b})`;
}
class DebugNode extends Container {
  constructor() {
    super();
    __publicField$1(this, "graphics");
    __publicField$1(this, "heatGraphics");
    this.graphics = /* @__PURE__ */ new Map();
    Object.values(DebugRegionType).forEach((type) => {
      const graphics = new Graphics$1();
      this.graphics.set(type, graphics);
      this.addChild(graphics);
    });
    this.heatGraphics = new Graphics$1();
    this.addChild(this.heatGraphics);
  }
  /**
   * Initialize the debug object with region data
   */
  init(regions) {
    const { target, alpha, heat } = regions;
    if (!regions.heatOnly) {
      Object.entries(regions).forEach(([type, region]) => {
        if (type === "target" || type === "alpha" || type === "heat" || type === "heatOnly") return;
        region = region;
        const graphics = this.graphics.get(type);
        if (!graphics || !region.draw) return;
        if (region.inner) {
          this.drawCutBox(graphics, region.outer, region.inner, region.color, alpha);
        } else {
          const { x, y, width, height } = region.outer;
          graphics.rect(x, y, width, Math.max(height, 1));
          graphics.fill({ color: region.color, alpha });
        }
      });
    }
    const { invalidationCount, draw } = heat;
    if (invalidationCount > 0 && draw) {
      const MAX_INVALIDATE_COUNT = 20;
      const normalizedAlpha = Math.min(invalidationCount / MAX_INVALIDATE_COUNT, 1);
      const marginRegion = regions[DebugRegionType.Margin];
      const startColor = [255, 255, 0];
      const endColor = [255, 0, 0];
      const color = lerpColor(startColor, endColor, normalizedAlpha);
      this.heatGraphics.rect(
        marginRegion.outer.x,
        marginRegion.outer.y,
        marginRegion.outer.width,
        marginRegion.outer.height
      );
      this.heatGraphics.fill({ color, alpha: Math.min(0.3, normalizedAlpha) });
      this.heatGraphics.stroke({ color, alpha: Math.max(0.3, normalizedAlpha), pixelLine: true });
    }
    this.position.set(target.x, target.y);
  }
  /**
   * Reset the debug object's state
   */
  reset() {
    this.graphics.forEach((graphics) => graphics.clear());
    this.heatGraphics.clear();
    this.removeFromParent();
  }
  /**
   * Draw a box with a cut-out center
   */
  drawCutBox(graphics, outer, inner, color, alpha) {
    const { x, y, width, height } = outer;
    const { x: innerX, y: innerY, width: innerWidth, height: innerHeight } = inner;
    graphics.rect(x, y, width, height);
    graphics.fill({ color, alpha });
    graphics.rect(innerX, innerY, innerWidth, innerHeight);
    graphics.cut();
  }
}
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
class DebugRenderer {
  constructor() {
    __publicField(this, "holder", new Container());
    __publicField(this, "regions", /* @__PURE__ */ new Map());
    __publicField(this, "colors", {
      [DebugRegionType.Margin]: "#B68655",
      [DebugRegionType.Padding]: "#BAC57F",
      [DebugRegionType.Border]: "#E7C583",
      [DebugRegionType.Content]: "#89B1BE",
      [DebugRegionType.Flex]: "#6E28D9"
    });
    __publicField(this, "alpha", 0.75);
    Object.values(DebugRegionType).forEach((type) => {
      this.regions.set(type, {
        outer: new Rectangle(),
        inner: new Rectangle()
      });
    });
    this.holder.__devtoolIgnore = true;
    this.holder.__devtoolIgnoreChildren = true;
    this.holder.eventMode = "none";
    this.holder.interactiveChildren = false;
  }
  /**
   * Clean up previous render state
   */
  reset() {
    for (let i = this.holder.children.length - 1; i >= 0; i--) {
      const child = this.holder.children[i];
      BigPool.return(child);
    }
  }
  /**
   * Render debug visuals for the given layout
   */
  render(layout) {
    calculateRegions(layout, this.regions);
    const regionData = Object.values(DebugRegionType).reduce(
      (acc, type) => {
        const region = this.regions.get(type);
        if (!region) return acc;
        const drawString = `debugDraw${type.charAt(0).toUpperCase()}${type.slice(1)}`;
        acc[type] = {
          ...region,
          color: this.colors[type],
          draw: layout._styles.custom[drawString] ?? true
        };
        return acc;
      },
      {}
    );
    const { left, top } = layout.computedLayout;
    const pos = layout.target.getGlobalPosition();
    const debugObject = BigPool.get(DebugNode, {
      ...regionData,
      target: { x: pos.x + left, y: pos.y + top },
      alpha: this.alpha,
      heat: {
        invalidationCount: layout._modificationCount,
        draw: layout._styles.custom.debugHeat !== false
      },
      heatOnly: !layout._styles.custom.debug
    });
    this.holder.addChildAt(debugObject, 0);
  }
  /**
   * Clean up the debug renderer
   */
  destroy() {
    this.reset();
    this.holder.destroy();
    this.regions.clear();
  }
}
export {
  DebugRenderer
};
