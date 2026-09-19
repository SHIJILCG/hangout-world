export function createConnectionOverlay() {
  const root = document.createElement('section');
  root.id = 'connection-overlay';
  root.setAttribute('role', 'alertdialog');
  root.setAttribute('aria-label', 'Connection status');
  root.innerHTML = '<div><h2>Finding your way back...</h2><p role="status">Reconnecting to the meadow.</p><button type="button">Return to join screen</button></div>';
  root.querySelector('button')!.addEventListener('click', () => location.reload());
  document.body.append(root);
  return {
    failed(message: string) {
      root.querySelector('h2')!.textContent = 'Connection lost';
      root.querySelector('p')!.textContent = `${message} You can rejoin the current world from the join screen.`;
    },
    dispose() { root.remove(); },
  };
}
