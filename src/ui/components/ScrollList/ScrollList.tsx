import { useRenderer } from '../../renderer-context';
import { DOMScrollList } from './ScrollList.dom';
import { GLScrollList } from './ScrollList.gl';
import type { ScrollListProps } from './types';

export const ScrollList: React.FC<ScrollListProps> = (props) => {
  const renderer = useRenderer();
  return renderer === 'gl' ? <GLScrollList {...props} /> : <DOMScrollList {...props} />;
};
