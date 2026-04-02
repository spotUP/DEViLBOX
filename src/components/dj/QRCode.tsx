/**
 * QRCode — renders a scannable QR code SVG using the `qrcode` library.
 */

import React, { useEffect, useRef } from 'react';
import QRCodeLib from 'qrcode';

interface QRCodeProps {
  url: string;
  size?: number;
}

export const QRCode: React.FC<QRCodeProps> = ({ url, size = 200 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !url) return;
    QRCodeLib.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'L',
    }).catch((err: Error) => console.error('[QRCode]', err));
  }, [url, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ borderRadius: 8, background: '#fff' }}
    />
  );
};
