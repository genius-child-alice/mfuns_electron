const versionsEl = document.getElementById('versions');

if (window.electronAPI?.versions) {
  const { node, chrome, electron } = window.electronAPI.versions;
  versionsEl.innerHTML = `
    <div><dt>Node</dt><dd>${node}</dd></div>
    <div><dt>Chrome</dt><dd>${chrome}</dd></div>
    <div><dt>Electron</dt><dd>${electron}</dd></div>
  `;
}
