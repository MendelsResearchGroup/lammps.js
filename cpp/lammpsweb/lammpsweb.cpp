#include "lammpsweb.h"

#include "atom.h"
#include "domain.h"
#include "force.h"
#include "library.h"
#include "lmptype.h"
#include "update.h"

#include <cstddef>
#include <cstdint>
#include <stdexcept>
#include <string>

namespace {

inline std::string buildRunCommand(std::int64_t steps, bool applyPre, bool applyPost) {
  std::string command = "run ";
  command += std::to_string(steps);
  command += applyPre ? " pre yes" : " pre no";
  command += applyPost ? " post yes" : " post no";
  command.push_back('\n');
  return command;
}

inline LAMMPSWeb::ScalarType scalarForTagint() noexcept {
  using LAMMPS_NS::tagint;
  if (sizeof(tagint) == sizeof(std::int64_t)) {
    return LAMMPSWeb::ScalarType::Int64;
  }
  return LAMMPSWeb::ScalarType::Int32;
}

template <typename DomainT>
auto invokeMinimumImage(DomainT* domain, double &dx, double &dy, double &dz, int)
    -> decltype(domain->minimum_image(dx, dy, dz), (void)0) {
  domain->minimum_image(dx, dy, dz);
}

template <typename DomainT>
auto invokeMinimumImage(DomainT* domain, double &dx, double &dy, double &dz, long)
    -> decltype(domain->minimum_image("LAMMPSWeb", 0, dx, dy, dz), (void)0) {
  domain->minimum_image("LAMMPSWeb", 0, dx, dy, dz);
}

inline void applyMinimumImage(LAMMPS_NS::Domain* domain, double &dx, double &dy, double &dz) {
  invokeMinimumImage(domain, dx, dy, dz, 0);
}

}  // namespace

void LAMMPSWeb::destroyLammps(LAMMPS_NS::LAMMPS *ptr) noexcept {
  if (ptr) {
    lammps_close(static_cast<void *>(ptr));
  }
}

LAMMPSWeb::LAMMPSWeb() = default;

LAMMPSWeb::~LAMMPSWeb() {
  stop();
}

void LAMMPSWeb::start() {
  if (hasSimulation()) {
    stop();
  }

  auto *instance = static_cast<LAMMPS_NS::LAMMPS *>(
    lammps_open_no_mpi(0, nullptr, nullptr)
  );

  if (!instance) {
    throw std::runtime_error("Failed to open LAMMPS instance");
  }

  m_lmp.reset(instance);
}

void LAMMPSWeb::stop() {
  if (!hasSimulation()) {
    return;
  }

  m_lmp.reset();
  resetStaticBuffers();
}

void LAMMPSWeb::advance(std::int64_t steps, bool applyPre, bool applyPost) {
  auto *sim = raw();
  if (!sim || steps <= 0) {
    return;
  }

  const std::string command = buildRunCommand(steps, applyPre, applyPost);
  lammps_commands_string(static_cast<void *>(sim), command.c_str());
}

void LAMMPSWeb::runCommand(const std::string &command) {
  if (command.empty()) {
    return;
  }

  std::string script = command;
  if (script.back() != '\n') {
    script.push_back('\n');
  }
  runScript(script);
}

void LAMMPSWeb::runScript(const std::string &script) {
  auto *sim = raw();
  if (!sim || script.empty()) {
    return;
  }

  lammps_commands_string(static_cast<void *>(sim), script.c_str());
}

void LAMMPSWeb::runFile(const std::string &path) {
  auto *sim = raw();
  if (!sim || path.empty()) {
    return;
  }

  lammps_file(static_cast<void *>(sim), path.c_str());
}

bool LAMMPSWeb::isReady() const noexcept {
  return hasSimulation();
}

bool LAMMPSWeb::getIsRunning() const noexcept {
  const auto *sim = raw();
  return sim && sim->update && sim->update->whichflag != 0;
}

double LAMMPSWeb::getCurrentStep() const noexcept {
  const auto *sim = raw();
  if (!sim || !sim->update) {
    return 0;
  }
  return static_cast<double>(sim->update->ntimestep);
}

double LAMMPSWeb::getTimestepSize() const noexcept {
  const auto *sim = raw();
  if (!sim || !sim->update) {
    return 0.0;
  }
  return sim->update->dt;
}

LAMMPSWeb::ParticleSnapshot LAMMPSWeb::syncParticles() {
  return captureParticles(false);
}

LAMMPSWeb::ParticleSnapshot LAMMPSWeb::syncParticlesWrapped() {
  return captureParticles(true);
}

LAMMPSWeb::BondSnapshot LAMMPSWeb::syncBonds() {
  return captureBonds(false);
}

LAMMPSWeb::BondSnapshot LAMMPSWeb::syncBondsWrapped() {
  return captureBonds(true);
}

LAMMPSWeb::ParticleSnapshot LAMMPSWeb::captureParticles(bool wrapped) {
  ParticleSnapshot snapshot{};

  auto *sim = raw();
  if (!sim || !sim->atom || !sim->domain) {
    m_particlePositions.clear();
    return snapshot;
  }

  auto *atom = sim->atom;
  const auto numAtoms = static_cast<std::uint32_t>(atom->natoms);
  if (numAtoms == 0) {
    m_particlePositions.clear();
    return snapshot;
  }

  m_particlePositions.resize(static_cast<std::size_t>(numAtoms) * 3);

  auto *domain = sim->domain;
  auto *image = wrapped ? nullptr : static_cast<int *>(lammps_extract_atom(static_cast<void *>(sim), "image"));

  for (std::uint32_t i = 0; i < numAtoms; ++i) {
    double position[3] = { atom->x[i][0], atom->x[i][1], atom->x[i][2] };
    if (image) {
      domain->unmap(position, image[i]);
    }

    const auto base = static_cast<std::size_t>(i) * 3;
    m_particlePositions[base + 0] = static_cast<float>(position[0]);
    m_particlePositions[base + 1] = static_cast<float>(position[1]);
    m_particlePositions[base + 2] = static_cast<float>(position[2]);
  }

  snapshot.count = numAtoms;
  snapshot.positions = makeView(m_particlePositions, 3, ScalarType::Float32);

  auto *ids = lammps_extract_atom(static_cast<void *>(sim), "id");
  snapshot.ids = makeRawView(ids, numAtoms, 1, scalarForTagint());

  auto *types = lammps_extract_atom(static_cast<void *>(sim), "type");
  snapshot.types = makeRawView(types, numAtoms, 1, ScalarType::Int32);

  return snapshot;
}

