type EntityType = 'project' | 'effect' | 'preset' | 'pattern' | 'curve' | 'action' | 'tab' | 'channel';

class IdGenerator {
  private counters: Map<EntityType, number> = new Map();
  
  generate(type: EntityType): string {
    const counter = (this.counters.get(type) || 0) + 1;
    this.counters.set(type, counter);
    return `${type}-${Date.now()}-${counter}`;
  }
  
  reset(type?: EntityType): void {
    if (type) {
      this.counters.delete(type);
    } else {
      this.counters.clear();
    }
  }
}

export const idGenerator = new IdGenerator();
