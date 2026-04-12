import { a1 as Filter, a3 as GpuProgram, a4 as GlProgram, j as ExtensionType, M as Matrix, Q as UniformGroup, K as BindGroup, a7 as TexturePool, T as Texture, aq as Geometry, t as RendererType, w as warn, B as Bounds, v as extensions } from "./PixiApp-DkMtmIVU.js";
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
var vertex = "in vec2 aPosition;\nout vec2 vTextureCoord;\n\nuniform vec4 uInputSize;\nuniform vec4 uOutputFrame;\nuniform vec4 uOutputTexture;\n\nvec4 filterVertexPosition( void )\n{\n    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;\n    \n    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;\n    position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;\n\n    return vec4(position, 0.0, 1.0);\n}\n\nvec2 filterTextureCoord( void )\n{\n    return aPosition * (uOutputFrame.zw * uInputSize.zw);\n}\n\nvoid main(void)\n{\n    gl_Position = filterVertexPosition();\n    vTextureCoord = filterTextureCoord();\n}\n";
var fragment = "in vec2 vTextureCoord;\nout vec4 finalColor;\nuniform sampler2D uTexture;\nvoid main() {\n    finalColor = texture(uTexture, vTextureCoord);\n}\n";
var source = "struct GlobalFilterUniforms {\n  uInputSize: vec4<f32>,\n  uInputPixel: vec4<f32>,\n  uInputClamp: vec4<f32>,\n  uOutputFrame: vec4<f32>,\n  uGlobalFrame: vec4<f32>,\n  uOutputTexture: vec4<f32>,\n};\n\n@group(0) @binding(0) var <uniform> gfu: GlobalFilterUniforms;\n@group(0) @binding(1) var uTexture: texture_2d<f32>;\n@group(0) @binding(2) var uSampler: sampler;\n\nstruct VSOutput {\n  @builtin(position) position: vec4<f32>,\n  @location(0) uv: vec2<f32>\n};\n\nfn filterVertexPosition(aPosition: vec2<f32>) -> vec4<f32>\n{\n    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;\n\n    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;\n    position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;\n\n    return vec4(position, 0.0, 1.0);\n}\n\nfn filterTextureCoord(aPosition: vec2<f32>) -> vec2<f32>\n{\n    return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);\n}\n\n@vertex\nfn mainVertex(\n  @location(0) aPosition: vec2<f32>,\n) -> VSOutput {\n  return VSOutput(\n   filterVertexPosition(aPosition),\n   filterTextureCoord(aPosition)\n  );\n}\n\n@fragment\nfn mainFragment(\n  @location(0) uv: vec2<f32>,\n) -> @location(0) vec4<f32> {\n    return textureSample(uTexture, uSampler, uv);\n}\n";
class PassthroughFilter extends Filter {
  constructor() {
    const gpuProgram = GpuProgram.from({
      vertex: { source, entryPoint: "mainVertex" },
      fragment: { source, entryPoint: "mainFragment" },
      name: "passthrough-filter"
    });
    const glProgram = GlProgram.from({
      vertex,
      fragment,
      name: "passthrough-filter"
    });
    super({
      gpuProgram,
      glProgram
    });
  }
}
class FilterPipe {
  constructor(renderer) {
    this._renderer = renderer;
  }
  push(filterEffect, container, instructionSet) {
    const renderPipes = this._renderer.renderPipes;
    renderPipes.batch.break(instructionSet);
    instructionSet.add({
      renderPipeId: "filter",
      canBundle: false,
      action: "pushFilter",
      container,
      filterEffect
    });
  }
  pop(_filterEffect, _container, instructionSet) {
    this._renderer.renderPipes.batch.break(instructionSet);
    instructionSet.add({
      renderPipeId: "filter",
      action: "popFilter",
      canBundle: false
    });
  }
  execute(instruction) {
    if (instruction.action === "pushFilter") {
      this._renderer.filter.push(instruction);
    } else if (instruction.action === "popFilter") {
      this._renderer.filter.pop();
    }
  }
  destroy() {
    this._renderer = null;
  }
}
FilterPipe.extension = {
  type: [
    ExtensionType.WebGLPipes,
    ExtensionType.WebGPUPipes,
    ExtensionType.CanvasPipes
  ],
  name: "filter"
};
const tempProjectionMatrix = new Matrix();
function getGlobalRenderableBounds(renderables, bounds) {
  bounds.clear();
  const actualMatrix = bounds.matrix;
  for (let i = 0; i < renderables.length; i++) {
    const renderable = renderables[i];
    if (renderable.globalDisplayStatus < 7) {
      continue;
    }
    const renderGroup = renderable.renderGroup ?? renderable.parentRenderGroup;
    if (renderGroup == null ? void 0 : renderGroup.isCachedAsTexture) {
      bounds.matrix = tempProjectionMatrix.copyFrom(renderGroup.textureOffsetInverseTransform).append(renderable.worldTransform);
    } else if (renderGroup == null ? void 0 : renderGroup._parentCacheAsTextureRenderGroup) {
      bounds.matrix = tempProjectionMatrix.copyFrom(renderGroup._parentCacheAsTextureRenderGroup.inverseWorldTransform).append(renderable.groupTransform);
    } else {
      bounds.matrix = renderable.worldTransform;
    }
    bounds.addBounds(renderable.bounds);
  }
  bounds.matrix = actualMatrix;
  return bounds;
}
const quadGeometry = new Geometry({
  attributes: {
    aPosition: {
      buffer: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      format: "float32x2",
      stride: 2 * 4,
      offset: 0
    }
  },
  indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3])
});
class FilterData {
  constructor() {
    this.skip = false;
    this.inputTexture = null;
    this.backTexture = null;
    this.filters = null;
    this.bounds = new Bounds();
    this.container = null;
    this.blendRequired = false;
    this.outputRenderSurface = null;
    this.globalFrame = { x: 0, y: 0, width: 0, height: 0 };
    this.firstEnabledIndex = -1;
    this.lastEnabledIndex = -1;
  }
}
class FilterSystem {
  constructor(renderer) {
    this._filterStackIndex = 0;
    this._filterStack = [];
    this._filterGlobalUniforms = new UniformGroup({
      uInputSize: { value: new Float32Array(4), type: "vec4<f32>" },
      uInputPixel: { value: new Float32Array(4), type: "vec4<f32>" },
      uInputClamp: { value: new Float32Array(4), type: "vec4<f32>" },
      uOutputFrame: { value: new Float32Array(4), type: "vec4<f32>" },
      uGlobalFrame: { value: new Float32Array(4), type: "vec4<f32>" },
      uOutputTexture: { value: new Float32Array(4), type: "vec4<f32>" }
    });
    this._globalFilterBindGroup = new BindGroup({});
    this.renderer = renderer;
  }
  /**
   * The back texture of the currently active filter. Requires the filter to have `blendRequired` set to true.
   * @readonly
   */
  get activeBackTexture() {
    var _a;
    return (_a = this._activeFilterData) == null ? void 0 : _a.backTexture;
  }
  /**
   * Pushes a filter instruction onto the filter stack.
   * @param instruction - The instruction containing the filter effect and container.
   * @internal
   */
  push(instruction) {
    const renderer = this.renderer;
    const filters = instruction.filterEffect.filters;
    const filterData = this._pushFilterData();
    filterData.skip = false;
    filterData.filters = filters;
    filterData.container = instruction.container;
    filterData.outputRenderSurface = renderer.renderTarget.renderSurface;
    const colorTextureSource = renderer.renderTarget.renderTarget.colorTexture.source;
    const rootResolution = colorTextureSource.resolution;
    const rootAntialias = colorTextureSource.antialias;
    if (filters.every((filter) => !filter.enabled)) {
      filterData.skip = true;
      return;
    }
    const bounds = filterData.bounds;
    this._calculateFilterArea(instruction, bounds);
    this._calculateFilterBounds(filterData, renderer.renderTarget.rootViewPort, rootAntialias, rootResolution, 1);
    if (filterData.skip) {
      return;
    }
    const previousFilterData = this._getPreviousFilterData();
    const globalResolution = this._findFilterResolution(rootResolution);
    let offsetX = 0;
    let offsetY = 0;
    if (previousFilterData) {
      offsetX = previousFilterData.bounds.minX;
      offsetY = previousFilterData.bounds.minY;
    }
    this._calculateGlobalFrame(
      filterData,
      offsetX,
      offsetY,
      globalResolution,
      colorTextureSource.width,
      colorTextureSource.height
    );
    this._setupFilterTextures(filterData, bounds, renderer, previousFilterData);
  }
  /**
   * Applies filters to a texture.
   *
   * This method takes a texture and a list of filters, applies the filters to the texture,
   * and returns the resulting texture.
   * @param {object} params - The parameters for applying filters.
   * @param {Texture} params.texture - The texture to apply filters to.
   * @param {Filter[]} params.filters - The filters to apply.
   * @returns {Texture} The resulting texture after all filters have been applied.
   * @example
   *
   * ```ts
   * // Create a texture and a list of filters
   * const texture = new Texture(...);
   * const filters = [new BlurFilter(), new ColorMatrixFilter()];
   *
   * // Apply the filters to the texture
   * const resultTexture = filterSystem.applyToTexture({ texture, filters });
   *
   * // Use the resulting texture
   * sprite.texture = resultTexture;
   * ```
   *
   * Key Points:
   * 1. padding is not currently supported here - so clipping may occur with filters that use padding.
   * 2. If all filters are disabled or skipped, the original texture is returned.
   */
  generateFilteredTexture({ texture, filters }) {
    const filterData = this._pushFilterData();
    this._activeFilterData = filterData;
    filterData.skip = false;
    filterData.filters = filters;
    const colorTextureSource = texture.source;
    const rootResolution = colorTextureSource.resolution;
    const rootAntialias = colorTextureSource.antialias;
    if (filters.every((filter) => !filter.enabled)) {
      filterData.skip = true;
      return texture;
    }
    const bounds = filterData.bounds;
    bounds.addRect(texture.frame);
    this._calculateFilterBounds(filterData, bounds.rectangle, rootAntialias, rootResolution, 0);
    if (filterData.skip) {
      return texture;
    }
    const globalResolution = rootResolution;
    const offsetX = 0;
    const offsetY = 0;
    this._calculateGlobalFrame(
      filterData,
      offsetX,
      offsetY,
      globalResolution,
      colorTextureSource.width,
      colorTextureSource.height
    );
    filterData.outputRenderSurface = TexturePool.getOptimalTexture(
      bounds.width,
      bounds.height,
      filterData.resolution,
      filterData.antialias
    );
    filterData.backTexture = Texture.EMPTY;
    filterData.inputTexture = texture;
    const renderer = this.renderer;
    renderer.renderTarget.finishRenderPass();
    this._applyFiltersToTexture(filterData, true);
    const outputTexture = filterData.outputRenderSurface;
    outputTexture.source.alphaMode = "premultiplied-alpha";
    return outputTexture;
  }
  /** @internal */
  pop() {
    const renderer = this.renderer;
    const filterData = this._popFilterData();
    if (filterData.skip) {
      return;
    }
    renderer.globalUniforms.pop();
    renderer.renderTarget.finishRenderPass();
    this._activeFilterData = filterData;
    this._applyFiltersToTexture(filterData, false);
    if (filterData.blendRequired) {
      TexturePool.returnTexture(filterData.backTexture);
    }
    TexturePool.returnTexture(filterData.inputTexture);
  }
  /**
   * Copies the last render surface to a texture.
   * @param lastRenderSurface - The last render surface to copy from.
   * @param bounds - The bounds of the area to copy.
   * @param previousBounds - The previous bounds to use for offsetting the copy.
   */
  getBackTexture(lastRenderSurface, bounds, previousBounds) {
    const backgroundResolution = lastRenderSurface.colorTexture.source._resolution;
    const backTexture = TexturePool.getOptimalTexture(
      bounds.width,
      bounds.height,
      backgroundResolution,
      false
    );
    let x = bounds.minX;
    let y = bounds.minY;
    if (previousBounds) {
      x -= previousBounds.minX;
      y -= previousBounds.minY;
    }
    x = Math.floor(x * backgroundResolution);
    y = Math.floor(y * backgroundResolution);
    const width = Math.ceil(bounds.width * backgroundResolution);
    const height = Math.ceil(bounds.height * backgroundResolution);
    this.renderer.renderTarget.copyToTexture(
      lastRenderSurface,
      backTexture,
      { x, y },
      { width, height },
      { x: 0, y: 0 }
    );
    return backTexture;
  }
  /**
   * Applies a filter to a texture.
   * @param filter - The filter to apply.
   * @param input - The input texture.
   * @param output - The output render surface.
   * @param clear - Whether to clear the output surface before applying the filter.
   */
  applyFilter(filter, input, output, clear) {
    const renderer = this.renderer;
    const filterData = this._activeFilterData;
    const outputRenderSurface = filterData.outputRenderSurface;
    const isFinalTarget = outputRenderSurface === output;
    const rootResolution = renderer.renderTarget.rootRenderTarget.colorTexture.source._resolution;
    const resolution = this._findFilterResolution(rootResolution);
    let offsetX = 0;
    let offsetY = 0;
    if (isFinalTarget) {
      const offset = this._findPreviousFilterOffset();
      offsetX = offset.x;
      offsetY = offset.y;
    }
    this._updateFilterUniforms(input, output, filterData, offsetX, offsetY, resolution, isFinalTarget, clear);
    const filterToApply = filter.enabled ? filter : this._getPassthroughFilter();
    this._setupBindGroupsAndRender(filterToApply, input, renderer);
  }
  /**
   * Multiply _input normalized coordinates_ to this matrix to get _sprite texture normalized coordinates_.
   *
   * Use `outputMatrix * vTextureCoord` in the shader.
   * @param outputMatrix - The matrix to output to.
   * @param {Sprite} sprite - The sprite to map to.
   * @returns The mapped matrix.
   */
  calculateSpriteMatrix(outputMatrix, sprite) {
    const data = this._activeFilterData;
    const mappedMatrix = outputMatrix.set(
      data.inputTexture._source.width,
      0,
      0,
      data.inputTexture._source.height,
      data.bounds.minX,
      data.bounds.minY
    );
    const worldTransform = sprite.worldTransform.copyTo(Matrix.shared);
    const renderGroup = sprite.renderGroup || sprite.parentRenderGroup;
    if (renderGroup && renderGroup.cacheToLocalTransform) {
      worldTransform.prepend(renderGroup.cacheToLocalTransform);
    }
    worldTransform.invert();
    mappedMatrix.prepend(worldTransform);
    mappedMatrix.scale(
      1 / sprite.texture.orig.width,
      1 / sprite.texture.orig.height
    );
    mappedMatrix.translate(sprite.anchor.x, sprite.anchor.y);
    return mappedMatrix;
  }
  destroy() {
    var _a;
    (_a = this._passthroughFilter) == null ? void 0 : _a.destroy(true);
    this._passthroughFilter = null;
  }
  _getPassthroughFilter() {
    this._passthroughFilter ?? (this._passthroughFilter = new PassthroughFilter());
    return this._passthroughFilter;
  }
  /**
   * Sets up the bind groups and renders the filter.
   * @param filter - The filter to apply
   * @param input - The input texture
   * @param renderer - The renderer instance
   */
  _setupBindGroupsAndRender(filter, input, renderer) {
    if (renderer.renderPipes.uniformBatch) {
      const batchUniforms = renderer.renderPipes.uniformBatch.getUboResource(this._filterGlobalUniforms);
      this._globalFilterBindGroup.setResource(batchUniforms, 0);
    } else {
      this._globalFilterBindGroup.setResource(this._filterGlobalUniforms, 0);
    }
    this._globalFilterBindGroup.setResource(input.source, 1);
    this._globalFilterBindGroup.setResource(input.source.style, 2);
    filter.groups[0] = this._globalFilterBindGroup;
    renderer.encoder.draw({
      geometry: quadGeometry,
      shader: filter,
      state: filter._state,
      topology: "triangle-list"
    });
    if (renderer.type === RendererType.WEBGL) {
      renderer.renderTarget.finishRenderPass();
    }
  }
  /**
   * Sets up the filter textures including input texture and back texture if needed.
   * @param filterData - The filter data to update
   * @param bounds - The bounds for the texture
   * @param renderer - The renderer instance
   * @param previousFilterData - The previous filter data for back texture calculation
   */
  _setupFilterTextures(filterData, bounds, renderer, previousFilterData) {
    filterData.backTexture = Texture.EMPTY;
    filterData.inputTexture = TexturePool.getOptimalTexture(
      bounds.width,
      bounds.height,
      filterData.resolution,
      filterData.antialias
    );
    if (filterData.blendRequired) {
      renderer.renderTarget.finishRenderPass();
      const renderTarget = renderer.renderTarget.getRenderTarget(filterData.outputRenderSurface);
      filterData.backTexture = this.getBackTexture(renderTarget, bounds, previousFilterData == null ? void 0 : previousFilterData.bounds);
    }
    renderer.renderTarget.bind(filterData.inputTexture, true);
    renderer.globalUniforms.push({
      offset: bounds
    });
  }
  /**
   * Calculates and sets the global frame for the filter.
   * @param filterData - The filter data to update
   * @param offsetX - The X offset
   * @param offsetY - The Y offset
   * @param globalResolution - The global resolution
   * @param sourceWidth - The source texture width
   * @param sourceHeight - The source texture height
   */
  _calculateGlobalFrame(filterData, offsetX, offsetY, globalResolution, sourceWidth, sourceHeight) {
    const globalFrame = filterData.globalFrame;
    globalFrame.x = offsetX * globalResolution;
    globalFrame.y = offsetY * globalResolution;
    globalFrame.width = sourceWidth * globalResolution;
    globalFrame.height = sourceHeight * globalResolution;
  }
  /**
   * Updates the filter uniforms with the current filter state.
   * @param input - The input texture
   * @param output - The output render surface
   * @param filterData - The current filter data
   * @param offsetX - The X offset for positioning
   * @param offsetY - The Y offset for positioning
   * @param resolution - The current resolution
   * @param isFinalTarget - Whether this is the final render target
   * @param clear - Whether to clear the output surface
   */
  _updateFilterUniforms(input, output, filterData, offsetX, offsetY, resolution, isFinalTarget, clear) {
    const uniforms = this._filterGlobalUniforms.uniforms;
    const outputFrame = uniforms.uOutputFrame;
    const inputSize = uniforms.uInputSize;
    const inputPixel = uniforms.uInputPixel;
    const inputClamp = uniforms.uInputClamp;
    const globalFrame = uniforms.uGlobalFrame;
    const outputTexture = uniforms.uOutputTexture;
    if (isFinalTarget) {
      outputFrame[0] = filterData.bounds.minX - offsetX;
      outputFrame[1] = filterData.bounds.minY - offsetY;
    } else {
      outputFrame[0] = 0;
      outputFrame[1] = 0;
    }
    outputFrame[2] = input.frame.width;
    outputFrame[3] = input.frame.height;
    inputSize[0] = input.source.width;
    inputSize[1] = input.source.height;
    inputSize[2] = 1 / inputSize[0];
    inputSize[3] = 1 / inputSize[1];
    inputPixel[0] = input.source.pixelWidth;
    inputPixel[1] = input.source.pixelHeight;
    inputPixel[2] = 1 / inputPixel[0];
    inputPixel[3] = 1 / inputPixel[1];
    inputClamp[0] = 0.5 * inputPixel[2];
    inputClamp[1] = 0.5 * inputPixel[3];
    inputClamp[2] = input.frame.width * inputSize[2] - 0.5 * inputPixel[2];
    inputClamp[3] = input.frame.height * inputSize[3] - 0.5 * inputPixel[3];
    const rootTexture = this.renderer.renderTarget.rootRenderTarget.colorTexture;
    globalFrame[0] = offsetX * resolution;
    globalFrame[1] = offsetY * resolution;
    globalFrame[2] = rootTexture.source.width * resolution;
    globalFrame[3] = rootTexture.source.height * resolution;
    if (output instanceof Texture) output.source.resource = null;
    const renderTarget = this.renderer.renderTarget.getRenderTarget(output);
    this.renderer.renderTarget.bind(output, !!clear);
    if (output instanceof Texture) {
      outputTexture[0] = output.frame.width;
      outputTexture[1] = output.frame.height;
    } else {
      outputTexture[0] = renderTarget.width;
      outputTexture[1] = renderTarget.height;
    }
    outputTexture[2] = renderTarget.isRoot ? -1 : 1;
    this._filterGlobalUniforms.update();
  }
  /**
   * Finds the correct resolution by looking back through the filter stack.
   * @param rootResolution - The fallback root resolution to use
   * @returns The resolution from the previous filter or root resolution
   */
  _findFilterResolution(rootResolution) {
    let currentIndex = this._filterStackIndex - 1;
    while (currentIndex > 0 && this._filterStack[currentIndex].skip) {
      --currentIndex;
    }
    return currentIndex > 0 && this._filterStack[currentIndex].inputTexture ? this._filterStack[currentIndex].inputTexture.source._resolution : rootResolution;
  }
  /**
   * Finds the offset from the previous non-skipped filter in the stack.
   * @returns The offset coordinates from the previous filter
   */
  _findPreviousFilterOffset() {
    let offsetX = 0;
    let offsetY = 0;
    let lastIndex = this._filterStackIndex;
    while (lastIndex > 0) {
      lastIndex--;
      const prevFilterData = this._filterStack[lastIndex];
      if (!prevFilterData.skip) {
        offsetX = prevFilterData.bounds.minX;
        offsetY = prevFilterData.bounds.minY;
        break;
      }
    }
    return { x: offsetX, y: offsetY };
  }
  /**
   * Calculates the filter area bounds based on the instruction type.
   * @param instruction - The filter instruction
   * @param bounds - The bounds object to populate
   */
  _calculateFilterArea(instruction, bounds) {
    if (instruction.renderables) {
      getGlobalRenderableBounds(instruction.renderables, bounds);
    } else if (instruction.filterEffect.filterArea) {
      bounds.clear();
      bounds.addRect(instruction.filterEffect.filterArea);
      bounds.applyMatrix(instruction.container.worldTransform);
    } else {
      instruction.container.getFastGlobalBounds(true, bounds);
    }
    if (instruction.container) {
      const renderGroup = instruction.container.renderGroup || instruction.container.parentRenderGroup;
      const filterFrameTransform = renderGroup.cacheToLocalTransform;
      if (filterFrameTransform) {
        bounds.applyMatrix(filterFrameTransform);
      }
    }
  }
  _applyFiltersToTexture(filterData, clear) {
    const inputTexture = filterData.inputTexture;
    const bounds = filterData.bounds;
    const filters = filterData.filters;
    const firstEnabled = filterData.firstEnabledIndex;
    const lastEnabled = filterData.lastEnabledIndex;
    this._globalFilterBindGroup.setResource(inputTexture.source.style, 2);
    this._globalFilterBindGroup.setResource(filterData.backTexture.source, 3);
    if (firstEnabled === lastEnabled) {
      filters[firstEnabled].apply(this, inputTexture, filterData.outputRenderSurface, clear);
    } else {
      let flip = filterData.inputTexture;
      const tempTexture = TexturePool.getOptimalTexture(
        bounds.width,
        bounds.height,
        flip.source._resolution,
        false
      );
      let flop = tempTexture;
      for (let i = firstEnabled; i < lastEnabled; i++) {
        const filter = filters[i];
        if (!filter.enabled) continue;
        filter.apply(this, flip, flop, true);
        const t = flip;
        flip = flop;
        flop = t;
      }
      filters[lastEnabled].apply(this, flip, filterData.outputRenderSurface, clear);
      TexturePool.returnTexture(tempTexture);
    }
  }
  _calculateFilterBounds(filterData, viewPort, rootAntialias, rootResolution, paddingMultiplier) {
    var _a;
    const renderer = this.renderer;
    const bounds = filterData.bounds;
    const filters = filterData.filters;
    let resolution = Infinity;
    let padding = 0;
    let antialias = true;
    let blendRequired = false;
    let enabled = false;
    let clipToViewport = true;
    let firstEnabledIndex = -1;
    let lastEnabledIndex = -1;
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      if (!filter.enabled) continue;
      if (firstEnabledIndex === -1) firstEnabledIndex = i;
      lastEnabledIndex = i;
      resolution = Math.min(resolution, filter.resolution === "inherit" ? rootResolution : filter.resolution);
      padding += filter.padding;
      if (filter.antialias === "off") {
        antialias = false;
      } else if (filter.antialias === "inherit") {
        antialias && (antialias = rootAntialias);
      }
      if (!filter.clipToViewport) {
        clipToViewport = false;
      }
      const isCompatible = !!(filter.compatibleRenderers & renderer.type);
      if (!isCompatible) {
        enabled = false;
        break;
      }
      if (filter.blendRequired && !(((_a = renderer.backBuffer) == null ? void 0 : _a.useBackBuffer) ?? true)) {
        warn("Blend filter requires backBuffer on WebGL renderer to be enabled. Set `useBackBuffer: true` in the renderer options.");
        enabled = false;
        break;
      }
      enabled = true;
      blendRequired || (blendRequired = filter.blendRequired);
    }
    if (!enabled) {
      filterData.skip = true;
      return;
    }
    if (clipToViewport) {
      bounds.fitBounds(0, viewPort.width / rootResolution, 0, viewPort.height / rootResolution);
    }
    bounds.scale(resolution).ceil().scale(1 / resolution).pad((padding | 0) * paddingMultiplier);
    if (!bounds.isPositive) {
      filterData.skip = true;
      return;
    }
    filterData.antialias = antialias;
    filterData.resolution = resolution;
    filterData.blendRequired = blendRequired;
    filterData.firstEnabledIndex = firstEnabledIndex;
    filterData.lastEnabledIndex = lastEnabledIndex;
  }
  _popFilterData() {
    this._filterStackIndex--;
    return this._filterStack[this._filterStackIndex];
  }
  _getPreviousFilterData() {
    let previousFilterData;
    let index = this._filterStackIndex - 1;
    while (index > 0) {
      index--;
      previousFilterData = this._filterStack[index];
      if (!previousFilterData.skip) {
        break;
      }
    }
    return previousFilterData;
  }
  _pushFilterData() {
    let filterData = this._filterStack[this._filterStackIndex];
    if (!filterData) {
      filterData = this._filterStack[this._filterStackIndex] = new FilterData();
    }
    this._filterStackIndex++;
    return filterData;
  }
}
FilterSystem.extension = {
  type: [
    ExtensionType.WebGLSystem,
    ExtensionType.WebGPUSystem
  ],
  name: "filter"
};
extensions.add(FilterSystem);
extensions.add(FilterPipe);
