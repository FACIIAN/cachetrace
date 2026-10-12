/* Lightbulb button + small panel. Used by the calculator and the practice exams. */
const HintUI = (function () {
  const BULB = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>';
  let n = 0;
  /** Returns { button, panel }: put the button in the section header and the panel right below it. */
  function create(html) {
    const id = 'hint-' + (++n);
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'hint-btn'; button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', id);
    button.setAttribute('aria-label', 'Mostrar pista'); button.title = 'Pista'; button.innerHTML = BULB;
    const panel = document.createElement('div');
    panel.className = 'hint-pop'; panel.id = id; panel.hidden = true; panel.innerHTML = html;
    button.addEventListener('click', () => {
      const open = panel.hidden;
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'Ocultar pista' : 'Mostrar pista');
    });
    const close = (e) => { if (e.key === 'Escape' && !panel.hidden) { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-label', 'Mostrar pista'); button.focus(); } };
    panel.addEventListener('keydown', close);
    button.addEventListener('keydown', close);
    return { button, panel };
  }
  return { create };
})();