LAMMPSWeb::BondSnapshot LAMMPSWeb::captureBonds(bool wrapped) {
  BondSnapshot snapshot{};

  auto *sim = raw();
  if (!sim || !sim->atom || !sim->domain) {
    m_bondsPosition1.clear();
    m_bondsPosition2.clear();
    return snapshot;
  }

  auto *atom = sim->atom;
  auto *domain = sim->domain;

  if (atom->nbonds == 0 || !atom->num_bond || !atom->bond_atom) {
    m_bondsPosition1.clear();
    m_bondsPosition2.clear();
    return snapshot;
  }

  const auto totalBonds = static_cast<std::size_t>(atom->nbonds);
  m_bondsPosition1.clear();
  m_bondsPosition2.clear();
  m_bondsPosition1.reserve(totalBonds * 3);
  m_bondsPosition2.reserve(totalBonds * 3);

  auto *image = wrapped ? nullptr : static_cast<int *>(lammps_extract_atom(static_cast<void *>(sim), "image"));
  const bool shareBondAcrossRanks = sim->force && sim->force->newton_bond;

  for (int atomIndex = 0; atomIndex < atom->natoms; ++atomIndex) {
    const int bondCount = atom->num_bond[atomIndex];
    if (bondCount <= 0) {
      continue;
    }

    double first[3] = { atom->x[atomIndex][0], atom->x[atomIndex][1], atom->x[atomIndex][2] };
    if (image) {
      domain->unmap(first, image[atomIndex]);
    }

    for (int bondIndex = 0; bondIndex < bondCount; ++bondIndex) {
      const int mappedIndex = atom->map(atom->bond_atom[atomIndex][bondIndex]);
      if (mappedIndex < 0 || mappedIndex >= atom->natoms) {
        continue;
      }

      if (!shareBondAcrossRanks && atomIndex < mappedIndex) {
        continue;
      }

      double second[3] = { atom->x[mappedIndex][0], atom->x[mappedIndex][1], atom->x[mappedIndex][2] };
      if (image) {
        domain->unmap(second, image[mappedIndex]);
      }

      m_bondsPosition1.push_back(static_cast<float>(first[0]));
      m_bondsPosition1.push_back(static_cast<float>(first[1]));
      m_bondsPosition1.push_back(static_cast<float>(first[2]));

      if (wrapped) {
        m_bondsPosition2.push_back(static_cast<float>(second[0]));
        m_bondsPosition2.push_back(static_cast<float>(second[1]));
        m_bondsPosition2.push_back(static_cast<float>(second[2]));
      } else {
        double dx = second[0] - first[0];
        double dy = second[1] - first[1];
        double dz = second[2] - first[2];
        applyMinimumImage(domain, dx, dy, dz);

        m_bondsPosition2.push_back(static_cast<float>(first[0] + dx));
        m_bondsPosition2.push_back(static_cast<float>(first[1] + dy));
        m_bondsPosition2.push_back(static_cast<float>(first[2] + dz));
      }
    }
  }

  snapshot.count = static_cast<std::uint32_t>(m_bondsPosition1.size() / 3);
  snapshot.first = makeView(m_bondsPosition1, 3, ScalarType::Float32);
  snapshot.second = makeView(m_bondsPosition2, 3, ScalarType::Float32);
  return snapshot;
}

LAMMPSWeb::BoxSnapshot LAMMPSWeb::syncSimulationBox() {
  BoxSnapshot snapshot{};

  auto *sim = raw();
  if (!sim || !sim->domain) {
    m_cellMatrix.fill(0.0f);
    m_boxSize.fill(0.0f);
    m_origo.fill(0.0f);
    return snapshot;
  }

  auto *domain = sim->domain;
  domain->box_corners();

  const double *origin = domain->corners[0];
  const double *a = domain->corners[1];
  const double *b = domain->corners[2];
  const double *c = domain->corners[4];

  for (int axis = 0; axis < 3; ++axis) {
    m_cellMatrix[axis] = static_cast<float>(a[axis] - origin[axis]);
    m_cellMatrix[3 + axis] = static_cast<float>(b[axis] - origin[axis]);
    m_cellMatrix[6 + axis] = static_cast<float>(c[axis] - origin[axis]);
    m_origo[axis] = static_cast<float>(origin[axis]);
    m_boxSize[axis] = static_cast<float>(domain->prd[axis]);
  }

  snapshot.matrix = makeView(m_cellMatrix, 3, ScalarType::Float32);
  snapshot.origin = makeView(m_origo, 3, ScalarType::Float32);
  snapshot.lengths = makeView(m_boxSize, 3, ScalarType::Float32);
  return snapshot;
}

void LAMMPSWeb::resetStaticBuffers() noexcept {
  m_cellMatrix.fill(0.0f);
  m_boxSize.fill(0.0f);
  m_origo.fill(0.0f);
  m_particlePositions.clear();
  m_bondsPosition1.clear();
  m_bondsPosition2.clear();
}
