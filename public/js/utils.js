export function isTestEnv() {
  return document.cookie.includes('test-env')
}
