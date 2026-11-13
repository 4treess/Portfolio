import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // This MUST be here

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
})