import { j as jsxDevRuntimeExports } from "./client-DHYdgbIN.js";
import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { R as REVISION, T as TrianglesDrawMode, a as TriangleFanDrawMode, b as TriangleStripDrawMode, V as Vector3, S as Spherical, Q as Quaternion, O as OrthographicCamera, c as Vector2, P as PerspectiveCamera$1, M as MOUSE, d as TOUCH, e as Ray, f as Plane, L as Loader, g as LoaderUtils, F as FileLoader, h as MeshPhysicalMaterial, C as Color, i as SpotLight, j as PointLight, D as DirectionalLight, k as Matrix4, I as InstancedMesh, l as InstancedBufferAttribute, m as Object3D, n as TextureLoader, o as ImageBitmapLoader, B as BufferAttribute, p as InterleavedBuffer, q as LinearMipmapLinearFilter, N as NearestMipmapLinearFilter, r as LinearMipmapNearestFilter, s as NearestMipmapNearestFilter, t as LinearFilter, u as NearestFilter, v as RepeatWrapping, w as MirroredRepeatWrapping, x as ClampToEdgeWrapping, y as PointsMaterial, z as Material, A as LineBasicMaterial, E as MeshStandardMaterial, G as DoubleSide, H as MeshBasicMaterial, J as PropertyBinding, K as BufferGeometry, U as SkinnedMesh, W as Mesh, X as LineSegments, Y as Line, Z as LineLoop, _ as Points, $ as Group, a0 as MathUtils, a1 as Skeleton, a2 as AnimationClip, a3 as Bone, a4 as InterpolateDiscrete, a5 as InterpolateLinear, a6 as InterleavedBufferAttribute, a7 as Texture, a8 as VectorKeyframeTrack, a9 as NumberKeyframeTrack, aa as QuaternionKeyframeTrack, ab as FrontSide, ac as Interpolant, ad as Box3, ae as Sphere, af as useLoader, ag as useThree, ah as WebGLRenderTarget, ai as HalfFloatType, aj as DepthTexture, ak as FloatType, al as useFrame, am as CanvasTexture, an as SRGBColorSpace$1, ao as Raycaster, ap as LinearSRGBColorSpace$1, aq as Canvas } from "./react-three-fiber.esm-C9Qiy9wi.js";
import { b as useDJStore, dE as TurntablePhysics, dD as getDJEngine, eH as OMEGA_NORMAL } from "./main-BbV5VyEH.js";
import { a as startScratch, t as togglePlay, b as setScratchVelocity, c as stopScratch, p as togglePFL, q as setDeckVolume, r as setMasterVolume, j as setCrossfader, u as setDeckTrimGain, v as setDeckEQ, w as setBoothVolume, x as setCrossfaderCurve, y as setDeckFilter } from "./DJActions-Ap2A5JjP.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./index-BU-6pTuc.js";
import "./vendor-tone-48TQc1H3.js";
import "./parseModuleToSong-B-Yqzlmn.js";
function _extends() {
  return _extends = Object.assign ? Object.assign.bind() : function(n) {
    for (var e = 1; e < arguments.length; e++) {
      var t = arguments[e];
      for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
    }
    return n;
  }, _extends.apply(null, arguments);
}
const version = /* @__PURE__ */ (() => parseInt(REVISION.replace(/\D+/g, "")))();
function toTrianglesDrawMode(geometry, drawMode) {
  if (drawMode === TrianglesDrawMode) {
    console.warn("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles.");
    return geometry;
  }
  if (drawMode === TriangleFanDrawMode || drawMode === TriangleStripDrawMode) {
    let index = geometry.getIndex();
    if (index === null) {
      const indices = [];
      const position = geometry.getAttribute("position");
      if (position !== void 0) {
        for (let i = 0; i < position.count; i++) {
          indices.push(i);
        }
        geometry.setIndex(indices);
        index = geometry.getIndex();
      } else {
        console.error(
          "THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible."
        );
        return geometry;
      }
    }
    const numberOfTriangles = index.count - 2;
    const newIndices = [];
    if (index) {
      if (drawMode === TriangleFanDrawMode) {
        for (let i = 1; i <= numberOfTriangles; i++) {
          newIndices.push(index.getX(0));
          newIndices.push(index.getX(i));
          newIndices.push(index.getX(i + 1));
        }
      } else {
        for (let i = 0; i < numberOfTriangles; i++) {
          if (i % 2 === 0) {
            newIndices.push(index.getX(i));
            newIndices.push(index.getX(i + 1));
            newIndices.push(index.getX(i + 2));
          } else {
            newIndices.push(index.getX(i + 2));
            newIndices.push(index.getX(i + 1));
            newIndices.push(index.getX(i));
          }
        }
      }
    }
    if (newIndices.length / 3 !== numberOfTriangles) {
      console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.");
    }
    const newGeometry = geometry.clone();
    newGeometry.setIndex(newIndices);
    newGeometry.clearGroups();
    return newGeometry;
  } else {
    console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:", drawMode);
    return geometry;
  }
}
var __defProp$1 = Object.defineProperty;
var __defNormalProp$1 = (obj, key, value) => key in obj ? __defProp$1(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$1 = (obj, key, value) => {
  __defNormalProp$1(obj, key + "", value);
  return value;
};
class EventDispatcher {
  constructor() {
    __publicField$1(this, "_listeners");
  }
  /**
   * Adds a listener to an event type.
   * @param type The type of event to listen to.
   * @param listener The function that gets called when the event is fired.
   */
  addEventListener(type, listener) {
    if (this._listeners === void 0)
      this._listeners = {};
    const listeners = this._listeners;
    if (listeners[type] === void 0) {
      listeners[type] = [];
    }
    if (listeners[type].indexOf(listener) === -1) {
      listeners[type].push(listener);
    }
  }
  /**
      * Checks if listener is added to an event type.
      * @param type The type of event to listen to.
      * @param listener The function that gets called when the event is fired.
      */
  hasEventListener(type, listener) {
    if (this._listeners === void 0)
      return false;
    const listeners = this._listeners;
    return listeners[type] !== void 0 && listeners[type].indexOf(listener) !== -1;
  }
  /**
      * Removes a listener from an event type.
      * @param type The type of the listener that gets removed.
      * @param listener The listener function that gets removed.
      */
  removeEventListener(type, listener) {
    if (this._listeners === void 0)
      return;
    const listeners = this._listeners;
    const listenerArray = listeners[type];
    if (listenerArray !== void 0) {
      const index = listenerArray.indexOf(listener);
      if (index !== -1) {
        listenerArray.splice(index, 1);
      }
    }
  }
  /**
      * Fire an event type.
      * @param event The event that gets fired.
      */
  dispatchEvent(event) {
    if (this._listeners === void 0)
      return;
    const listeners = this._listeners;
    const listenerArray = listeners[event.type];
    if (listenerArray !== void 0) {
      event.target = this;
      const array = listenerArray.slice(0);
      for (let i = 0, l = array.length; i < l; i++) {
        array[i].call(this, event);
      }
      event.target = null;
    }
  }
}
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
const _ray = /* @__PURE__ */ new Ray();
const _plane = /* @__PURE__ */ new Plane();
const TILT_LIMIT = Math.cos(70 * (Math.PI / 180));
const moduloWrapAround = (offset, capacity) => (offset % capacity + capacity) % capacity;
let OrbitControls$1 = class OrbitControls extends EventDispatcher {
  constructor(object, domElement) {
    super();
    __publicField(this, "object");
    __publicField(this, "domElement");
    __publicField(this, "enabled", true);
    __publicField(this, "target", new Vector3());
    __publicField(this, "minDistance", 0);
    __publicField(this, "maxDistance", Infinity);
    __publicField(this, "minZoom", 0);
    __publicField(this, "maxZoom", Infinity);
    __publicField(this, "minPolarAngle", 0);
    __publicField(this, "maxPolarAngle", Math.PI);
    __publicField(this, "minAzimuthAngle", -Infinity);
    __publicField(this, "maxAzimuthAngle", Infinity);
    __publicField(this, "enableDamping", false);
    __publicField(this, "dampingFactor", 0.05);
    __publicField(this, "enableZoom", true);
    __publicField(this, "zoomSpeed", 1);
    __publicField(this, "enableRotate", true);
    __publicField(this, "rotateSpeed", 1);
    __publicField(this, "enablePan", true);
    __publicField(this, "panSpeed", 1);
    __publicField(this, "screenSpacePanning", true);
    __publicField(this, "keyPanSpeed", 7);
    __publicField(this, "zoomToCursor", false);
    __publicField(this, "autoRotate", false);
    __publicField(this, "autoRotateSpeed", 2);
    __publicField(this, "reverseOrbit", false);
    __publicField(this, "reverseHorizontalOrbit", false);
    __publicField(this, "reverseVerticalOrbit", false);
    __publicField(this, "keys", { LEFT: "ArrowLeft", UP: "ArrowUp", RIGHT: "ArrowRight", BOTTOM: "ArrowDown" });
    __publicField(this, "mouseButtons", {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.PAN
    });
    __publicField(this, "touches", { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN });
    __publicField(this, "target0");
    __publicField(this, "position0");
    __publicField(this, "zoom0");
    __publicField(this, "_domElementKeyEvents", null);
    __publicField(this, "getPolarAngle");
    __publicField(this, "getAzimuthalAngle");
    __publicField(this, "setPolarAngle");
    __publicField(this, "setAzimuthalAngle");
    __publicField(this, "getDistance");
    __publicField(this, "getZoomScale");
    __publicField(this, "listenToKeyEvents");
    __publicField(this, "stopListenToKeyEvents");
    __publicField(this, "saveState");
    __publicField(this, "reset");
    __publicField(this, "update");
    __publicField(this, "connect");
    __publicField(this, "dispose");
    __publicField(this, "dollyIn");
    __publicField(this, "dollyOut");
    __publicField(this, "getScale");
    __publicField(this, "setScale");
    this.object = object;
    this.domElement = domElement;
    this.target0 = this.target.clone();
    this.position0 = this.object.position.clone();
    this.zoom0 = this.object.zoom;
    this.getPolarAngle = () => spherical.phi;
    this.getAzimuthalAngle = () => spherical.theta;
    this.setPolarAngle = (value) => {
      let phi = moduloWrapAround(value, 2 * Math.PI);
      let currentPhi = spherical.phi;
      if (currentPhi < 0)
        currentPhi += 2 * Math.PI;
      if (phi < 0)
        phi += 2 * Math.PI;
      let phiDist = Math.abs(phi - currentPhi);
      if (2 * Math.PI - phiDist < phiDist) {
        if (phi < currentPhi) {
          phi += 2 * Math.PI;
        } else {
          currentPhi += 2 * Math.PI;
        }
      }
      sphericalDelta.phi = phi - currentPhi;
      scope.update();
    };
    this.setAzimuthalAngle = (value) => {
      let theta = moduloWrapAround(value, 2 * Math.PI);
      let currentTheta = spherical.theta;
      if (currentTheta < 0)
        currentTheta += 2 * Math.PI;
      if (theta < 0)
        theta += 2 * Math.PI;
      let thetaDist = Math.abs(theta - currentTheta);
      if (2 * Math.PI - thetaDist < thetaDist) {
        if (theta < currentTheta) {
          theta += 2 * Math.PI;
        } else {
          currentTheta += 2 * Math.PI;
        }
      }
      sphericalDelta.theta = theta - currentTheta;
      scope.update();
    };
    this.getDistance = () => scope.object.position.distanceTo(scope.target);
    this.listenToKeyEvents = (domElement2) => {
      domElement2.addEventListener("keydown", onKeyDown);
      this._domElementKeyEvents = domElement2;
    };
    this.stopListenToKeyEvents = () => {
      this._domElementKeyEvents.removeEventListener("keydown", onKeyDown);
      this._domElementKeyEvents = null;
    };
    this.saveState = () => {
      scope.target0.copy(scope.target);
      scope.position0.copy(scope.object.position);
      scope.zoom0 = scope.object.zoom;
    };
    this.reset = () => {
      scope.target.copy(scope.target0);
      scope.object.position.copy(scope.position0);
      scope.object.zoom = scope.zoom0;
      scope.object.updateProjectionMatrix();
      scope.dispatchEvent(changeEvent);
      scope.update();
      state = STATE.NONE;
    };
    this.update = (() => {
      const offset = new Vector3();
      const up = new Vector3(0, 1, 0);
      const quat = new Quaternion().setFromUnitVectors(object.up, up);
      const quatInverse = quat.clone().invert();
      const lastPosition = new Vector3();
      const lastQuaternion = new Quaternion();
      const twoPI = 2 * Math.PI;
      return function update() {
        const position = scope.object.position;
        quat.setFromUnitVectors(object.up, up);
        quatInverse.copy(quat).invert();
        offset.copy(position).sub(scope.target);
        offset.applyQuaternion(quat);
        spherical.setFromVector3(offset);
        if (scope.autoRotate && state === STATE.NONE) {
          rotateLeft(getAutoRotationAngle());
        }
        if (scope.enableDamping) {
          spherical.theta += sphericalDelta.theta * scope.dampingFactor;
          spherical.phi += sphericalDelta.phi * scope.dampingFactor;
        } else {
          spherical.theta += sphericalDelta.theta;
          spherical.phi += sphericalDelta.phi;
        }
        let min = scope.minAzimuthAngle;
        let max = scope.maxAzimuthAngle;
        if (isFinite(min) && isFinite(max)) {
          if (min < -Math.PI)
            min += twoPI;
          else if (min > Math.PI)
            min -= twoPI;
          if (max < -Math.PI)
            max += twoPI;
          else if (max > Math.PI)
            max -= twoPI;
          if (min <= max) {
            spherical.theta = Math.max(min, Math.min(max, spherical.theta));
          } else {
            spherical.theta = spherical.theta > (min + max) / 2 ? Math.max(min, spherical.theta) : Math.min(max, spherical.theta);
          }
        }
        spherical.phi = Math.max(scope.minPolarAngle, Math.min(scope.maxPolarAngle, spherical.phi));
        spherical.makeSafe();
        if (scope.enableDamping === true) {
          scope.target.addScaledVector(panOffset, scope.dampingFactor);
        } else {
          scope.target.add(panOffset);
        }
        if (scope.zoomToCursor && performCursorZoom || scope.object.isOrthographicCamera) {
          spherical.radius = clampDistance(spherical.radius);
        } else {
          spherical.radius = clampDistance(spherical.radius * scale);
        }
        offset.setFromSpherical(spherical);
        offset.applyQuaternion(quatInverse);
        position.copy(scope.target).add(offset);
        if (!scope.object.matrixAutoUpdate)
          scope.object.updateMatrix();
        scope.object.lookAt(scope.target);
        if (scope.enableDamping === true) {
          sphericalDelta.theta *= 1 - scope.dampingFactor;
          sphericalDelta.phi *= 1 - scope.dampingFactor;
          panOffset.multiplyScalar(1 - scope.dampingFactor);
        } else {
          sphericalDelta.set(0, 0, 0);
          panOffset.set(0, 0, 0);
        }
        let zoomChanged = false;
        if (scope.zoomToCursor && performCursorZoom) {
          let newRadius = null;
          if (scope.object instanceof PerspectiveCamera$1 && scope.object.isPerspectiveCamera) {
            const prevRadius = offset.length();
            newRadius = clampDistance(prevRadius * scale);
            const radiusDelta = prevRadius - newRadius;
            scope.object.position.addScaledVector(dollyDirection, radiusDelta);
            scope.object.updateMatrixWorld();
          } else if (scope.object.isOrthographicCamera) {
            const mouseBefore = new Vector3(mouse.x, mouse.y, 0);
            mouseBefore.unproject(scope.object);
            scope.object.zoom = Math.max(scope.minZoom, Math.min(scope.maxZoom, scope.object.zoom / scale));
            scope.object.updateProjectionMatrix();
            zoomChanged = true;
            const mouseAfter = new Vector3(mouse.x, mouse.y, 0);
            mouseAfter.unproject(scope.object);
            scope.object.position.sub(mouseAfter).add(mouseBefore);
            scope.object.updateMatrixWorld();
            newRadius = offset.length();
          } else {
            console.warn("WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled.");
            scope.zoomToCursor = false;
          }
          if (newRadius !== null) {
            if (scope.screenSpacePanning) {
              scope.target.set(0, 0, -1).transformDirection(scope.object.matrix).multiplyScalar(newRadius).add(scope.object.position);
            } else {
              _ray.origin.copy(scope.object.position);
              _ray.direction.set(0, 0, -1).transformDirection(scope.object.matrix);
              if (Math.abs(scope.object.up.dot(_ray.direction)) < TILT_LIMIT) {
                object.lookAt(scope.target);
              } else {
                _plane.setFromNormalAndCoplanarPoint(scope.object.up, scope.target);
                _ray.intersectPlane(_plane, scope.target);
              }
            }
          }
        } else if (scope.object instanceof OrthographicCamera && scope.object.isOrthographicCamera) {
          zoomChanged = scale !== 1;
          if (zoomChanged) {
            scope.object.zoom = Math.max(scope.minZoom, Math.min(scope.maxZoom, scope.object.zoom / scale));
            scope.object.updateProjectionMatrix();
          }
        }
        scale = 1;
        performCursorZoom = false;
        if (zoomChanged || lastPosition.distanceToSquared(scope.object.position) > EPS || 8 * (1 - lastQuaternion.dot(scope.object.quaternion)) > EPS) {
          scope.dispatchEvent(changeEvent);
          lastPosition.copy(scope.object.position);
          lastQuaternion.copy(scope.object.quaternion);
          zoomChanged = false;
          return true;
        }
        return false;
      };
    })();
    this.connect = (domElement2) => {
      scope.domElement = domElement2;
      scope.domElement.style.touchAction = "none";
      scope.domElement.addEventListener("contextmenu", onContextMenu);
      scope.domElement.addEventListener("pointerdown", onPointerDown);
      scope.domElement.addEventListener("pointercancel", onPointerUp);
      scope.domElement.addEventListener("wheel", onMouseWheel);
    };
    this.dispose = () => {
      var _a, _b, _c, _d, _e, _f;
      if (scope.domElement) {
        scope.domElement.style.touchAction = "auto";
      }
      (_a = scope.domElement) == null ? void 0 : _a.removeEventListener("contextmenu", onContextMenu);
      (_b = scope.domElement) == null ? void 0 : _b.removeEventListener("pointerdown", onPointerDown);
      (_c = scope.domElement) == null ? void 0 : _c.removeEventListener("pointercancel", onPointerUp);
      (_d = scope.domElement) == null ? void 0 : _d.removeEventListener("wheel", onMouseWheel);
      (_e = scope.domElement) == null ? void 0 : _e.ownerDocument.removeEventListener("pointermove", onPointerMove);
      (_f = scope.domElement) == null ? void 0 : _f.ownerDocument.removeEventListener("pointerup", onPointerUp);
      if (scope._domElementKeyEvents !== null) {
        scope._domElementKeyEvents.removeEventListener("keydown", onKeyDown);
      }
    };
    const scope = this;
    const changeEvent = { type: "change" };
    const startEvent = { type: "start" };
    const endEvent = { type: "end" };
    const STATE = {
      NONE: -1,
      ROTATE: 0,
      DOLLY: 1,
      PAN: 2,
      TOUCH_ROTATE: 3,
      TOUCH_PAN: 4,
      TOUCH_DOLLY_PAN: 5,
      TOUCH_DOLLY_ROTATE: 6
    };
    let state = STATE.NONE;
    const EPS = 1e-6;
    const spherical = new Spherical();
    const sphericalDelta = new Spherical();
    let scale = 1;
    const panOffset = new Vector3();
    const rotateStart = new Vector2();
    const rotateEnd = new Vector2();
    const rotateDelta = new Vector2();
    const panStart = new Vector2();
    const panEnd = new Vector2();
    const panDelta = new Vector2();
    const dollyStart = new Vector2();
    const dollyEnd = new Vector2();
    const dollyDelta = new Vector2();
    const dollyDirection = new Vector3();
    const mouse = new Vector2();
    let performCursorZoom = false;
    const pointers = [];
    const pointerPositions = {};
    function getAutoRotationAngle() {
      return 2 * Math.PI / 60 / 60 * scope.autoRotateSpeed;
    }
    function getZoomScale() {
      return Math.pow(0.95, scope.zoomSpeed);
    }
    function rotateLeft(angle) {
      if (scope.reverseOrbit || scope.reverseHorizontalOrbit) {
        sphericalDelta.theta += angle;
      } else {
        sphericalDelta.theta -= angle;
      }
    }
    function rotateUp(angle) {
      if (scope.reverseOrbit || scope.reverseVerticalOrbit) {
        sphericalDelta.phi += angle;
      } else {
        sphericalDelta.phi -= angle;
      }
    }
    const panLeft = (() => {
      const v = new Vector3();
      return function panLeft2(distance, objectMatrix) {
        v.setFromMatrixColumn(objectMatrix, 0);
        v.multiplyScalar(-distance);
        panOffset.add(v);
      };
    })();
    const panUp = (() => {
      const v = new Vector3();
      return function panUp2(distance, objectMatrix) {
        if (scope.screenSpacePanning === true) {
          v.setFromMatrixColumn(objectMatrix, 1);
        } else {
          v.setFromMatrixColumn(objectMatrix, 0);
          v.crossVectors(scope.object.up, v);
        }
        v.multiplyScalar(distance);
        panOffset.add(v);
      };
    })();
    const pan = (() => {
      const offset = new Vector3();
      return function pan2(deltaX, deltaY) {
        const element = scope.domElement;
        if (element && scope.object instanceof PerspectiveCamera$1 && scope.object.isPerspectiveCamera) {
          const position = scope.object.position;
          offset.copy(position).sub(scope.target);
          let targetDistance = offset.length();
          targetDistance *= Math.tan(scope.object.fov / 2 * Math.PI / 180);
          panLeft(2 * deltaX * targetDistance / element.clientHeight, scope.object.matrix);
          panUp(2 * deltaY * targetDistance / element.clientHeight, scope.object.matrix);
        } else if (element && scope.object instanceof OrthographicCamera && scope.object.isOrthographicCamera) {
          panLeft(
            deltaX * (scope.object.right - scope.object.left) / scope.object.zoom / element.clientWidth,
            scope.object.matrix
          );
          panUp(
            deltaY * (scope.object.top - scope.object.bottom) / scope.object.zoom / element.clientHeight,
            scope.object.matrix
          );
        } else {
          console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.");
          scope.enablePan = false;
        }
      };
    })();
    function setScale(newScale) {
      if (scope.object instanceof PerspectiveCamera$1 && scope.object.isPerspectiveCamera || scope.object instanceof OrthographicCamera && scope.object.isOrthographicCamera) {
        scale = newScale;
      } else {
        console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.");
        scope.enableZoom = false;
      }
    }
    function dollyOut(dollyScale) {
      setScale(scale / dollyScale);
    }
    function dollyIn(dollyScale) {
      setScale(scale * dollyScale);
    }
    function updateMouseParameters(event) {
      if (!scope.zoomToCursor || !scope.domElement) {
        return;
      }
      performCursorZoom = true;
      const rect = scope.domElement.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const w = rect.width;
      const h = rect.height;
      mouse.x = x / w * 2 - 1;
      mouse.y = -(y / h) * 2 + 1;
      dollyDirection.set(mouse.x, mouse.y, 1).unproject(scope.object).sub(scope.object.position).normalize();
    }
    function clampDistance(dist) {
      return Math.max(scope.minDistance, Math.min(scope.maxDistance, dist));
    }
    function handleMouseDownRotate(event) {
      rotateStart.set(event.clientX, event.clientY);
    }
    function handleMouseDownDolly(event) {
      updateMouseParameters(event);
      dollyStart.set(event.clientX, event.clientY);
    }
    function handleMouseDownPan(event) {
      panStart.set(event.clientX, event.clientY);
    }
    function handleMouseMoveRotate(event) {
      rotateEnd.set(event.clientX, event.clientY);
      rotateDelta.subVectors(rotateEnd, rotateStart).multiplyScalar(scope.rotateSpeed);
      const element = scope.domElement;
      if (element) {
        rotateLeft(2 * Math.PI * rotateDelta.x / element.clientHeight);
        rotateUp(2 * Math.PI * rotateDelta.y / element.clientHeight);
      }
      rotateStart.copy(rotateEnd);
      scope.update();
    }
    function handleMouseMoveDolly(event) {
      dollyEnd.set(event.clientX, event.clientY);
      dollyDelta.subVectors(dollyEnd, dollyStart);
      if (dollyDelta.y > 0) {
        dollyOut(getZoomScale());
      } else if (dollyDelta.y < 0) {
        dollyIn(getZoomScale());
      }
      dollyStart.copy(dollyEnd);
      scope.update();
    }
    function handleMouseMovePan(event) {
      panEnd.set(event.clientX, event.clientY);
      panDelta.subVectors(panEnd, panStart).multiplyScalar(scope.panSpeed);
      pan(panDelta.x, panDelta.y);
      panStart.copy(panEnd);
      scope.update();
    }
    function handleMouseWheel(event) {
      updateMouseParameters(event);
      if (event.deltaY < 0) {
        dollyIn(getZoomScale());
      } else if (event.deltaY > 0) {
        dollyOut(getZoomScale());
      }
      scope.update();
    }
    function handleKeyDown(event) {
      let needsUpdate = false;
      switch (event.code) {
        case scope.keys.UP:
          pan(0, scope.keyPanSpeed);
          needsUpdate = true;
          break;
        case scope.keys.BOTTOM:
          pan(0, -scope.keyPanSpeed);
          needsUpdate = true;
          break;
        case scope.keys.LEFT:
          pan(scope.keyPanSpeed, 0);
          needsUpdate = true;
          break;
        case scope.keys.RIGHT:
          pan(-scope.keyPanSpeed, 0);
          needsUpdate = true;
          break;
      }
      if (needsUpdate) {
        event.preventDefault();
        scope.update();
      }
    }
    function handleTouchStartRotate() {
      if (pointers.length == 1) {
        rotateStart.set(pointers[0].pageX, pointers[0].pageY);
      } else {
        const x = 0.5 * (pointers[0].pageX + pointers[1].pageX);
        const y = 0.5 * (pointers[0].pageY + pointers[1].pageY);
        rotateStart.set(x, y);
      }
    }
    function handleTouchStartPan() {
      if (pointers.length == 1) {
        panStart.set(pointers[0].pageX, pointers[0].pageY);
      } else {
        const x = 0.5 * (pointers[0].pageX + pointers[1].pageX);
        const y = 0.5 * (pointers[0].pageY + pointers[1].pageY);
        panStart.set(x, y);
      }
    }
    function handleTouchStartDolly() {
      const dx = pointers[0].pageX - pointers[1].pageX;
      const dy = pointers[0].pageY - pointers[1].pageY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      dollyStart.set(0, distance);
    }
    function handleTouchStartDollyPan() {
      if (scope.enableZoom)
        handleTouchStartDolly();
      if (scope.enablePan)
        handleTouchStartPan();
    }
    function handleTouchStartDollyRotate() {
      if (scope.enableZoom)
        handleTouchStartDolly();
      if (scope.enableRotate)
        handleTouchStartRotate();
    }
    function handleTouchMoveRotate(event) {
      if (pointers.length == 1) {
        rotateEnd.set(event.pageX, event.pageY);
      } else {
        const position = getSecondPointerPosition(event);
        const x = 0.5 * (event.pageX + position.x);
        const y = 0.5 * (event.pageY + position.y);
        rotateEnd.set(x, y);
      }
      rotateDelta.subVectors(rotateEnd, rotateStart).multiplyScalar(scope.rotateSpeed);
      const element = scope.domElement;
      if (element) {
        rotateLeft(2 * Math.PI * rotateDelta.x / element.clientHeight);
        rotateUp(2 * Math.PI * rotateDelta.y / element.clientHeight);
      }
      rotateStart.copy(rotateEnd);
    }
    function handleTouchMovePan(event) {
      if (pointers.length == 1) {
        panEnd.set(event.pageX, event.pageY);
      } else {
        const position = getSecondPointerPosition(event);
        const x = 0.5 * (event.pageX + position.x);
        const y = 0.5 * (event.pageY + position.y);
        panEnd.set(x, y);
      }
      panDelta.subVectors(panEnd, panStart).multiplyScalar(scope.panSpeed);
      pan(panDelta.x, panDelta.y);
      panStart.copy(panEnd);
    }
    function handleTouchMoveDolly(event) {
      const position = getSecondPointerPosition(event);
      const dx = event.pageX - position.x;
      const dy = event.pageY - position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      dollyEnd.set(0, distance);
      dollyDelta.set(0, Math.pow(dollyEnd.y / dollyStart.y, scope.zoomSpeed));
      dollyOut(dollyDelta.y);
      dollyStart.copy(dollyEnd);
    }
    function handleTouchMoveDollyPan(event) {
      if (scope.enableZoom)
        handleTouchMoveDolly(event);
      if (scope.enablePan)
        handleTouchMovePan(event);
    }
    function handleTouchMoveDollyRotate(event) {
      if (scope.enableZoom)
        handleTouchMoveDolly(event);
      if (scope.enableRotate)
        handleTouchMoveRotate(event);
    }
    function onPointerDown(event) {
      var _a, _b;
      if (scope.enabled === false)
        return;
      if (pointers.length === 0) {
        (_a = scope.domElement) == null ? void 0 : _a.ownerDocument.addEventListener("pointermove", onPointerMove);
        (_b = scope.domElement) == null ? void 0 : _b.ownerDocument.addEventListener("pointerup", onPointerUp);
      }
      addPointer(event);
      if (event.pointerType === "touch") {
        onTouchStart(event);
      } else {
        onMouseDown(event);
      }
    }
    function onPointerMove(event) {
      if (scope.enabled === false)
        return;
      if (event.pointerType === "touch") {
        onTouchMove(event);
      } else {
        onMouseMove(event);
      }
    }
    function onPointerUp(event) {
      var _a, _b, _c;
      removePointer(event);
      if (pointers.length === 0) {
        (_a = scope.domElement) == null ? void 0 : _a.releasePointerCapture(event.pointerId);
        (_b = scope.domElement) == null ? void 0 : _b.ownerDocument.removeEventListener("pointermove", onPointerMove);
        (_c = scope.domElement) == null ? void 0 : _c.ownerDocument.removeEventListener("pointerup", onPointerUp);
      }
      scope.dispatchEvent(endEvent);
      state = STATE.NONE;
    }
    function onMouseDown(event) {
      let mouseAction;
      switch (event.button) {
        case 0:
          mouseAction = scope.mouseButtons.LEFT;
          break;
        case 1:
          mouseAction = scope.mouseButtons.MIDDLE;
          break;
        case 2:
          mouseAction = scope.mouseButtons.RIGHT;
          break;
        default:
          mouseAction = -1;
      }
      switch (mouseAction) {
        case MOUSE.DOLLY:
          if (scope.enableZoom === false)
            return;
          handleMouseDownDolly(event);
          state = STATE.DOLLY;
          break;
        case MOUSE.ROTATE:
          if (event.ctrlKey || event.metaKey || event.shiftKey) {
            if (scope.enablePan === false)
              return;
            handleMouseDownPan(event);
            state = STATE.PAN;
          } else {
            if (scope.enableRotate === false)
              return;
            handleMouseDownRotate(event);
            state = STATE.ROTATE;
          }
          break;
        case MOUSE.PAN:
          if (event.ctrlKey || event.metaKey || event.shiftKey) {
            if (scope.enableRotate === false)
              return;
            handleMouseDownRotate(event);
            state = STATE.ROTATE;
          } else {
            if (scope.enablePan === false)
              return;
            handleMouseDownPan(event);
            state = STATE.PAN;
          }
          break;
        default:
          state = STATE.NONE;
      }
      if (state !== STATE.NONE) {
        scope.dispatchEvent(startEvent);
      }
    }
    function onMouseMove(event) {
      if (scope.enabled === false)
        return;
      switch (state) {
        case STATE.ROTATE:
          if (scope.enableRotate === false)
            return;
          handleMouseMoveRotate(event);
          break;
        case STATE.DOLLY:
          if (scope.enableZoom === false)
            return;
          handleMouseMoveDolly(event);
          break;
        case STATE.PAN:
          if (scope.enablePan === false)
            return;
          handleMouseMovePan(event);
          break;
      }
    }
    function onMouseWheel(event) {
      if (scope.enabled === false || scope.enableZoom === false || state !== STATE.NONE && state !== STATE.ROTATE) {
        return;
      }
      event.preventDefault();
      scope.dispatchEvent(startEvent);
      handleMouseWheel(event);
      scope.dispatchEvent(endEvent);
    }
    function onKeyDown(event) {
      if (scope.enabled === false || scope.enablePan === false)
        return;
      handleKeyDown(event);
    }
    function onTouchStart(event) {
      trackPointer(event);
      switch (pointers.length) {
        case 1:
          switch (scope.touches.ONE) {
            case TOUCH.ROTATE:
              if (scope.enableRotate === false)
                return;
              handleTouchStartRotate();
              state = STATE.TOUCH_ROTATE;
              break;
            case TOUCH.PAN:
              if (scope.enablePan === false)
                return;
              handleTouchStartPan();
              state = STATE.TOUCH_PAN;
              break;
            default:
              state = STATE.NONE;
          }
          break;
        case 2:
          switch (scope.touches.TWO) {
            case TOUCH.DOLLY_PAN:
              if (scope.enableZoom === false && scope.enablePan === false)
                return;
              handleTouchStartDollyPan();
              state = STATE.TOUCH_DOLLY_PAN;
              break;
            case TOUCH.DOLLY_ROTATE:
              if (scope.enableZoom === false && scope.enableRotate === false)
                return;
              handleTouchStartDollyRotate();
              state = STATE.TOUCH_DOLLY_ROTATE;
              break;
            default:
              state = STATE.NONE;
          }
          break;
        default:
          state = STATE.NONE;
      }
      if (state !== STATE.NONE) {
        scope.dispatchEvent(startEvent);
      }
    }
    function onTouchMove(event) {
      trackPointer(event);
      switch (state) {
        case STATE.TOUCH_ROTATE:
          if (scope.enableRotate === false)
            return;
          handleTouchMoveRotate(event);
          scope.update();
          break;
        case STATE.TOUCH_PAN:
          if (scope.enablePan === false)
            return;
          handleTouchMovePan(event);
          scope.update();
          break;
        case STATE.TOUCH_DOLLY_PAN:
          if (scope.enableZoom === false && scope.enablePan === false)
            return;
          handleTouchMoveDollyPan(event);
          scope.update();
          break;
        case STATE.TOUCH_DOLLY_ROTATE:
          if (scope.enableZoom === false && scope.enableRotate === false)
            return;
          handleTouchMoveDollyRotate(event);
          scope.update();
          break;
        default:
          state = STATE.NONE;
      }
    }
    function onContextMenu(event) {
      if (scope.enabled === false)
        return;
      event.preventDefault();
    }
    function addPointer(event) {
      pointers.push(event);
    }
    function removePointer(event) {
      delete pointerPositions[event.pointerId];
      for (let i = 0; i < pointers.length; i++) {
        if (pointers[i].pointerId == event.pointerId) {
          pointers.splice(i, 1);
          return;
        }
      }
    }
    function trackPointer(event) {
      let position = pointerPositions[event.pointerId];
      if (position === void 0) {
        position = new Vector2();
        pointerPositions[event.pointerId] = position;
      }
      position.set(event.pageX, event.pageY);
    }
    function getSecondPointerPosition(event) {
      const pointer = event.pointerId === pointers[0].pointerId ? pointers[1] : pointers[0];
      return pointerPositions[pointer.pointerId];
    }
    this.dollyIn = (dollyScale = getZoomScale()) => {
      dollyIn(dollyScale);
      scope.update();
    };
    this.dollyOut = (dollyScale = getZoomScale()) => {
      dollyOut(dollyScale);
      scope.update();
    };
    this.getScale = () => {
      return scale;
    };
    this.setScale = (newScale) => {
      setScale(newScale);
      scope.update();
    };
    this.getZoomScale = () => {
      return getZoomScale();
    };
    if (domElement !== void 0)
      this.connect(domElement);
    this.update();
  }
};
function decodeText(array) {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder().decode(array);
  }
  let s = "";
  for (let i = 0, il = array.length; i < il; i++) {
    s += String.fromCharCode(array[i]);
  }
  try {
    return decodeURIComponent(escape(s));
  } catch (e) {
    return s;
  }
}
const SRGBColorSpace = "srgb";
const LinearSRGBColorSpace = "srgb-linear";
const sRGBEncoding = 3001;
const LinearEncoding = 3e3;
class GLTFLoader extends Loader {
  constructor(manager) {
    super(manager);
    this.dracoLoader = null;
    this.ktx2Loader = null;
    this.meshoptDecoder = null;
    this.pluginCallbacks = [];
    this.register(function(parser) {
      return new GLTFMaterialsClearcoatExtension(parser);
    });
    this.register(function(parser) {
      return new GLTFMaterialsDispersionExtension(parser);
    });
    this.register(function(parser) {
      return new GLTFTextureBasisUExtension(parser);
    });
    this.register(function(parser) {
      return new GLTFTextureWebPExtension(parser);
    });
    this.register(function(parser) {
      return new GLTFTextureAVIFExtension(parser);
    });
    this.register(function(parser) {
      return new GLTFMaterialsSheenExtension(parser);
    });
    this.register(function(parser) {
      return new GLTFMaterialsTransmissionExtension(parser);
    });
    this.register(function(parser) {
      return new GLTFMaterialsVolumeExtension(parser);
    });
    this.register(function(parser) {
      return new GLTFMaterialsIorExtension(parser);
    });
    this.register(function(parser) {
      return new GLTFMaterialsEmissiveStrengthExtension(parser);
    });
    this.register(function(parser) {
      return new GLTFMaterialsSpecularExtension(parser);
    });
    this.register(function(parser) {
      return new GLTFMaterialsIridescenceExtension(parser);
    });
    this.register(function(parser) {
      return new GLTFMaterialsAnisotropyExtension(parser);
    });
    this.register(function(parser) {
      return new GLTFMaterialsBumpExtension(parser);
    });
    this.register(function(parser) {
      return new GLTFLightsExtension(parser);
    });
    this.register(function(parser) {
      return new GLTFMeshoptCompression(parser);
    });
    this.register(function(parser) {
      return new GLTFMeshGpuInstancing(parser);
    });
  }
  load(url, onLoad, onProgress, onError) {
    const scope = this;
    let resourcePath;
    if (this.resourcePath !== "") {
      resourcePath = this.resourcePath;
    } else if (this.path !== "") {
      const relativeUrl = LoaderUtils.extractUrlBase(url);
      resourcePath = LoaderUtils.resolveURL(relativeUrl, this.path);
    } else {
      resourcePath = LoaderUtils.extractUrlBase(url);
    }
    this.manager.itemStart(url);
    const _onError = function(e) {
      if (onError) {
        onError(e);
      } else {
        console.error(e);
      }
      scope.manager.itemError(url);
      scope.manager.itemEnd(url);
    };
    const loader = new FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setResponseType("arraybuffer");
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);
    loader.load(
      url,
      function(data) {
        try {
          scope.parse(
            data,
            resourcePath,
            function(gltf) {
              onLoad(gltf);
              scope.manager.itemEnd(url);
            },
            _onError
          );
        } catch (e) {
          _onError(e);
        }
      },
      onProgress,
      _onError
    );
  }
  setDRACOLoader(dracoLoader2) {
    this.dracoLoader = dracoLoader2;
    return this;
  }
  setDDSLoader() {
    throw new Error('THREE.GLTFLoader: "MSFT_texture_dds" no longer supported. Please update to "KHR_texture_basisu".');
  }
  setKTX2Loader(ktx2Loader) {
    this.ktx2Loader = ktx2Loader;
    return this;
  }
  setMeshoptDecoder(meshoptDecoder) {
    this.meshoptDecoder = meshoptDecoder;
    return this;
  }
  register(callback) {
    if (this.pluginCallbacks.indexOf(callback) === -1) {
      this.pluginCallbacks.push(callback);
    }
    return this;
  }
  unregister(callback) {
    if (this.pluginCallbacks.indexOf(callback) !== -1) {
      this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(callback), 1);
    }
    return this;
  }
  parse(data, path, onLoad, onError) {
    let json;
    const extensions2 = {};
    const plugins = {};
    if (typeof data === "string") {
      json = JSON.parse(data);
    } else if (data instanceof ArrayBuffer) {
      const magic = decodeText(new Uint8Array(data.slice(0, 4)));
      if (magic === BINARY_EXTENSION_HEADER_MAGIC) {
        try {
          extensions2[EXTENSIONS.KHR_BINARY_GLTF] = new GLTFBinaryExtension(data);
        } catch (error) {
          if (onError)
            onError(error);
          return;
        }
        json = JSON.parse(extensions2[EXTENSIONS.KHR_BINARY_GLTF].content);
      } else {
        json = JSON.parse(decodeText(new Uint8Array(data)));
      }
    } else {
      json = data;
    }
    if (json.asset === void 0 || json.asset.version[0] < 2) {
      if (onError)
        onError(new Error("THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported."));
      return;
    }
    const parser = new GLTFParser(json, {
      path: path || this.resourcePath || "",
      crossOrigin: this.crossOrigin,
      requestHeader: this.requestHeader,
      manager: this.manager,
      ktx2Loader: this.ktx2Loader,
      meshoptDecoder: this.meshoptDecoder
    });
    parser.fileLoader.setRequestHeader(this.requestHeader);
    for (let i = 0; i < this.pluginCallbacks.length; i++) {
      const plugin = this.pluginCallbacks[i](parser);
      if (!plugin.name)
        console.error("THREE.GLTFLoader: Invalid plugin found: missing name");
      plugins[plugin.name] = plugin;
      extensions2[plugin.name] = true;
    }
    if (json.extensionsUsed) {
      for (let i = 0; i < json.extensionsUsed.length; ++i) {
        const extensionName = json.extensionsUsed[i];
        const extensionsRequired = json.extensionsRequired || [];
        switch (extensionName) {
          case EXTENSIONS.KHR_MATERIALS_UNLIT:
            extensions2[extensionName] = new GLTFMaterialsUnlitExtension();
            break;
          case EXTENSIONS.KHR_DRACO_MESH_COMPRESSION:
            extensions2[extensionName] = new GLTFDracoMeshCompressionExtension(json, this.dracoLoader);
            break;
          case EXTENSIONS.KHR_TEXTURE_TRANSFORM:
            extensions2[extensionName] = new GLTFTextureTransformExtension();
            break;
          case EXTENSIONS.KHR_MESH_QUANTIZATION:
            extensions2[extensionName] = new GLTFMeshQuantizationExtension();
            break;
          default:
            if (extensionsRequired.indexOf(extensionName) >= 0 && plugins[extensionName] === void 0) {
              console.warn('THREE.GLTFLoader: Unknown extension "' + extensionName + '".');
            }
        }
      }
    }
    parser.setExtensions(extensions2);
    parser.setPlugins(plugins);
    parser.parse(onLoad, onError);
  }
  parseAsync(data, path) {
    const scope = this;
    return new Promise(function(resolve, reject) {
      scope.parse(data, path, resolve, reject);
    });
  }
}
function GLTFRegistry() {
  let objects = {};
  return {
    get: function(key) {
      return objects[key];
    },
    add: function(key, object) {
      objects[key] = object;
    },
    remove: function(key) {
      delete objects[key];
    },
    removeAll: function() {
      objects = {};
    }
  };
}
const EXTENSIONS = {
  KHR_BINARY_GLTF: "KHR_binary_glTF",
  KHR_DRACO_MESH_COMPRESSION: "KHR_draco_mesh_compression",
  KHR_LIGHTS_PUNCTUAL: "KHR_lights_punctual",
  KHR_MATERIALS_CLEARCOAT: "KHR_materials_clearcoat",
  KHR_MATERIALS_DISPERSION: "KHR_materials_dispersion",
  KHR_MATERIALS_IOR: "KHR_materials_ior",
  KHR_MATERIALS_SHEEN: "KHR_materials_sheen",
  KHR_MATERIALS_SPECULAR: "KHR_materials_specular",
  KHR_MATERIALS_TRANSMISSION: "KHR_materials_transmission",
  KHR_MATERIALS_IRIDESCENCE: "KHR_materials_iridescence",
  KHR_MATERIALS_ANISOTROPY: "KHR_materials_anisotropy",
  KHR_MATERIALS_UNLIT: "KHR_materials_unlit",
  KHR_MATERIALS_VOLUME: "KHR_materials_volume",
  KHR_TEXTURE_BASISU: "KHR_texture_basisu",
  KHR_TEXTURE_TRANSFORM: "KHR_texture_transform",
  KHR_MESH_QUANTIZATION: "KHR_mesh_quantization",
  KHR_MATERIALS_EMISSIVE_STRENGTH: "KHR_materials_emissive_strength",
  EXT_MATERIALS_BUMP: "EXT_materials_bump",
  EXT_TEXTURE_WEBP: "EXT_texture_webp",
  EXT_TEXTURE_AVIF: "EXT_texture_avif",
  EXT_MESHOPT_COMPRESSION: "EXT_meshopt_compression",
  EXT_MESH_GPU_INSTANCING: "EXT_mesh_gpu_instancing"
};
class GLTFLightsExtension {
  constructor(parser) {
    this.parser = parser;
    this.name = EXTENSIONS.KHR_LIGHTS_PUNCTUAL;
    this.cache = { refs: {}, uses: {} };
  }
  _markDefs() {
    const parser = this.parser;
    const nodeDefs = this.parser.json.nodes || [];
    for (let nodeIndex = 0, nodeLength = nodeDefs.length; nodeIndex < nodeLength; nodeIndex++) {
      const nodeDef = nodeDefs[nodeIndex];
      if (nodeDef.extensions && nodeDef.extensions[this.name] && nodeDef.extensions[this.name].light !== void 0) {
        parser._addNodeRef(this.cache, nodeDef.extensions[this.name].light);
      }
    }
  }
  _loadLight(lightIndex) {
    const parser = this.parser;
    const cacheKey = "light:" + lightIndex;
    let dependency = parser.cache.get(cacheKey);
    if (dependency)
      return dependency;
    const json = parser.json;
    const extensions2 = json.extensions && json.extensions[this.name] || {};
    const lightDefs = extensions2.lights || [];
    const lightDef = lightDefs[lightIndex];
    let lightNode;
    const color = new Color(16777215);
    if (lightDef.color !== void 0)
      color.setRGB(lightDef.color[0], lightDef.color[1], lightDef.color[2], LinearSRGBColorSpace);
    const range = lightDef.range !== void 0 ? lightDef.range : 0;
    switch (lightDef.type) {
      case "directional":
        lightNode = new DirectionalLight(color);
        lightNode.target.position.set(0, 0, -1);
        lightNode.add(lightNode.target);
        break;
      case "point":
        lightNode = new PointLight(color);
        lightNode.distance = range;
        break;
      case "spot":
        lightNode = new SpotLight(color);
        lightNode.distance = range;
        lightDef.spot = lightDef.spot || {};
        lightDef.spot.innerConeAngle = lightDef.spot.innerConeAngle !== void 0 ? lightDef.spot.innerConeAngle : 0;
        lightDef.spot.outerConeAngle = lightDef.spot.outerConeAngle !== void 0 ? lightDef.spot.outerConeAngle : Math.PI / 4;
        lightNode.angle = lightDef.spot.outerConeAngle;
        lightNode.penumbra = 1 - lightDef.spot.innerConeAngle / lightDef.spot.outerConeAngle;
        lightNode.target.position.set(0, 0, -1);
        lightNode.add(lightNode.target);
        break;
      default:
        throw new Error("THREE.GLTFLoader: Unexpected light type: " + lightDef.type);
    }
    lightNode.position.set(0, 0, 0);
    lightNode.decay = 2;
    assignExtrasToUserData(lightNode, lightDef);
    if (lightDef.intensity !== void 0)
      lightNode.intensity = lightDef.intensity;
    lightNode.name = parser.createUniqueName(lightDef.name || "light_" + lightIndex);
    dependency = Promise.resolve(lightNode);
    parser.cache.add(cacheKey, dependency);
    return dependency;
  }
  getDependency(type, index) {
    if (type !== "light")
      return;
    return this._loadLight(index);
  }
  createNodeAttachment(nodeIndex) {
    const self2 = this;
    const parser = this.parser;
    const json = parser.json;
    const nodeDef = json.nodes[nodeIndex];
    const lightDef = nodeDef.extensions && nodeDef.extensions[this.name] || {};
    const lightIndex = lightDef.light;
    if (lightIndex === void 0)
      return null;
    return this._loadLight(lightIndex).then(function(light) {
      return parser._getNodeRef(self2.cache, lightIndex, light);
    });
  }
}
class GLTFMaterialsUnlitExtension {
  constructor() {
    this.name = EXTENSIONS.KHR_MATERIALS_UNLIT;
  }
  getMaterialType() {
    return MeshBasicMaterial;
  }
  extendParams(materialParams, materialDef, parser) {
    const pending = [];
    materialParams.color = new Color(1, 1, 1);
    materialParams.opacity = 1;
    const metallicRoughness = materialDef.pbrMetallicRoughness;
    if (metallicRoughness) {
      if (Array.isArray(metallicRoughness.baseColorFactor)) {
        const array = metallicRoughness.baseColorFactor;
        materialParams.color.setRGB(array[0], array[1], array[2], LinearSRGBColorSpace);
        materialParams.opacity = array[3];
      }
      if (metallicRoughness.baseColorTexture !== void 0) {
        pending.push(parser.assignTexture(materialParams, "map", metallicRoughness.baseColorTexture, SRGBColorSpace));
      }
    }
    return Promise.all(pending);
  }
}
class GLTFMaterialsEmissiveStrengthExtension {
  constructor(parser) {
    this.parser = parser;
    this.name = EXTENSIONS.KHR_MATERIALS_EMISSIVE_STRENGTH;
  }
  extendMaterialParams(materialIndex, materialParams) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name]) {
      return Promise.resolve();
    }
    const emissiveStrength = materialDef.extensions[this.name].emissiveStrength;
    if (emissiveStrength !== void 0) {
      materialParams.emissiveIntensity = emissiveStrength;
    }
    return Promise.resolve();
  }
}
class GLTFMaterialsClearcoatExtension {
  constructor(parser) {
    this.parser = parser;
    this.name = EXTENSIONS.KHR_MATERIALS_CLEARCOAT;
  }
  getMaterialType(materialIndex) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name])
      return null;
    return MeshPhysicalMaterial;
  }
  extendMaterialParams(materialIndex, materialParams) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name]) {
      return Promise.resolve();
    }
    const pending = [];
    const extension = materialDef.extensions[this.name];
    if (extension.clearcoatFactor !== void 0) {
      materialParams.clearcoat = extension.clearcoatFactor;
    }
    if (extension.clearcoatTexture !== void 0) {
      pending.push(parser.assignTexture(materialParams, "clearcoatMap", extension.clearcoatTexture));
    }
    if (extension.clearcoatRoughnessFactor !== void 0) {
      materialParams.clearcoatRoughness = extension.clearcoatRoughnessFactor;
    }
    if (extension.clearcoatRoughnessTexture !== void 0) {
      pending.push(parser.assignTexture(materialParams, "clearcoatRoughnessMap", extension.clearcoatRoughnessTexture));
    }
    if (extension.clearcoatNormalTexture !== void 0) {
      pending.push(parser.assignTexture(materialParams, "clearcoatNormalMap", extension.clearcoatNormalTexture));
      if (extension.clearcoatNormalTexture.scale !== void 0) {
        const scale = extension.clearcoatNormalTexture.scale;
        materialParams.clearcoatNormalScale = new Vector2(scale, scale);
      }
    }
    return Promise.all(pending);
  }
}
class GLTFMaterialsDispersionExtension {
  constructor(parser) {
    this.parser = parser;
    this.name = EXTENSIONS.KHR_MATERIALS_DISPERSION;
  }
  getMaterialType(materialIndex) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name])
      return null;
    return MeshPhysicalMaterial;
  }
  extendMaterialParams(materialIndex, materialParams) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name]) {
      return Promise.resolve();
    }
    const extension = materialDef.extensions[this.name];
    materialParams.dispersion = extension.dispersion !== void 0 ? extension.dispersion : 0;
    return Promise.resolve();
  }
}
class GLTFMaterialsIridescenceExtension {
  constructor(parser) {
    this.parser = parser;
    this.name = EXTENSIONS.KHR_MATERIALS_IRIDESCENCE;
  }
  getMaterialType(materialIndex) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name])
      return null;
    return MeshPhysicalMaterial;
  }
  extendMaterialParams(materialIndex, materialParams) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name]) {
      return Promise.resolve();
    }
    const pending = [];
    const extension = materialDef.extensions[this.name];
    if (extension.iridescenceFactor !== void 0) {
      materialParams.iridescence = extension.iridescenceFactor;
    }
    if (extension.iridescenceTexture !== void 0) {
      pending.push(parser.assignTexture(materialParams, "iridescenceMap", extension.iridescenceTexture));
    }
    if (extension.iridescenceIor !== void 0) {
      materialParams.iridescenceIOR = extension.iridescenceIor;
    }
    if (materialParams.iridescenceThicknessRange === void 0) {
      materialParams.iridescenceThicknessRange = [100, 400];
    }
    if (extension.iridescenceThicknessMinimum !== void 0) {
      materialParams.iridescenceThicknessRange[0] = extension.iridescenceThicknessMinimum;
    }
    if (extension.iridescenceThicknessMaximum !== void 0) {
      materialParams.iridescenceThicknessRange[1] = extension.iridescenceThicknessMaximum;
    }
    if (extension.iridescenceThicknessTexture !== void 0) {
      pending.push(
        parser.assignTexture(materialParams, "iridescenceThicknessMap", extension.iridescenceThicknessTexture)
      );
    }
    return Promise.all(pending);
  }
}
class GLTFMaterialsSheenExtension {
  constructor(parser) {
    this.parser = parser;
    this.name = EXTENSIONS.KHR_MATERIALS_SHEEN;
  }
  getMaterialType(materialIndex) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name])
      return null;
    return MeshPhysicalMaterial;
  }
  extendMaterialParams(materialIndex, materialParams) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name]) {
      return Promise.resolve();
    }
    const pending = [];
    materialParams.sheenColor = new Color(0, 0, 0);
    materialParams.sheenRoughness = 0;
    materialParams.sheen = 1;
    const extension = materialDef.extensions[this.name];
    if (extension.sheenColorFactor !== void 0) {
      const colorFactor = extension.sheenColorFactor;
      materialParams.sheenColor.setRGB(colorFactor[0], colorFactor[1], colorFactor[2], LinearSRGBColorSpace);
    }
    if (extension.sheenRoughnessFactor !== void 0) {
      materialParams.sheenRoughness = extension.sheenRoughnessFactor;
    }
    if (extension.sheenColorTexture !== void 0) {
      pending.push(parser.assignTexture(materialParams, "sheenColorMap", extension.sheenColorTexture, SRGBColorSpace));
    }
    if (extension.sheenRoughnessTexture !== void 0) {
      pending.push(parser.assignTexture(materialParams, "sheenRoughnessMap", extension.sheenRoughnessTexture));
    }
    return Promise.all(pending);
  }
}
class GLTFMaterialsTransmissionExtension {
  constructor(parser) {
    this.parser = parser;
    this.name = EXTENSIONS.KHR_MATERIALS_TRANSMISSION;
  }
  getMaterialType(materialIndex) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name])
      return null;
    return MeshPhysicalMaterial;
  }
  extendMaterialParams(materialIndex, materialParams) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name]) {
      return Promise.resolve();
    }
    const pending = [];
    const extension = materialDef.extensions[this.name];
    if (extension.transmissionFactor !== void 0) {
      materialParams.transmission = extension.transmissionFactor;
    }
    if (extension.transmissionTexture !== void 0) {
      pending.push(parser.assignTexture(materialParams, "transmissionMap", extension.transmissionTexture));
    }
    return Promise.all(pending);
  }
}
class GLTFMaterialsVolumeExtension {
  constructor(parser) {
    this.parser = parser;
    this.name = EXTENSIONS.KHR_MATERIALS_VOLUME;
  }
  getMaterialType(materialIndex) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name])
      return null;
    return MeshPhysicalMaterial;
  }
  extendMaterialParams(materialIndex, materialParams) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name]) {
      return Promise.resolve();
    }
    const pending = [];
    const extension = materialDef.extensions[this.name];
    materialParams.thickness = extension.thicknessFactor !== void 0 ? extension.thicknessFactor : 0;
    if (extension.thicknessTexture !== void 0) {
      pending.push(parser.assignTexture(materialParams, "thicknessMap", extension.thicknessTexture));
    }
    materialParams.attenuationDistance = extension.attenuationDistance || Infinity;
    const colorArray = extension.attenuationColor || [1, 1, 1];
    materialParams.attenuationColor = new Color().setRGB(
      colorArray[0],
      colorArray[1],
      colorArray[2],
      LinearSRGBColorSpace
    );
    return Promise.all(pending);
  }
}
class GLTFMaterialsIorExtension {
  constructor(parser) {
    this.parser = parser;
    this.name = EXTENSIONS.KHR_MATERIALS_IOR;
  }
  getMaterialType(materialIndex) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name])
      return null;
    return MeshPhysicalMaterial;
  }
  extendMaterialParams(materialIndex, materialParams) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name]) {
      return Promise.resolve();
    }
    const extension = materialDef.extensions[this.name];
    materialParams.ior = extension.ior !== void 0 ? extension.ior : 1.5;
    return Promise.resolve();
  }
}
class GLTFMaterialsSpecularExtension {
  constructor(parser) {
    this.parser = parser;
    this.name = EXTENSIONS.KHR_MATERIALS_SPECULAR;
  }
  getMaterialType(materialIndex) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name])
      return null;
    return MeshPhysicalMaterial;
  }
  extendMaterialParams(materialIndex, materialParams) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name]) {
      return Promise.resolve();
    }
    const pending = [];
    const extension = materialDef.extensions[this.name];
    materialParams.specularIntensity = extension.specularFactor !== void 0 ? extension.specularFactor : 1;
    if (extension.specularTexture !== void 0) {
      pending.push(parser.assignTexture(materialParams, "specularIntensityMap", extension.specularTexture));
    }
    const colorArray = extension.specularColorFactor || [1, 1, 1];
    materialParams.specularColor = new Color().setRGB(colorArray[0], colorArray[1], colorArray[2], LinearSRGBColorSpace);
    if (extension.specularColorTexture !== void 0) {
      pending.push(
        parser.assignTexture(materialParams, "specularColorMap", extension.specularColorTexture, SRGBColorSpace)
      );
    }
    return Promise.all(pending);
  }
}
class GLTFMaterialsBumpExtension {
  constructor(parser) {
    this.parser = parser;
    this.name = EXTENSIONS.EXT_MATERIALS_BUMP;
  }
  getMaterialType(materialIndex) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name])
      return null;
    return MeshPhysicalMaterial;
  }
  extendMaterialParams(materialIndex, materialParams) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name]) {
      return Promise.resolve();
    }
    const pending = [];
    const extension = materialDef.extensions[this.name];
    materialParams.bumpScale = extension.bumpFactor !== void 0 ? extension.bumpFactor : 1;
    if (extension.bumpTexture !== void 0) {
      pending.push(parser.assignTexture(materialParams, "bumpMap", extension.bumpTexture));
    }
    return Promise.all(pending);
  }
}
class GLTFMaterialsAnisotropyExtension {
  constructor(parser) {
    this.parser = parser;
    this.name = EXTENSIONS.KHR_MATERIALS_ANISOTROPY;
  }
  getMaterialType(materialIndex) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name])
      return null;
    return MeshPhysicalMaterial;
  }
  extendMaterialParams(materialIndex, materialParams) {
    const parser = this.parser;
    const materialDef = parser.json.materials[materialIndex];
    if (!materialDef.extensions || !materialDef.extensions[this.name]) {
      return Promise.resolve();
    }
    const pending = [];
    const extension = materialDef.extensions[this.name];
    if (extension.anisotropyStrength !== void 0) {
      materialParams.anisotropy = extension.anisotropyStrength;
    }
    if (extension.anisotropyRotation !== void 0) {
      materialParams.anisotropyRotation = extension.anisotropyRotation;
    }
    if (extension.anisotropyTexture !== void 0) {
      pending.push(parser.assignTexture(materialParams, "anisotropyMap", extension.anisotropyTexture));
    }
    return Promise.all(pending);
  }
}
class GLTFTextureBasisUExtension {
  constructor(parser) {
    this.parser = parser;
    this.name = EXTENSIONS.KHR_TEXTURE_BASISU;
  }
  loadTexture(textureIndex) {
    const parser = this.parser;
    const json = parser.json;
    const textureDef = json.textures[textureIndex];
    if (!textureDef.extensions || !textureDef.extensions[this.name]) {
      return null;
    }
    const extension = textureDef.extensions[this.name];
    const loader = parser.options.ktx2Loader;
    if (!loader) {
      if (json.extensionsRequired && json.extensionsRequired.indexOf(this.name) >= 0) {
        throw new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");
      } else {
        return null;
      }
    }
    return parser.loadTextureImage(textureIndex, extension.source, loader);
  }
}
class GLTFTextureWebPExtension {
  constructor(parser) {
    this.parser = parser;
    this.name = EXTENSIONS.EXT_TEXTURE_WEBP;
    this.isSupported = null;
  }
  loadTexture(textureIndex) {
    const name = this.name;
    const parser = this.parser;
    const json = parser.json;
    const textureDef = json.textures[textureIndex];
    if (!textureDef.extensions || !textureDef.extensions[name]) {
      return null;
    }
    const extension = textureDef.extensions[name];
    const source = json.images[extension.source];
    let loader = parser.textureLoader;
    if (source.uri) {
      const handler = parser.options.manager.getHandler(source.uri);
      if (handler !== null)
        loader = handler;
    }
    return this.detectSupport().then(function(isSupported) {
      if (isSupported)
        return parser.loadTextureImage(textureIndex, extension.source, loader);
      if (json.extensionsRequired && json.extensionsRequired.indexOf(name) >= 0) {
        throw new Error("THREE.GLTFLoader: WebP required by asset but unsupported.");
      }
      return parser.loadTexture(textureIndex);
    });
  }
  detectSupport() {
    if (!this.isSupported) {
      this.isSupported = new Promise(function(resolve) {
        const image = new Image();
        image.src = "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA";
        image.onload = image.onerror = function() {
          resolve(image.height === 1);
        };
      });
    }
    return this.isSupported;
  }
}
class GLTFTextureAVIFExtension {
  constructor(parser) {
    this.parser = parser;
    this.name = EXTENSIONS.EXT_TEXTURE_AVIF;
    this.isSupported = null;
  }
  loadTexture(textureIndex) {
    const name = this.name;
    const parser = this.parser;
    const json = parser.json;
    const textureDef = json.textures[textureIndex];
    if (!textureDef.extensions || !textureDef.extensions[name]) {
      return null;
    }
    const extension = textureDef.extensions[name];
    const source = json.images[extension.source];
    let loader = parser.textureLoader;
    if (source.uri) {
      const handler = parser.options.manager.getHandler(source.uri);
      if (handler !== null)
        loader = handler;
    }
    return this.detectSupport().then(function(isSupported) {
      if (isSupported)
        return parser.loadTextureImage(textureIndex, extension.source, loader);
      if (json.extensionsRequired && json.extensionsRequired.indexOf(name) >= 0) {
        throw new Error("THREE.GLTFLoader: AVIF required by asset but unsupported.");
      }
      return parser.loadTexture(textureIndex);
    });
  }
  detectSupport() {
    if (!this.isSupported) {
      this.isSupported = new Promise(function(resolve) {
        const image = new Image();
        image.src = "data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAABcAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAAB9tZGF0EgAKCBgABogQEDQgMgkQAAAAB8dSLfI=";
        image.onload = image.onerror = function() {
          resolve(image.height === 1);
        };
      });
    }
    return this.isSupported;
  }
}
class GLTFMeshoptCompression {
  constructor(parser) {
    this.name = EXTENSIONS.EXT_MESHOPT_COMPRESSION;
    this.parser = parser;
  }
  loadBufferView(index) {
    const json = this.parser.json;
    const bufferView = json.bufferViews[index];
    if (bufferView.extensions && bufferView.extensions[this.name]) {
      const extensionDef = bufferView.extensions[this.name];
      const buffer = this.parser.getDependency("buffer", extensionDef.buffer);
      const decoder = this.parser.options.meshoptDecoder;
      if (!decoder || !decoder.supported) {
        if (json.extensionsRequired && json.extensionsRequired.indexOf(this.name) >= 0) {
          throw new Error("THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files");
        } else {
          return null;
        }
      }
      return buffer.then(function(res) {
        const byteOffset = extensionDef.byteOffset || 0;
        const byteLength = extensionDef.byteLength || 0;
        const count = extensionDef.count;
        const stride = extensionDef.byteStride;
        const source = new Uint8Array(res, byteOffset, byteLength);
        if (decoder.decodeGltfBufferAsync) {
          return decoder.decodeGltfBufferAsync(count, stride, source, extensionDef.mode, extensionDef.filter).then(function(res2) {
            return res2.buffer;
          });
        } else {
          return decoder.ready.then(function() {
            const result = new ArrayBuffer(count * stride);
            decoder.decodeGltfBuffer(
              new Uint8Array(result),
              count,
              stride,
              source,
              extensionDef.mode,
              extensionDef.filter
            );
            return result;
          });
        }
      });
    } else {
      return null;
    }
  }
}
class GLTFMeshGpuInstancing {
  constructor(parser) {
    this.name = EXTENSIONS.EXT_MESH_GPU_INSTANCING;
    this.parser = parser;
  }
  createNodeMesh(nodeIndex) {
    const json = this.parser.json;
    const nodeDef = json.nodes[nodeIndex];
    if (!nodeDef.extensions || !nodeDef.extensions[this.name] || nodeDef.mesh === void 0) {
      return null;
    }
    const meshDef = json.meshes[nodeDef.mesh];
    for (const primitive of meshDef.primitives) {
      if (primitive.mode !== WEBGL_CONSTANTS.TRIANGLES && primitive.mode !== WEBGL_CONSTANTS.TRIANGLE_STRIP && primitive.mode !== WEBGL_CONSTANTS.TRIANGLE_FAN && primitive.mode !== void 0) {
        return null;
      }
    }
    const extensionDef = nodeDef.extensions[this.name];
    const attributesDef = extensionDef.attributes;
    const pending = [];
    const attributes = {};
    for (const key in attributesDef) {
      pending.push(
        this.parser.getDependency("accessor", attributesDef[key]).then((accessor) => {
          attributes[key] = accessor;
          return attributes[key];
        })
      );
    }
    if (pending.length < 1) {
      return null;
    }
    pending.push(this.parser.createNodeMesh(nodeIndex));
    return Promise.all(pending).then((results) => {
      const nodeObject = results.pop();
      const meshes = nodeObject.isGroup ? nodeObject.children : [nodeObject];
      const count = results[0].count;
      const instancedMeshes = [];
      for (const mesh of meshes) {
        const m = new Matrix4();
        const p = new Vector3();
        const q = new Quaternion();
        const s = new Vector3(1, 1, 1);
        const instancedMesh = new InstancedMesh(mesh.geometry, mesh.material, count);
        for (let i = 0; i < count; i++) {
          if (attributes.TRANSLATION) {
            p.fromBufferAttribute(attributes.TRANSLATION, i);
          }
          if (attributes.ROTATION) {
            q.fromBufferAttribute(attributes.ROTATION, i);
          }
          if (attributes.SCALE) {
            s.fromBufferAttribute(attributes.SCALE, i);
          }
          instancedMesh.setMatrixAt(i, m.compose(p, q, s));
        }
        for (const attributeName in attributes) {
          if (attributeName === "_COLOR_0") {
            const attr = attributes[attributeName];
            instancedMesh.instanceColor = new InstancedBufferAttribute(attr.array, attr.itemSize, attr.normalized);
          } else if (attributeName !== "TRANSLATION" && attributeName !== "ROTATION" && attributeName !== "SCALE") {
            mesh.geometry.setAttribute(attributeName, attributes[attributeName]);
          }
        }
        Object3D.prototype.copy.call(instancedMesh, mesh);
        this.parser.assignFinalMaterial(instancedMesh);
        instancedMeshes.push(instancedMesh);
      }
      if (nodeObject.isGroup) {
        nodeObject.clear();
        nodeObject.add(...instancedMeshes);
        return nodeObject;
      }
      return instancedMeshes[0];
    });
  }
}
const BINARY_EXTENSION_HEADER_MAGIC = "glTF";
const BINARY_EXTENSION_HEADER_LENGTH = 12;
const BINARY_EXTENSION_CHUNK_TYPES = { JSON: 1313821514, BIN: 5130562 };
class GLTFBinaryExtension {
  constructor(data) {
    this.name = EXTENSIONS.KHR_BINARY_GLTF;
    this.content = null;
    this.body = null;
    const headerView = new DataView(data, 0, BINARY_EXTENSION_HEADER_LENGTH);
    this.header = {
      magic: decodeText(new Uint8Array(data.slice(0, 4))),
      version: headerView.getUint32(4, true),
      length: headerView.getUint32(8, true)
    };
    if (this.header.magic !== BINARY_EXTENSION_HEADER_MAGIC) {
      throw new Error("THREE.GLTFLoader: Unsupported glTF-Binary header.");
    } else if (this.header.version < 2) {
      throw new Error("THREE.GLTFLoader: Legacy binary file detected.");
    }
    const chunkContentsLength = this.header.length - BINARY_EXTENSION_HEADER_LENGTH;
    const chunkView = new DataView(data, BINARY_EXTENSION_HEADER_LENGTH);
    let chunkIndex = 0;
    while (chunkIndex < chunkContentsLength) {
      const chunkLength = chunkView.getUint32(chunkIndex, true);
      chunkIndex += 4;
      const chunkType = chunkView.getUint32(chunkIndex, true);
      chunkIndex += 4;
      if (chunkType === BINARY_EXTENSION_CHUNK_TYPES.JSON) {
        const contentArray = new Uint8Array(data, BINARY_EXTENSION_HEADER_LENGTH + chunkIndex, chunkLength);
        this.content = decodeText(contentArray);
      } else if (chunkType === BINARY_EXTENSION_CHUNK_TYPES.BIN) {
        const byteOffset = BINARY_EXTENSION_HEADER_LENGTH + chunkIndex;
        this.body = data.slice(byteOffset, byteOffset + chunkLength);
      }
      chunkIndex += chunkLength;
    }
    if (this.content === null) {
      throw new Error("THREE.GLTFLoader: JSON content not found.");
    }
  }
}
class GLTFDracoMeshCompressionExtension {
  constructor(json, dracoLoader2) {
    if (!dracoLoader2) {
      throw new Error("THREE.GLTFLoader: No DRACOLoader instance provided.");
    }
    this.name = EXTENSIONS.KHR_DRACO_MESH_COMPRESSION;
    this.json = json;
    this.dracoLoader = dracoLoader2;
    this.dracoLoader.preload();
  }
  decodePrimitive(primitive, parser) {
    const json = this.json;
    const dracoLoader2 = this.dracoLoader;
    const bufferViewIndex = primitive.extensions[this.name].bufferView;
    const gltfAttributeMap = primitive.extensions[this.name].attributes;
    const threeAttributeMap = {};
    const attributeNormalizedMap = {};
    const attributeTypeMap = {};
    for (const attributeName in gltfAttributeMap) {
      const threeAttributeName = ATTRIBUTES[attributeName] || attributeName.toLowerCase();
      threeAttributeMap[threeAttributeName] = gltfAttributeMap[attributeName];
    }
    for (const attributeName in primitive.attributes) {
      const threeAttributeName = ATTRIBUTES[attributeName] || attributeName.toLowerCase();
      if (gltfAttributeMap[attributeName] !== void 0) {
        const accessorDef = json.accessors[primitive.attributes[attributeName]];
        const componentType = WEBGL_COMPONENT_TYPES[accessorDef.componentType];
        attributeTypeMap[threeAttributeName] = componentType.name;
        attributeNormalizedMap[threeAttributeName] = accessorDef.normalized === true;
      }
    }
    return parser.getDependency("bufferView", bufferViewIndex).then(function(bufferView) {
      return new Promise(function(resolve, reject) {
        dracoLoader2.decodeDracoFile(
          bufferView,
          function(geometry) {
            for (const attributeName in geometry.attributes) {
              const attribute = geometry.attributes[attributeName];
              const normalized = attributeNormalizedMap[attributeName];
              if (normalized !== void 0)
                attribute.normalized = normalized;
            }
            resolve(geometry);
          },
          threeAttributeMap,
          attributeTypeMap,
          LinearSRGBColorSpace,
          reject
        );
      });
    });
  }
}
class GLTFTextureTransformExtension {
  constructor() {
    this.name = EXTENSIONS.KHR_TEXTURE_TRANSFORM;
  }
  extendTexture(texture, transform) {
    if ((transform.texCoord === void 0 || transform.texCoord === texture.channel) && transform.offset === void 0 && transform.rotation === void 0 && transform.scale === void 0) {
      return texture;
    }
    texture = texture.clone();
    if (transform.texCoord !== void 0) {
      texture.channel = transform.texCoord;
    }
    if (transform.offset !== void 0) {
      texture.offset.fromArray(transform.offset);
    }
    if (transform.rotation !== void 0) {
      texture.rotation = transform.rotation;
    }
    if (transform.scale !== void 0) {
      texture.repeat.fromArray(transform.scale);
    }
    texture.needsUpdate = true;
    return texture;
  }
}
class GLTFMeshQuantizationExtension {
  constructor() {
    this.name = EXTENSIONS.KHR_MESH_QUANTIZATION;
  }
}
class GLTFCubicSplineInterpolant extends Interpolant {
  constructor(parameterPositions, sampleValues, sampleSize, resultBuffer) {
    super(parameterPositions, sampleValues, sampleSize, resultBuffer);
  }
  copySampleValue_(index) {
    const result = this.resultBuffer, values = this.sampleValues, valueSize = this.valueSize, offset = index * valueSize * 3 + valueSize;
    for (let i = 0; i !== valueSize; i++) {
      result[i] = values[offset + i];
    }
    return result;
  }
  interpolate_(i1, t0, t, t1) {
    const result = this.resultBuffer;
    const values = this.sampleValues;
    const stride = this.valueSize;
    const stride2 = stride * 2;
    const stride3 = stride * 3;
    const td = t1 - t0;
    const p = (t - t0) / td;
    const pp = p * p;
    const ppp = pp * p;
    const offset1 = i1 * stride3;
    const offset0 = offset1 - stride3;
    const s2 = -2 * ppp + 3 * pp;
    const s3 = ppp - pp;
    const s0 = 1 - s2;
    const s1 = s3 - pp + p;
    for (let i = 0; i !== stride; i++) {
      const p0 = values[offset0 + i + stride];
      const m0 = values[offset0 + i + stride2] * td;
      const p1 = values[offset1 + i + stride];
      const m1 = values[offset1 + i] * td;
      result[i] = s0 * p0 + s1 * m0 + s2 * p1 + s3 * m1;
    }
    return result;
  }
}
const _q = /* @__PURE__ */ new Quaternion();
class GLTFCubicSplineQuaternionInterpolant extends GLTFCubicSplineInterpolant {
  interpolate_(i1, t0, t, t1) {
    const result = super.interpolate_(i1, t0, t, t1);
    _q.fromArray(result).normalize().toArray(result);
    return result;
  }
}
const WEBGL_CONSTANTS = {
  POINTS: 0,
  LINES: 1,
  LINE_LOOP: 2,
  LINE_STRIP: 3,
  TRIANGLES: 4,
  TRIANGLE_STRIP: 5,
  TRIANGLE_FAN: 6
};
const WEBGL_COMPONENT_TYPES = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array
};
const WEBGL_FILTERS = {
  9728: NearestFilter,
  9729: LinearFilter,
  9984: NearestMipmapNearestFilter,
  9985: LinearMipmapNearestFilter,
  9986: NearestMipmapLinearFilter,
  9987: LinearMipmapLinearFilter
};
const WEBGL_WRAPPINGS = {
  33071: ClampToEdgeWrapping,
  33648: MirroredRepeatWrapping,
  10497: RepeatWrapping
};
const WEBGL_TYPE_SIZES = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16
};
const ATTRIBUTES = {
  POSITION: "position",
  NORMAL: "normal",
  TANGENT: "tangent",
  // uv => uv1, 4 uv channels
  // https://github.com/mrdoob/three.js/pull/25943
  // https://github.com/mrdoob/three.js/pull/25788
  ...version >= 152 ? {
    TEXCOORD_0: "uv",
    TEXCOORD_1: "uv1",
    TEXCOORD_2: "uv2",
    TEXCOORD_3: "uv3"
  } : {
    TEXCOORD_0: "uv",
    TEXCOORD_1: "uv2"
  },
  COLOR_0: "color",
  WEIGHTS_0: "skinWeight",
  JOINTS_0: "skinIndex"
};
const PATH_PROPERTIES = {
  scale: "scale",
  translation: "position",
  rotation: "quaternion",
  weights: "morphTargetInfluences"
};
const INTERPOLATION = {
  CUBICSPLINE: void 0,
  // We use a custom interpolant (GLTFCubicSplineInterpolation) for CUBICSPLINE tracks. Each
  // keyframe track will be initialized with a default interpolation type, then modified.
  LINEAR: InterpolateLinear,
  STEP: InterpolateDiscrete
};
const ALPHA_MODES = {
  OPAQUE: "OPAQUE",
  MASK: "MASK",
  BLEND: "BLEND"
};
function createDefaultMaterial(cache) {
  if (cache["DefaultMaterial"] === void 0) {
    cache["DefaultMaterial"] = new MeshStandardMaterial({
      color: 16777215,
      emissive: 0,
      metalness: 1,
      roughness: 1,
      transparent: false,
      depthTest: true,
      side: FrontSide
    });
  }
  return cache["DefaultMaterial"];
}
function addUnknownExtensionsToUserData(knownExtensions, object, objectDef) {
  for (const name in objectDef.extensions) {
    if (knownExtensions[name] === void 0) {
      object.userData.gltfExtensions = object.userData.gltfExtensions || {};
      object.userData.gltfExtensions[name] = objectDef.extensions[name];
    }
  }
}
function assignExtrasToUserData(object, gltfDef) {
  if (gltfDef.extras !== void 0) {
    if (typeof gltfDef.extras === "object") {
      Object.assign(object.userData, gltfDef.extras);
    } else {
      console.warn("THREE.GLTFLoader: Ignoring primitive type .extras, " + gltfDef.extras);
    }
  }
}
function addMorphTargets(geometry, targets, parser) {
  let hasMorphPosition = false;
  let hasMorphNormal = false;
  let hasMorphColor = false;
  for (let i = 0, il = targets.length; i < il; i++) {
    const target = targets[i];
    if (target.POSITION !== void 0)
      hasMorphPosition = true;
    if (target.NORMAL !== void 0)
      hasMorphNormal = true;
    if (target.COLOR_0 !== void 0)
      hasMorphColor = true;
    if (hasMorphPosition && hasMorphNormal && hasMorphColor)
      break;
  }
  if (!hasMorphPosition && !hasMorphNormal && !hasMorphColor)
    return Promise.resolve(geometry);
  const pendingPositionAccessors = [];
  const pendingNormalAccessors = [];
  const pendingColorAccessors = [];
  for (let i = 0, il = targets.length; i < il; i++) {
    const target = targets[i];
    if (hasMorphPosition) {
      const pendingAccessor = target.POSITION !== void 0 ? parser.getDependency("accessor", target.POSITION) : geometry.attributes.position;
      pendingPositionAccessors.push(pendingAccessor);
    }
    if (hasMorphNormal) {
      const pendingAccessor = target.NORMAL !== void 0 ? parser.getDependency("accessor", target.NORMAL) : geometry.attributes.normal;
      pendingNormalAccessors.push(pendingAccessor);
    }
    if (hasMorphColor) {
      const pendingAccessor = target.COLOR_0 !== void 0 ? parser.getDependency("accessor", target.COLOR_0) : geometry.attributes.color;
      pendingColorAccessors.push(pendingAccessor);
    }
  }
  return Promise.all([
    Promise.all(pendingPositionAccessors),
    Promise.all(pendingNormalAccessors),
    Promise.all(pendingColorAccessors)
  ]).then(function(accessors) {
    const morphPositions = accessors[0];
    const morphNormals = accessors[1];
    const morphColors = accessors[2];
    if (hasMorphPosition)
      geometry.morphAttributes.position = morphPositions;
    if (hasMorphNormal)
      geometry.morphAttributes.normal = morphNormals;
    if (hasMorphColor)
      geometry.morphAttributes.color = morphColors;
    geometry.morphTargetsRelative = true;
    return geometry;
  });
}
function updateMorphTargets(mesh, meshDef) {
  mesh.updateMorphTargets();
  if (meshDef.weights !== void 0) {
    for (let i = 0, il = meshDef.weights.length; i < il; i++) {
      mesh.morphTargetInfluences[i] = meshDef.weights[i];
    }
  }
  if (meshDef.extras && Array.isArray(meshDef.extras.targetNames)) {
    const targetNames = meshDef.extras.targetNames;
    if (mesh.morphTargetInfluences.length === targetNames.length) {
      mesh.morphTargetDictionary = {};
      for (let i = 0, il = targetNames.length; i < il; i++) {
        mesh.morphTargetDictionary[targetNames[i]] = i;
      }
    } else {
      console.warn("THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.");
    }
  }
}
function createPrimitiveKey(primitiveDef) {
  let geometryKey;
  const dracoExtension = primitiveDef.extensions && primitiveDef.extensions[EXTENSIONS.KHR_DRACO_MESH_COMPRESSION];
  if (dracoExtension) {
    geometryKey = "draco:" + dracoExtension.bufferView + ":" + dracoExtension.indices + ":" + createAttributesKey(dracoExtension.attributes);
  } else {
    geometryKey = primitiveDef.indices + ":" + createAttributesKey(primitiveDef.attributes) + ":" + primitiveDef.mode;
  }
  if (primitiveDef.targets !== void 0) {
    for (let i = 0, il = primitiveDef.targets.length; i < il; i++) {
      geometryKey += ":" + createAttributesKey(primitiveDef.targets[i]);
    }
  }
  return geometryKey;
}
function createAttributesKey(attributes) {
  let attributesKey = "";
  const keys = Object.keys(attributes).sort();
  for (let i = 0, il = keys.length; i < il; i++) {
    attributesKey += keys[i] + ":" + attributes[keys[i]] + ";";
  }
  return attributesKey;
}
function getNormalizedComponentScale(constructor) {
  switch (constructor) {
    case Int8Array:
      return 1 / 127;
    case Uint8Array:
      return 1 / 255;
    case Int16Array:
      return 1 / 32767;
    case Uint16Array:
      return 1 / 65535;
    default:
      throw new Error("THREE.GLTFLoader: Unsupported normalized accessor component type.");
  }
}
function getImageURIMimeType(uri) {
  if (uri.search(/\.jpe?g($|\?)/i) > 0 || uri.search(/^data\:image\/jpeg/) === 0)
    return "image/jpeg";
  if (uri.search(/\.webp($|\?)/i) > 0 || uri.search(/^data\:image\/webp/) === 0)
    return "image/webp";
  return "image/png";
}
const _identityMatrix = /* @__PURE__ */ new Matrix4();
class GLTFParser {
  constructor(json = {}, options = {}) {
    this.json = json;
    this.extensions = {};
    this.plugins = {};
    this.options = options;
    this.cache = new GLTFRegistry();
    this.associations = /* @__PURE__ */ new Map();
    this.primitiveCache = {};
    this.nodeCache = {};
    this.meshCache = { refs: {}, uses: {} };
    this.cameraCache = { refs: {}, uses: {} };
    this.lightCache = { refs: {}, uses: {} };
    this.sourceCache = {};
    this.textureCache = {};
    this.nodeNamesUsed = {};
    let isSafari = false;
    let isFirefox = false;
    let firefoxVersion = -1;
    if (typeof navigator !== "undefined" && typeof navigator.userAgent !== "undefined") {
      isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) === true;
      isFirefox = navigator.userAgent.indexOf("Firefox") > -1;
      firefoxVersion = isFirefox ? navigator.userAgent.match(/Firefox\/([0-9]+)\./)[1] : -1;
    }
    if (typeof createImageBitmap === "undefined" || isSafari || isFirefox && firefoxVersion < 98) {
      this.textureLoader = new TextureLoader(this.options.manager);
    } else {
      this.textureLoader = new ImageBitmapLoader(this.options.manager);
    }
    this.textureLoader.setCrossOrigin(this.options.crossOrigin);
    this.textureLoader.setRequestHeader(this.options.requestHeader);
    this.fileLoader = new FileLoader(this.options.manager);
    this.fileLoader.setResponseType("arraybuffer");
    if (this.options.crossOrigin === "use-credentials") {
      this.fileLoader.setWithCredentials(true);
    }
  }
  setExtensions(extensions2) {
    this.extensions = extensions2;
  }
  setPlugins(plugins) {
    this.plugins = plugins;
  }
  parse(onLoad, onError) {
    const parser = this;
    const json = this.json;
    const extensions2 = this.extensions;
    this.cache.removeAll();
    this.nodeCache = {};
    this._invokeAll(function(ext) {
      return ext._markDefs && ext._markDefs();
    });
    Promise.all(
      this._invokeAll(function(ext) {
        return ext.beforeRoot && ext.beforeRoot();
      })
    ).then(function() {
      return Promise.all([
        parser.getDependencies("scene"),
        parser.getDependencies("animation"),
        parser.getDependencies("camera")
      ]);
    }).then(function(dependencies) {
      const result = {
        scene: dependencies[0][json.scene || 0],
        scenes: dependencies[0],
        animations: dependencies[1],
        cameras: dependencies[2],
        asset: json.asset,
        parser,
        userData: {}
      };
      addUnknownExtensionsToUserData(extensions2, result, json);
      assignExtrasToUserData(result, json);
      return Promise.all(
        parser._invokeAll(function(ext) {
          return ext.afterRoot && ext.afterRoot(result);
        })
      ).then(function() {
        for (const scene of result.scenes) {
          scene.updateMatrixWorld();
        }
        onLoad(result);
      });
    }).catch(onError);
  }
  /**
   * Marks the special nodes/meshes in json for efficient parse.
   */
  _markDefs() {
    const nodeDefs = this.json.nodes || [];
    const skinDefs = this.json.skins || [];
    const meshDefs = this.json.meshes || [];
    for (let skinIndex = 0, skinLength = skinDefs.length; skinIndex < skinLength; skinIndex++) {
      const joints = skinDefs[skinIndex].joints;
      for (let i = 0, il = joints.length; i < il; i++) {
        nodeDefs[joints[i]].isBone = true;
      }
    }
    for (let nodeIndex = 0, nodeLength = nodeDefs.length; nodeIndex < nodeLength; nodeIndex++) {
      const nodeDef = nodeDefs[nodeIndex];
      if (nodeDef.mesh !== void 0) {
        this._addNodeRef(this.meshCache, nodeDef.mesh);
        if (nodeDef.skin !== void 0) {
          meshDefs[nodeDef.mesh].isSkinnedMesh = true;
        }
      }
      if (nodeDef.camera !== void 0) {
        this._addNodeRef(this.cameraCache, nodeDef.camera);
      }
    }
  }
  /**
   * Counts references to shared node / Object3D resources. These resources
   * can be reused, or "instantiated", at multiple nodes in the scene
   * hierarchy. Mesh, Camera, and Light instances are instantiated and must
   * be marked. Non-scenegraph resources (like Materials, Geometries, and
   * Textures) can be reused directly and are not marked here.
   *
   * Example: CesiumMilkTruck sample model reuses "Wheel" meshes.
   */
  _addNodeRef(cache, index) {
    if (index === void 0)
      return;
    if (cache.refs[index] === void 0) {
      cache.refs[index] = cache.uses[index] = 0;
    }
    cache.refs[index]++;
  }
  /** Returns a reference to a shared resource, cloning it if necessary. */
  _getNodeRef(cache, index, object) {
    if (cache.refs[index] <= 1)
      return object;
    const ref = object.clone();
    const updateMappings = (original, clone) => {
      const mappings = this.associations.get(original);
      if (mappings != null) {
        this.associations.set(clone, mappings);
      }
      for (const [i, child] of original.children.entries()) {
        updateMappings(child, clone.children[i]);
      }
    };
    updateMappings(object, ref);
    ref.name += "_instance_" + cache.uses[index]++;
    return ref;
  }
  _invokeOne(func) {
    const extensions2 = Object.values(this.plugins);
    extensions2.push(this);
    for (let i = 0; i < extensions2.length; i++) {
      const result = func(extensions2[i]);
      if (result)
        return result;
    }
    return null;
  }
  _invokeAll(func) {
    const extensions2 = Object.values(this.plugins);
    extensions2.unshift(this);
    const pending = [];
    for (let i = 0; i < extensions2.length; i++) {
      const result = func(extensions2[i]);
      if (result)
        pending.push(result);
    }
    return pending;
  }
  /**
   * Requests the specified dependency asynchronously, with caching.
   * @param {string} type
   * @param {number} index
   * @return {Promise<Object3D|Material|THREE.Texture|AnimationClip|ArrayBuffer|Object>}
   */
  getDependency(type, index) {
    const cacheKey = type + ":" + index;
    let dependency = this.cache.get(cacheKey);
    if (!dependency) {
      switch (type) {
        case "scene":
          dependency = this.loadScene(index);
          break;
        case "node":
          dependency = this._invokeOne(function(ext) {
            return ext.loadNode && ext.loadNode(index);
          });
          break;
        case "mesh":
          dependency = this._invokeOne(function(ext) {
            return ext.loadMesh && ext.loadMesh(index);
          });
          break;
        case "accessor":
          dependency = this.loadAccessor(index);
          break;
        case "bufferView":
          dependency = this._invokeOne(function(ext) {
            return ext.loadBufferView && ext.loadBufferView(index);
          });
          break;
        case "buffer":
          dependency = this.loadBuffer(index);
          break;
        case "material":
          dependency = this._invokeOne(function(ext) {
            return ext.loadMaterial && ext.loadMaterial(index);
          });
          break;
        case "texture":
          dependency = this._invokeOne(function(ext) {
            return ext.loadTexture && ext.loadTexture(index);
          });
          break;
        case "skin":
          dependency = this.loadSkin(index);
          break;
        case "animation":
          dependency = this._invokeOne(function(ext) {
            return ext.loadAnimation && ext.loadAnimation(index);
          });
          break;
        case "camera":
          dependency = this.loadCamera(index);
          break;
        default:
          dependency = this._invokeOne(function(ext) {
            return ext != this && ext.getDependency && ext.getDependency(type, index);
          });
          if (!dependency) {
            throw new Error("Unknown type: " + type);
          }
          break;
      }
      this.cache.add(cacheKey, dependency);
    }
    return dependency;
  }
  /**
   * Requests all dependencies of the specified type asynchronously, with caching.
   * @param {string} type
   * @return {Promise<Array<Object>>}
   */
  getDependencies(type) {
    let dependencies = this.cache.get(type);
    if (!dependencies) {
      const parser = this;
      const defs = this.json[type + (type === "mesh" ? "es" : "s")] || [];
      dependencies = Promise.all(
        defs.map(function(def, index) {
          return parser.getDependency(type, index);
        })
      );
      this.cache.add(type, dependencies);
    }
    return dependencies;
  }
  /**
   * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#buffers-and-buffer-views
   * @param {number} bufferIndex
   * @return {Promise<ArrayBuffer>}
   */
  loadBuffer(bufferIndex) {
    const bufferDef = this.json.buffers[bufferIndex];
    const loader = this.fileLoader;
    if (bufferDef.type && bufferDef.type !== "arraybuffer") {
      throw new Error("THREE.GLTFLoader: " + bufferDef.type + " buffer type is not supported.");
    }
    if (bufferDef.uri === void 0 && bufferIndex === 0) {
      return Promise.resolve(this.extensions[EXTENSIONS.KHR_BINARY_GLTF].body);
    }
    const options = this.options;
    return new Promise(function(resolve, reject) {
      loader.load(LoaderUtils.resolveURL(bufferDef.uri, options.path), resolve, void 0, function() {
        reject(new Error('THREE.GLTFLoader: Failed to load buffer "' + bufferDef.uri + '".'));
      });
    });
  }
  /**
   * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#buffers-and-buffer-views
   * @param {number} bufferViewIndex
   * @return {Promise<ArrayBuffer>}
   */
  loadBufferView(bufferViewIndex) {
    const bufferViewDef = this.json.bufferViews[bufferViewIndex];
    return this.getDependency("buffer", bufferViewDef.buffer).then(function(buffer) {
      const byteLength = bufferViewDef.byteLength || 0;
      const byteOffset = bufferViewDef.byteOffset || 0;
      return buffer.slice(byteOffset, byteOffset + byteLength);
    });
  }
  /**
   * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#accessors
   * @param {number} accessorIndex
   * @return {Promise<BufferAttribute|InterleavedBufferAttribute>}
   */
  loadAccessor(accessorIndex) {
    const parser = this;
    const json = this.json;
    const accessorDef = this.json.accessors[accessorIndex];
    if (accessorDef.bufferView === void 0 && accessorDef.sparse === void 0) {
      const itemSize = WEBGL_TYPE_SIZES[accessorDef.type];
      const TypedArray = WEBGL_COMPONENT_TYPES[accessorDef.componentType];
      const normalized = accessorDef.normalized === true;
      const array = new TypedArray(accessorDef.count * itemSize);
      return Promise.resolve(new BufferAttribute(array, itemSize, normalized));
    }
    const pendingBufferViews = [];
    if (accessorDef.bufferView !== void 0) {
      pendingBufferViews.push(this.getDependency("bufferView", accessorDef.bufferView));
    } else {
      pendingBufferViews.push(null);
    }
    if (accessorDef.sparse !== void 0) {
      pendingBufferViews.push(this.getDependency("bufferView", accessorDef.sparse.indices.bufferView));
      pendingBufferViews.push(this.getDependency("bufferView", accessorDef.sparse.values.bufferView));
    }
    return Promise.all(pendingBufferViews).then(function(bufferViews) {
      const bufferView = bufferViews[0];
      const itemSize = WEBGL_TYPE_SIZES[accessorDef.type];
      const TypedArray = WEBGL_COMPONENT_TYPES[accessorDef.componentType];
      const elementBytes = TypedArray.BYTES_PER_ELEMENT;
      const itemBytes = elementBytes * itemSize;
      const byteOffset = accessorDef.byteOffset || 0;
      const byteStride = accessorDef.bufferView !== void 0 ? json.bufferViews[accessorDef.bufferView].byteStride : void 0;
      const normalized = accessorDef.normalized === true;
      let array, bufferAttribute;
      if (byteStride && byteStride !== itemBytes) {
        const ibSlice = Math.floor(byteOffset / byteStride);
        const ibCacheKey = "InterleavedBuffer:" + accessorDef.bufferView + ":" + accessorDef.componentType + ":" + ibSlice + ":" + accessorDef.count;
        let ib = parser.cache.get(ibCacheKey);
        if (!ib) {
          array = new TypedArray(bufferView, ibSlice * byteStride, accessorDef.count * byteStride / elementBytes);
          ib = new InterleavedBuffer(array, byteStride / elementBytes);
          parser.cache.add(ibCacheKey, ib);
        }
        bufferAttribute = new InterleavedBufferAttribute(
          ib,
          itemSize,
          byteOffset % byteStride / elementBytes,
          normalized
        );
      } else {
        if (bufferView === null) {
          array = new TypedArray(accessorDef.count * itemSize);
        } else {
          array = new TypedArray(bufferView, byteOffset, accessorDef.count * itemSize);
        }
        bufferAttribute = new BufferAttribute(array, itemSize, normalized);
      }
      if (accessorDef.sparse !== void 0) {
        const itemSizeIndices = WEBGL_TYPE_SIZES.SCALAR;
        const TypedArrayIndices = WEBGL_COMPONENT_TYPES[accessorDef.sparse.indices.componentType];
        const byteOffsetIndices = accessorDef.sparse.indices.byteOffset || 0;
        const byteOffsetValues = accessorDef.sparse.values.byteOffset || 0;
        const sparseIndices = new TypedArrayIndices(
          bufferViews[1],
          byteOffsetIndices,
          accessorDef.sparse.count * itemSizeIndices
        );
        const sparseValues = new TypedArray(bufferViews[2], byteOffsetValues, accessorDef.sparse.count * itemSize);
        if (bufferView !== null) {
          bufferAttribute = new BufferAttribute(
            bufferAttribute.array.slice(),
            bufferAttribute.itemSize,
            bufferAttribute.normalized
          );
        }
        for (let i = 0, il = sparseIndices.length; i < il; i++) {
          const index = sparseIndices[i];
          bufferAttribute.setX(index, sparseValues[i * itemSize]);
          if (itemSize >= 2)
            bufferAttribute.setY(index, sparseValues[i * itemSize + 1]);
          if (itemSize >= 3)
            bufferAttribute.setZ(index, sparseValues[i * itemSize + 2]);
          if (itemSize >= 4)
            bufferAttribute.setW(index, sparseValues[i * itemSize + 3]);
          if (itemSize >= 5)
            throw new Error("THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.");
        }
      }
      return bufferAttribute;
    });
  }
  /**
   * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#textures
   * @param {number} textureIndex
   * @return {Promise<THREE.Texture|null>}
   */
  loadTexture(textureIndex) {
    const json = this.json;
    const options = this.options;
    const textureDef = json.textures[textureIndex];
    const sourceIndex = textureDef.source;
    const sourceDef = json.images[sourceIndex];
    let loader = this.textureLoader;
    if (sourceDef.uri) {
      const handler = options.manager.getHandler(sourceDef.uri);
      if (handler !== null)
        loader = handler;
    }
    return this.loadTextureImage(textureIndex, sourceIndex, loader);
  }
  loadTextureImage(textureIndex, sourceIndex, loader) {
    const parser = this;
    const json = this.json;
    const textureDef = json.textures[textureIndex];
    const sourceDef = json.images[sourceIndex];
    const cacheKey = (sourceDef.uri || sourceDef.bufferView) + ":" + textureDef.sampler;
    if (this.textureCache[cacheKey]) {
      return this.textureCache[cacheKey];
    }
    const promise = this.loadImageSource(sourceIndex, loader).then(function(texture) {
      texture.flipY = false;
      texture.name = textureDef.name || sourceDef.name || "";
      if (texture.name === "" && typeof sourceDef.uri === "string" && sourceDef.uri.startsWith("data:image/") === false) {
        texture.name = sourceDef.uri;
      }
      const samplers = json.samplers || {};
      const sampler = samplers[textureDef.sampler] || {};
      texture.magFilter = WEBGL_FILTERS[sampler.magFilter] || LinearFilter;
      texture.minFilter = WEBGL_FILTERS[sampler.minFilter] || LinearMipmapLinearFilter;
      texture.wrapS = WEBGL_WRAPPINGS[sampler.wrapS] || RepeatWrapping;
      texture.wrapT = WEBGL_WRAPPINGS[sampler.wrapT] || RepeatWrapping;
      parser.associations.set(texture, { textures: textureIndex });
      return texture;
    }).catch(function() {
      return null;
    });
    this.textureCache[cacheKey] = promise;
    return promise;
  }
  loadImageSource(sourceIndex, loader) {
    const parser = this;
    const json = this.json;
    const options = this.options;
    if (this.sourceCache[sourceIndex] !== void 0) {
      return this.sourceCache[sourceIndex].then((texture) => texture.clone());
    }
    const sourceDef = json.images[sourceIndex];
    const URL2 = self.URL || self.webkitURL;
    let sourceURI = sourceDef.uri || "";
    let isObjectURL = false;
    if (sourceDef.bufferView !== void 0) {
      sourceURI = parser.getDependency("bufferView", sourceDef.bufferView).then(function(bufferView) {
        isObjectURL = true;
        const blob = new Blob([bufferView], { type: sourceDef.mimeType });
        sourceURI = URL2.createObjectURL(blob);
        return sourceURI;
      });
    } else if (sourceDef.uri === void 0) {
      throw new Error("THREE.GLTFLoader: Image " + sourceIndex + " is missing URI and bufferView");
    }
    const promise = Promise.resolve(sourceURI).then(function(sourceURI2) {
      return new Promise(function(resolve, reject) {
        let onLoad = resolve;
        if (loader.isImageBitmapLoader === true) {
          onLoad = function(imageBitmap) {
            const texture = new Texture(imageBitmap);
            texture.needsUpdate = true;
            resolve(texture);
          };
        }
        loader.load(LoaderUtils.resolveURL(sourceURI2, options.path), onLoad, void 0, reject);
      });
    }).then(function(texture) {
      if (isObjectURL === true) {
        URL2.revokeObjectURL(sourceURI);
      }
      assignExtrasToUserData(texture, sourceDef);
      texture.userData.mimeType = sourceDef.mimeType || getImageURIMimeType(sourceDef.uri);
      return texture;
    }).catch(function(error) {
      console.error("THREE.GLTFLoader: Couldn't load texture", sourceURI);
      throw error;
    });
    this.sourceCache[sourceIndex] = promise;
    return promise;
  }
  /**
   * Asynchronously assigns a texture to the given material parameters.
   * @param {Object} materialParams
   * @param {string} mapName
   * @param {Object} mapDef
   * @return {Promise<Texture>}
   */
  assignTexture(materialParams, mapName, mapDef, colorSpace) {
    const parser = this;
    return this.getDependency("texture", mapDef.index).then(function(texture) {
      if (!texture)
        return null;
      if (mapDef.texCoord !== void 0 && mapDef.texCoord > 0) {
        texture = texture.clone();
        texture.channel = mapDef.texCoord;
      }
      if (parser.extensions[EXTENSIONS.KHR_TEXTURE_TRANSFORM]) {
        const transform = mapDef.extensions !== void 0 ? mapDef.extensions[EXTENSIONS.KHR_TEXTURE_TRANSFORM] : void 0;
        if (transform) {
          const gltfReference = parser.associations.get(texture);
          texture = parser.extensions[EXTENSIONS.KHR_TEXTURE_TRANSFORM].extendTexture(texture, transform);
          parser.associations.set(texture, gltfReference);
        }
      }
      if (colorSpace !== void 0) {
        if (typeof colorSpace === "number")
          colorSpace = colorSpace === sRGBEncoding ? SRGBColorSpace : LinearSRGBColorSpace;
        if ("colorSpace" in texture)
          texture.colorSpace = colorSpace;
        else
          texture.encoding = colorSpace === SRGBColorSpace ? sRGBEncoding : LinearEncoding;
      }
      materialParams[mapName] = texture;
      return texture;
    });
  }
  /**
   * Assigns final material to a Mesh, Line, or Points instance. The instance
   * already has a material (generated from the glTF material options alone)
   * but reuse of the same glTF material may require multiple threejs materials
   * to accommodate different primitive types, defines, etc. New materials will
   * be created if necessary, and reused from a cache.
   * @param  {Object3D} mesh Mesh, Line, or Points instance.
   */
  assignFinalMaterial(mesh) {
    const geometry = mesh.geometry;
    let material = mesh.material;
    const useDerivativeTangents = geometry.attributes.tangent === void 0;
    const useVertexColors = geometry.attributes.color !== void 0;
    const useFlatShading = geometry.attributes.normal === void 0;
    if (mesh.isPoints) {
      const cacheKey = "PointsMaterial:" + material.uuid;
      let pointsMaterial = this.cache.get(cacheKey);
      if (!pointsMaterial) {
        pointsMaterial = new PointsMaterial();
        Material.prototype.copy.call(pointsMaterial, material);
        pointsMaterial.color.copy(material.color);
        pointsMaterial.map = material.map;
        pointsMaterial.sizeAttenuation = false;
        this.cache.add(cacheKey, pointsMaterial);
      }
      material = pointsMaterial;
    } else if (mesh.isLine) {
      const cacheKey = "LineBasicMaterial:" + material.uuid;
      let lineMaterial = this.cache.get(cacheKey);
      if (!lineMaterial) {
        lineMaterial = new LineBasicMaterial();
        Material.prototype.copy.call(lineMaterial, material);
        lineMaterial.color.copy(material.color);
        lineMaterial.map = material.map;
        this.cache.add(cacheKey, lineMaterial);
      }
      material = lineMaterial;
    }
    if (useDerivativeTangents || useVertexColors || useFlatShading) {
      let cacheKey = "ClonedMaterial:" + material.uuid + ":";
      if (useDerivativeTangents)
        cacheKey += "derivative-tangents:";
      if (useVertexColors)
        cacheKey += "vertex-colors:";
      if (useFlatShading)
        cacheKey += "flat-shading:";
      let cachedMaterial = this.cache.get(cacheKey);
      if (!cachedMaterial) {
        cachedMaterial = material.clone();
        if (useVertexColors)
          cachedMaterial.vertexColors = true;
        if (useFlatShading)
          cachedMaterial.flatShading = true;
        if (useDerivativeTangents) {
          if (cachedMaterial.normalScale)
            cachedMaterial.normalScale.y *= -1;
          if (cachedMaterial.clearcoatNormalScale)
            cachedMaterial.clearcoatNormalScale.y *= -1;
        }
        this.cache.add(cacheKey, cachedMaterial);
        this.associations.set(cachedMaterial, this.associations.get(material));
      }
      material = cachedMaterial;
    }
    mesh.material = material;
  }
  getMaterialType() {
    return MeshStandardMaterial;
  }
  /**
   * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#materials
   * @param {number} materialIndex
   * @return {Promise<Material>}
   */
  loadMaterial(materialIndex) {
    const parser = this;
    const json = this.json;
    const extensions2 = this.extensions;
    const materialDef = json.materials[materialIndex];
    let materialType;
    const materialParams = {};
    const materialExtensions = materialDef.extensions || {};
    const pending = [];
    if (materialExtensions[EXTENSIONS.KHR_MATERIALS_UNLIT]) {
      const kmuExtension = extensions2[EXTENSIONS.KHR_MATERIALS_UNLIT];
      materialType = kmuExtension.getMaterialType();
      pending.push(kmuExtension.extendParams(materialParams, materialDef, parser));
    } else {
      const metallicRoughness = materialDef.pbrMetallicRoughness || {};
      materialParams.color = new Color(1, 1, 1);
      materialParams.opacity = 1;
      if (Array.isArray(metallicRoughness.baseColorFactor)) {
        const array = metallicRoughness.baseColorFactor;
        materialParams.color.setRGB(array[0], array[1], array[2], LinearSRGBColorSpace);
        materialParams.opacity = array[3];
      }
      if (metallicRoughness.baseColorTexture !== void 0) {
        pending.push(parser.assignTexture(materialParams, "map", metallicRoughness.baseColorTexture, SRGBColorSpace));
      }
      materialParams.metalness = metallicRoughness.metallicFactor !== void 0 ? metallicRoughness.metallicFactor : 1;
      materialParams.roughness = metallicRoughness.roughnessFactor !== void 0 ? metallicRoughness.roughnessFactor : 1;
      if (metallicRoughness.metallicRoughnessTexture !== void 0) {
        pending.push(parser.assignTexture(materialParams, "metalnessMap", metallicRoughness.metallicRoughnessTexture));
        pending.push(parser.assignTexture(materialParams, "roughnessMap", metallicRoughness.metallicRoughnessTexture));
      }
      materialType = this._invokeOne(function(ext) {
        return ext.getMaterialType && ext.getMaterialType(materialIndex);
      });
      pending.push(
        Promise.all(
          this._invokeAll(function(ext) {
            return ext.extendMaterialParams && ext.extendMaterialParams(materialIndex, materialParams);
          })
        )
      );
    }
    if (materialDef.doubleSided === true) {
      materialParams.side = DoubleSide;
    }
    const alphaMode = materialDef.alphaMode || ALPHA_MODES.OPAQUE;
    if (alphaMode === ALPHA_MODES.BLEND) {
      materialParams.transparent = true;
      materialParams.depthWrite = false;
    } else {
      materialParams.transparent = false;
      if (alphaMode === ALPHA_MODES.MASK) {
        materialParams.alphaTest = materialDef.alphaCutoff !== void 0 ? materialDef.alphaCutoff : 0.5;
      }
    }
    if (materialDef.normalTexture !== void 0 && materialType !== MeshBasicMaterial) {
      pending.push(parser.assignTexture(materialParams, "normalMap", materialDef.normalTexture));
      materialParams.normalScale = new Vector2(1, 1);
      if (materialDef.normalTexture.scale !== void 0) {
        const scale = materialDef.normalTexture.scale;
        materialParams.normalScale.set(scale, scale);
      }
    }
    if (materialDef.occlusionTexture !== void 0 && materialType !== MeshBasicMaterial) {
      pending.push(parser.assignTexture(materialParams, "aoMap", materialDef.occlusionTexture));
      if (materialDef.occlusionTexture.strength !== void 0) {
        materialParams.aoMapIntensity = materialDef.occlusionTexture.strength;
      }
    }
    if (materialDef.emissiveFactor !== void 0 && materialType !== MeshBasicMaterial) {
      const emissiveFactor = materialDef.emissiveFactor;
      materialParams.emissive = new Color().setRGB(
        emissiveFactor[0],
        emissiveFactor[1],
        emissiveFactor[2],
        LinearSRGBColorSpace
      );
    }
    if (materialDef.emissiveTexture !== void 0 && materialType !== MeshBasicMaterial) {
      pending.push(parser.assignTexture(materialParams, "emissiveMap", materialDef.emissiveTexture, SRGBColorSpace));
    }
    return Promise.all(pending).then(function() {
      const material = new materialType(materialParams);
      if (materialDef.name)
        material.name = materialDef.name;
      assignExtrasToUserData(material, materialDef);
      parser.associations.set(material, { materials: materialIndex });
      if (materialDef.extensions)
        addUnknownExtensionsToUserData(extensions2, material, materialDef);
      return material;
    });
  }
  /** When Object3D instances are targeted by animation, they need unique names. */
  createUniqueName(originalName) {
    const sanitizedName = PropertyBinding.sanitizeNodeName(originalName || "");
    if (sanitizedName in this.nodeNamesUsed) {
      return sanitizedName + "_" + ++this.nodeNamesUsed[sanitizedName];
    } else {
      this.nodeNamesUsed[sanitizedName] = 0;
      return sanitizedName;
    }
  }
  /**
   * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#geometry
   *
   * Creates BufferGeometries from primitives.
   *
   * @param {Array<GLTF.Primitive>} primitives
   * @return {Promise<Array<BufferGeometry>>}
   */
  loadGeometries(primitives) {
    const parser = this;
    const extensions2 = this.extensions;
    const cache = this.primitiveCache;
    function createDracoPrimitive(primitive) {
      return extensions2[EXTENSIONS.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(primitive, parser).then(function(geometry) {
        return addPrimitiveAttributes(geometry, primitive, parser);
      });
    }
    const pending = [];
    for (let i = 0, il = primitives.length; i < il; i++) {
      const primitive = primitives[i];
      const cacheKey = createPrimitiveKey(primitive);
      const cached = cache[cacheKey];
      if (cached) {
        pending.push(cached.promise);
      } else {
        let geometryPromise;
        if (primitive.extensions && primitive.extensions[EXTENSIONS.KHR_DRACO_MESH_COMPRESSION]) {
          geometryPromise = createDracoPrimitive(primitive);
        } else {
          geometryPromise = addPrimitiveAttributes(new BufferGeometry(), primitive, parser);
        }
        cache[cacheKey] = { primitive, promise: geometryPromise };
        pending.push(geometryPromise);
      }
    }
    return Promise.all(pending);
  }
  /**
   * Specification: https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#meshes
   * @param {number} meshIndex
   * @return {Promise<Group|Mesh|SkinnedMesh>}
   */
  loadMesh(meshIndex) {
    const parser = this;
    const json = this.json;
    const extensions2 = this.extensions;
    const meshDef = json.meshes[meshIndex];
    const primitives = meshDef.primitives;
    const pending = [];
    for (let i = 0, il = primitives.length; i < il; i++) {
      const material = primitives[i].material === void 0 ? createDefaultMaterial(this.cache) : this.getDependency("material", primitives[i].material);
      pending.push(material);
    }
    pending.push(parser.loadGeometries(primitives));
    return Promise.all(pending).then(function(results) {
      const materials = results.slice(0, results.length - 1);
      const geometries = results[results.length - 1];
      const meshes = [];
      for (let i = 0, il = geometries.length; i < il; i++) {
        const geometry = geometries[i];
        const primitive = primitives[i];
        let mesh;
        const material = materials[i];
        if (primitive.mode === WEBGL_CONSTANTS.TRIANGLES || primitive.mode === WEBGL_CONSTANTS.TRIANGLE_STRIP || primitive.mode === WEBGL_CONSTANTS.TRIANGLE_FAN || primitive.mode === void 0) {
          mesh = meshDef.isSkinnedMesh === true ? new SkinnedMesh(geometry, material) : new Mesh(geometry, material);
          if (mesh.isSkinnedMesh === true) {
            mesh.normalizeSkinWeights();
          }
          if (primitive.mode === WEBGL_CONSTANTS.TRIANGLE_STRIP) {
            mesh.geometry = toTrianglesDrawMode(mesh.geometry, TriangleStripDrawMode);
          } else if (primitive.mode === WEBGL_CONSTANTS.TRIANGLE_FAN) {
            mesh.geometry = toTrianglesDrawMode(mesh.geometry, TriangleFanDrawMode);
          }
        } else if (primitive.mode === WEBGL_CONSTANTS.LINES) {
          mesh = new LineSegments(geometry, material);
        } else if (primitive.mode === WEBGL_CONSTANTS.LINE_STRIP) {
          mesh = new Line(geometry, material);
        } else if (primitive.mode === WEBGL_CONSTANTS.LINE_LOOP) {
          mesh = new LineLoop(geometry, material);
        } else if (primitive.mode === WEBGL_CONSTANTS.POINTS) {
          mesh = new Points(geometry, material);
        } else {
          throw new Error("THREE.GLTFLoader: Primitive mode unsupported: " + primitive.mode);
        }
        if (Object.keys(mesh.geometry.morphAttributes).length > 0) {
          updateMorphTargets(mesh, meshDef);
        }
        mesh.name = parser.createUniqueName(meshDef.name || "mesh_" + meshIndex);
        assignExtrasToUserData(mesh, meshDef);
        if (primitive.extensions)
          addUnknownExtensionsToUserData(extensions2, mesh, primitive);
        parser.assignFinalMaterial(mesh);
        meshes.push(mesh);
      }
      for (let i = 0, il = meshes.length; i < il; i++) {
        parser.associations.set(meshes[i], {
          meshes: meshIndex,
          primitives: i
        });
      }
      if (meshes.length === 1) {
        if (meshDef.extensions)
          addUnknownExtensionsToUserData(extensions2, meshes[0], meshDef);
        return meshes[0];
      }
      const group = new Group();
      if (meshDef.extensions)
        addUnknownExtensionsToUserData(extensions2, group, meshDef);
      parser.associations.set(group, { meshes: meshIndex });
      for (let i = 0, il = meshes.length; i < il; i++) {
        group.add(meshes[i]);
      }
      return group;
    });
  }
  /**
   * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#cameras
   * @param {number} cameraIndex
   * @return {Promise<THREE.Camera>}
   */
  loadCamera(cameraIndex) {
    let camera;
    const cameraDef = this.json.cameras[cameraIndex];
    const params = cameraDef[cameraDef.type];
    if (!params) {
      console.warn("THREE.GLTFLoader: Missing camera parameters.");
      return;
    }
    if (cameraDef.type === "perspective") {
      camera = new PerspectiveCamera$1(
        MathUtils.radToDeg(params.yfov),
        params.aspectRatio || 1,
        params.znear || 1,
        params.zfar || 2e6
      );
    } else if (cameraDef.type === "orthographic") {
      camera = new OrthographicCamera(-params.xmag, params.xmag, params.ymag, -params.ymag, params.znear, params.zfar);
    }
    if (cameraDef.name)
      camera.name = this.createUniqueName(cameraDef.name);
    assignExtrasToUserData(camera, cameraDef);
    return Promise.resolve(camera);
  }
  /**
   * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#skins
   * @param {number} skinIndex
   * @return {Promise<Skeleton>}
   */
  loadSkin(skinIndex) {
    const skinDef = this.json.skins[skinIndex];
    const pending = [];
    for (let i = 0, il = skinDef.joints.length; i < il; i++) {
      pending.push(this._loadNodeShallow(skinDef.joints[i]));
    }
    if (skinDef.inverseBindMatrices !== void 0) {
      pending.push(this.getDependency("accessor", skinDef.inverseBindMatrices));
    } else {
      pending.push(null);
    }
    return Promise.all(pending).then(function(results) {
      const inverseBindMatrices = results.pop();
      const jointNodes = results;
      const bones = [];
      const boneInverses = [];
      for (let i = 0, il = jointNodes.length; i < il; i++) {
        const jointNode = jointNodes[i];
        if (jointNode) {
          bones.push(jointNode);
          const mat = new Matrix4();
          if (inverseBindMatrices !== null) {
            mat.fromArray(inverseBindMatrices.array, i * 16);
          }
          boneInverses.push(mat);
        } else {
          console.warn('THREE.GLTFLoader: Joint "%s" could not be found.', skinDef.joints[i]);
        }
      }
      return new Skeleton(bones, boneInverses);
    });
  }
  /**
   * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#animations
   * @param {number} animationIndex
   * @return {Promise<AnimationClip>}
   */
  loadAnimation(animationIndex) {
    const json = this.json;
    const parser = this;
    const animationDef = json.animations[animationIndex];
    const animationName = animationDef.name ? animationDef.name : "animation_" + animationIndex;
    const pendingNodes = [];
    const pendingInputAccessors = [];
    const pendingOutputAccessors = [];
    const pendingSamplers = [];
    const pendingTargets = [];
    for (let i = 0, il = animationDef.channels.length; i < il; i++) {
      const channel = animationDef.channels[i];
      const sampler = animationDef.samplers[channel.sampler];
      const target = channel.target;
      const name = target.node;
      const input = animationDef.parameters !== void 0 ? animationDef.parameters[sampler.input] : sampler.input;
      const output = animationDef.parameters !== void 0 ? animationDef.parameters[sampler.output] : sampler.output;
      if (target.node === void 0)
        continue;
      pendingNodes.push(this.getDependency("node", name));
      pendingInputAccessors.push(this.getDependency("accessor", input));
      pendingOutputAccessors.push(this.getDependency("accessor", output));
      pendingSamplers.push(sampler);
      pendingTargets.push(target);
    }
    return Promise.all([
      Promise.all(pendingNodes),
      Promise.all(pendingInputAccessors),
      Promise.all(pendingOutputAccessors),
      Promise.all(pendingSamplers),
      Promise.all(pendingTargets)
    ]).then(function(dependencies) {
      const nodes = dependencies[0];
      const inputAccessors = dependencies[1];
      const outputAccessors = dependencies[2];
      const samplers = dependencies[3];
      const targets = dependencies[4];
      const tracks = [];
      for (let i = 0, il = nodes.length; i < il; i++) {
        const node = nodes[i];
        const inputAccessor = inputAccessors[i];
        const outputAccessor = outputAccessors[i];
        const sampler = samplers[i];
        const target = targets[i];
        if (node === void 0)
          continue;
        if (node.updateMatrix) {
          node.updateMatrix();
        }
        const createdTracks = parser._createAnimationTracks(node, inputAccessor, outputAccessor, sampler, target);
        if (createdTracks) {
          for (let k = 0; k < createdTracks.length; k++) {
            tracks.push(createdTracks[k]);
          }
        }
      }
      return new AnimationClip(animationName, void 0, tracks);
    });
  }
  createNodeMesh(nodeIndex) {
    const json = this.json;
    const parser = this;
    const nodeDef = json.nodes[nodeIndex];
    if (nodeDef.mesh === void 0)
      return null;
    return parser.getDependency("mesh", nodeDef.mesh).then(function(mesh) {
      const node = parser._getNodeRef(parser.meshCache, nodeDef.mesh, mesh);
      if (nodeDef.weights !== void 0) {
        node.traverse(function(o) {
          if (!o.isMesh)
            return;
          for (let i = 0, il = nodeDef.weights.length; i < il; i++) {
            o.morphTargetInfluences[i] = nodeDef.weights[i];
          }
        });
      }
      return node;
    });
  }
  /**
   * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#nodes-and-hierarchy
   * @param {number} nodeIndex
   * @return {Promise<Object3D>}
   */
  loadNode(nodeIndex) {
    const json = this.json;
    const parser = this;
    const nodeDef = json.nodes[nodeIndex];
    const nodePending = parser._loadNodeShallow(nodeIndex);
    const childPending = [];
    const childrenDef = nodeDef.children || [];
    for (let i = 0, il = childrenDef.length; i < il; i++) {
      childPending.push(parser.getDependency("node", childrenDef[i]));
    }
    const skeletonPending = nodeDef.skin === void 0 ? Promise.resolve(null) : parser.getDependency("skin", nodeDef.skin);
    return Promise.all([nodePending, Promise.all(childPending), skeletonPending]).then(function(results) {
      const node = results[0];
      const children = results[1];
      const skeleton = results[2];
      if (skeleton !== null) {
        node.traverse(function(mesh) {
          if (!mesh.isSkinnedMesh)
            return;
          mesh.bind(skeleton, _identityMatrix);
        });
      }
      for (let i = 0, il = children.length; i < il; i++) {
        node.add(children[i]);
      }
      return node;
    });
  }
  // ._loadNodeShallow() parses a single node.
  // skin and child nodes are created and added in .loadNode() (no '_' prefix).
  _loadNodeShallow(nodeIndex) {
    const json = this.json;
    const extensions2 = this.extensions;
    const parser = this;
    if (this.nodeCache[nodeIndex] !== void 0) {
      return this.nodeCache[nodeIndex];
    }
    const nodeDef = json.nodes[nodeIndex];
    const nodeName = nodeDef.name ? parser.createUniqueName(nodeDef.name) : "";
    const pending = [];
    const meshPromise = parser._invokeOne(function(ext) {
      return ext.createNodeMesh && ext.createNodeMesh(nodeIndex);
    });
    if (meshPromise) {
      pending.push(meshPromise);
    }
    if (nodeDef.camera !== void 0) {
      pending.push(
        parser.getDependency("camera", nodeDef.camera).then(function(camera) {
          return parser._getNodeRef(parser.cameraCache, nodeDef.camera, camera);
        })
      );
    }
    parser._invokeAll(function(ext) {
      return ext.createNodeAttachment && ext.createNodeAttachment(nodeIndex);
    }).forEach(function(promise) {
      pending.push(promise);
    });
    this.nodeCache[nodeIndex] = Promise.all(pending).then(function(objects) {
      let node;
      if (nodeDef.isBone === true) {
        node = new Bone();
      } else if (objects.length > 1) {
        node = new Group();
      } else if (objects.length === 1) {
        node = objects[0];
      } else {
        node = new Object3D();
      }
      if (node !== objects[0]) {
        for (let i = 0, il = objects.length; i < il; i++) {
          node.add(objects[i]);
        }
      }
      if (nodeDef.name) {
        node.userData.name = nodeDef.name;
        node.name = nodeName;
      }
      assignExtrasToUserData(node, nodeDef);
      if (nodeDef.extensions)
        addUnknownExtensionsToUserData(extensions2, node, nodeDef);
      if (nodeDef.matrix !== void 0) {
        const matrix = new Matrix4();
        matrix.fromArray(nodeDef.matrix);
        node.applyMatrix4(matrix);
      } else {
        if (nodeDef.translation !== void 0) {
          node.position.fromArray(nodeDef.translation);
        }
        if (nodeDef.rotation !== void 0) {
          node.quaternion.fromArray(nodeDef.rotation);
        }
        if (nodeDef.scale !== void 0) {
          node.scale.fromArray(nodeDef.scale);
        }
      }
      if (!parser.associations.has(node)) {
        parser.associations.set(node, {});
      }
      parser.associations.get(node).nodes = nodeIndex;
      return node;
    });
    return this.nodeCache[nodeIndex];
  }
  /**
   * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#scenes
   * @param {number} sceneIndex
   * @return {Promise<Group>}
   */
  loadScene(sceneIndex) {
    const extensions2 = this.extensions;
    const sceneDef = this.json.scenes[sceneIndex];
    const parser = this;
    const scene = new Group();
    if (sceneDef.name)
      scene.name = parser.createUniqueName(sceneDef.name);
    assignExtrasToUserData(scene, sceneDef);
    if (sceneDef.extensions)
      addUnknownExtensionsToUserData(extensions2, scene, sceneDef);
    const nodeIds = sceneDef.nodes || [];
    const pending = [];
    for (let i = 0, il = nodeIds.length; i < il; i++) {
      pending.push(parser.getDependency("node", nodeIds[i]));
    }
    return Promise.all(pending).then(function(nodes) {
      for (let i = 0, il = nodes.length; i < il; i++) {
        scene.add(nodes[i]);
      }
      const reduceAssociations = (node) => {
        const reducedAssociations = /* @__PURE__ */ new Map();
        for (const [key, value] of parser.associations) {
          if (key instanceof Material || key instanceof Texture) {
            reducedAssociations.set(key, value);
          }
        }
        node.traverse((node2) => {
          const mappings = parser.associations.get(node2);
          if (mappings != null) {
            reducedAssociations.set(node2, mappings);
          }
        });
        return reducedAssociations;
      };
      parser.associations = reduceAssociations(scene);
      return scene;
    });
  }
  _createAnimationTracks(node, inputAccessor, outputAccessor, sampler, target) {
    const tracks = [];
    const targetName = node.name ? node.name : node.uuid;
    const targetNames = [];
    if (PATH_PROPERTIES[target.path] === PATH_PROPERTIES.weights) {
      node.traverse(function(object) {
        if (object.morphTargetInfluences) {
          targetNames.push(object.name ? object.name : object.uuid);
        }
      });
    } else {
      targetNames.push(targetName);
    }
    let TypedKeyframeTrack;
    switch (PATH_PROPERTIES[target.path]) {
      case PATH_PROPERTIES.weights:
        TypedKeyframeTrack = NumberKeyframeTrack;
        break;
      case PATH_PROPERTIES.rotation:
        TypedKeyframeTrack = QuaternionKeyframeTrack;
        break;
      case PATH_PROPERTIES.position:
      case PATH_PROPERTIES.scale:
        TypedKeyframeTrack = VectorKeyframeTrack;
        break;
      default:
        switch (outputAccessor.itemSize) {
          case 1:
            TypedKeyframeTrack = NumberKeyframeTrack;
            break;
          case 2:
          case 3:
          default:
            TypedKeyframeTrack = VectorKeyframeTrack;
            break;
        }
        break;
    }
    const interpolation = sampler.interpolation !== void 0 ? INTERPOLATION[sampler.interpolation] : InterpolateLinear;
    const outputArray = this._getArrayFromAccessor(outputAccessor);
    for (let j = 0, jl = targetNames.length; j < jl; j++) {
      const track = new TypedKeyframeTrack(
        targetNames[j] + "." + PATH_PROPERTIES[target.path],
        inputAccessor.array,
        outputArray,
        interpolation
      );
      if (sampler.interpolation === "CUBICSPLINE") {
        this._createCubicSplineTrackInterpolant(track);
      }
      tracks.push(track);
    }
    return tracks;
  }
  _getArrayFromAccessor(accessor) {
    let outputArray = accessor.array;
    if (accessor.normalized) {
      const scale = getNormalizedComponentScale(outputArray.constructor);
      const scaled = new Float32Array(outputArray.length);
      for (let j = 0, jl = outputArray.length; j < jl; j++) {
        scaled[j] = outputArray[j] * scale;
      }
      outputArray = scaled;
    }
    return outputArray;
  }
  _createCubicSplineTrackInterpolant(track) {
    track.createInterpolant = function InterpolantFactoryMethodGLTFCubicSpline(result) {
      const interpolantType = this instanceof QuaternionKeyframeTrack ? GLTFCubicSplineQuaternionInterpolant : GLTFCubicSplineInterpolant;
      return new interpolantType(this.times, this.values, this.getValueSize() / 3, result);
    };
    track.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline = true;
  }
}
function computeBounds(geometry, primitiveDef, parser) {
  const attributes = primitiveDef.attributes;
  const box = new Box3();
  if (attributes.POSITION !== void 0) {
    const accessor = parser.json.accessors[attributes.POSITION];
    const min = accessor.min;
    const max = accessor.max;
    if (min !== void 0 && max !== void 0) {
      box.set(new Vector3(min[0], min[1], min[2]), new Vector3(max[0], max[1], max[2]));
      if (accessor.normalized) {
        const boxScale = getNormalizedComponentScale(WEBGL_COMPONENT_TYPES[accessor.componentType]);
        box.min.multiplyScalar(boxScale);
        box.max.multiplyScalar(boxScale);
      }
    } else {
      console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.");
      return;
    }
  } else {
    return;
  }
  const targets = primitiveDef.targets;
  if (targets !== void 0) {
    const maxDisplacement = new Vector3();
    const vector = new Vector3();
    for (let i = 0, il = targets.length; i < il; i++) {
      const target = targets[i];
      if (target.POSITION !== void 0) {
        const accessor = parser.json.accessors[target.POSITION];
        const min = accessor.min;
        const max = accessor.max;
        if (min !== void 0 && max !== void 0) {
          vector.setX(Math.max(Math.abs(min[0]), Math.abs(max[0])));
          vector.setY(Math.max(Math.abs(min[1]), Math.abs(max[1])));
          vector.setZ(Math.max(Math.abs(min[2]), Math.abs(max[2])));
          if (accessor.normalized) {
            const boxScale = getNormalizedComponentScale(WEBGL_COMPONENT_TYPES[accessor.componentType]);
            vector.multiplyScalar(boxScale);
          }
          maxDisplacement.max(vector);
        } else {
          console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.");
        }
      }
    }
    box.expandByVector(maxDisplacement);
  }
  geometry.boundingBox = box;
  const sphere = new Sphere();
  box.getCenter(sphere.center);
  sphere.radius = box.min.distanceTo(box.max) / 2;
  geometry.boundingSphere = sphere;
}
function addPrimitiveAttributes(geometry, primitiveDef, parser) {
  const attributes = primitiveDef.attributes;
  const pending = [];
  function assignAttributeAccessor(accessorIndex, attributeName) {
    return parser.getDependency("accessor", accessorIndex).then(function(accessor) {
      geometry.setAttribute(attributeName, accessor);
    });
  }
  for (const gltfAttributeName in attributes) {
    const threeAttributeName = ATTRIBUTES[gltfAttributeName] || gltfAttributeName.toLowerCase();
    if (threeAttributeName in geometry.attributes)
      continue;
    pending.push(assignAttributeAccessor(attributes[gltfAttributeName], threeAttributeName));
  }
  if (primitiveDef.indices !== void 0 && !geometry.index) {
    const accessor = parser.getDependency("accessor", primitiveDef.indices).then(function(accessor2) {
      geometry.setIndex(accessor2);
    });
    pending.push(accessor);
  }
  assignExtrasToUserData(geometry, primitiveDef);
  computeBounds(geometry, primitiveDef, parser);
  return Promise.all(pending).then(function() {
    return primitiveDef.targets !== void 0 ? addMorphTargets(geometry, primitiveDef.targets, parser) : geometry;
  });
}
const _taskCache = /* @__PURE__ */ new WeakMap();
class DRACOLoader extends Loader {
  constructor(manager) {
    super(manager);
    this.decoderPath = "";
    this.decoderConfig = {};
    this.decoderBinary = null;
    this.decoderPending = null;
    this.workerLimit = 4;
    this.workerPool = [];
    this.workerNextTaskID = 1;
    this.workerSourceURL = "";
    this.defaultAttributeIDs = {
      position: "POSITION",
      normal: "NORMAL",
      color: "COLOR",
      uv: "TEX_COORD"
    };
    this.defaultAttributeTypes = {
      position: "Float32Array",
      normal: "Float32Array",
      color: "Float32Array",
      uv: "Float32Array"
    };
  }
  setDecoderPath(path) {
    this.decoderPath = path;
    return this;
  }
  setDecoderConfig(config) {
    this.decoderConfig = config;
    return this;
  }
  setWorkerLimit(workerLimit) {
    this.workerLimit = workerLimit;
    return this;
  }
  load(url, onLoad, onProgress, onError) {
    const loader = new FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setResponseType("arraybuffer");
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);
    loader.load(
      url,
      (buffer) => {
        const taskConfig = {
          attributeIDs: this.defaultAttributeIDs,
          attributeTypes: this.defaultAttributeTypes,
          useUniqueIDs: false
        };
        this.decodeGeometry(buffer, taskConfig).then(onLoad).catch(onError);
      },
      onProgress,
      onError
    );
  }
  /** @deprecated Kept for backward-compatibility with previous DRACOLoader versions. */
  decodeDracoFile(buffer, callback, attributeIDs, attributeTypes) {
    const taskConfig = {
      attributeIDs: attributeIDs || this.defaultAttributeIDs,
      attributeTypes: attributeTypes || this.defaultAttributeTypes,
      useUniqueIDs: !!attributeIDs
    };
    this.decodeGeometry(buffer, taskConfig).then(callback);
  }
  decodeGeometry(buffer, taskConfig) {
    for (const attribute in taskConfig.attributeTypes) {
      const type = taskConfig.attributeTypes[attribute];
      if (type.BYTES_PER_ELEMENT !== void 0) {
        taskConfig.attributeTypes[attribute] = type.name;
      }
    }
    const taskKey = JSON.stringify(taskConfig);
    if (_taskCache.has(buffer)) {
      const cachedTask = _taskCache.get(buffer);
      if (cachedTask.key === taskKey) {
        return cachedTask.promise;
      } else if (buffer.byteLength === 0) {
        throw new Error(
          "THREE.DRACOLoader: Unable to re-decode a buffer with different settings. Buffer has already been transferred."
        );
      }
    }
    let worker;
    const taskID = this.workerNextTaskID++;
    const taskCost = buffer.byteLength;
    const geometryPending = this._getWorker(taskID, taskCost).then((_worker) => {
      worker = _worker;
      return new Promise((resolve, reject) => {
        worker._callbacks[taskID] = { resolve, reject };
        worker.postMessage({ type: "decode", id: taskID, taskConfig, buffer }, [buffer]);
      });
    }).then((message) => this._createGeometry(message.geometry));
    geometryPending.catch(() => true).then(() => {
      if (worker && taskID) {
        this._releaseTask(worker, taskID);
      }
    });
    _taskCache.set(buffer, {
      key: taskKey,
      promise: geometryPending
    });
    return geometryPending;
  }
  _createGeometry(geometryData) {
    const geometry = new BufferGeometry();
    if (geometryData.index) {
      geometry.setIndex(new BufferAttribute(geometryData.index.array, 1));
    }
    for (let i = 0; i < geometryData.attributes.length; i++) {
      const attribute = geometryData.attributes[i];
      const name = attribute.name;
      const array = attribute.array;
      const itemSize = attribute.itemSize;
      geometry.setAttribute(name, new BufferAttribute(array, itemSize));
    }
    return geometry;
  }
  _loadLibrary(url, responseType) {
    const loader = new FileLoader(this.manager);
    loader.setPath(this.decoderPath);
    loader.setResponseType(responseType);
    loader.setWithCredentials(this.withCredentials);
    return new Promise((resolve, reject) => {
      loader.load(url, resolve, void 0, reject);
    });
  }
  preload() {
    this._initDecoder();
    return this;
  }
  _initDecoder() {
    if (this.decoderPending)
      return this.decoderPending;
    const useJS = typeof WebAssembly !== "object" || this.decoderConfig.type === "js";
    const librariesPending = [];
    if (useJS) {
      librariesPending.push(this._loadLibrary("draco_decoder.js", "text"));
    } else {
      librariesPending.push(this._loadLibrary("draco_wasm_wrapper.js", "text"));
      librariesPending.push(this._loadLibrary("draco_decoder.wasm", "arraybuffer"));
    }
    this.decoderPending = Promise.all(librariesPending).then((libraries) => {
      const jsContent = libraries[0];
      if (!useJS) {
        this.decoderConfig.wasmBinary = libraries[1];
      }
      const fn = DRACOWorker.toString();
      const body = [
        "/* draco decoder */",
        jsContent,
        "",
        "/* worker */",
        fn.substring(fn.indexOf("{") + 1, fn.lastIndexOf("}"))
      ].join("\n");
      this.workerSourceURL = URL.createObjectURL(new Blob([body]));
    });
    return this.decoderPending;
  }
  _getWorker(taskID, taskCost) {
    return this._initDecoder().then(() => {
      if (this.workerPool.length < this.workerLimit) {
        const worker2 = new Worker(this.workerSourceURL);
        worker2._callbacks = {};
        worker2._taskCosts = {};
        worker2._taskLoad = 0;
        worker2.postMessage({ type: "init", decoderConfig: this.decoderConfig });
        worker2.onmessage = function(e) {
          const message = e.data;
          switch (message.type) {
            case "decode":
              worker2._callbacks[message.id].resolve(message);
              break;
            case "error":
              worker2._callbacks[message.id].reject(message);
              break;
            default:
              console.error('THREE.DRACOLoader: Unexpected message, "' + message.type + '"');
          }
        };
        this.workerPool.push(worker2);
      } else {
        this.workerPool.sort(function(a, b) {
          return a._taskLoad > b._taskLoad ? -1 : 1;
        });
      }
      const worker = this.workerPool[this.workerPool.length - 1];
      worker._taskCosts[taskID] = taskCost;
      worker._taskLoad += taskCost;
      return worker;
    });
  }
  _releaseTask(worker, taskID) {
    worker._taskLoad -= worker._taskCosts[taskID];
    delete worker._callbacks[taskID];
    delete worker._taskCosts[taskID];
  }
  debug() {
    console.log(
      "Task load: ",
      this.workerPool.map((worker) => worker._taskLoad)
    );
  }
  dispose() {
    for (let i = 0; i < this.workerPool.length; ++i) {
      this.workerPool[i].terminate();
    }
    this.workerPool.length = 0;
    return this;
  }
}
function DRACOWorker() {
  let decoderConfig;
  let decoderPending;
  onmessage = function(e) {
    const message = e.data;
    switch (message.type) {
      case "init":
        decoderConfig = message.decoderConfig;
        decoderPending = new Promise(function(resolve) {
          decoderConfig.onModuleLoaded = function(draco) {
            resolve({ draco });
          };
          DracoDecoderModule(decoderConfig);
        });
        break;
      case "decode":
        const buffer = message.buffer;
        const taskConfig = message.taskConfig;
        decoderPending.then((module) => {
          const draco = module.draco;
          const decoder = new draco.Decoder();
          const decoderBuffer = new draco.DecoderBuffer();
          decoderBuffer.Init(new Int8Array(buffer), buffer.byteLength);
          try {
            const geometry = decodeGeometry(draco, decoder, decoderBuffer, taskConfig);
            const buffers = geometry.attributes.map((attr) => attr.array.buffer);
            if (geometry.index)
              buffers.push(geometry.index.array.buffer);
            self.postMessage({ type: "decode", id: message.id, geometry }, buffers);
          } catch (error) {
            console.error(error);
            self.postMessage({ type: "error", id: message.id, error: error.message });
          } finally {
            draco.destroy(decoderBuffer);
            draco.destroy(decoder);
          }
        });
        break;
    }
  };
  function decodeGeometry(draco, decoder, decoderBuffer, taskConfig) {
    const attributeIDs = taskConfig.attributeIDs;
    const attributeTypes = taskConfig.attributeTypes;
    let dracoGeometry;
    let decodingStatus;
    const geometryType = decoder.GetEncodedGeometryType(decoderBuffer);
    if (geometryType === draco.TRIANGULAR_MESH) {
      dracoGeometry = new draco.Mesh();
      decodingStatus = decoder.DecodeBufferToMesh(decoderBuffer, dracoGeometry);
    } else if (geometryType === draco.POINT_CLOUD) {
      dracoGeometry = new draco.PointCloud();
      decodingStatus = decoder.DecodeBufferToPointCloud(decoderBuffer, dracoGeometry);
    } else {
      throw new Error("THREE.DRACOLoader: Unexpected geometry type.");
    }
    if (!decodingStatus.ok() || dracoGeometry.ptr === 0) {
      throw new Error("THREE.DRACOLoader: Decoding failed: " + decodingStatus.error_msg());
    }
    const geometry = { index: null, attributes: [] };
    for (const attributeName in attributeIDs) {
      const attributeType = self[attributeTypes[attributeName]];
      let attribute;
      let attributeID;
      if (taskConfig.useUniqueIDs) {
        attributeID = attributeIDs[attributeName];
        attribute = decoder.GetAttributeByUniqueId(dracoGeometry, attributeID);
      } else {
        attributeID = decoder.GetAttributeId(dracoGeometry, draco[attributeIDs[attributeName]]);
        if (attributeID === -1)
          continue;
        attribute = decoder.GetAttribute(dracoGeometry, attributeID);
      }
      geometry.attributes.push(decodeAttribute(draco, decoder, dracoGeometry, attributeName, attributeType, attribute));
    }
    if (geometryType === draco.TRIANGULAR_MESH) {
      geometry.index = decodeIndex(draco, decoder, dracoGeometry);
    }
    draco.destroy(dracoGeometry);
    return geometry;
  }
  function decodeIndex(draco, decoder, dracoGeometry) {
    const numFaces = dracoGeometry.num_faces();
    const numIndices = numFaces * 3;
    const byteLength = numIndices * 4;
    const ptr = draco._malloc(byteLength);
    decoder.GetTrianglesUInt32Array(dracoGeometry, byteLength, ptr);
    const index = new Uint32Array(draco.HEAPF32.buffer, ptr, numIndices).slice();
    draco._free(ptr);
    return { array: index, itemSize: 1 };
  }
  function decodeAttribute(draco, decoder, dracoGeometry, attributeName, attributeType, attribute) {
    const numComponents = attribute.num_components();
    const numPoints = dracoGeometry.num_points();
    const numValues = numPoints * numComponents;
    const byteLength = numValues * attributeType.BYTES_PER_ELEMENT;
    const dataType = getDracoDataType(draco, attributeType);
    const ptr = draco._malloc(byteLength);
    decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, dataType, byteLength, ptr);
    const array = new attributeType(draco.HEAPF32.buffer, ptr, numValues).slice();
    draco._free(ptr);
    return {
      name: attributeName,
      array,
      itemSize: numComponents
    };
  }
  function getDracoDataType(draco, attributeType) {
    switch (attributeType) {
      case Float32Array:
        return draco.DT_FLOAT32;
      case Int8Array:
        return draco.DT_INT8;
      case Int16Array:
        return draco.DT_INT16;
      case Int32Array:
        return draco.DT_INT32;
      case Uint8Array:
        return draco.DT_UINT8;
      case Uint16Array:
        return draco.DT_UINT16;
      case Uint32Array:
        return draco.DT_UINT32;
    }
  }
}
let generated;
const MeshoptDecoder = () => {
  if (generated)
    return generated;
  const wasm_base = "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";
  const wasm_simd = "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";
  const detector = new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    1,
    4,
    1,
    96,
    0,
    0,
    3,
    3,
    2,
    0,
    0,
    5,
    3,
    1,
    0,
    1,
    12,
    1,
    0,
    10,
    22,
    2,
    12,
    0,
    65,
    0,
    65,
    0,
    65,
    0,
    252,
    10,
    0,
    0,
    11,
    7,
    0,
    65,
    0,
    253,
    15,
    26,
    11
  ]);
  const wasmpack = new Uint8Array([
    32,
    0,
    65,
    253,
    3,
    1,
    2,
    34,
    4,
    106,
    6,
    5,
    11,
    8,
    7,
    20,
    13,
    33,
    12,
    16,
    128,
    9,
    116,
    64,
    19,
    113,
    127,
    15,
    10,
    21,
    22,
    14,
    255,
    66,
    24,
    54,
    136,
    107,
    18,
    23,
    192,
    26,
    114,
    118,
    132,
    17,
    77,
    101,
    130,
    144,
    27,
    87,
    131,
    44,
    45,
    74,
    156,
    154,
    70,
    167
  ]);
  if (typeof WebAssembly !== "object") {
    return {
      supported: false
    };
  }
  let wasm = wasm_base;
  if (WebAssembly.validate(detector)) {
    wasm = wasm_simd;
  }
  let instance;
  const promise = WebAssembly.instantiate(unpack(wasm), {}).then((result) => {
    instance = result.instance;
    instance.exports.__wasm_call_ctors();
  });
  function unpack(data) {
    const result = new Uint8Array(data.length);
    for (let i = 0; i < data.length; ++i) {
      const ch = data.charCodeAt(i);
      result[i] = ch > 96 ? ch - 71 : ch > 64 ? ch - 65 : ch > 47 ? ch + 4 : ch > 46 ? 63 : 62;
    }
    let write = 0;
    for (let i = 0; i < data.length; ++i) {
      result[write++] = result[i] < 60 ? wasmpack[result[i]] : (result[i] - 60) * 64 + result[++i];
    }
    return result.buffer.slice(0, write);
  }
  function decode(fun, target, count, size, source, filter) {
    const sbrk = instance.exports.sbrk;
    const count4 = count + 3 & -4;
    const tp = sbrk(count4 * size);
    const sp = sbrk(source.length);
    const heap = new Uint8Array(instance.exports.memory.buffer);
    heap.set(source, sp);
    const res = fun(tp, count, size, sp, source.length);
    if (res === 0 && filter) {
      filter(tp, count4, size);
    }
    target.set(heap.subarray(tp, tp + count * size));
    sbrk(tp - sbrk(0));
    if (res !== 0) {
      throw new Error(`Malformed buffer data: ${res}`);
    }
  }
  const filters = {
    // legacy index-based enums for glTF
    0: "",
    1: "meshopt_decodeFilterOct",
    2: "meshopt_decodeFilterQuat",
    3: "meshopt_decodeFilterExp",
    // string-based enums for glTF
    NONE: "",
    OCTAHEDRAL: "meshopt_decodeFilterOct",
    QUATERNION: "meshopt_decodeFilterQuat",
    EXPONENTIAL: "meshopt_decodeFilterExp"
  };
  const decoders = {
    // legacy index-based enums for glTF
    0: "meshopt_decodeVertexBuffer",
    1: "meshopt_decodeIndexBuffer",
    2: "meshopt_decodeIndexSequence",
    // string-based enums for glTF
    ATTRIBUTES: "meshopt_decodeVertexBuffer",
    TRIANGLES: "meshopt_decodeIndexBuffer",
    INDICES: "meshopt_decodeIndexSequence"
  };
  generated = {
    ready: promise,
    supported: true,
    decodeVertexBuffer(target, count, size, source, filter) {
      decode(
        instance.exports.meshopt_decodeVertexBuffer,
        target,
        count,
        size,
        source,
        instance.exports[filters[filter]]
      );
    },
    decodeIndexBuffer(target, count, size, source) {
      decode(instance.exports.meshopt_decodeIndexBuffer, target, count, size, source);
    },
    decodeIndexSequence(target, count, size, source) {
      decode(instance.exports.meshopt_decodeIndexSequence, target, count, size, source);
    },
    decodeGltfBuffer(target, count, size, source, mode, filter) {
      decode(
        instance.exports[decoders[mode]],
        target,
        count,
        size,
        source,
        instance.exports[filters[filter]]
      );
    }
  };
  return generated;
};
let dracoLoader = null;
let decoderPath = "https://www.gstatic.com/draco/versioned/decoders/1.5.5/";
function extensions(useDraco = true, useMeshopt = true, extendLoader) {
  return (loader) => {
    if (extendLoader) {
      extendLoader(loader);
    }
    if (useDraco) {
      if (!dracoLoader) {
        dracoLoader = new DRACOLoader();
      }
      dracoLoader.setDecoderPath(typeof useDraco === "string" ? useDraco : decoderPath);
      loader.setDRACOLoader(dracoLoader);
    }
    if (useMeshopt) {
      loader.setMeshoptDecoder(typeof MeshoptDecoder === "function" ? MeshoptDecoder() : MeshoptDecoder);
    }
  };
}
const useGLTF = (path, useDraco, useMeshopt, extendLoader) => useLoader(GLTFLoader, path, extensions(useDraco, useMeshopt, extendLoader));
useGLTF.preload = (path, useDraco, useMeshopt, extendLoader) => useLoader.preload(GLTFLoader, path, extensions(useDraco, useMeshopt, extendLoader));
useGLTF.clear = (path) => useLoader.clear(GLTFLoader, path);
useGLTF.setDecoderPath = (path) => {
  decoderPath = path;
};
function useFBO(width, height, settings) {
  const size = useThree((state) => state.size);
  const viewport = useThree((state) => state.viewport);
  const _width = typeof width === "number" ? width : size.width * viewport.dpr;
  const _height = size.height * viewport.dpr;
  const _settings = (typeof width === "number" ? settings : width) || {};
  const {
    samples = 0,
    depth,
    ...targetSettings
  } = _settings;
  const depthBuffer = depth !== null && depth !== void 0 ? depth : _settings.depthBuffer;
  const target = reactExports.useMemo(() => {
    const target2 = new WebGLRenderTarget(_width, _height, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      type: HalfFloatType,
      ...targetSettings
    });
    if (depthBuffer) {
      target2.depthTexture = new DepthTexture(_width, _height, FloatType);
    }
    target2.samples = samples;
    return target2;
  }, []);
  reactExports.useLayoutEffect(() => {
    target.setSize(_width, _height);
    if (samples) target.samples = samples;
  }, [samples, target, _width, _height]);
  reactExports.useEffect(() => {
    return () => target.dispose();
  }, []);
  return target;
}
const isFunction = (node) => typeof node === "function";
const PerspectiveCamera = /* @__PURE__ */ reactExports.forwardRef(({
  envMap,
  resolution = 256,
  frames = Infinity,
  makeDefault,
  children,
  ...props
}, ref) => {
  const set = useThree(({
    set: set2
  }) => set2);
  const camera = useThree(({
    camera: camera2
  }) => camera2);
  const size = useThree(({
    size: size2
  }) => size2);
  const cameraRef = reactExports.useRef(null);
  reactExports.useImperativeHandle(ref, () => cameraRef.current, []);
  const groupRef = reactExports.useRef(null);
  const fbo = useFBO(resolution);
  reactExports.useLayoutEffect(() => {
    if (!props.manual) {
      cameraRef.current.aspect = size.width / size.height;
    }
  }, [size, props]);
  reactExports.useLayoutEffect(() => {
    cameraRef.current.updateProjectionMatrix();
  });
  let count = 0;
  let oldEnvMap = null;
  const functional = isFunction(children);
  useFrame((state) => {
    if (functional && (frames === Infinity || count < frames)) {
      groupRef.current.visible = false;
      state.gl.setRenderTarget(fbo);
      oldEnvMap = state.scene.background;
      if (envMap) state.scene.background = envMap;
      state.gl.render(state.scene, cameraRef.current);
      state.scene.background = oldEnvMap;
      state.gl.setRenderTarget(null);
      groupRef.current.visible = true;
      count++;
    }
  });
  reactExports.useLayoutEffect(() => {
    if (makeDefault) {
      const oldCam = camera;
      set(() => ({
        camera: cameraRef.current
      }));
      return () => set(() => ({
        camera: oldCam
      }));
    }
  }, [cameraRef, makeDefault, set]);
  return /* @__PURE__ */ reactExports.createElement(reactExports.Fragment, null, /* @__PURE__ */ reactExports.createElement("perspectiveCamera", _extends({
    ref: cameraRef
  }, props), !functional && children), /* @__PURE__ */ reactExports.createElement("group", {
    ref: groupRef
  }, functional && children(fbo.texture)));
});
const OrbitControls2 = /* @__PURE__ */ reactExports.forwardRef(({
  makeDefault,
  camera,
  regress,
  domElement,
  enableDamping = true,
  keyEvents = false,
  onChange,
  onStart,
  onEnd,
  ...restProps
}, ref) => {
  const invalidate = useThree((state) => state.invalidate);
  const defaultCamera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const events = useThree((state) => state.events);
  const setEvents = useThree((state) => state.setEvents);
  const set = useThree((state) => state.set);
  const get = useThree((state) => state.get);
  const performance2 = useThree((state) => state.performance);
  const explCamera = camera || defaultCamera;
  const explDomElement = domElement || events.connected || gl.domElement;
  const controls = reactExports.useMemo(() => new OrbitControls$1(explCamera), [explCamera]);
  useFrame(() => {
    if (controls.enabled) controls.update();
  }, -1);
  reactExports.useEffect(() => {
    if (keyEvents) {
      controls.connect(keyEvents === true ? explDomElement : keyEvents);
    }
    controls.connect(explDomElement);
    return () => void controls.dispose();
  }, [keyEvents, explDomElement, regress, controls, invalidate]);
  reactExports.useEffect(() => {
    const callback = (e) => {
      invalidate();
      if (regress) performance2.regress();
      if (onChange) onChange(e);
    };
    const onStartCb = (e) => {
      if (onStart) onStart(e);
    };
    const onEndCb = (e) => {
      if (onEnd) onEnd(e);
    };
    controls.addEventListener("change", callback);
    controls.addEventListener("start", onStartCb);
    controls.addEventListener("end", onEndCb);
    return () => {
      controls.removeEventListener("start", onStartCb);
      controls.removeEventListener("end", onEndCb);
      controls.removeEventListener("change", callback);
    };
  }, [onChange, onStart, onEnd, controls, invalidate, setEvents]);
  reactExports.useEffect(() => {
    if (makeDefault) {
      const old = get().controls;
      set({
        controls
      });
      return () => set({
        controls: old
      });
    }
  }, [makeDefault, controls]);
  return /* @__PURE__ */ reactExports.createElement("primitive", _extends({
    ref,
    object: controls,
    enableDamping
  }, restProps));
});
const MODEL_PATH$1 = "/models/turntable.glb";
const MODEL_SCALE$1 = 0.01;
const DECK_ACCENT = {
  A: "#60a5fa",
  B: "#f87171",
  C: "#34d399"
};
const RPM_33 = 33;
const RPM_45 = 45;
const RPS_33 = 33.333 / 60;
const RPS_45 = 45 / 60;
const TONEARM_ANGLE_REST = 0.3;
const TONEARM_ANGLE_START = 0;
const TONEARM_ANGLE_END = -0.35;
const _rotMat = new Matrix4();
const _transMat = new Matrix4();
const _invTransMat = new Matrix4();
const _compositeMat = new Matrix4();
function makeRotationAroundPivot(angle, pivot, out) {
  _transMat.makeTranslation(pivot.x, pivot.y, pivot.z);
  _rotMat.makeRotationY(angle);
  _invTransMat.makeTranslation(-pivot.x, -pivot.y, -pivot.z);
  out.copy(_transMat).multiply(_rotMat).multiply(_invTransMat);
}
function TurntableScene({ deckId, orbitRef, embedded }) {
  const { scene: gltfScene } = useGLTF(MODEL_PATH$1);
  const physicsRef = reactExports.useRef(null);
  const platterAngleRef = reactExports.useRef(0);
  const tonearmAngleRef = reactExports.useRef(TONEARM_ANGLE_REST);
  const isScratchActiveRef = reactExports.useRef(false);
  const lastPointerRef = reactExports.useRef(null);
  const lastPointerTimeRef = reactExports.useRef(0);
  const prevRateRef = reactExports.useRef(1);
  const pitchDragRef = reactExports.useRef(false);
  const pitchDragStartYRef = reactExports.useRef(0);
  const pitchDragStartValueRef = reactExports.useRef(0);
  const rpmRef = reactExports.useRef(RPM_33);
  const ledYRef = reactExports.useRef(0);
  const tonearmHitboxRef = reactExports.useRef(null);
  const labelMeshRef = reactExports.useRef(null);
  const labelTextureRef = reactExports.useRef(null);
  const [rpm, setRpm] = reactExports.useState(RPM_33);
  const [stylusLight, setStylusLight] = reactExports.useState(true);
  const [powerOn, setPowerOn] = reactExports.useState(false);
  const powerOnRef = reactExports.useRef(false);
  powerOnRef.current = powerOn;
  const isPlaying = useDJStore((s) => s.decks[deckId].isPlaying);
  const songPos = useDJStore((s) => s.decks[deckId].songPos);
  const totalPositions = useDJStore((s) => s.decks[deckId].totalPositions);
  const audioPosition = useDJStore((s) => s.decks[deckId].audioPosition);
  const durationMs = useDJStore((s) => s.decks[deckId].durationMs);
  const playbackMode = useDJStore((s) => s.decks[deckId].playbackMode);
  const pitchOffset = useDJStore((s) => s.decks[deckId].pitchOffset);
  const trackName = useDJStore((s) => s.decks[deckId].trackName);
  const playStateRef = reactExports.useRef({ isPlaying, songPos, totalPositions, audioPosition, durationMs, playbackMode, pitchOffset });
  playStateRef.current = { isPlaying, songPos, totalPositions, audioPosition, durationMs, playbackMode, pitchOffset };
  const accentColor = DECK_ACCENT[deckId] ?? "#60a5fa";
  const { clonedScene, platterMeshes, tonearmMeshes, platterCenter, tonearmPivot, pitchsliderMesh, ledMesh } = reactExports.useMemo(() => {
    const cloned = gltfScene.clone(true);
    cloned.updateMatrixWorld(true);
    const platters = [];
    const tonearms = [];
    let swivleMesh = null;
    let pitchsliderMesh2 = null;
    let ledMesh2 = null;
    cloned.traverse((child) => {
      if (!("isMesh" in child && child.isMesh)) return;
      const mesh = child;
      const name = mesh.name;
      if (name === "Platter_2001" || name === "Vinyl001") {
        platters.push(mesh);
      } else if (name === "Cartridge_1" || name === "Cartridge_2" || name === "Swivle001") {
        tonearms.push(mesh);
        if (name === "Swivle001") swivleMesh = mesh;
      } else if (name === "Pitchslider") {
        pitchsliderMesh2 = mesh;
        mesh.matrixAutoUpdate = false;
      } else if (name === "Led") {
        ledMesh2 = mesh;
      } else if (name === "Glass_Cover_2001" || name === "Hinges001" || name === "Glass_Caps001") {
        mesh.visible = false;
      }
    });
    const pCenter = new Vector3();
    const vinylMesh = platters.find((m) => m.name === "Vinyl001");
    if (vinylMesh) {
      vinylMesh.geometry.computeBoundingBox();
      vinylMesh.geometry.boundingBox.getCenter(pCenter);
    } else if (platters.length > 0) {
      const box = new Box3();
      for (const m of platters) {
        m.geometry.computeBoundingBox();
        if (m.geometry.boundingBox) box.union(m.geometry.boundingBox);
      }
      box.getCenter(pCenter);
    }
    const tPivot = new Vector3();
    if (swivleMesh) {
      swivleMesh.geometry.computeBoundingBox();
      swivleMesh.geometry.boundingBox.getCenter(tPivot);
    }
    for (const m of platters) m.matrixAutoUpdate = false;
    for (const m of tonearms) m.matrixAutoUpdate = false;
    return { clonedScene: cloned, platterMeshes: platters, tonearmMeshes: tonearms, platterCenter: pCenter, tonearmPivot: tPivot, pitchsliderMesh: pitchsliderMesh2, ledMesh: ledMesh2 };
  }, [gltfScene]);
  reactExports.useMemo(() => {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace$1;
    labelTextureRef.current = tex;
    return tex;
  }, []);
  reactExports.useMemo(() => {
    const tex = labelTextureRef.current;
    if (!tex) return;
    const canvas = tex.image;
    const ctx = canvas.getContext("2d");
    const S = canvas.width;
    const cx = S / 2, cy = S / 2;
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath();
    ctx.arc(cx, cy, S / 2, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a1a";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, S * 0.38, 0, Math.PI * 2);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, S * 0.03, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.fillStyle = accentColor;
    ctx.font = `bold ${S * 0.12}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`DECK ${deckId}`, cx, cy - S * 0.1);
    if (trackName) {
      const text = trackName.toUpperCase();
      const radius = S * 0.42;
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${S * 0.07}px monospace`;
      const charAngle = 0.07;
      const totalAngle = Math.min(Math.PI * 1.8, text.length * charAngle);
      const startAngle = -Math.PI / 2 - totalAngle / 2;
      for (let i = 0; i < text.length; i++) {
        const angle = startAngle + i / text.length * totalAngle;
        ctx.save();
        ctx.translate(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
        ctx.rotate(angle + Math.PI / 2);
        ctx.fillText(text[i], 0, 0);
        ctx.restore();
      }
      const innerRadius = S * 0.28;
      ctx.fillStyle = "#888";
      ctx.font = `${S * 0.055}px monospace`;
      const innerStart = Math.PI / 2 - totalAngle / 2;
      for (let i = 0; i < text.length; i++) {
        const angle = innerStart + i / text.length * totalAngle;
        ctx.save();
        ctx.translate(cx + Math.cos(angle) * innerRadius, cy + Math.sin(angle) * innerRadius);
        ctx.rotate(angle + Math.PI / 2);
        ctx.fillText(text[i], 0, 0);
        ctx.restore();
      }
      ctx.fillStyle = "#666";
      ctx.font = `bold ${S * 0.06}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText("DEViLBOX", cx, cy + S * 0.03);
      ctx.fillStyle = "#444";
      ctx.font = `${S * 0.04}px monospace`;
      ctx.fillText("RECORDS", cx, cy + S * 0.08);
    } else {
      ctx.fillStyle = accentColor;
      ctx.font = `bold ${S * 0.09}px monospace`;
      ctx.fillText("DEViLBOX", cx, cy + S * 0.03);
      ctx.fillStyle = "#555";
      ctx.font = `${S * 0.045}px monospace`;
      ctx.fillText("NO TRACK LOADED", cx, cy + S * 0.1);
    }
    tex.needsUpdate = true;
  }, [trackName, deckId, accentColor]);
  useFrame((_state, delta) => {
    const {
      isPlaying: playing,
      songPos: sPos,
      totalPositions: total,
      audioPosition: aPos,
      durationMs: dur,
      playbackMode: mode
    } = playStateRef.current;
    if (!physicsRef.current) {
      try {
        physicsRef.current = getDJEngine().getDeck(deckId).physics;
      } catch {
        return;
      }
    }
    const physics = physicsRef.current;
    if (platterMeshes.length > 0) {
      const baseRps = rpmRef.current === RPM_45 ? RPS_45 : RPS_33;
      const pitchMultiplier = Math.pow(2, playStateRef.current.pitchOffset / 12);
      const rps = baseRps * pitchMultiplier;
      const physicsActive = isScratchActiveRef.current || physics.spinbackActive || physics.powerCutActive || physics.eBrakeActive;
      if (playing || physicsActive) {
        let rate = 1;
        if (physicsActive) {
          rate = physics.tick(delta);
        }
        platterAngleRef.current -= rps * rate * 2 * Math.PI * delta;
        if (isScratchActiveRef.current && Math.abs(rate - prevRateRef.current) > 0.01) {
          setScratchVelocity(deckId, rate);
          prevRateRef.current = rate;
        }
        if (isScratchActiveRef.current && !physics.touching && !physics.spinbackActive && !physics.powerCutActive && !physics.eBrakeActive) {
          if (Math.abs(rate - 1) < 0.02) {
            isScratchActiveRef.current = false;
            stopScratch(deckId, 50);
            prevRateRef.current = 1;
          }
        }
      }
      makeRotationAroundPivot(platterAngleRef.current, platterCenter, _compositeMat);
      for (const mesh of platterMeshes) {
        mesh.matrix.copy(_compositeMat);
      }
      if (labelMeshRef.current) {
        const lp = labelMeshRef.current.position;
        _compositeMat.makeTranslation(lp.x, lp.y, lp.z);
        _rotMat.makeRotationY(platterAngleRef.current);
        _compositeMat.multiply(_rotMat);
        _rotMat.makeRotationX(-Math.PI / 2);
        _compositeMat.multiply(_rotMat);
        labelMeshRef.current.matrix.copy(_compositeMat);
      }
    }
    if (tonearmMeshes.length > 0) {
      let progress = 0;
      if (mode === "audio" && dur > 0) {
        progress = aPos / (dur / 1e3);
      } else if (mode === "tracker" && total > 0) {
        progress = sPos / total;
      }
      progress = Math.max(0, Math.min(1, progress));
      const targetAngle = playing && trackName ? TONEARM_ANGLE_START + progress * (TONEARM_ANGLE_END - TONEARM_ANGLE_START) : TONEARM_ANGLE_REST;
      tonearmAngleRef.current += (targetAngle - tonearmAngleRef.current) * Math.min(1, delta * 12);
      makeRotationAroundPivot(tonearmAngleRef.current, tonearmPivot, _compositeMat);
      for (const mesh of tonearmMeshes) {
        mesh.matrix.copy(_compositeMat);
      }
      if (tonearmHitboxRef.current) {
        const midX = (tonearmPivot.x + -0.049) / 2;
        const midZ = (tonearmPivot.z + -0.01) / 2;
        const cos = Math.cos(tonearmAngleRef.current);
        const sin = Math.sin(tonearmAngleRef.current);
        const dx = midX - tonearmPivot.x;
        const dz = midZ - tonearmPivot.z;
        const rx = tonearmPivot.x + dx * cos - dz * sin;
        const rz = tonearmPivot.z + dx * sin + dz * cos;
        tonearmHitboxRef.current.position.set(rx, tonearmPivot.y, rz);
        tonearmHitboxRef.current.rotation.set(0, tonearmAngleRef.current, 0);
        tonearmHitboxRef.current.updateMatrix();
      }
    }
    if (pitchsliderMesh) {
      const pitchNorm = (playStateRef.current.pitchOffset ?? 0) / 8;
      const slideRange = 4;
      const zOffset = -pitchNorm * slideRange;
      _compositeMat.makeTranslation(0, 0, zOffset);
      pitchsliderMesh.matrix.copy(_compositeMat);
    }
    if (ledMesh) {
      const targetY = stylusLight ? 0 : -3;
      ledYRef.current += (targetY - ledYRef.current) * Math.min(1, delta * 6);
      ledMesh.matrixAutoUpdate = false;
      _compositeMat.makeTranslation(0, ledYRef.current, 0);
      ledMesh.matrix.copy(_compositeMat);
      const mat = ledMesh.material;
      if (mat && "emissive" in mat) {
        const extended = ledYRef.current > -0.5;
        if (powerOn && stylusLight && extended) {
          mat.emissive.set(16768324);
          mat.emissiveIntensity = 2;
        } else {
          mat.emissive.set(0);
          mat.emissiveIntensity = 0;
        }
      }
    }
  });
  const enterScratch = reactExports.useCallback(() => {
    if (isScratchActiveRef.current) return;
    isScratchActiveRef.current = true;
    startScratch(deckId);
  }, [deckId]);
  const handlePlatterPointerDown = reactExports.useCallback((e) => {
    var _a, _b, _c, _d;
    e.stopPropagation();
    if (e.point) {
      const localX = e.point.x + 0.049;
      const localZ = e.point.z + 0.01;
      if (localX > 0.03 && Math.abs(localZ) < 0.12) return;
    }
    (_b = (_a = e.nativeEvent.target) == null ? void 0 : _a.setPointerCapture) == null ? void 0 : _b.call(_a, e.nativeEvent.pointerId);
    if (!powerOnRef.current || !playStateRef.current.isPlaying) return;
    enterScratch();
    lastPointerRef.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
    lastPointerTimeRef.current = performance.now();
    (_c = physicsRef.current) == null ? void 0 : _c.setTouching(true);
    (_d = physicsRef.current) == null ? void 0 : _d.setHandVelocity(0);
  }, [enterScratch]);
  const handlePlatterPointerMove = reactExports.useCallback((e) => {
    var _a;
    if (!lastPointerRef.current) return;
    const dx = e.nativeEvent.clientX - lastPointerRef.current.x;
    const now = performance.now();
    const dt = Math.max(1e-3, (now - lastPointerTimeRef.current) / 1e3);
    lastPointerTimeRef.current = now;
    const pixelVelocity = -dx / dt;
    const sensitivity = useDJStore.getState().jogWheelSensitivity;
    const omega = pixelVelocity / 400 * OMEGA_NORMAL * sensitivity;
    (_a = physicsRef.current) == null ? void 0 : _a.setHandVelocity(omega);
    lastPointerRef.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
  }, []);
  const handlePlatterPointerUp = reactExports.useCallback(() => {
    var _a;
    lastPointerRef.current = null;
    (_a = physicsRef.current) == null ? void 0 : _a.setTouching(false);
  }, []);
  const handleStartStopClick = reactExports.useCallback((e) => {
    var _a, _b;
    e.stopPropagation();
    if (!powerOnRef.current) return;
    const store = useDJStore.getState();
    const playing = store.decks[deckId].isPlaying;
    if (playing) {
      void togglePlay(deckId, { spinDownMs: 0 });
      (_a = physicsRef.current) == null ? void 0 : _a.triggerElectronicBrake();
    } else {
      (_b = physicsRef.current) == null ? void 0 : _b.triggerMotorStart();
      void togglePlay(deckId, { quantize: false });
    }
  }, [deckId, powerOn]);
  const handlePowerToggle = reactExports.useCallback((e) => {
    var _a;
    e.stopPropagation();
    if (powerOn) {
      setPowerOn(false);
      const store = useDJStore.getState();
      if (store.decks[deckId].isPlaying) {
        void togglePlay(deckId, { spinDownMs: 0 });
        (_a = physicsRef.current) == null ? void 0 : _a.triggerPowerCut();
      }
    } else {
      setPowerOn(true);
    }
  }, [deckId, powerOn]);
  const handlePitchPointerDown = reactExports.useCallback((e) => {
    var _a, _b;
    e.stopPropagation();
    if (!powerOnRef.current) return;
    pitchDragRef.current = true;
    pitchDragStartYRef.current = e.nativeEvent.clientY;
    pitchDragStartValueRef.current = playStateRef.current.pitchOffset;
    const canvas = (_b = (_a = e.nativeEvent.target) == null ? void 0 : _a.closest) == null ? void 0 : _b.call(_a, "canvas");
    if (canvas) canvas.setPointerCapture(e.nativeEvent.pointerId);
  }, []);
  reactExports.useEffect(() => {
    const onMove = (e) => {
      if (!pitchDragRef.current) return;
      const dy = e.clientY - pitchDragStartYRef.current;
      const pitchDelta = dy / 120 * 8;
      const newPitch = Math.max(-8, Math.min(8, pitchDragStartValueRef.current + pitchDelta));
      useDJStore.getState().setDeckPitch(deckId, newPitch);
    };
    const onUp = () => {
      pitchDragRef.current = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [deckId]);
  const handlePitchPointerMove = reactExports.useCallback(() => {
  }, []);
  const handlePitchPointerUp = reactExports.useCallback(() => {
    pitchDragRef.current = false;
  }, []);
  const handlePitchDoubleClick = reactExports.useCallback((e) => {
    e.stopPropagation();
    useDJStore.getState().setDeckPitch(deckId, 0);
  }, [deckId]);
  const handleRpmClick = reactExports.useCallback((e) => {
    e.stopPropagation();
    const next = rpmRef.current === RPM_33 ? RPM_45 : RPM_33;
    rpmRef.current = next;
    setRpm(next);
  }, []);
  const handleWheel = reactExports.useCallback((e) => {
    var _a;
    if (!powerOnRef.current || !playStateRef.current.isPlaying) return;
    e.stopPropagation();
    if (!isScratchActiveRef.current) enterScratch();
    const impulse = TurntablePhysics.deltaToImpulse(e.nativeEvent.deltaY, e.nativeEvent.deltaMode);
    (_a = physicsRef.current) == null ? void 0 : _a.applyImpulse(impulse);
  }, [enterScratch]);
  const pickupDragRef = reactExports.useRef(false);
  const pickupDragStartXRef = reactExports.useRef(0);
  const pickupDragStartProgressRef = reactExports.useRef(0);
  const handlePickupDown = reactExports.useCallback((e) => {
    var _a, _b;
    e.stopPropagation();
    pickupDragRef.current = true;
    pickupDragStartXRef.current = e.nativeEvent.clientY;
    const { audioPosition: aPos, durationMs: dur, songPos: sPos, totalPositions: total, playbackMode: mode } = playStateRef.current;
    pickupDragStartProgressRef.current = mode === "audio" && dur > 0 ? aPos / (dur / 1e3) : total > 0 ? sPos / total : 0;
    (_b = (_a = e.nativeEvent.target) == null ? void 0 : _a.setPointerCapture) == null ? void 0 : _b.call(_a, e.nativeEvent.pointerId);
  }, []);
  const handlePickupMove = reactExports.useCallback((e) => {
    var _a;
    if (!pickupDragRef.current) return;
    const dy = e.nativeEvent.clientY - pickupDragStartXRef.current;
    const progressDelta = dy / 200;
    const newProgress = Math.max(0, Math.min(1, pickupDragStartProgressRef.current + progressDelta));
    tonearmAngleRef.current = TONEARM_ANGLE_START + newProgress * (TONEARM_ANGLE_END - TONEARM_ANGLE_START);
    try {
      const deck = getDJEngine().getDeck(deckId);
      const { playbackMode: mode, durationMs: dur, totalPositions: total } = playStateRef.current;
      if (mode === "audio" && dur > 0) {
        deck.audioPlayer.seek(newProgress * dur / 1e3);
      } else if (total > 0) {
        const targetPos = Math.round(newProgress * total);
        (_a = deck.replayer) == null ? void 0 : _a.seekTo(targetPos, 0);
      }
    } catch {
    }
  }, [deckId]);
  const handlePickupUp = reactExports.useCallback(() => {
    pickupDragRef.current = false;
  }, []);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
    !embedded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("ambientLight", { intensity: 0.5 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
      lineNumber: 635,
      columnNumber: 21
    }, this),
    !embedded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("directionalLight", { position: [2, 5, 3], intensity: 0.9, castShadow: false }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
      lineNumber: 636,
      columnNumber: 21
    }, this),
    !embedded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("directionalLight", { position: [-2, 3, -1], intensity: 0.3 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
      lineNumber: 637,
      columnNumber: 21
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("pointLight", { position: [0, 0.05, 0], color: accentColor, intensity: 0.4, distance: 0.6 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
      lineNumber: 638,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("primitive", { object: clonedScene, scale: MODEL_SCALE$1 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
      lineNumber: 641,
      columnNumber: 7
    }, this),
    labelTextureRef.current && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "mesh",
      {
        ref: labelMeshRef,
        position: [-0.049, 0.1068, -0.01],
        rotation: [-Math.PI / 2, 0, 0],
        matrixAutoUpdate: false,
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("circleGeometry", { args: [0.048, 48] }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
            lineNumber: 651,
            columnNumber: 11
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            "meshStandardMaterial",
            {
              map: labelTextureRef.current,
              transparent: true,
              roughness: 0.7,
              metalness: 0.05
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
              lineNumber: 652,
              columnNumber: 11
            },
            this
          )
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 645,
        columnNumber: 9
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "mesh",
      {
        position: [-0.049, 0.108, -0.01],
        rotation: [-Math.PI / 2, 0, 0],
        onPointerDown: handlePlatterPointerDown,
        onPointerMove: handlePlatterPointerMove,
        onPointerUp: handlePlatterPointerUp,
        onPointerCancel: handlePlatterPointerUp,
        onWheel: handleWheel,
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("circleGeometry", { args: [0.159, 32] }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
            lineNumber: 671,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("meshBasicMaterial", { transparent: true, opacity: 0, depthWrite: false }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
            lineNumber: 672,
            columnNumber: 9
          }, this)
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 662,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("mesh", { position: [-0.203, 0.093, 0.148], onClick: handleStartStopClick, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("boxGeometry", { args: [0.046, 3e-3, 0.038] }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 677,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("meshBasicMaterial", { transparent: true, opacity: 0, depthWrite: false }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 678,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
      lineNumber: 676,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("mesh", { position: [-0.212, 0.097, 0.098], onClick: handlePowerToggle, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("boxGeometry", { args: [0.028, 0.023, 0.026] }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 683,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("meshBasicMaterial", { transparent: true, opacity: 0, depthWrite: false }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 684,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
      lineNumber: 682,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("mesh", { position: [-0.198, 0.097, 0.098], rotation: [0, 0, 0], children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("planeGeometry", { args: [3e-3, 0.012] }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 688,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "meshStandardMaterial",
        {
          color: powerOn ? "#00ff44" : "#111111",
          emissive: powerOn ? "#00ff44" : "#000000",
          emissiveIntensity: powerOn ? 4 : 0,
          side: DoubleSide,
          depthWrite: false
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
          lineNumber: 689,
          columnNumber: 9
        },
        this
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
      lineNumber: 687,
      columnNumber: 7
    }, this),
    powerOn && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "pointLight",
      {
        position: [-0.196, 0.097, 0.098],
        color: "#00ff44",
        intensity: 0.3,
        distance: 0.12,
        decay: 2
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 699,
        columnNumber: 9
      },
      this
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("mesh", { position: [-0.164, 0.092, 0.161], onClick: handleRpmClick, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("boxGeometry", { args: [0.027, 3e-3, 0.01] }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 710,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("meshBasicMaterial", { transparent: true, opacity: 0, depthWrite: false }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 711,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
      lineNumber: 709,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("mesh", { position: [-0.157, 0.0935, 0.157], rotation: [-Math.PI / 2, 0, 0], children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("planeGeometry", { args: [7e-3, 2e-3] }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 714,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "meshStandardMaterial",
        {
          color: powerOn && rpm === RPM_33 ? accentColor : "#111111",
          emissive: powerOn && rpm === RPM_33 ? accentColor : "#000000",
          emissiveIntensity: powerOn && rpm === RPM_33 ? 3 : 0,
          depthWrite: false
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
          lineNumber: 715,
          columnNumber: 9
        },
        this
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
      lineNumber: 713,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("mesh", { position: [-0.137, 0.092, 0.161], onClick: handleRpmClick, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("boxGeometry", { args: [0.027, 3e-3, 0.01] }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 725,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("meshBasicMaterial", { transparent: true, opacity: 0, depthWrite: false }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 726,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
      lineNumber: 724,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("mesh", { position: [-0.13, 0.0935, 0.157], rotation: [-Math.PI / 2, 0, 0], children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("planeGeometry", { args: [7e-3, 2e-3] }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 729,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "meshStandardMaterial",
        {
          color: powerOn && rpm === RPM_45 ? accentColor : "#111111",
          emissive: powerOn && rpm === RPM_45 ? accentColor : "#000000",
          emissiveIntensity: powerOn && rpm === RPM_45 ? 3 : 0,
          depthWrite: false
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
          lineNumber: 730,
          columnNumber: 9
        },
        this
      )
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
      lineNumber: 728,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "mesh",
      {
        position: [0.207, 0.093, 0.02],
        onPointerDown: handlePitchPointerDown,
        onPointerMove: handlePitchPointerMove,
        onPointerUp: handlePitchPointerUp,
        onPointerCancel: handlePitchPointerUp,
        onDoubleClick: handlePitchDoubleClick,
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("boxGeometry", { args: [0.04, 0.04, 0.12] }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
            lineNumber: 747,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("meshBasicMaterial", { transparent: true, opacity: 0, depthWrite: false }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
            lineNumber: 748,
            columnNumber: 9
          }, this)
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 739,
        columnNumber: 7
      },
      this
    ),
    (() => {
      const atCenter = powerOn && Math.abs(pitchOffset) < 0.15;
      return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("mesh", { position: [0.195, 0.0935, 0.066], rotation: [-Math.PI / 2, 0, 0], children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("circleGeometry", { args: [2e-3, 10] }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
          lineNumber: 755,
          columnNumber: 13
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "meshStandardMaterial",
          {
            color: atCenter ? "#00ff44" : "#111111",
            emissive: atCenter ? "#00ff44" : "#000000",
            emissiveIntensity: atCenter ? 3 : 0,
            depthWrite: false
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
            lineNumber: 756,
            columnNumber: 13
          },
          this
        )
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 754,
        columnNumber: 11
      }, this);
    })(),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("mesh", { position: [0.04, 0.107, 0.153], onClick: (e) => {
      e.stopPropagation();
      if (powerOnRef.current) setStylusLight(false);
    }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("boxGeometry", { args: [0.012, 0.035, 0.011] }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 769,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("meshBasicMaterial", { transparent: true, opacity: 0, depthWrite: false }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 770,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
      lineNumber: 768,
      columnNumber: 7
    }, this),
    powerOn && stylusLight && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("group", { children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
        "spotLight",
        {
          position: [0.04, 0.13, 0.153],
          color: "#ffee88",
          intensity: 1.5,
          angle: 0.6,
          penumbra: 0.5,
          distance: 0.2,
          decay: 2
        },
        void 0,
        false,
        {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
          lineNumber: 775,
          columnNumber: 11
        },
        this
      ),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("mesh", { position: [-0.049, 0.107, -0.01], ref: (m) => {
        if (m) {
          const parent = m.parent;
          const spot = parent == null ? void 0 : parent.children.find((c) => c.isSpotLight);
          if (spot) spot.target = m;
        }
      }, children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("boxGeometry", { args: [1e-3, 1e-3, 1e-3] }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
          lineNumber: 792,
          columnNumber: 13
        }, this),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("meshBasicMaterial", { visible: false }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
          lineNumber: 793,
          columnNumber: 13
        }, this)
      ] }, void 0, true, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 785,
        columnNumber: 11
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
      lineNumber: 774,
      columnNumber: 9
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("mesh", { position: [0.052, 0.091, 0.157], onClick: (e) => {
      e.stopPropagation();
      if (powerOn) setStylusLight(true);
    }, children: [
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("boxGeometry", { args: [9e-3, 1e-3, 9e-3] }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 799,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("meshBasicMaterial", { transparent: true, opacity: 0, depthWrite: false }, void 0, false, {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 800,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
      lineNumber: 798,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      "mesh",
      {
        ref: tonearmHitboxRef,
        position: [0.05, 0.125, 0],
        renderOrder: 10,
        onPointerDown: (e) => {
          e.stopPropagation();
          handlePickupDown(e);
        },
        onPointerMove: handlePickupMove,
        onPointerUp: handlePickupUp,
        onPointerCancel: handlePickupUp,
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("boxGeometry", { args: [0.015, 0.02, 0.18] }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
            lineNumber: 814,
            columnNumber: 9
          }, this),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("meshBasicMaterial", { transparent: true, opacity: 0, depthWrite: false }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
            lineNumber: 815,
            columnNumber: 9
          }, this)
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 805,
        columnNumber: 7
      },
      this
    ),
    !embedded && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      OrbitControls2,
      {
        ref: orbitRef,
        enablePan: false,
        enableZoom: false,
        enableRotate: false,
        enableDamping: true,
        dampingFactor: 0.1,
        minPolarAngle: Math.PI * 0.05,
        maxPolarAngle: Math.PI * 0.45,
        minDistance: 0.1,
        maxDistance: 2,
        mouseButtons: {
          LEFT: void 0,
          MIDDLE: void 0,
          RIGHT: void 0
        }
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
        lineNumber: 820,
        columnNumber: 9
      },
      this
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DeckVinyl3DView.tsx",
    lineNumber: 633,
    columnNumber: 5
  }, this);
}
useGLTF.preload(MODEL_PATH$1);
const MODEL_PATH = "/models/vestax-mixer.glb";
const MODEL_SCALE = 0.01;
const KNOB_MIN_ANGLE = -Math.PI * 0.75;
const KNOB_MAX_ANGLE = Math.PI * 0.75;
const KNOB_RANGE = KNOB_MAX_ANGLE - KNOB_MIN_ANGLE;
const _knobRotMat = new Matrix4();
const _knobTransMat = new Matrix4();
const _knobInvTransMat = new Matrix4();
const _knobCompositeMat = new Matrix4();
const _faderTransMat = new Matrix4();
function makeRotationAroundPivotY(angle, pivot, out) {
  _knobTransMat.makeTranslation(pivot.x, pivot.y, pivot.z);
  _knobRotMat.makeRotationY(angle);
  _knobInvTransMat.makeTranslation(-pivot.x, -pivot.y, -pivot.z);
  out.copy(_knobTransMat).multiply(_knobRotMat).multiply(_knobInvTransMat);
}
function isExpNamespace(name) {
  return /Klamz_uv_Death_DJ_02/i.test(name);
}
function simplifyName(name) {
  let s = name.replace(/^Mixer[\s_]+/, "");
  const expMatch = s.match(/Klamz_uv_Death_DJ_02mixer_EXP(.+)/);
  if (expMatch) s = expMatch[1];
  s = s.replace(/FBXASC032/g, " ").trim();
  const controlRe = /^(knob|fader|hfader|button|window)\d*$/;
  let stripped = s;
  while (!controlRe.test(stripped) && /_\d+$/.test(stripped)) {
    stripped = stripped.replace(/_\d+$/, "");
  }
  if (controlRe.test(stripped)) return stripped;
  return s;
}
function getControlName(mesh) {
  const isExp = isExpNamespace(mesh.name) || mesh.parent != null && isExpNamespace(mesh.parent.name);
  const selfName = simplifyName(mesh.name);
  const parentName = mesh.parent ? simplifyName(mesh.parent.name) : "";
  const controlRe = /^(knob|fader|hfader|button|window)\d*$/;
  let base = selfName;
  if (!controlRe.test(base) && controlRe.test(parentName)) base = parentName;
  if (isExp && controlRe.test(base)) return "exp_" + base;
  return base;
}
function MixerScene({ viewRef }) {
  const { scene: gltfScene } = useGLTF(MODEL_PATH);
  const { camera, scene: threeScene, invalidate } = useThree();
  const activeKnobRef = reactExports.useRef(null);
  const activeFaderRef = reactExports.useRef(null);
  const dragStartRef = reactExports.useRef({ x: 0, y: 0 });
  const dragStartValueRef = reactExports.useRef(0);
  const { knobControls, faderControls, buttonControls } = reactExports.useMemo(() => {
    const store = useDJStore.getState;
    const knobs = [
      // CH-1 (Deck A) strip — x ~ -9.6
      {
        meshName: "knob2",
        label: "CH1 Trim",
        action: (v) => setDeckTrimGain("A", v),
        readValue: () => store().decks.A.trimGain,
        min: -12,
        max: 12,
        defaultValue: 0,
        centerDetent: true
      },
      {
        meshName: "knob3",
        label: "CH1 EQ High",
        action: (v) => setDeckEQ("A", "high", v),
        readValue: () => store().decks.A.eqHigh,
        min: -24,
        max: 6,
        defaultValue: 0,
        centerDetent: true
      },
      {
        meshName: "knob4",
        label: "CH1 EQ Mid",
        action: (v) => setDeckEQ("A", "mid", v),
        readValue: () => store().decks.A.eqMid,
        min: -24,
        max: 6,
        defaultValue: 0,
        centerDetent: true
      },
      {
        meshName: "knob5",
        label: "CH1 EQ Low",
        action: (v) => setDeckEQ("A", "low", v),
        readValue: () => store().decks.A.eqLow,
        min: -24,
        max: 6,
        defaultValue: 0,
        centerDetent: true
      },
      // CH-2 (Deck B) strip — x ~ 3.3
      {
        meshName: "knob13",
        label: "CH2 Trim",
        action: (v) => setDeckTrimGain("B", v),
        readValue: () => store().decks.B.trimGain,
        min: -12,
        max: 12,
        defaultValue: 0,
        centerDetent: true
      },
      {
        meshName: "knob12",
        label: "CH2 EQ High",
        action: (v) => setDeckEQ("B", "high", v),
        readValue: () => store().decks.B.eqHigh,
        min: -24,
        max: 6,
        defaultValue: 0,
        centerDetent: true
      },
      {
        meshName: "knob11",
        label: "CH2 EQ Mid",
        action: (v) => setDeckEQ("B", "mid", v),
        readValue: () => store().decks.B.eqMid,
        min: -24,
        max: 6,
        defaultValue: 0,
        centerDetent: true
      },
      {
        meshName: "knob10",
        label: "CH2 EQ Low",
        action: (v) => setDeckEQ("B", "low", v),
        readValue: () => store().decks.B.eqLow,
        min: -24,
        max: 6,
        defaultValue: 0,
        centerDetent: true
      },
      // Center column — x ~ -3.2
      {
        meshName: "knob9",
        label: "Cue/Mix",
        action: (v) => store().setCueMix(v),
        readValue: () => store().cueMix,
        min: 0,
        max: 1,
        defaultValue: 0.5,
        centerDetent: true
      },
      {
        meshName: "knob8",
        label: "Headphone Level",
        action: (v) => store().setCueVolume(v),
        readValue: () => store().cueVolume,
        min: 0,
        max: 1.5,
        defaultValue: 1
      },
      {
        meshName: "knob7",
        label: "Master Level",
        action: (v) => setMasterVolume(v),
        readValue: () => store().masterVolume,
        min: 0,
        max: 1.5,
        defaultValue: 1
      },
      {
        meshName: "knob6",
        label: "Booth Level",
        action: (v) => setBoothVolume(v),
        readValue: () => store().boothVolume,
        min: 0,
        max: 1.5,
        defaultValue: 1
      },
      // Far-left — crossfader curve controls
      {
        meshName: "knob",
        label: "CF Curve",
        action: (v) => {
          const curve = v < 0.33 ? "cut" : v < 0.66 ? "smooth" : "linear";
          setCrossfaderCurve(curve);
        },
        readValue: () => {
          const c = store().crossfaderCurve;
          return c === "cut" ? 0.17 : c === "smooth" ? 0.5 : 0.83;
        },
        min: 0,
        max: 1,
        defaultValue: 0.5
      },
      {
        meshName: "knob1",
        label: "CF Reverse",
        action: (v) => store().setHamsterSwitch(v > 0.5),
        readValue: () => store().hamsterSwitch ? 1 : 0,
        min: 0,
        max: 1,
        defaultValue: 0
      },
      // Far-right — headphone / monitor
      {
        meshName: "knob15",
        label: "Filter",
        action: (v) => {
          const pos = (v - 0.5) * 2;
          setDeckFilter("A", pos);
          setDeckFilter("B", pos);
        },
        readValue: () => (store().decks.A.filterPosition + 1) / 2,
        min: 0,
        max: 1,
        defaultValue: 0.5,
        centerDetent: true
      }
    ];
    const faders = [
      {
        meshName: "exp_fader1",
        label: "CH1 Volume",
        axis: "y",
        dragAxis: "y",
        travel: 5,
        defaultValue: 0.75,
        action: (v) => setDeckVolume("A", v),
        readValue: () => store().decks.A.volume,
        min: 0,
        max: 1.5
      },
      {
        meshName: "fader1",
        label: "CH2 Volume",
        axis: "y",
        dragAxis: "y",
        travel: 5,
        defaultValue: 0.75,
        action: (v) => setDeckVolume("B", v),
        readValue: () => store().decks.B.volume,
        min: 0,
        max: 1.5
      },
      {
        meshName: "fader4",
        label: "Master Volume",
        axis: "y",
        dragAxis: "y",
        travel: 5,
        defaultValue: 0.75,
        action: (v) => setMasterVolume(v),
        readValue: () => store().masterVolume,
        min: 0,
        max: 1.5
      },
      {
        meshName: "hfader1",
        label: "Crossfader",
        axis: "x",
        dragAxis: "x",
        travel: 4,
        defaultValue: 0.5,
        action: (v) => {
          const hamster = store().hamsterSwitch;
          const pos = hamster ? 1 - v : v;
          setCrossfader(pos);
        },
        readValue: () => {
          const hamster = store().hamsterSwitch;
          const pos = store().crossfaderPosition;
          return hamster ? 1 - pos : pos;
        },
        min: 0,
        max: 1
      },
      {
        meshName: "exp_hfader1",
        label: "Crossfader Alt",
        axis: "x",
        dragAxis: "x",
        travel: 4,
        defaultValue: 0.5,
        action: (v) => {
          const hamster = store().hamsterSwitch;
          const pos = hamster ? 1 - v : v;
          setCrossfader(pos);
        },
        readValue: () => {
          const hamster = store().hamsterSwitch;
          const pos = store().crossfaderPosition;
          return hamster ? 1 - pos : pos;
        },
        min: 0,
        max: 1
      },
      {
        meshName: "knob14",
        label: "CF Monitor",
        axis: "x",
        dragAxis: "x",
        travel: 3,
        defaultValue: 1,
        action: (v) => store().setSessionMonitorVolume(v),
        readValue: () => store().sessionMonitorVolume,
        min: 0,
        max: 1.5
      }
    ];
    const buttons = [
      {
        meshName: "button1",
        label: "CUE CH1",
        action: () => togglePFL("A"),
        readActive: () => store().decks.A.pflEnabled
      },
      {
        meshName: "button2",
        label: "CUE CH2",
        action: () => togglePFL("B"),
        readActive: () => store().decks.B.pflEnabled
      },
      {
        meshName: "exp_button1",
        label: "CUE CH1 Alt",
        action: () => togglePFL("A"),
        readActive: () => store().decks.A.pflEnabled
      },
      {
        meshName: "exp_button2",
        label: "CUE CH2 Alt",
        action: () => togglePFL("B"),
        readActive: () => store().decks.B.pflEnabled
      }
    ];
    return { knobControls: knobs, faderControls: faders, buttonControls: buttons };
  }, []);
  const knobMap = reactExports.useMemo(() => {
    const map = /* @__PURE__ */ new Map();
    for (const k of knobControls) map.set(k.meshName, k);
    return map;
  }, [knobControls]);
  const faderMap = reactExports.useMemo(() => {
    const map = /* @__PURE__ */ new Map();
    for (const f of faderControls) map.set(f.meshName, f);
    return map;
  }, [faderControls]);
  const buttonMap = reactExports.useMemo(() => {
    const map = /* @__PURE__ */ new Map();
    for (const b of buttonControls) map.set(b.meshName, b);
    return map;
  }, [buttonControls]);
  const { sceneGroup, meshRegistry } = reactExports.useMemo(() => {
    const cloned = gltfScene.clone(true);
    const registry = /* @__PURE__ */ new Map();
    cloned.traverse((child) => {
      if (!("isMesh" in child && child.isMesh)) return;
      const mesh = child;
      const sName = getControlName(mesh);
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      const center = new Vector3();
      box.getCenter(center);
      let type = "static";
      if (sName.startsWith("knob") || sName.startsWith("exp_knob")) {
        type = "knob";
      } else if (/^(exp_)?fader\d+$/.test(sName)) {
        type = "fader";
      } else if (/^(exp_)?hfader\d+$/.test(sName)) {
        type = "hfader";
      } else if (sName.startsWith("button") || sName.startsWith("exp_button")) {
        type = "button";
      } else if (sName === "window" || sName === "exp_window") {
        type = "vu";
      }
      mesh.updateMatrix();
      const existing = registry.get(sName);
      if (existing) {
        existing.meshes.push(mesh);
        existing.restMatrices.push(mesh.matrix.clone());
      } else {
        registry.set(sName, {
          meshes: [mesh],
          restMatrices: [mesh.matrix.clone()],
          center,
          type
        });
      }
      if (mesh.material && "metalness" in mesh.material) {
        const m = mesh.material;
        const name = m.name || "";
        mesh.material = m.clone();
        const mc = mesh.material;
        if (name.includes("Cylinder06")) {
          mc.metalness = 0.15;
          mc.roughness = 0.4;
          mc.color.set(13421772);
        } else if (name.includes("FaceplateSG")) {
          mc.metalness = 0.15;
          mc.roughness = 0.4;
          mc.color.set(8947848);
        } else if (name.includes("windowSG")) {
          mc.emissive = new Color(2121932);
          mc.emissiveIntensity = 0.5;
          mc.roughness = 0.2;
        } else if (name.includes("pCylinder1SG")) {
          mc.metalness = 0.3;
          mc.roughness = 0.5;
        } else if (name.includes("BoxFBX") || name.includes("OuterSG")) {
          mc.metalness = 0.05;
          mc.roughness = 0.5;
        } else if (name.includes("fader")) {
          mc.metalness = 0.7;
          mc.roughness = 0.2;
        } else if (name.includes("knobSG")) {
          mc.color.set(1710618);
          mc.metalness = 0.1;
          mc.roughness = 0.75;
        } else if (name.includes("polySurface1SG")) {
          mc.metalness = 0.1;
          mc.roughness = 0.6;
          mc.color.set(1118481);
        } else if (name.includes("Cylinder05") || name.includes("polySurface") || name.includes("pCylinder7")) {
          mc.metalness = 0.6;
          mc.roughness = 0.35;
        } else if (name.includes("Rectangle01")) {
          mc.metalness = 0.5;
          mc.roughness = 0.4;
        } else {
          mc.metalness = 0.4;
          mc.roughness = 0.45;
        }
      }
      if (type === "knob" || type === "fader" || type === "hfader") {
        mesh.matrixAutoUpdate = false;
      }
      if (type !== "static" && type !== "vu") {
        mesh.userData.interactive = true;
        mesh.userData.controlName = sName;
      }
    });
    return { sceneGroup: cloned, meshRegistry: registry };
  }, [gltfScene]);
  const vuCanvasRef = reactExports.useRef(null);
  const vuTextureRef = reactExports.useRef(null);
  const vuBaseImageRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    vuCanvasRef.current = canvas;
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace$1;
    vuTextureRef.current = tex;
    const img = new Image();
    img.src = "/models/vestax/Textures/InputLevel.jpg";
    img.onload = () => {
      vuBaseImageRef.current = img;
    };
    const vuEntry = meshRegistry.get("window");
    if (vuEntry) {
      for (const mesh of vuEntry.meshes) {
        const mat = mesh.material;
        mat.emissiveMap = tex;
        mat.emissive = new Color(16777215);
        mat.emissiveIntensity = 1.5;
        mat.needsUpdate = true;
      }
    }
    return () => {
      tex.dispose();
    };
  }, [meshRegistry]);
  reactExports.useEffect(() => {
    const loader = new TextureLoader();
    const texCache = /* @__PURE__ */ new Map();
    let pending = 0;
    const loadTex = (path, srgb, cb) => {
      const cached = texCache.get(path);
      if (cached) {
        cb(cached);
        return;
      }
      pending++;
      loader.load(path, (tex) => {
        tex.colorSpace = srgb ? SRGBColorSpace$1 : LinearSRGBColorSpace$1;
        texCache.set(path, tex);
        cb(tex);
        pending--;
        invalidate();
        if (pending === 0) setTimeout(() => invalidate(), 100);
      });
    };
    sceneGroup.traverse((child) => {
      if (!("isMesh" in child && child.isMesh)) return;
      const mc = child.material;
      if (!(mc == null ? void 0 : mc.name)) return;
      if (mc.name.includes("Cylinder06") && !mc.map) {
        loadTex("/models/vestax/Textures/Anis_Metal_Spec.jpg", true, (tex) => {
          mc.map = tex;
          mc.needsUpdate = true;
        });
      }
      if (mc.name.includes("FaceplateSG") && !mc.roughnessMap) {
        loadTex("/models/vestax/Textures/Anis_Metal_Spec.jpg", false, (tex) => {
          mc.roughnessMap = tex;
          mc.needsUpdate = true;
        });
      }
    });
  }, [sceneGroup, invalidate]);
  useFrame(() => {
    const store = useDJStore.getState();
    for (const [meshName, control] of knobMap) {
      const entry = meshRegistry.get(meshName);
      if (!entry || entry.meshes.length === 0) continue;
      const value = control.readValue();
      const normalized = (value - control.min) / (control.max - control.min);
      const angle = KNOB_MIN_ANGLE + normalized * KNOB_RANGE;
      makeRotationAroundPivotY(angle, entry.center, _knobCompositeMat);
      for (let i = 0; i < entry.meshes.length; i++) {
        const mesh = entry.meshes[i];
        mesh.matrix.copy(entry.restMatrices[i]).multiply(_knobCompositeMat);
        mesh.matrixWorldNeedsUpdate = true;
      }
    }
    for (const [meshName, control] of faderMap) {
      const entry = meshRegistry.get(meshName);
      if (!entry || entry.meshes.length === 0) continue;
      const value = control.readValue();
      const normalized = (value - control.min) / (control.max - control.min);
      const defaultNorm = (control.defaultValue - control.min) / (control.max - control.min);
      const delta = normalized - defaultNorm;
      if (control.axis === "x") {
        _faderTransMat.makeTranslation(delta * control.travel, 0, 0);
      } else if (control.axis === "y") {
        _faderTransMat.makeTranslation(0, delta * control.travel, 0);
      } else {
        _faderTransMat.makeTranslation(0, 0, delta * control.travel);
      }
      for (let i = 0; i < entry.meshes.length; i++) {
        const mesh = entry.meshes[i];
        mesh.matrix.copy(entry.restMatrices[i]).multiply(_faderTransMat);
        mesh.matrixWorldNeedsUpdate = true;
      }
    }
    const canvas = vuCanvasRef.current;
    const vuTex = vuTextureRef.current;
    const baseImg = vuBaseImageRef.current;
    if (canvas && vuTex) {
      const ctx = canvas.getContext("2d");
      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      if (baseImg) ctx.drawImage(baseImg, 0, 0, W, H);
      const segmentDbValues = [-20, -10, -6, -3, 0, 3, 6];
      const segY0 = 0.625;
      const segY6 = 0.44;
      const segH = 0.018;
      const pgm1X = [0.375, 0.385, 0.43, 0.45];
      const pgm2X = [0.535, 0.545, 0.57, 0.58];
      let peakA = -60, peakB = -60;
      try {
        const engine = getDJEngine();
        if (store.decks.A.isPlaying) peakA = engine.getDeck("A").getLevel();
        if (store.decks.B.isPlaying) peakB = engine.getDeck("B").getLevel();
      } catch {
      }
      for (let i = 0; i < 7; i++) {
        const db = segmentDbValues[i];
        const t = i / 6;
        const cy = (segY0 + (segY6 - segY0) * t) * H;
        let ledColor;
        if (db >= 3) ledColor = "#ff2200";
        else if (db >= 0) ledColor = "#ffaa00";
        else ledColor = "#00dd44";
        const litA = peakA >= db;
        if (litA) {
          ctx.fillStyle = ledColor;
          ctx.fillRect(pgm1X[0] * W, cy - segH * H / 2, (pgm1X[1] - pgm1X[0]) * W, segH * H);
          ctx.fillRect(pgm1X[2] * W, cy - segH * H / 2, (pgm1X[3] - pgm1X[2]) * W, segH * H);
        }
        const litB = peakB >= db;
        if (litB) {
          ctx.fillStyle = ledColor;
          ctx.fillRect(pgm2X[0] * W, cy - segH * H / 2, (pgm2X[1] - pgm2X[0]) * W, segH * H);
          ctx.fillRect(pgm2X[2] * W, cy - segH * H / 2, (pgm2X[3] - pgm2X[2]) * W, segH * H);
        }
      }
      vuTex.needsUpdate = true;
    }
    for (const [meshName, control] of buttonMap) {
      const entry = meshRegistry.get(meshName);
      if (!entry) continue;
      const active = control.readActive();
      for (const mesh of entry.meshes) {
        const mat = mesh.material;
        if (mat.emissive) {
          mat.emissive.setRGB(active ? 1 : 0.1, active ? 0.4 : 0.1, active ? 0.1 : 0.1);
          mat.emissiveIntensity = active ? 1.5 : 0.2;
        }
      }
    }
  });
  const scene = threeScene;
  const raycaster = reactExports.useMemo(() => new Raycaster(), []);
  const pointer = reactExports.useMemo(() => new Vector2(), []);
  const findControl = reactExports.useCallback((hitObj) => {
    let obj = hitObj;
    while (obj) {
      if (obj.userData.controlName) return obj.userData.controlName;
      obj = obj.parent;
    }
    return null;
  }, []);
  const raycastControl = reactExports.useCallback((e) => {
    var _a;
    const rect = (_a = viewRef.current) == null ? void 0 : _a.getBoundingClientRect();
    if (!rect) return null;
    pointer.x = (e.clientX - rect.left) / rect.width * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const hit of hits) {
      const name = findControl(hit.object);
      if (name) return name;
    }
    return null;
  }, [viewRef, camera, scene, raycaster, pointer, findControl]);
  reactExports.useEffect(() => {
    const target = viewRef.current;
    if (!target) return;
    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      const controlName = raycastControl(e);
      if (!controlName) return;
      const button = buttonMap.get(controlName);
      if (button) {
        button.action();
        return;
      }
      const knob = knobMap.get(controlName);
      if (knob) {
        activeKnobRef.current = controlName;
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        dragStartValueRef.current = knob.readValue();
        return;
      }
      const fader = faderMap.get(controlName);
      if (fader) {
        activeFaderRef.current = controlName;
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        dragStartValueRef.current = fader.readValue();
      }
    };
    const onDblClick = (e) => {
      const controlName = raycastControl(e);
      if (!controlName) return;
      const knob = knobMap.get(controlName);
      if (knob) {
        knob.action(knob.defaultValue);
        return;
      }
      const fader = faderMap.get(controlName);
      if (fader) fader.action(fader.defaultValue);
    };
    const onPointerMove = (e) => {
      const knobName = activeKnobRef.current;
      if (knobName) {
        const knob = knobMap.get(knobName);
        if (!knob) return;
        const dy = dragStartRef.current.y - e.clientY;
        const delta = dy / 150 * (knob.max - knob.min);
        let newVal = Math.max(knob.min, Math.min(knob.max, dragStartValueRef.current + delta));
        if (knob.centerDetent) {
          const detent = knob.defaultValue;
          const snapRange = (knob.max - knob.min) * 0.02;
          if (Math.abs(newVal - detent) < snapRange) newVal = detent;
        }
        knob.action(newVal);
        return;
      }
      const faderName = activeFaderRef.current;
      if (faderName) {
        const fader = faderMap.get(faderName);
        if (!fader) return;
        const d = fader.dragAxis === "x" ? e.clientX - dragStartRef.current.x : dragStartRef.current.y - e.clientY;
        const delta = d / 150 * (fader.max - fader.min);
        fader.action(Math.max(fader.min, Math.min(fader.max, dragStartValueRef.current + delta)));
      }
    };
    const onPointerUp = () => {
      activeKnobRef.current = null;
      activeFaderRef.current = null;
    };
    target.addEventListener("pointerdown", onPointerDown);
    target.addEventListener("dblclick", onDblClick);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      target.removeEventListener("pointerdown", onPointerDown);
      target.removeEventListener("dblclick", onDblClick);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [viewRef, raycastControl, knobMap, faderMap, buttonMap]);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("group", { scale: [MODEL_SCALE, MODEL_SCALE, MODEL_SCALE], children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("primitive", { object: sceneGroup }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerVestax3DView.tsx",
    lineNumber: 822,
    columnNumber: 7
  }, this) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/MixerVestax3DView.tsx",
    lineNumber: 821,
    columnNumber: 5
  }, this);
}
useGLTF.preload(MODEL_PATH);
const DEFAULT_CAM_POS = [0, 0.55, 0.65];
const DEFAULT_CAM_TARGET = [0, 0, -0.02];
const CameraButtons = ({ orbitRef }) => {
  const dragMode = reactExports.useRef(null);
  const lastPos = reactExports.useRef({ x: 0, y: 0 });
  const onDragStart = reactExports.useCallback((mode, e) => {
    e.preventDefault();
    e.stopPropagation();
    dragMode.current = mode;
    lastPos.current = { x: e.clientX, y: e.clientY };
    e.target.setPointerCapture(e.pointerId);
  }, []);
  const onDragMove = reactExports.useCallback((e) => {
    if (!dragMode.current) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    const c = orbitRef.current;
    if (!c) return;
    switch (dragMode.current) {
      case "rotate":
        c.setAzimuthalAngle(c.getAzimuthalAngle() - dx * 8e-3);
        c.setPolarAngle(c.getPolarAngle() + dy * 8e-3);
        c.update();
        break;
      case "pan": {
        const cam = c.object;
        const forward = new Vector3();
        cam.getWorldDirection(forward);
        const right = new Vector3().crossVectors(cam.up, forward).normalize();
        const up = new Vector3().crossVectors(forward, right).normalize();
        const offset = right.multiplyScalar(dx * 2e-3).addScaledVector(up, dy * 2e-3);
        c.target.add(offset);
        cam.position.add(offset);
        c.update();
        break;
      }
      case "zoom": {
        const dir = c.object.position.clone().sub(c.target).normalize();
        c.object.position.addScaledVector(dir, dy * 0.01);
        c.update();
        break;
      }
    }
  }, [orbitRef]);
  const onDragEnd = reactExports.useCallback((e) => {
    if (dragMode.current) {
      e.target.releasePointerCapture(e.pointerId);
      dragMode.current = null;
    }
  }, []);
  const resetView = reactExports.useCallback(() => {
    const c = orbitRef.current;
    if (!c) return;
    c.target.set(...DEFAULT_CAM_TARGET);
    c.object.position.set(...DEFAULT_CAM_POS);
    c.update();
  }, [orbitRef]);
  const pad = "w-10 h-10 flex items-center justify-center rounded bg-black/50 hover:bg-white/20 text-white/70 hover:text-text-primary text-[10px] leading-tight select-none cursor-grab active:cursor-grabbing border border-white/10 transition-colors touch-none";
  const btn = "w-10 h-6 flex items-center justify-center rounded bg-black/50 hover:bg-white/20 text-white/70 hover:text-text-primary text-[10px] select-none cursor-pointer border border-white/10 transition-colors";
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
    "div",
    {
      className: "absolute bottom-2 right-2 flex flex-col gap-0.5 z-10 pointer-events-auto",
      onPointerDown: (e) => e.stopPropagation(),
      children: [
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: pad,
            title: "Drag to rotate",
            onPointerDown: (e) => onDragStart("rotate", e),
            onPointerMove: onDragMove,
            onPointerUp: onDragEnd,
            onPointerCancel: onDragEnd,
            children: "Orbit"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
            lineNumber: 101,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: pad,
            title: "Drag to pan",
            onPointerDown: (e) => onDragStart("pan", e),
            onPointerMove: onDragMove,
            onPointerUp: onDragEnd,
            onPointerCancel: onDragEnd,
            children: "Pan"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
            lineNumber: 109,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
          "div",
          {
            className: pad,
            title: "Drag up/down to zoom",
            onPointerDown: (e) => onDragStart("zoom", e),
            onPointerMove: onDragMove,
            onPointerUp: onDragEnd,
            onPointerCancel: onDragEnd,
            children: "Zoom"
          },
          void 0,
          false,
          {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
            lineNumber: 117,
            columnNumber: 7
          },
          void 0
        ),
        /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("button", { className: btn, title: "Reset camera", onClick: resetView, children: "Reset" }, void 0, false, {
          fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
          lineNumber: 125,
          columnNumber: 7
        }, void 0)
      ]
    },
    void 0,
    true,
    {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
      lineNumber: 97,
      columnNumber: 5
    },
    void 0
  );
};
function DemandInvalidator() {
  const { invalidate } = useThree();
  const invalidateRef = reactExports.useRef(invalidate);
  invalidateRef.current = invalidate;
  reactExports.useEffect(() => {
    let id;
    const poll = () => {
      const decks = useDJStore.getState().decks;
      if (decks.A.isPlaying || decks.B.isPlaying || decks.C.isPlaying) {
        invalidateRef.current();
      }
    };
    id = setInterval(poll, 33);
    return () => clearInterval(id);
  }, []);
  return null;
}
const UnifiedDJScene = ({ orbitRef, canvasContainerRef, thirdDeckActive }) => {
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(jsxDevRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      PerspectiveCamera,
      {
        makeDefault: true,
        position: DEFAULT_CAM_POS,
        fov: 50,
        near: 0.01,
        far: 20
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
        lineNumber: 165,
        columnNumber: 7
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("ambientLight", { intensity: 0.3 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
      lineNumber: 174,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("directionalLight", { position: [2, 5, 3], intensity: 0.8 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
      lineNumber: 175,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("directionalLight", { position: [-2, 3, -1], intensity: 0.3 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
      lineNumber: 176,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("spotLight", { position: [0, 4, 1], intensity: 1.5, angle: 0.5, penumbra: 0.6 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
      lineNumber: 177,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("pointLight", { position: [0, 0.1, 0], color: "#4488ff", intensity: 0.6, distance: 1, decay: 2 }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
      lineNumber: 178,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("group", { position: [-0.4, 0, 0], children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TurntableScene, { deckId: "A", orbitRef, embedded: true }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
      lineNumber: 182,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
      lineNumber: 181,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("group", { position: [0, 0.15, 0], children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(MixerScene, { viewRef: canvasContainerRef }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
      lineNumber: 187,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
      lineNumber: 186,
      columnNumber: 7
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("group", { position: [0.4, 0, 0], children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TurntableScene, { deckId: "B", orbitRef, embedded: true }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
      lineNumber: 192,
      columnNumber: 9
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
      lineNumber: 191,
      columnNumber: 7
    }, void 0),
    thirdDeckActive && /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("group", { position: [0.85, 0, 0], children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(TurntableScene, { deckId: "C", orbitRef, embedded: true }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
      lineNumber: 198,
      columnNumber: 11
    }, void 0) }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
      lineNumber: 197,
      columnNumber: 9
    }, void 0),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      OrbitControls2,
      {
        ref: orbitRef,
        target: DEFAULT_CAM_TARGET,
        enableDamping: true,
        dampingFactor: 0.1,
        minPolarAngle: Math.PI * 0.05,
        maxPolarAngle: Math.PI * 0.48,
        minDistance: 0.15,
        maxDistance: 3,
        mouseButtons: {
          LEFT: void 0,
          MIDDLE: void 0,
          RIGHT: void 0
        }
      },
      void 0,
      false,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
        lineNumber: 203,
        columnNumber: 7
      },
      void 0
    )
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
    lineNumber: 163,
    columnNumber: 5
  }, void 0);
};
const DJ3DOverlay = () => {
  const thirdDeckActive = useDJStore((s) => s.thirdDeckActive);
  const orbitRef = reactExports.useRef(null);
  const canvasContainerRef = reactExports.useRef(null);
  return /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { ref: canvasContainerRef, className: "w-full h-full relative", style: { touchAction: "none" }, children: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(reactExports.Suspense, { fallback: /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("div", { className: "flex items-center justify-center w-full h-full text-text-muted text-sm", children: "Loading 3D scene..." }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
    lineNumber: 231,
    columnNumber: 9
  }, void 0), children: [
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
      Canvas,
      {
        style: { position: "absolute", inset: 0 },
        gl: { antialias: true, alpha: false, powerPreference: "low-power" },
        dpr: [1, 1.5],
        frameloop: "demand",
        children: [
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV("color", { attach: "background", args: ["#0a0a0a"] }, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
            lineNumber: 241,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(DemandInvalidator, {}, void 0, false, {
            fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
            lineNumber: 242,
            columnNumber: 11
          }, void 0),
          /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(
            UnifiedDJScene,
            {
              orbitRef,
              canvasContainerRef,
              thirdDeckActive
            },
            void 0,
            false,
            {
              fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
              lineNumber: 243,
              columnNumber: 11
            },
            void 0
          )
        ]
      },
      void 0,
      true,
      {
        fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
        lineNumber: 235,
        columnNumber: 9
      },
      void 0
    ),
    /* @__PURE__ */ jsxDevRuntimeExports.jsxDEV(CameraButtons, { orbitRef }, void 0, false, {
      fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
      lineNumber: 249,
      columnNumber: 9
    }, void 0)
  ] }, void 0, true, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
    lineNumber: 230,
    columnNumber: 7
  }, void 0) }, void 0, false, {
    fileName: "/Users/spot/Code/DEViLBOX/src/components/dj/DJ3DOverlay.tsx",
    lineNumber: 229,
    columnNumber: 5
  }, void 0);
};
export {
  DJ3DOverlay
};
