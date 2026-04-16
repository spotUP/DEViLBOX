import { DOMScrollList } from './ScrollList.dom';
import type { ScrollListProps } from './types';

export const ScrollList: React.FC<ScrollListProps> = (props) => {
  return <DOMScrollList {...props} />;
};
