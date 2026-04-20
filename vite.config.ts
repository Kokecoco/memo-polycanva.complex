import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repositorySlug = process.env.GITHUB_REPOSITORY
const repositoryName =
  repositorySlug && repositorySlug.includes('/') ? repositorySlug.split('/')[1] : undefined
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true'

// https://vite.dev/config/
export default defineConfig({
  base: isGitHubActions && repositoryName ? `/${repositoryName}/` : '/',
  plugins: [react()],
})
