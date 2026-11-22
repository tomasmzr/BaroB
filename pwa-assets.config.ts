import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#111412' } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#111412' } },
  },
  images: ['public/logo.svg'],
})
