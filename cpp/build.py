#!/usr/bin/env python3
import os
import shutil
import subprocess
from pathlib import Path

LAMMPS_TAG = os.environ.get("LAMMPS_TAG", "patch_10Sep2025")
BASE_DIR = Path(__file__).resolve().parent
LAMMPS_DIR = BASE_DIR / "lammps"
SRC_DIR = LAMMPS_DIR / "src"

# Override with: PACKAGES="yes-molecule yes-kspace"
PACKAGES = os.environ.get("PACKAGES", "yes-molecule").split()

# Files you actually need from your local code
CUSTOM_BASENAMES = [
  "lammpsweb",
]

LOCATE_FILE = BASE_DIR / "locateFile.js"
LOCATE_FILE_STUB = """\
if (typeof Module === "undefined") {
  Module = {};
}
if (!Module.locateFile) {
  Module.locateFile = function locateFile(path) {
    return path;
  };
}
"""


def read(path: Path) -> str:
  return path.read_text() if path.exists() else ""


def copy_if_changed(src: Path, dst: Path) -> None:
  if read(src) != read(dst):
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)
    print(f"updated: {dst.relative_to(BASE_DIR)}")


def ensure_clone() -> None:
  if LAMMPS_DIR.is_dir():
    return
  print("Cloning LAMMPS ...")
  subprocess.check_call(
    [
      "git",
      "clone",
      "--depth",
      "1",
      "--branch",
      LAMMPS_TAG,
      "https://github.com/lammps/lammps.git",
      str(LAMMPS_DIR),
    ],
    cwd=BASE_DIR,
  )

def install_packages():
  if not PACKAGES:
    return
  cmd = ["make"] + PACKAGES
  print("Installing packages:", " ".join(PACKAGES))
  subprocess.check_call(" ".join(cmd), shell=True, cwd=str(SRC_DIR))

def copy_custom_sources():
  for base in CUSTOM_BASENAMES:
    for ext in (".cpp", ".h"):
      src = BASE_DIR / "lammpsweb" / f"{base}{ext}"
      dst = SRC_DIR / f"{base}{ext}"
      if src.exists():
        copy_if_changed(src, dst)

def remove_broken_imd():
  target_cpp = SRC_DIR / "fix_imd.cpp"
  target_h = SRC_DIR / "fix_imd.h"
  if target_cpp.is_file():
    target_cpp.unlink()
    if target_h.is_file():
      target_h.unlink()
    print("removed: fix_imd.*")



def build_native_once():
  print("Native prebuild ...")
  subprocess.call("make clean-machine", shell=True, cwd=str(SRC_DIR))
  subprocess.check_call("make -j8 serial", shell=True, cwd=str(SRC_DIR))

def build_wasm():
  env = os.environ.copy()
  if env.get("SINGLE_FILE") == "1":
    # Request embedded wasm; emscripten picks this from CFLAGS in most Makefile flows
    extra = env.get("EMCC_CFLAGS", "")
    flags = extra.split() + ["-s", "SINGLE_FILE=1", "-s", "MODULARIZE=1", "-s", "EXPORT_ES6=1"]
    env["EMCC_CFLAGS"] = " ".join(flags)
    print("SINGLE_FILE=1 enabled for emscripten build")
  print("Building wasm/JS ...")
  subprocess.check_call("make -j8", shell=True, cwd=str(SRC_DIR), env=env)

def ensure_emcc():
  if shutil.which("emcc") is None:
    raise RuntimeError(
      "Emscripten compiler 'emcc' not found on PATH. Activate emsdk before running build.py."
    )

def ensure_locate_file():
  if LOCATE_FILE.exists():
    return
  LOCATE_FILE.write_text(LOCATE_FILE_STUB)
  print(f"created: {LOCATE_FILE.relative_to(BASE_DIR)}")

def build_bundle():
  ensure_emcc()
  ensure_locate_file()
  env = os.environ.copy()
  cache_dir = env.setdefault("EM_CACHE", str(BASE_DIR / ".emscripten_cache"))
  Path(cache_dir).mkdir(parents=True, exist_ok=True)
  print("Linking lammps.js via top-level Makefile ...")
  subprocess.check_call("make wasm", shell=True, cwd=str(BASE_DIR), env=env)
  if not (BASE_DIR / "lammps.js").exists():
    raise RuntimeError("Emscripten link step completed but did not produce lammps.js")

def main():
  ensure_clone()
  install_packages()
  copy_custom_sources()
  remove_broken_imd()
  build_native_once()
  build_wasm()
  build_bundle()

  print("\nDone.\nArtifacts are left in:", SRC_DIR)

if __name__ == "__main__":
  main()
