#pragma once

#include "lammps.h"

#include <array>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <emscripten/bind.h>
#endif

class LAMMPSWeb {
public:
  using pointer_type = std::intptr_t;

  LAMMPSWeb();
  ~LAMMPSWeb();

  void start();
  void stop();
  void step();
  void runCommand(const std::string &command);
  void runFile(const std::string &path);

  [[nodiscard]] bool getIsRunning() const noexcept;
  [[nodiscard]] int getNumAtoms() const noexcept;
  [[nodiscard]] int getNumBonds() const noexcept;

  int computeParticles();
  int computeBonds();

  [[nodiscard]] pointer_type getPositionsPointer() noexcept;
  [[nodiscard]] pointer_type getBondsPosition1Pointer() noexcept;
  [[nodiscard]] pointer_type getBondsPosition2Pointer() noexcept;
  [[nodiscard]] pointer_type getCellMatrixPointer() noexcept;
  [[nodiscard]] pointer_type getOrigoPointer() noexcept;
  [[nodiscard]] pointer_type getBoxSizePointer() noexcept;
  [[nodiscard]] pointer_type getIdPointer() const noexcept;
  [[nodiscard]] pointer_type getTypePointer() const noexcept;

private:
  static void destroyLammps(LAMMPS_NS::LAMMPS *ptr) noexcept;
  using LammpsPtr = std::unique_ptr<LAMMPS_NS::LAMMPS, decltype(&LAMMPSWeb::destroyLammps)>;

  [[nodiscard]] bool hasSimulation() const noexcept { return static_cast<bool>(m_lmp); }
  [[nodiscard]] LAMMPS_NS::LAMMPS *raw() const noexcept { return m_lmp.get(); }
  void resetStaticBuffers() noexcept;

  template <typename Container>
  static pointer_type pointerFrom(const Container &buffer) noexcept {
    if (buffer.empty()) {
      return 0;
    }
    using ValueType = typename Container::value_type;
    return reinterpret_cast<pointer_type>(
      const_cast<ValueType *>(buffer.data())
    );
  }

  template <typename T, std::size_t N>
  static pointer_type pointerFrom(const std::array<T, N> &buffer) noexcept {
    return reinterpret_cast<pointer_type>(
      const_cast<T *>(buffer.data())
    );
  }

  LammpsPtr m_lmp{nullptr, &LAMMPSWeb::destroyLammps};
  std::array<double, 9> m_cellMatrix{};
  std::array<double, 3> m_boxSize{};
  std::array<double, 3> m_origo{};
  std::vector<float> m_particlePositions;
  std::vector<float> m_bondsPosition1;
  std::vector<float> m_bondsPosition2;
};

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_BINDINGS(lammps_web_module) {
  emscripten::class_<LAMMPSWeb>("LAMMPSWeb")
    .constructor<>()
    .function("start", &LAMMPSWeb::start)
    .function("stop", &LAMMPSWeb::stop)
    .function("step", &LAMMPSWeb::step)
    .function("runCommand", &LAMMPSWeb::runCommand)
    .function("runFile", &LAMMPSWeb::runFile)
    .function("getIsRunning", &LAMMPSWeb::getIsRunning)
    .function("getNumAtoms", &LAMMPSWeb::getNumAtoms)
    .function("getNumBonds", &LAMMPSWeb::getNumBonds)
    .function("computeParticles", &LAMMPSWeb::computeParticles)
    .function("computeBonds", &LAMMPSWeb::computeBonds)
    .function("getPositionsPointer", &LAMMPSWeb::getPositionsPointer)
    .function("getBondsPosition1Pointer", &LAMMPSWeb::getBondsPosition1Pointer)
    .function("getBondsPosition2Pointer", &LAMMPSWeb::getBondsPosition2Pointer)
    .function("getCellMatrixPointer", &LAMMPSWeb::getCellMatrixPointer)
    .function("getOrigoPointer", &LAMMPSWeb::getOrigoPointer)
    .function("getBoxSizePointer", &LAMMPSWeb::getBoxSizePointer)
    .function("getIdPointer", &LAMMPSWeb::getIdPointer)
    .function("getTypePointer", &LAMMPSWeb::getTypePointer);
}
#endif
