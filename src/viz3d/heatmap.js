// Barevný řez pobytovou zónou (a svislý řez rychlostí) – shader s rampou a izolinií limitu.
import * as THREE from 'three';
import { HEAT_KINDS, RAMP_VELOCITY, rampBytes } from '../viz/colormaps.js';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FRAG = /* glsl */ `
  uniform sampler2D uField;
  uniform sampler2D uRamp;
  uniform float uLevel;
  uniform float uOpacity;
  uniform float uAlphaByValue;
  uniform vec2 uGrid;
  varying vec2 vUv;
  void main() {
    float v = texture2D(uField, vUv).r;
    vec3 c = texture2D(uRamp, vec2(clamp(v, 0.002, 0.998), 0.5)).rgb;
    float a = uOpacity * mix(1.0, 0.1 + 0.9 * smoothstep(0.06, 0.62, v), uAlphaByValue);
    // jemná 1m síť
    vec2 gp = vUv * uGrid;
    vec2 gd = abs(fract(gp - 0.5) - 0.5) / fwidth(gp);
    float grid = 1.0 - min(min(gd.x, gd.y), 1.0);
    c = mix(c, vec3(1.0), grid * 0.08);
    if (uLevel > 0.0) {
      float d = abs(v - uLevel) / max(fwidth(v), 1e-4);
      float line = 1.0 - smoothstep(0.7, 1.7, d);
      c = mix(c, vec3(1.0), line);
      a = max(a, line * 0.95);
    }
    gl_FragColor = vec4(c, a);
  }
`;

function rampTexture(ramp) {
  const t = new THREE.DataTexture(rampBytes(ramp), 256, 1, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export class HeatSlice {
  constructor(inp) {
    this.inp = inp;
    this.fieldTex = null;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uField: { value: null },
        uRamp: { value: rampTexture(RAMP_VELOCITY) },
        uLevel: { value: 0 },
        uOpacity: { value: 0.8 },
        uAlphaByValue: { value: 1 },
        uGrid: { value: new THREE.Vector2(inp.L, inp.W) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const g = new THREE.PlaneGeometry(inp.L, inp.W);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = inp.oz;
    this.mesh.renderOrder = 5;
    this.kind = null;
  }

  /** map = {nx, ny, u, t, dr}; kind = 'velocity' | 'dr' | 'temp' */
  set(map, kind, limits) {
    const K = HEAT_KINDS[kind];
    this.kind = kind;
    const n = map.nx * map.ny;
    const data = new Uint8Array(n * 4);
    const src = kind === 'velocity' ? map.u : kind === 'dr' ? map.dr : map.t;
    const lo = K.relative ? this.inp.tr + K.min : K.min;
    const hi = K.relative ? this.inp.tr + K.max : K.max;
    // PlaneGeometry: u → +X (délka), v → +Y před rotací = −Z = y od 0 (řádek 0 = y 0 → v = 1)
    for (let j = 0; j < map.ny; j++) {
      for (let i = 0; i < map.nx; i++) {
        const k = j * map.nx + i;
        const v = Math.max(0, Math.min(1, (src[k] - lo) / (hi - lo)));
        const row = map.ny - 1 - j;
        const o = (row * map.nx + i) * 4;
        data[o] = Math.round(v * 255);
        data[o + 3] = 255;
      }
    }
    if (this.fieldTex) this.fieldTex.dispose();
    const t = new THREE.DataTexture(data, map.nx, map.ny, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    this.fieldTex = t;
    this.mat.uniforms.uField.value = t;
    this.mat.uniforms.uRamp.value.dispose();
    this.mat.uniforms.uRamp.value = rampTexture(K.ramp);
    let level = 0;
    if (kind === 'velocity' && limits?.v) level = (limits.v - lo) / (hi - lo);
    if (kind === 'dr' && limits?.dr) level = (limits.dr - lo) / (hi - lo);
    this.mat.uniforms.uLevel.value = level > 0 && level < 1 ? level : 0;
    this.mat.uniforms.uAlphaByValue.value = kind === 'temp' ? 0 : 1;
    this.mat.uniforms.uOpacity.value = kind === 'temp' ? 0.62 : 0.86;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    if (this.fieldTex) this.fieldTex.dispose();
  }
}

/** Svislý řez halou (rovina y–z uprostřed délky) – rychlostní pole modelu nebo živé CFD. */
export class SectionSlice {
  constructor(inp) {
    this.inp = inp;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uField: { value: null },
        uRamp: { value: rampTexture(RAMP_VELOCITY) },
        uLevel: { value: 0 },
        uOpacity: { value: 0.78 },
        uAlphaByValue: { value: 1 },
        uGrid: { value: new THREE.Vector2(inp.W, inp.H) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(inp.W, inp.H), this.mat);
    this.mesh.rotation.y = Math.PI / 2;
    this.mesh.position.set(0, inp.H / 2, 0);
    this.mesh.renderOrder = 6;
    this.tex = null;
  }

  /** field: {ny, nz, mag(Float32Array), solid?} rychlost 0–vmax */
  set(field, vmax = 1.0) {
    const { ny, nz } = field;
    if (!this.tex || this.tex.image.width !== ny || this.tex.image.height !== nz) {
      if (this.tex) this.tex.dispose();
      this.data = new Uint8Array(ny * nz * 4);
      this.tex = new THREE.DataTexture(this.data, ny, nz, THREE.RGBAFormat);
      this.tex.magFilter = THREE.LinearFilter;
      this.tex.minFilter = THREE.LinearFilter;
      this.mat.uniforms.uField.value = this.tex;
    }
    const d = this.data;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < ny; i++) {
        const k = j * ny + i;
        // PlaneGeometry (otočená o 90° kolem Y): u → −Z … přepočet: u = 1 − y/W
        const o = (j * ny + (ny - 1 - i)) * 4;
        const v = field.solid && field.solid[k] ? 0 : Math.min(1, field.mag[k] / vmax);
        d[o] = Math.round(v * 255);
        d[o + 3] = 255;
      }
    }
    this.tex.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    if (this.tex) this.tex.dispose();
  }
}
