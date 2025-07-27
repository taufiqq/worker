// custom.d.ts

// Sebelumnya: declare module '*.html'
// Menjadi:
declare module '*.html?raw' {
  const content: string;
  export default content;
}