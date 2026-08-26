import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // core/ 와 export/ 의 순수 로직만 다룬다. DOM에 의존하지 않으므로
    // jsdom을 얹을 이유가 없다 — 느려지기만 한다.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
