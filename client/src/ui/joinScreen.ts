import { AVATAR_COLORS } from '../net/connection';

const CSS = `
#join-screen { position: fixed; inset: 0; display: flex; align-items: center;
  justify-content: center; background: rgba(15, 23, 42, 0.85); z-index: 10;
  font-family: system-ui, sans-serif; }
#join-card { background: #ffffff; border-radius: 12px; padding: 28px;
  width: 320px; display: flex; flex-direction: column; gap: 14px; }
#join-card h1 { margin: 0; font-size: 22px; color: #0f172a; }
#join-name { padding: 10px; font-size: 16px; border: 1px solid #cbd5e1;
  border-radius: 8px; }
#join-swatches { display: flex; gap: 10px; }
.join-swatch { width: 34px; height: 34px; border-radius: 50%; border: 3px solid
  transparent; cursor: pointer; }
.join-swatch.selected { border-color: #0f172a; }
#join-btn { padding: 12px; font-size: 16px; font-weight: 600; color: #fff;
  background: #2563eb; border: 0; border-radius: 8px; cursor: pointer; }
#join-btn:disabled { opacity: 0.6; cursor: wait; }
#join-error { color: #dc2626; font-size: 14px; min-height: 18px; margin: 0; }
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
      <h1>Hangout World</h1>
      <input id="join-name" maxlength="16" placeholder="Your nickname" />
      <div id="join-swatches"></div>
      <p id="join-error"></p>
      <button id="join-btn">Enter world</button>
    </div>`;
  document.body.appendChild(overlay);

  const swatchRow = overlay.querySelector('#join-swatches')!;
  let colorIndex = 0;
  AVATAR_COLORS.forEach((color, i) => {
    const b = document.createElement('button');
    b.className = 'join-swatch' + (i === 0 ? ' selected' : '');
    b.dataset.index = String(i);
    b.style.background = '#' + color.toString(16).padStart(6, '0');
    b.addEventListener('click', () => {
      colorIndex = i;
      swatchRow.querySelectorAll('.join-swatch').forEach((s, j) =>
        s.classList.toggle('selected', j === i)
      );
    });
    swatchRow.appendChild(b);
  });

  const nameInput = overlay.querySelector<HTMLInputElement>('#join-name')!;
  const button = overlay.querySelector<HTMLButtonElement>('#join-btn')!;
  const error = overlay.querySelector<HTMLParagraphElement>('#join-error')!;

  const submit = async () => {
    const name = nameInput.value.trim();
    if (name.length < 2) {
      error.textContent = 'Please enter a nickname (at least 2 characters).';
      return;
    }
    error.textContent = '';
    button.disabled = true;
    try {
      await onJoin(name, colorIndex);
      overlay.remove();
      style.remove();
    } catch (e) {
      error.textContent = `Could not join: ${e instanceof Error ? e.message : 'unknown error'}`;
      button.disabled = false;
    }
  };

  button.addEventListener('click', submit);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
  nameInput.focus();
}
