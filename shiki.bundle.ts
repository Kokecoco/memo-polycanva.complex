/* Generate by @shikijs/codegen */
import type {
  DynamicImportLanguageRegistration,
  DynamicImportThemeRegistration,
  HighlighterGeneric,
} from '@shikijs/types'
import {
  createBundledHighlighter,
  createSingletonShorthands,
} from '@shikijs/core'
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'

type BundledLanguage =
  | 'javascript'
  | 'js'
  | 'cjs'
  | 'mjs'
  | 'typescript'
  | 'ts'
  | 'cts'
  | 'mts'
  | 'jsx'
  | 'tsx'
  | 'html'
  | 'css'
  | 'json'
  | 'python'
  | 'py'
  | 'shellscript'
  | 'bash'
  | 'sh'
  | 'shell'
  | 'zsh'
  | 'markdown'
  | 'md'
  | 'yaml'
  | 'yml'
  | 'java'
  | 'rust'
  | 'rs'
  | 'go'
  | 'sql'
type BundledTheme = 'one-dark-pro' | 'catppuccin-mocha'
type Highlighter = HighlighterGeneric<BundledLanguage, BundledTheme>

const bundledLanguages = {
  javascript: () => import('@shikijs/langs-precompiled/javascript'),
  js: () => import('@shikijs/langs-precompiled/javascript'),
  cjs: () => import('@shikijs/langs-precompiled/javascript'),
  mjs: () => import('@shikijs/langs-precompiled/javascript'),
  typescript: () => import('@shikijs/langs-precompiled/typescript'),
  ts: () => import('@shikijs/langs-precompiled/typescript'),
  cts: () => import('@shikijs/langs-precompiled/typescript'),
  mts: () => import('@shikijs/langs-precompiled/typescript'),
  jsx: () => import('@shikijs/langs-precompiled/jsx'),
  tsx: () => import('@shikijs/langs-precompiled/tsx'),
  html: () => import('@shikijs/langs-precompiled/html'),
  css: () => import('@shikijs/langs-precompiled/css'),
  json: () => import('@shikijs/langs-precompiled/json'),
  python: () => import('@shikijs/langs-precompiled/python'),
  py: () => import('@shikijs/langs-precompiled/python'),
  shellscript: () => import('@shikijs/langs-precompiled/shellscript'),
  bash: () => import('@shikijs/langs-precompiled/shellscript'),
  sh: () => import('@shikijs/langs-precompiled/shellscript'),
  shell: () => import('@shikijs/langs-precompiled/shellscript'),
  zsh: () => import('@shikijs/langs-precompiled/shellscript'),
  markdown: () => import('@shikijs/langs-precompiled/markdown'),
  md: () => import('@shikijs/langs-precompiled/markdown'),
  yaml: () => import('@shikijs/langs-precompiled/yaml'),
  yml: () => import('@shikijs/langs-precompiled/yaml'),
  java: () => import('@shikijs/langs-precompiled/java'),
  rust: () => import('@shikijs/langs-precompiled/rust'),
  rs: () => import('@shikijs/langs-precompiled/rust'),
  go: () => import('@shikijs/langs-precompiled/go'),
  sql: () => import('@shikijs/langs-precompiled/sql'),
} as Record<BundledLanguage, DynamicImportLanguageRegistration>

const bundledThemes = {
  'one-dark-pro': () => import('@shikijs/themes/one-dark-pro'),
  'catppuccin-mocha': () => import('@shikijs/themes/catppuccin-mocha'),
} as Record<BundledTheme, DynamicImportThemeRegistration>

const createHighlighter = /* @__PURE__ */ createBundledHighlighter<
  BundledLanguage,
  BundledTheme
>({
  langs: bundledLanguages,
  themes: bundledThemes,
  engine: () => createJavaScriptRegexEngine(),
})

const {
  codeToHtml,
  codeToHast,
  codeToTokensBase,
  codeToTokens,
  codeToTokensWithThemes,
  getSingletonHighlighter,
  getLastGrammarState,
} = /* @__PURE__ */ createSingletonShorthands<BundledLanguage, BundledTheme>(
  createHighlighter,
)

export {
  bundledLanguages,
  bundledThemes,
  codeToHast,
  codeToHtml,
  codeToTokens,
  codeToTokensBase,
  codeToTokensWithThemes,
  createHighlighter,
  getLastGrammarState,
  getSingletonHighlighter,
}
export type { BundledLanguage, BundledTheme, Highlighter }
