import { spawn } from 'child_process';

export async function transcodeToOpus(inputBuffer: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', [
      '-i', 'pipe:0',
      '-c:a', 'libopus',
      '-b:a', '320k',
      '-vbr', 'on',
      '-f', 'webm',
      'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    const chunks: Buffer[] = [];
    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.on('error', () => {
      console.warn('[transcode] ffmpeg not available, storing uncompressed');
      resolve(null);
    });
    proc.on('close', (code) => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        console.warn(`[transcode] ffmpeg exited with code ${code}, storing uncompressed`);
        resolve(null);
      }
    });
    proc.stdin.write(inputBuffer);
    proc.stdin.end();
  });
}
