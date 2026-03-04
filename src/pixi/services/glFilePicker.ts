/**
 * Triggers a native browser file picker from GL/canvas code
 * using a hidden DOM <input type="file"> element.
 */

function openPicker(accept?: string, multiple?: boolean): Promise<File[]> {
  return new Promise<File[]>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    if (accept) input.accept = accept;
    if (multiple) input.multiple = true;

    const cleanup = () => input.remove();

    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      cleanup();
      resolve(files);
    };

    // Handle cancel: input receives focus back without a change event
    window.addEventListener('focus', () => {
      setTimeout(() => {
        if (!input.files?.length) {
          cleanup();
          resolve([]);
        }
      }, 300);
    }, { once: true });

    document.body.appendChild(input);
    input.click();
  });
}

export function pickFile(options?: { accept?: string; multiple?: boolean }): Promise<File | null> {
  return openPicker(options?.accept, options?.multiple).then((files) => files[0] ?? null);
}

export function pickFiles(options?: { accept?: string }): Promise<File[]> {
  return openPicker(options?.accept, true);
}
