const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const states = new Set(['idle', 'ready', 'requesting', 'listening', 'transcribing', 'thinking', 'processing', 'speaking', 'success', 'error', 'paused']);

export function mascotIconMarkup(label = '') {
  return `<span class="mascot-icon" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}><img src="./assets/luklaan-mascot.png" alt="" draggable="false"></span>`;
}

export function mascotStageMarkup(className = '') {
  const safeClass = String(className).replace(/[^\w -]/g, '');
  return `<div class="voice-sphere mascot-companion ${safeClass}" data-state="idle" aria-hidden="true"><img class="mascot-base" src="./assets/luklaan-mascot.png" alt="" draggable="false"><span class="mascot-pose pose-listening"></span><span class="mascot-pose pose-thinking"></span><span class="mascot-pose pose-speaking"></span><span class="mascot-pose pose-success"></span><span class="mascot-ground"></span></div>`;
}

export function setMascotState(state, root = document) {
  const next = states.has(state) ? state : 'idle';
  for (const mascot of root.querySelectorAll('.mascot-companion')) mascot.dataset.state = next;
}
