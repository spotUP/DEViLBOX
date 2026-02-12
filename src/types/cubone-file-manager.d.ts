declare module '@cubone/react-file-manager' {
  import { ComponentType } from 'react';

  export interface FileManagerProps {
    [key: string]: unknown;
  }

  export const FileManager: ComponentType<FileManagerProps>;
}
