/**
 * ReactiveParticles — Audio-reactive particle field scene.
 *
 * Thousands of particles orbit and pulse with bass, mid, and high frequencies.
 * Beat detection triggers expansion bursts.
 */

import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { VJSceneProps } from './types';

const PARTICLE_COUNT = 3000;

export const ReactiveParticles: React.FC<VJSceneProps> = ({ audioRef }) => {
  const meshRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const vel = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.5 + Math.random() * 2;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      vel[i * 3] = (Math.random() - 0.5) * 0.02;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
    }
    return { positions: pos, velocities: vel };
  }, []);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uBass: { value: 0 },
    uMid: { value: 0 },
    uHigh: { value: 0 },
    uBeat: { value: 0 },
  }), []);

  useFrame((state) => {
    const audio = audioRef.current;
    const mat = materialRef.current;
    if (!mat) return;

    mat.uniforms.uTime.value = state.clock.elapsedTime;
    if (audio) {
      mat.uniforms.uBass.value = audio.bassEnergy + audio.subEnergy * 0.5;
      mat.uniforms.uMid.value = audio.midEnergy;
      mat.uniforms.uHigh.value = audio.highEnergy;
      mat.uniforms.uBeat.value = audio.beat ? 1.0 : mat.uniforms.uBeat.value * 0.9;
    }

    // Animate positions
    const geo = meshRef.current?.geometry;
    if (geo) {
      const posAttr = geo.attributes.position as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const beat = mat.uniforms.uBeat.value;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        arr[i3] += velocities[i3] * (1 + beat * 3);
        arr[i3 + 1] += velocities[i3 + 1] * (1 + beat * 3);
        arr[i3 + 2] += velocities[i3 + 2] * (1 + beat * 3);

        // Pull back toward sphere
        const x = arr[i3], y = arr[i3 + 1], z = arr[i3 + 2];
        const dist = Math.sqrt(x * x + y * y + z * z);
        const targetR = 2.0 + (audio?.bassEnergy || 0) * 1.5;
        const pull = (dist - targetR) * 0.01;
        arr[i3] -= (x / dist) * pull;
        arr[i3 + 1] -= (y / dist) * pull;
        arr[i3 + 2] -= (z / dist) * pull;
      }
      posAttr.needsUpdate = true;
    }
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={`
          uniform float uTime;
          uniform float uBass;
          uniform float uBeat;
          varying float vLife;
          void main() {
            vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
            float dist = length(position);
            vLife = 1.0 - smoothstep(1.0, 4.0, dist);
            gl_PointSize = (3.0 + uBass * 4.0 + uBeat * 2.0) * (300.0 / -mvPos.z);
            gl_Position = projectionMatrix * mvPos;
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform float uBass;
          uniform float uMid;
          uniform float uHigh;
          varying float vLife;
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            if (d > 1.0) discard;
            float alpha = smoothstep(1.0, 0.3, d) * vLife;
            vec3 col = vec3(
              0.2 + uBass * 0.8,
              0.3 + uMid * 0.7,
              0.8 + uHigh * 0.2
            );
            gl_FragColor = vec4(col, alpha * 0.8);
          }
        `}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};
