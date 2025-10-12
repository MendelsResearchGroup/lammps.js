if (typeof Module === "undefined") {
  Module = {};
}
if (!Module.locateFile) {
  Module.locateFile = function locateFile(path) {
    return path;
  };
}
