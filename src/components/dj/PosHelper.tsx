/**
 * PosHelper — Debug tool for positioning 3D hitboxes.
 *
 * Click to select, arrow keys to move, Q/E to rotate.
 * Logs position/size/rotation to console on every change.
 *
 * Controls:
 *   Arrows        = move X/Z
 *   Alt+Up/Down   = move Y
 *   Shift+Arrows  = resize X/Z
 *   Shift+Alt+Up/Down = resize Y
 *   Q/E           = rotate Y
 *   Ctrl + any    = 5x speed
 */

import { useRef, useCallback, useState, useEffect } from 'react';
import type { Mesh } from 'three';
import type { ThreeEvent } from '@react-three/fiber';

const _selectedHelper = { current: null as string | null };

export function PosHelper({ name, color, initial, size: initialSize, initialRotY = 0 }: {
  name: string; color: string; initial: [number, number, number]; size: [number, number, number]; initialRotY?: number;
}) {
  const meshRef = useRef<Mesh>(null);
  const posRef = useRef<[number, number, number]>([...initial]);
  const sizeRef = useRef<[number, number, number]>([...initialSize]);
  const rotRef = useRef(initialRotY);
  const [selected, setSelected] = useState(false);
  const [pos, setPos] = useState<[number, number, number]>([...initial]);
  const [sz, setSz] = useState<[number, number, number]>([...initialSize]);
  const [rotY, setRotY] = useState(initialRotY);

  const STEP = 0.002;
  const SIZE_STEP = 0.002;

  const select = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    _selectedHelper.current = name;
    setSelected(true);
  }, [name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (_selectedHelper.current !== name) {
        if (selected) setSelected(false);
        return;
      }
      if (!selected) setSelected(true);

      const p = posRef.current;
      const s = sizeRef.current;
      const ctrl = e.ctrlKey || e.metaKey;
      const step = ctrl ? STEP * 5 : STEP;
      const sStep = ctrl ? SIZE_STEP * 5 : SIZE_STEP;

      let handled = false;
      const r = rotRef.current;

      // Q/E = rotate Y
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault(); e.stopImmediatePropagation();
        rotRef.current = r - (ctrl ? 0.1 : 0.02);
        setRotY(rotRef.current);
        console.log(`[PosHelper] ${name}: rotY=${rotRef.current.toFixed(4)}`);
        return;
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault(); e.stopImmediatePropagation();
        rotRef.current = r + (ctrl ? 0.1 : 0.02);
        setRotY(rotRef.current);
        console.log(`[PosHelper] ${name}: rotY=${rotRef.current.toFixed(4)}`);
        return;
      }

      if (e.shiftKey && e.altKey) {
        if (e.key === 'ArrowUp') { s[1] += sStep; handled = true; }
        else if (e.key === 'ArrowDown') { s[1] = Math.max(0.001, s[1] - sStep); handled = true; }
      } else if (e.shiftKey) {
        if (e.key === 'ArrowRight') { s[0] += sStep; handled = true; }
        else if (e.key === 'ArrowLeft') { s[0] = Math.max(0.001, s[0] - sStep); handled = true; }
        else if (e.key === 'ArrowUp') { s[2] += sStep; handled = true; }
        else if (e.key === 'ArrowDown') { s[2] = Math.max(0.001, s[2] - sStep); handled = true; }
      } else if (e.altKey) {
        if (e.key === 'ArrowUp') { p[1] += step; handled = true; }
        else if (e.key === 'ArrowDown') { p[1] -= step; handled = true; }
      } else {
        if (e.key === 'ArrowRight') { p[0] += step; handled = true; }
        else if (e.key === 'ArrowLeft') { p[0] -= step; handled = true; }
        else if (e.key === 'ArrowUp') { p[2] -= step; handled = true; }
        else if (e.key === 'ArrowDown') { p[2] += step; handled = true; }
      }

      if (!handled) return;
      e.preventDefault();
      posRef.current = [...p];
      sizeRef.current = [...s];
      setPos([...p]);
      setSz([...s]);
      console.log(`[PosHelper] ${name}: pos=[${p[0].toFixed(4)}, ${p[1].toFixed(4)}, ${p[2].toFixed(4)}] size=[${s[0].toFixed(4)}, ${s[1].toFixed(4)}, ${s[2].toFixed(4)}] rotY=${rotRef.current.toFixed(4)}`);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [name, selected]);

  useEffect(() => {
    const check = () => {
      if (_selectedHelper.current !== name && selected) setSelected(false);
    };
    window.addEventListener('pointerdown', check);
    return () => window.removeEventListener('pointerdown', check);
  }, [name, selected]);

  const isSelected = selected && _selectedHelper.current === name;
  return (
    <mesh ref={meshRef} position={pos} rotation={[0, rotY, 0]} onClick={select}>
      <boxGeometry args={sz} />
      <meshBasicMaterial
        color={isSelected ? 'white' : color}
        transparent
        opacity={isSelected ? 0.8 : 0.5}
        depthTest={false}
      />
    </mesh>
  );
}

/** Invisible plane for click-to-deselect */
export function PosHelperDeselect() {
  return (
    <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={() => { _selectedHelper.current = null; }}>
      <planeGeometry args={[5, 5]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}
