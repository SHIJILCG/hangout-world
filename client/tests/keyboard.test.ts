// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { KeyboardInput } from '../src/input/keyboard';

function press(code: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code }));
}
function release(code: string) {
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
}

describe('KeyboardInput', () => {
  it('starts neutral', () => {
    const input = new KeyboardInput();
    expect(input.state).toEqual({ moveX: 0, moveZ: 0, run: false, jump: false });
    input.dispose();
  });

  it('maps WASD to axes', () => {
    const input = new KeyboardInput();
    press('KeyW');
    press('KeyD');
    expect(input.state.moveZ).toBe(1);
    expect(input.state.moveX).toBe(1);
    release('KeyW');
    press('KeyS');
    expect(input.state.moveZ).toBe(-1);
    input.dispose();
  });

  it('opposite keys cancel out', () => {
    const input = new KeyboardInput();
    press('KeyA');
    press('KeyD');
    expect(input.state.moveX).toBe(0);
    input.dispose();
  });

  it('maps Shift to run and Space to jump', () => {
    const input = new KeyboardInput();
    press('ShiftLeft');
    press('Space');
    expect(input.state.run).toBe(true);
    expect(input.state.jump).toBe(true);
    release('Space');
    expect(input.state.jump).toBe(false);
    input.dispose();
  });

  it('stops listening after dispose', () => {
    const input = new KeyboardInput();
    input.dispose();
    press('KeyW');
    expect(input.state.moveZ).toBe(0);
  });

  it('clear() forgets all held keys, and keys can re-latch afterward', () => {
    const input = new KeyboardInput();
    press('KeyW');
    expect(input.state.moveZ).toBe(1);
    input.clear();
    expect(input.state).toEqual({ moveX: 0, moveZ: 0, run: false, jump: false });
    press('KeyW');
    expect(input.state.moveZ).toBe(1);
    input.dispose();
  });
});
