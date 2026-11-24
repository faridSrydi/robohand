// Data bersama untuk halaman kontrol dan simulasi.
// Urutan jari = urutan indeks pose (0 = Jempol ... 4 = Kelingking).
// Catatan: firmware tidak menyimpan nama jari; urutan ini perlu dicocokkan dengan pemasangan servo fisik
// (pin 13, 14, 25, 26, 27 untuk servo 0-4).
export const FINGER_NAMES = ['Jempol', 'Telunjuk', 'Tengah', 'Manis', 'Kelingking'];

// Pasangan landmark MediaPipe untuk menghitung rasio tekukan jari.
// rasio = jarak(a, b) / jarak(c, d). Kecil = menekuk, besar = lurus.
export const RATIO_PAIRS = [
  { a: 4, b: 17, c: 5, d: 17 },
  { a: 8, b: 0, c: 5, d: 0 },
  { a: 12, b: 0, c: 9, d: 0 },
  { a: 16, b: 0, c: 13, d: 0 },
  { a: 20, b: 0, c: 17, d: 0 },
];
