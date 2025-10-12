#include "lammpsweb.h"

#include "atom.h"
#include "domain.h"
#include "force.h"
#include "library.h"
#include "update.h"

#include <cstddef>
#include <stdexcept>

namespace {

constexpr const char kSingleStepScript[] = "run 1 pre no post no\n";

[[nodiscard]] double component(const double *const vector, const int index) noexcept {
  return vector[index];
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

void LAMMPSWeb::step() {
  auto *sim = raw();
  if (!sim) {
    return;
  }

  lammps_commands_string(static_cast<void *>(sim), kSingleStepScript);
}

void LAMMPSWeb::runCommand(const std::string &command) {
  auto *sim = raw();
  if (!sim) {
    return;
  }

  lammps_commands_string(static_cast<void *>(sim), command.c_str());
}

void LAMMPSWeb::runFile(const std::string &path) {
  auto *sim = raw();
  if (!sim) {
    return;
  }

  lammps_file(static_cast<void *>(sim), path.c_str());
}

bool LAMMPSWeb::getIsRunning() const noexcept {
  const auto *sim = raw();
  if (!sim || !sim->update) {
    return false;
  }
  return sim->update->whichflag != 0;
}

int LAMMPSWeb::getNumAtoms() const noexcept {
  const auto *sim = raw();
  if (!sim) {
    return 0;
  }
  return static_cast<int>(lammps_get_natoms(static_cast<void *>(const_cast<LAMMPS_NS::LAMMPS *>(sim))));
}

int LAMMPSWeb::getNumBonds() const noexcept {
  return static_cast<int>(m_bondsPosition1.size() / 3);
}

int LAMMPSWeb::computeParticles() {
  auto *sim = raw();
  if (!sim || !sim->atom || !sim->domain) {
    m_particlePositions.clear();
    return 0;
  }

  auto *atom = sim->atom;
  const int numAtoms = static_cast<int>(atom->natoms);

  m_particlePositions.resize(static_cast<std::size_t>(numAtoms) * 3);
  if (numAtoms == 0) {
    return 0;
  }

  auto *domain = sim->domain;
  auto *image = static_cast<int *>(lammps_extract_atom(static_cast<void *>(sim), "image"));

  for (int i = 0; i < numAtoms; ++i) {
    double position[3] = { atom->x[i][0], atom->x[i][1], atom->x[i][2] };
    if (image) {
      domain->unmap(position, image[i]);
    }

    const auto base = static_cast<std::size_t>(i) * 3;
    m_particlePositions[base + 0] = static_cast<float>(position[0]);
    m_particlePositions[base + 1] = static_cast<float>(position[1]);
    m_particlePositions[base + 2] = static_cast<float>(position[2]);
  }

  return numAtoms;
}

int LAMMPSWeb::computeBonds() {
  auto *sim = raw();
  if (!sim || !sim->atom || !sim->domain) {
    m_bondsPosition1.clear();
    m_bondsPosition2.clear();
    return 0;
  }

  auto *atom = sim->atom;
  auto *domain = sim->domain;

  if (atom->nbonds == 0 || !atom->num_bond || !atom->bond_atom) {
    m_bondsPosition1.clear();
    m_bondsPosition2.clear();
    return 0;
  }

  const auto totalBonds = static_cast<std::size_t>(atom->nbonds) * 3;
  m_bondsPosition1.clear();
  m_bondsPosition2.clear();
  m_bondsPosition1.reserve(totalBonds);
  m_bondsPosition2.reserve(totalBonds);

  auto *image = static_cast<int *>(lammps_extract_atom(static_cast<void *>(sim), "image"));
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

      double dx = second[0] - first[0];
      double dy = second[1] - first[1];
      double dz = second[2] - first[2];
      domain->minimum_image(dx, dy, dz);

      m_bondsPosition1.push_back(static_cast<float>(first[0]));
      m_bondsPosition1.push_back(static_cast<float>(first[1]));
      m_bondsPosition1.push_back(static_cast<float>(first[2]));

      m_bondsPosition2.push_back(static_cast<float>(first[0] + dx));
      m_bondsPosition2.push_back(static_cast<float>(first[1] + dy));
      m_bondsPosition2.push_back(static_cast<float>(first[2] + dz));
    }
  }

  return getNumBonds();
}

LAMMPSWeb::pointer_type LAMMPSWeb::getPositionsPointer() noexcept {
  return pointerFrom(m_particlePositions);
}

LAMMPSWeb::pointer_type LAMMPSWeb::getBondsPosition1Pointer() noexcept {
  return pointerFrom(m_bondsPosition1);
}

LAMMPSWeb::pointer_type LAMMPSWeb::getBondsPosition2Pointer() noexcept {
  return pointerFrom(m_bondsPosition2);
}

LAMMPSWeb::pointer_type LAMMPSWeb::getCellMatrixPointer() noexcept {
  auto *sim = raw();
  if (!sim || !sim->domain) {
    return 0;
  }

  auto *domain = sim->domain;
  domain->box_corners();

  const double *origin = domain->corners[0];
  const double *a = domain->corners[1];
  const double *b = domain->corners[2];
  const double *c = domain->corners[4];

  for (int axis = 0; axis < 3; ++axis) {
    m_cellMatrix[axis] = component(a, axis) - component(origin, axis);
    m_cellMatrix[3 + axis] = component(b, axis) - component(origin, axis);
    m_cellMatrix[6 + axis] = component(c, axis) - component(origin, axis);
  }

  return pointerFrom(m_cellMatrix);
}

LAMMPSWeb::pointer_type LAMMPSWeb::getOrigoPointer() noexcept {
  auto *sim = raw();
  if (!sim || !sim->domain) {
    return 0;
  }

  auto *domain = sim->domain;
  domain->box_corners();

  for (int axis = 0; axis < 3; ++axis) {
    m_origo[axis] = component(domain->corners[0], axis);
  }

  return pointerFrom(m_origo);
}

LAMMPSWeb::pointer_type LAMMPSWeb::getBoxSizePointer() noexcept {
  auto *sim = raw();
  if (!sim || !sim->domain) {
    return 0;
  }

  auto *domain = sim->domain;
  m_boxSize[0] = domain->prd[0];
  m_boxSize[1] = domain->prd[1];
  m_boxSize[2] = domain->prd[2];

  return pointerFrom(m_boxSize);
}

LAMMPSWeb::pointer_type LAMMPSWeb::getIdPointer() const noexcept {
  const auto *sim = raw();
  if (!sim) {
    return 0;
  }

  auto *ids = lammps_extract_atom(static_cast<void *>(const_cast<LAMMPS_NS::LAMMPS *>(sim)), "id");
  return reinterpret_cast<pointer_type>(ids);
}

LAMMPSWeb::pointer_type LAMMPSWeb::getTypePointer() const noexcept {
  const auto *sim = raw();
  if (!sim) {
    return 0;
  }

  auto *types = lammps_extract_atom(static_cast<void *>(const_cast<LAMMPS_NS::LAMMPS *>(sim)), "type");
  return reinterpret_cast<pointer_type>(types);
}

void LAMMPSWeb::resetStaticBuffers() noexcept {
  m_cellMatrix.fill(0.0);
  m_boxSize.fill(0.0);
  m_origo.fill(0.0);
  m_particlePositions.clear();
  m_bondsPosition1.clear();
  m_bondsPosition2.clear();
}
