import {resolve} from 'node:path';
import {defineConfig} from 'vite';
export default defineConfig({
  base: './',
  worker: {format: 'es'},
  build: {rollupOptions: {input: {main: resolve('index.html'), demo: resolve('demo.html')}}},
});
