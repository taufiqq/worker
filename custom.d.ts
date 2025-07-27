// custom.d.ts

// Sebelumnya: declare module '*.html'
// Menjadi:
declare module '*.html' {
  const content: string;
  export default content;
}