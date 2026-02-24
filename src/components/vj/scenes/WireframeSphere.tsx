/**
 * WireframeSphere — Pulsing wireframe sphere with audio-reactive distortion.
 *
 * Classic VJ staple: a sphere that breathes with bass and distorts with mids.
 */

import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { VJSceneProps } from './types';

export const WireframeSphere: React.FC<VJSceneProps> = ({ audioRef }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1.5, 4), []);

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
    const mesh = meshRef.current;
    if (!mat || !mesh) return;

    mat.uniforms.uTime.value = state.clock.elapsedTime;
    mesh.rotation.y = state.clock.elapsedTime * 0.15;
    mesh.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.2;

    if (audio) {
      const bass = Math.min(1, (audio.bassEnergy + audio.subEnergy) * 2.5);
      const mid = Math.min(1, audio.midEnergy * 3);
      const high = Math.min(1, audio.highEnergy * 3);
      mat.uniforms.uBass.value += (bass - mat.uniforms.uBass.value) * 0.4;
      mat.uniforms.uMid.value += (mid - mat.uniforms.uMid.value) * 0.4;
      mat.uniforms.uHigh.value += (high - mat.uniforms.uHigh.value) * 0.4;
      mat.uniforms.uBeat.value = audio.beat ? 1.0 : mat.uniforms.uBeat.value * 0.85;
    }
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
          uniform float uBeat;
          varying vec3 vNormal;
          varying float vDisplacement;
          
          void main() {
            vNormal = normal;
            
            // Bass: breathing
            float breath = 1.0 + uBass * 0.8 + uBeat * 0.5;
            
            // Mid: vertex displacement
            float disp = sin(position.x * 3.0 + uTime * 2.0) * 
                         cos(position.y * 2.0 - uTime * 1.5) * 
                         sin(position.z * 2.5 + uTime) * uMid * 0.8;
            
            vec3 pos = position * breath + normal * disp;
            vDisplacement = disp;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform float uBass;
          uniform float uMid;
          uniform float uHigh;
          uniform float uBeat;
          varying vec3 vNormal;
          varying float vDisplacement;
          
          void main() {
            vec3 n = normalize(vNormal);
            float fresnel = pow(1.0 - abs(dot(n, vec3(0.0, 0.0, 1.0))), 2.0);
            
            vec3 col = vec3(
              0.1 + fresnel * 0.5 + uBass * 0.6,
              0.2 + fresnel * 0.3 + uMid * 0.7,
              0.8 + fresnel * 0.2 + uHigh * 0.4
            );
            
            col += vec3(0.3, 0.1, 0.5) * abs(vDisplacement) * 5.0;
            col += vec3(1.0) * uBeat * fresnel * 0.8;
            
            gl_FragColor = vec4(col, 0.7 + fresnel * 0.3);
          }
        `}
        transparent
        wireframe
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};
