const paths = {
  library: '<path d="M4 5.5h6v13H4zM14 5.5h6v13h-6z"/>',
  recent: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 15h9"/>',
  folder: '<path d="M3 6.5h7l2 2h9v10H3z"/>',
  archive: '<path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6"/>',
  transfer: '<path d="M7 7h12m-4-4 4 4-4 4M17 17H5m4 4-4-4 4-4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.6a7 7 0 0 0-.7-1.6l1-1.8-2.1-2.1-1.8 1A7 7 0 0 0 11.8 5L11 3H8l-.6 2a7 7 0 0 0-1.6.7l-1.8-1L2 6.8l1 1.8a7 7 0 0 0-.7 1.6l-2 .6v3l2 .6a7 7 0 0 0 .7 1.6l-1 1.8L4 20l1.8-1a7 7 0 0 0 1.6.7l.6 2h3l.6-2a7 7 0 0 0 1.6-.7l1.8 1 2.1-2.1-1-1.8a7 7 0 0 0 .7-1.6z" transform="translate(1 -1) scale(.92)"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  grid: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
  table: '<path d="M3 5h18v14H3zM3 10h18M8 5v14"/>',
  arrowLeft: '<path d="m14 5-7 7 7 7M7 12h13"/>',
  spark: '<path d="m12 2 1.5 5.2L19 9l-5.5 1.8L12 16l-1.5-5.2L5 9l5.5-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  print: '<path d="M7 9V3h10v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M7 15h10v6H7z"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h8M16 18h4"/><circle cx="16" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="18" r="2"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  trash: '<path d="M4 7h16M9 3h6l1 4H8zM7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  image: '<path d="M3 5h18v14H3z"/><circle cx="9" cy="10" r="2"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
  chevronUp: '<path d="m6 15 6-6 6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  copy: '<path d="M8 8h11v12H8zM5 16H3V4h11v2"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>'
};

export function icon(name, label = "") {
  return '<svg viewBox="0 0 24 24" aria-hidden="' + (label ? "false" : "true") + '"' +
    (label ? ' aria-label="' + label + '"' : "") + ">" + (paths[name] || paths.more) + "</svg>";
}
