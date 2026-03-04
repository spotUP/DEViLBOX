/**
 * Trigger a browser file download from a Blob using a hidden anchor element.
 */
export function downloadFile(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}

/**
 * Convenience wrapper: serialise `data` as JSON and trigger a download.
 */
export function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadFile(blob, filename);
}
