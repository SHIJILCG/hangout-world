export interface InputState {
  moveX: number;
  moveZ: number;
  run: boolean;
  jump: boolean;
}

export class KeyboardInput {
  private down = new Set<string>();
  private target: EventTarget;
  private onKeyDown = (e: Event) => this.down.add((e as KeyboardEvent).code);
  private onKeyUp = (e: Event) => this.down.delete((e as KeyboardEvent).code);

  constructor(target: EventTarget = window) {
    this.target = target;
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
  }

  get state(): InputState {
    const has = (c: string) => this.down.has(c);
    return {
      moveX: (has('KeyD') ? 1 : 0) - (has('KeyA') ? 1 : 0),
      moveZ: (has('KeyW') ? 1 : 0) - (has('KeyS') ? 1 : 0),
      run: has('ShiftLeft') || has('ShiftRight'),
      jump: has('Space'),
    };
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.down.clear();
  }
}
