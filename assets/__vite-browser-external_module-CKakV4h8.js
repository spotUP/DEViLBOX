const __viteBrowserExternal_module = new Proxy({}, {
  get(_, key) {
    throw new Error(`Module "module" has been externalized for browser compatibility. Cannot access "module.${key}" in client code.  See https://vite.dev/guide/troubleshooting.html#module-externalized-for-browser-compatibility for more details.`);
  }
});
export {
  __viteBrowserExternal_module as default
};
