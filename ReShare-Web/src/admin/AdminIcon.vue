<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 });
const paths: Record<string, string> = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  donation: 'M3 15h4l4 3h5l5-5 M3 21h4v-8H3z M9 12l3 2h4a2 2 0 0 1 0 4 M14 9s-5-3-5-6a3 3 0 0 1 5 0 3 3 0 0 1 5 0c0 3-5 6-5 6z',
  box: 'M3 3h18v5H3z M5 8v13h14V8 M9 12h6',
  users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20v-2a6 6 0 0 1 12 0v2z M16 5a3 3 0 0 1 0 6 M18 14a5 5 0 0 1 3 4v2',
  chart: 'M3 21V11 M8 21v-7 M13 21V9 M18 21V5 M3 7l5 3 5-6 5-2',
  log: 'M5 3h14v18H5z M8 3v5h8V3 M8 12h8 M8 16h8',
  shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M9 12l2 2 4-4',
  settings: 'M9 3h6l1 3 3 1 2 5-2 2 0 4-4 3-3-1-3 1-4-3 0-4-2-2 2-5 3-1z M15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
  warehouse: 'M3 21V8l9-5 9 5v13 M7 21V11h10v10 M10 21v-5h4v5',
  clock: 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0 M12 7v5l3 2',
  search: 'M16 10a6 6 0 1 0-12 0 6 6 0 0 0 12 0 M15 15l6 6',
  bell: 'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5z M10 21h4',
  user: 'M15 7a3 3 0 1 0-6 0 3 3 0 0 0 6 0 M5 20v-2a7 7 0 0 1 14 0v2z',
  chevron: 'M8 10l4 4 4-4',
  arrow: 'M20 12H4 M10 6l-6 6 6 6',
  flask: 'M9 3h6 M10 3v6l-6 10a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3 M8 14h8',
  hanger: 'M10 6a2 2 0 1 1 3 2l-1 1v3 M12 12L3 20h18z',
  lock: 'M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3',
  eye: 'M3 3l18 18 M9 5c6-2 12 7 12 7l-3 3 M6 6c-2 2-3 6-3 6s5 8 12 6 M10 10a3 3 0 0 0 4 4',
  info: 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0 M12 11v6 M12 7v1',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0 M15 10a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
  warning: 'M12 3L2 21h20z M12 9v6 M12 18v1',
  check: 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0 M8 12l3 3 5-6',
  close: 'M6 6l12 12 M6 18L18 6',
  gavel: 'M9 3l9 9 M6 6l9 9 M8 4l-4 4 7 7 4-4 M13 13l7 7 M3 21h11',
  monitor: 'M3 3h18v13H3z M12 16v5 M8 21h8',
  play: 'M7 4l14 8-14 8z',
  history: 'M4 4h16v16H4z M4 9h16 M15 13h2 M15 16h2 M3 3l18 18',
  calendar: 'M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z'
};
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path :d="paths[name] ?? paths.shield" />
  </svg>
</template>
