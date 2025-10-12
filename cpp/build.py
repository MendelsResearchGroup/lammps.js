#!/usr/bin/env python3
import os, subprocess, shutil, sys

LAMMPS_TAG = os.environ.get("LAMMPS_TAG", "stable_23Jun2022_update1")
LAMMPS_DIR = "lammps"
SRC_DIR = os.path.join(LAMMPS_DIR, "src")

# Override with: PACKAGES="yes-molecule yes-kspace"
PACKAGES = os.environ.get("PACKAGES", "yes-molecule").split()

# Files you actually need from your local code
CUSTOM_BASENAMES = [
  "lammpsweb",
]

LOCATE_FILE = "locateFile.js"
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

STALE_BASENAMES = [
  "fix_atomify",
  "data1d",
  "atomify_compute",
  "atomify_fix",
  "atomify_variable",
  "atomify_modify",
]

def read(path):
  return open(path, "r").read() if os.path.exists(path) else ""

def copy_if_changed(src, dst):
  if read(src) != read(dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)
    print(f"updated: {dst}")

def ensure_clone():
  if os.path.isdir(LAMMPS_DIR):
    return
  print("Cloning LAMMPS ...")
  subprocess.check_call(
    f"git clone --depth 1 --branch {LAMMPS_TAG} https://github.com/lammps/lammps.git",
    shell=True
  )

def install_packages():
  if not PACKAGES:
    return
  cmd = ["make"] + PACKAGES
  print("Installing packages:", " ".join(PACKAGES))
  subprocess.check_call(" ".join(cmd), shell=True, cwd=SRC_DIR)

def copy_custom_sources():
  for base in CUSTOM_BASENAMES:
    for ext in (".cpp", ".h"):
      src = os.path.join("lammpsweb", base + ext)
      dst = os.path.join(SRC_DIR, base + ext)
      if os.path.exists(src):
        copy_if_changed(src, dst)

def remove_stale_sources():
  removed_any = False
  for base in STALE_BASENAMES:
    for ext in (".cpp", ".h"):
      path = os.path.join(SRC_DIR, base + ext)
      if os.path.isfile(path):
        os.remove(path)
        print(f"removed: {os.path.relpath(path, SRC_DIR)}")
        removed_any = True
  return removed_any

def remove_broken_imd():
  a = os.path.join(SRC_DIR, "fix_imd.cpp")
  b = os.path.join(SRC_DIR, "fix_imd.h")
  if os.path.isfile(a):
    os.remove(a)
    if os.path.isfile(b):
      os.remove(b)
    print("removed: fix_imd.*")

def build_native_once():
  print("Native prebuild ...")
  subprocess.check_call("make -j8 serial", shell=True, cwd=SRC_DIR)

def build_wasm():
  env = os.environ.copy()
  if env.get("SINGLE_FILE") == "1":
    # Request embedded wasm; emscripten picks this from CFLAGS in most Makefile flows
    extra = env.get("EMCC_CFLAGS", "")
    flags = extra.split() + ["-s", "SINGLE_FILE=1", "-s", "MODULARIZE=1", "-s", "EXPORT_ES6=1"]
    env["EMCC_CFLAGS"] = " ".join(flags)
    print("SINGLE_FILE=1 enabled for emscripten build")
  print("Building wasm/JS ...")
  subprocess.check_call("make -j8", shell=True, cwd=SRC_DIR, env=env)

def ensure_emcc():
  if shutil.which("emcc") is None:
    raise RuntimeError(
      "Emscripten compiler 'emcc' not found on PATH. Activate emsdk before running build.py."
    )

def ensure_locate_file():
  if os.path.exists(LOCATE_FILE):
    return
  with open(LOCATE_FILE, "w") as fp:
    fp.write(LOCATE_FILE_STUB)
  print(f"created: {LOCATE_FILE}")

def build_bundle():
  ensure_emcc()
  ensure_locate_file()
  env = os.environ.copy()
  cache_dir = env.setdefault("EM_CACHE", os.path.abspath(".emscripten_cache"))
  os.makedirs(cache_dir, exist_ok=True)
  print("Linking lammps.js via top-level Makefile ...")
  subprocess.check_call("make wasm", shell=True, env=env)
  if not os.path.exists("lammps.js"):
    raise RuntimeError("Emscripten link step completed but did not produce lammps.js")

def main():
  ensure_clone()
  copy_if_changed("mpi.cpp", os.path.join(SRC_DIR, "mpi.cpp")) if os.path.exists("mpi.cpp") else None
  # Only copy a stub header if you vendor it; otherwise LAMMPS provides its own STUBS
  stub_h = os.path.join(LAMMPS_DIR, "src", "STUBS", "mpi.h")
  if os.path.isfile(stub_h):
    copy_if_changed(stub_h, os.path.join(SRC_DIR, "mpi.h"))

  install_packages()
  copy_custom_sources()
  remove_stale_sources()
  remove_broken_imd()
  build_native_once()
  build_wasm()
  build_bundle()

  print("\nDone.\nArtifacts are left in:", SRC_DIR)

if __name__ == "__main__":
  main()
