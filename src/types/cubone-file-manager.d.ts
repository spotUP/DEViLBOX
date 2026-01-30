declare module '@cubone/react-file-manager' {
  import { ComponentType } from 'react';

  export interface FileManagerProps {
    [key: string]: any;
  }

  export const FileManager: ComponentType<FileManagerProps>;
}
