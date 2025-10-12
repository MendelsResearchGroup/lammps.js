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

  enum class ScalarType : std::uint8_t {
    Float32,
    Float64,
    Int32,
    Int64,
  };

  struct BufferView {
    pointer_type ptr = 0;
    std::uint32_t length = 0;
    std::uint32_t components = 1;
    ScalarType type = ScalarType::Float32;

    [[nodiscard]] bool empty() const noexcept { return ptr == 0 || length == 0; }
    [[nodiscard]] std::uint32_t count() const noexcept {
      return components == 0 ? 0 : length / components;
    }
  };

  struct ParticleSnapshot {
    BufferView positions;
    BufferView ids;
    BufferView types;
    std::uint32_t count = 0;
  };

  struct BondSnapshot {
    BufferView first;
    BufferView second;
    std::uint32_t count = 0;
  };

  struct BoxSnapshot {
    BufferView matrix;
    BufferView origin;
    BufferView lengths;
  };

  LAMMPSWeb();
  ~LAMMPSWeb();

  void start();
  void stop();

  void advance(std::int64_t steps = 1, bool applyPre = false, bool applyPost = false);
  void runCommand(const std::string &command);
  void runScript(const std::string &script);
  void runFile(const std::string &path);

  [[nodiscard]] bool isReady() const noexcept;
  [[nodiscard]] bool getIsRunning() const noexcept;
  [[nodiscard]] std::int64_t getCurrentStep() const noexcept;
  [[nodiscard]] double getTimestepSize() const noexcept;

  ParticleSnapshot syncParticles();
  BondSnapshot syncBonds();
  BoxSnapshot syncSimulationBox();

private:
  static void destroyLammps(LAMMPS_NS::LAMMPS *ptr) noexcept;
  using LammpsPtr = std::unique_ptr<LAMMPS_NS::LAMMPS, decltype(&LAMMPSWeb::destroyLammps)>;

  [[nodiscard]] bool hasSimulation() const noexcept { return static_cast<bool>(m_lmp); }
  [[nodiscard]] LAMMPS_NS::LAMMPS *raw() const noexcept { return m_lmp.get(); }
  void resetStaticBuffers() noexcept;

  template <typename Container>
  static pointer_type pointerFrom(Container &buffer) noexcept {
    using ValueType = typename Container::value_type;
    if (buffer.empty()) {
      return 0;
    }
    return reinterpret_cast<pointer_type>(buffer.data());
  }

  template <typename T, std::size_t N>
  static pointer_type pointerFrom(std::array<T, N> &buffer) noexcept {
    return reinterpret_cast<pointer_type>(buffer.data());
  }

  template <typename Container>
  static BufferView makeView(Container &buffer, std::uint32_t components, ScalarType type) noexcept {
    BufferView view{};
    view.ptr = pointerFrom(buffer);
    view.length = static_cast<std::uint32_t>(buffer.size());
    view.components = components;
    view.type = type;
    if (view.ptr == 0) {
      view.length = 0;
      view.components = 0;
    }
    return view;
  }

  static BufferView makeRawView(void *ptr, std::uint32_t count, std::uint32_t components, ScalarType type) noexcept {
    BufferView view{};
    if (!ptr || count == 0 || components == 0) {
      return view;
    }
    view.ptr = reinterpret_cast<pointer_type>(ptr);
    view.length = count * components;
    view.components = components;
    view.type = type;
    return view;
  }

  LammpsPtr m_lmp{nullptr, &LAMMPSWeb::destroyLammps};
  std::array<float, 9> m_cellMatrix{};
  std::array<float, 3> m_boxSize{};
  std::array<float, 3> m_origo{};
  std::vector<float> m_particlePositions;
  std::vector<float> m_bondsPosition1;
  std::vector<float> m_bondsPosition2;
};

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_BINDINGS(lammps_web_module) {
  emscripten::enum_<LAMMPSWeb::ScalarType>("ScalarType")
    .value("Float32", LAMMPSWeb::ScalarType::Float32)
    .value("Float64", LAMMPSWeb::ScalarType::Float64)
    .value("Int32", LAMMPSWeb::ScalarType::Int32)
    .value("Int64", LAMMPSWeb::ScalarType::Int64);

  emscripten::value_object<LAMMPSWeb::BufferView>("BufferView")
    .field("ptr", &LAMMPSWeb::BufferView::ptr)
    .field("length", &LAMMPSWeb::BufferView::length)
    .field("components", &LAMMPSWeb::BufferView::components)
    .field("type", &LAMMPSWeb::BufferView::type);

  emscripten::value_object<LAMMPSWeb::ParticleSnapshot>("ParticleSnapshot")
    .field("positions", &LAMMPSWeb::ParticleSnapshot::positions)
    .field("ids", &LAMMPSWeb::ParticleSnapshot::ids)
    .field("types", &LAMMPSWeb::ParticleSnapshot::types)
    .field("count", &LAMMPSWeb::ParticleSnapshot::count);

  emscripten::value_object<LAMMPSWeb::BondSnapshot>("BondSnapshot")
    .field("first", &LAMMPSWeb::BondSnapshot::first)
    .field("second", &LAMMPSWeb::BondSnapshot::second)
    .field("count", &LAMMPSWeb::BondSnapshot::count);

  emscripten::value_object<LAMMPSWeb::BoxSnapshot>("BoxSnapshot")
    .field("matrix", &LAMMPSWeb::BoxSnapshot::matrix)
    .field("origin", &LAMMPSWeb::BoxSnapshot::origin)
    .field("lengths", &LAMMPSWeb::BoxSnapshot::lengths);

  emscripten::class_<LAMMPSWeb>("LAMMPSWeb")
    .constructor<>()
    .function("start", &LAMMPSWeb::start)
    .function("stop", &LAMMPSWeb::stop)
    .function(
      "advance",
      emscripten::optional_override([](LAMMPSWeb &self,
                                       std::int64_t steps,
                                       emscripten::optional<bool> applyPre,
                                       emscripten::optional<bool> applyPost) {
        const bool pre = applyPre ? *applyPre : false;
        const bool post = applyPost ? *applyPost : false;
        self.advance(steps, pre, post);
      })
    )
    .function("runCommand", &LAMMPSWeb::runCommand)
    .function("runScript", &LAMMPSWeb::runScript)
    .function("runFile", &LAMMPSWeb::runFile)
    .function("isReady", &LAMMPSWeb::isReady)
    .function("getIsRunning", &LAMMPSWeb::getIsRunning)
    .function("getCurrentStep", &LAMMPSWeb::getCurrentStep)
    .function("getTimestepSize", &LAMMPSWeb::getTimestepSize)
    .function("syncParticles", &LAMMPSWeb::syncParticles)
    .function("syncBonds", &LAMMPSWeb::syncBonds)
    .function("syncSimulationBox", &LAMMPSWeb::syncSimulationBox);
}
#endif
