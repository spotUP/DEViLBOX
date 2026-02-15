import React, { useMemo } from 'react';

interface MAMEVFXFilterVisualizerProps {
  k1: number;
  k2: number;
  width?: number;
  height?: number;
  color?: string;
}

/**
 * MAMEVFXFilterVisualizer - Visualizes the frequency response of the ES5506 OTTO filter
 * 
 * The OTTO uses a 2nd-order state-variable filter controlled by K1 and K2 coefficients.
 * This component maps those coefficients to a frequency response curve.
 */
export const MAMEVFXFilterVisualizer: React.FC<MAMEVFXFilterVisualizerProps> = ({
  k1,
  k2,
  width = 160,
  height = 64,
  color = '#ec4899'
}) => {
  const points = useMemo(() => {
    const pts: string[] = [];
    const numPoints = 40;
    
    // Convert 8-bit K1/K2 to normalized coefficients
    // Simplified model of the SVF response based on OTTO architecture
    const res = (k2 / 255);
    const cutoff = (k1 / 255);

    for (let i = 0; i <= numPoints; i++) {
      const x = (i / numPoints) * width;
      const freq = (i / numPoints);
      
      // Basic resonance peak model
      const dist = Math.abs(freq - cutoff);
      const amp = 1 / (0.1 + dist * 5 + (1-res) * 2);
      
      const y = height - (Math.min(0.9, amp * 0.5) * height) - 5;
      pts.push(`${x},${y}`);
    }
    
    return pts.join(' ');
  }, [k1, k2, width, height]);

  return (
    <div className="relative bg-black/40 rounded border border-border overflow-hidden" style={{ width, height }}>
      <svg width={width} height={height} className="absolute inset-0">
        <path
          d={`M 0,${height} L ${points} L ${width},${height} Z`}
          fill={`${color}20`}
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Cutoff marker */}
        <line 
          x1={(k1/255) * width} y1="0" 
          x2={(k1/255) * width} y2={height} 
          stroke="white" strokeWidth="1" strokeDasharray="2,2" opacity="0.3" 
        />
      </svg>
      <div className="absolute top-1 left-1 text-[7px] text-text-muted font-bold uppercase tracking-tighter">
        VFX SVF Response
      </div>
    </div>
  );
};
