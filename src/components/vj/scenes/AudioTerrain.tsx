/**
 * AudioTerrain — 3D terrain mesh deformed by audio frequencies.
 *
 * A grid plane where vertex heights respond to bass (large waves),
 * mid (detail), and high (shimmer). Camera flies forward continuously.
 */

import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { VJSceneProps } from './types';

const GRID_SIZE = 80;
const GRID_SEGMENTS = GRID_SIZE - 1;

export const AudioTerrain: React.FC<VJSceneProps> = ({ audioRef }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(20, 40, GRID_SEGMENTS, GRID_SEGMENTS * 2);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uBass: { value: 0 },
    uMid: { value: 0 },
    uHigh: { value: 0 },
    uBeat: { value: 0 },
    uColor1: { value: new THREE.Color(0x0066ff) },
    uColor2: { value: new THREE.Color(0xff0066) },
  }), []);

  useFrame((state) => {
    const audio = audioRef.current;
    const mat = materialRef.current;
    if (!mat) return;

    mat.uniforms.uTime.value = state.clock.elapsedTime;
    if (audio) {
      mat.uniforms.uBass.value += (audio.bassEnergy - mat.uniforms.uBass.value) * 0.15;
      mat.uniforms.uMid.value += (audio.midEnergy - mat.uniforms.uMid.value) * 0.15;
      mat.uniforms.uHigh.value += (audio.highEnergy - mat.uniforms.uHigh.value) * 0.15;
      mat.uniforms.uBeat.value = audio.beat ? 1.0 : mat.uniforms.uBeat.value * 0.92;
    }

    // Move camera forward
    state.camera.position.z = -5 + Math.sin(state.clock.elapsedTime * 0.2) * 2;
    state.camera.position.y = 3 + (audio?.bassEnergy || 0) * 1.5;
    state.camera.lookAt(0, 0, 5);
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={`
          uniform float uTime;
          uniform float uBass;
          uniform float uMid;
          uniform float uHigh;
          uniform float uBeat;
          varying float vHeight;
          varying vec2 vUv;
          
          float noise(vec2 p) {
            return sin(p.x * 1.0 + uTime) * cos(p.y * 0.8 - uTime * 0.7);
          }
          
          void main() {
            vUv = uv;
            vec3 pos = position;
            
            // Bass: large rolling waves
            float bass = sin(pos.z * 0.5 + uTime * 2.0) * uBass * 2.0;
            bass += cos(pos.x * 0.3 + uTime) * uBass * 1.0;
            
            // Mid: medium detail
            float mid = noise(pos.xz * 0.5) * uMid * 1.0;
            
            // High: fine shimmer
            float high = sin(pos.x * 3.0 + pos.z * 2.0 + uTime * 4.0) * uHigh * 0.3;
            
            // Beat: pulse
            float beat = sin(length(pos.xz) * 2.0 - uTime * 6.0) * uBeat * 0.5;
            
            pos.y += bass + mid + high + beat;
            vHeight = pos.y;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform float uBass;
          uniform float uBeat;
          uniform vec3 uColor1;
          uniform vec3 uColor2;
          varying float vHeight;
          varying vec2 vUv;
          
          void main() {
            // Grid lines
            vec2 grid = abs(fract(vUv * 40.0) - 0.5);
            float line = smoothstep(0.02, 0.0, min(grid.x, grid.y));
            
            // Height-based coloring
            float h = clamp(vHeight * 0.3 + 0.5, 0.0, 1.0);
            vec3 col = mix(uColor1, uColor2, h);
            
            // Wire + glow
            vec3 wire = col * (0.3 + line * 0.7);
            wire += col * line * (0.5 + uBeat * 0.5);
            
            float alpha = 0.3 + line * 0.7;
            gl_FragColor = vec4(wire, alpha);
          }
        `}
        transparent
        side={THREE.DoubleSide}
        wireframe={false}
      />
    </mesh>
  );
};
