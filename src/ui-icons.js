const paths = {
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="m3 3 18 18M10.6 5.1C17.9 4.1 22 12 22 12a18.8 18.8 0 0 1-4.2 4.9M6.1 6.2A18.8 18.8 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 4-0.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  arrowUp: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
  arrowDown: '<path d="M12 4v16m-6-6 6 6 6-6"/>',
};

export function uiIcon(name) {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'ui-icon' })) icon.setAttribute(key, value);
  icon.innerHTML = paths[name];
  return icon;
}
