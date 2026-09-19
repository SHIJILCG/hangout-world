import { AVATAR_COLORS, WorldFullError } from '../net/connection';

const CSS = `
#join-screen { position: fixed; inset: 0; display: flex; align-items: center;
  justify-content: center; background: radial-gradient(ellipse at 25% 20%, #6c9d78, transparent 60%), linear-gradient(150deg, #a6d8db, #547a5f 55%, #203d35); z-index: 10;
  font-family: system-ui, sans-serif; }
#join-card { background: #203d35f2; border: 1px solid #91ab88; border-radius: 20px; padding: 36px;
  width: min(360px, 80vw); display: flex; flex-direction: column; gap: 16px; box-shadow: 0 24px 80px #16332866; }
#join-card h1 { margin: 0; font-size: 30px; color: #fff5da; }
#join-card p { margin: 0; color: #ccd9bd; line-height: 1.6; font-size: 14px; }
#join-card small { color: #d7d995; text-transform: uppercase; letter-spacing: 2px; }
#join-name { padding: 10px; font-size: 16px; border: 1px solid #cbd5e1;
  border-radius: 8px; background: #f9f6e9; color: #203d35; }
#join-swatches { display: flex; gap: 10px; }
.join-swatch { width: 34px; height: 34px; border-radius: 50%; border: 3px solid
  transparent; cursor: pointer; }
.join-swatch.selected { border-color: #fff5da; outline: 2px solid #7b9777; outline-offset: 3px; }
#join-btn { padding: 12px; font-size: 16px; font-weight: 600; color: #fff;
  background: #67864c; border: 1px solid #9fb976; border-radius: 8px; cursor: pointer; }
#join-btn:disabled { opacity: 0.6; cursor: wait; }
#join-card #join-error { color: #ffc2a6; font-size: 14px; min-height: 18px; margin: 0; }
`;

export function showJoinScreen(
  onJoin: (name: string, colorIndex: number) => Promise<void>
): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'join-screen';
  overlay.innerHTML = `
    <div id="join-card">
      <small>A little world, together</small>
      <h1>Hangout World</h1>
      <p>Wander the meadow, climb the old ruins, and meet someone new.</p>
      <label for="join-name">Your nickname</label>
      <input id="join-name" maxlength="16" placeholder="Your nickname" autocomplete="nickname" />
      <span>Choose your explorer's color</span>
      <div id="join-swatches" role="group" aria-label="Explorer color"></div>
      <p>Press Enter in the world to chat with other explorers.</p>
      <p id="join-error" role="alert"></p>
      <button id="join-btn">Enter world</button>
      <button id="join-cancel" hidden type="button">Cancel automatic retry</button>
    </div>`;
  document.body.appendChild(overlay);

  const swatchRow = overlay.querySelector('#join-swatches')!;
  let colorIndex = 0;
  AVATAR_COLORS.forEach((color, i) => {
    const b = document.createElement('button');
    b.className = 'join-swatch' + (i === 0 ? ' selected' : '');
    b.dataset.index = String(i);
    b.type = 'button';
    b.setAttribute('aria-label', ['Blue', 'Coral', 'Mint', 'Yellow', 'Purple', 'Orange'][i]);
    b.setAttribute('aria-pressed', String(i === 0));
    b.style.background = '#' + color.toString(16).padStart(6, '0');
    b.addEventListener('click', () => {
      colorIndex = i;
      swatchRow.querySelectorAll('.join-swatch').forEach((s, j) => {
        s.classList.toggle('selected', j === i);
        s.setAttribute('aria-pressed', String(j === i));
      });
    });
    swatchRow.appendChild(b);
  });

  const nameInput = overlay.querySelector<HTMLInputElement>('#join-name')!;
  const button = overlay.querySelector<HTMLButtonElement>('#join-btn')!;
  const error = overlay.querySelector<HTMLParagraphElement>('#join-error')!;
  const cancel = overlay.querySelector<HTMLButtonElement>('#join-cancel')!;
  let retry: ReturnType<typeof setTimeout> | undefined;
  cancel.addEventListener('click', () => {
    clearTimeout(retry);
    retry = undefined;
    cancel.hidden = true;
    button.disabled = false;
    button.textContent = 'Enter world';
    error.textContent = 'Automatic retry cancelled. You can try joining again.';
  });

  const submit = async () => {
    if (button.disabled) return; // re-entrancy guard: Enter key must not bypass a pending join
    const name = nameInput.value.trim();
    if (name.length < 2) {
      error.textContent = 'Please enter a nickname (at least 2 characters).';
      return;
    }
    error.textContent = '';
    button.disabled = true;
    button.textContent = 'Joining the meadow...';
    try {
      await onJoin(name, colorIndex);
      overlay.remove();
      style.remove();
    } catch (e) {
      if (e instanceof WorldFullError) {
        error.textContent = e.message;
        button.textContent = 'World full - waiting...';
        cancel.hidden = false;
        retry = setTimeout(() => {
          button.disabled = false;
          cancel.hidden = true;
          void submit();
        }, 5000);
        return;
      }
      error.textContent = `Could not join: ${e instanceof Error ? e.message : 'unknown error'}`;
      button.disabled = false;
      button.textContent = 'Enter world';
    }
  };

  button.addEventListener('click', submit);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
  nameInput.focus();
}
