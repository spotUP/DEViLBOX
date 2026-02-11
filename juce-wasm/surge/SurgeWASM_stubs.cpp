/**
 * SurgeWASM_stubs.cpp — Minimal stubs for Surge XT symbols excluded from WASM build
 *
 * Provides stubs for functions from excluded source files:
 *   - SurgeSynthesizerIO.cpp (filesystem/PatchDB/UserDefaults deps)
 *   - FormulaModulationHelper.cpp (Lua dependency)
 *   - UserDefaults.cpp (filesystem dependency)
 *   - PatchDB.cpp / PatchDBQueryParser.cpp (SQLite dependency)
 *   - FxPresetAndClipboardManager.cpp (filesystem dependency)
 *   - ModulatorPresetManager.cpp (filesystem dependency)
 *   - WAVFileSupport.cpp (filesystem dependency)
 *   - version.cpp (build system generated)
 */

#include "SurgeSynthesizer.h"
#include "SurgeStorage.h"
#include "dsp/modulators/FormulaModulationHelper.h"
#include "UserDefaults.h"
#include "PatchDB.h"
#include "FxPresetAndClipboardManager.h"
#include "ModulatorPresetManager.h"
#include "version.h"

// ========================================================================
// SurgeSynthesizerIO.cpp stubs
// ========================================================================

void SurgeSynthesizer::loadRaw(const void *data, int size, bool preset)
{
    halt_engine = true;
    allNotesOff();

    for (int s = 0; s < n_scenes; s++)
        for (int i = 0; i < n_customcontrollers; i++)
            storage.getPatch().scene[s].modsources[ms_ctrl1 + i]->reset();

    storage.getPatch().init_default_values();
    storage.getPatch().load_patch(data, size, preset);
    storage.getPatch().update_controls(false, nullptr, true);

    for (int i = 0; i < n_fx_slots; i++)
    {
        fxsync[i] = storage.getPatch().fx[i];
        fx_reload[i] = true;
    }

    loadFx(false, true);

    halt_engine = false;
    patch_loaded = true;
    refresh_editor = true;
}

bool SurgeSynthesizer::loadPatchByPath(const char *fxpPath, int categoryId,
                                       const char *name, bool forceIsPreset)
{
    return false;
}

void SurgeSynthesizer::loadPatch(int id) {}
void SurgeSynthesizer::savePatchToPath(fs::path p, bool refreshPatchList) {}
void SurgeSynthesizer::savePatch(bool factoryInPlace, bool skipOverwrite) {}
void SurgeSynthesizer::selectRandomPatch() {}
void SurgeSynthesizer::jogCategory(bool increment) {}
void SurgeSynthesizer::jogPatch(bool increment, bool insideCategory) {}
void SurgeSynthesizer::jogPatchOrCategory(bool increment, bool isCategory, bool insideCategory) {}
void SurgeSynthesizer::processEnqueuedPatchIfNeeded() {}

// ========================================================================
// WAVFileSupport.cpp stub
// ========================================================================

bool SurgeStorage::load_wt_wav_portable(std::string filename, Wavetable *wt, std::string &metadata)
{
    return false;
}

// ========================================================================
// FormulaModulationHelper.cpp stubs (Lua dependency excluded)
// ========================================================================

namespace Surge
{
namespace Formula
{

void setupStorage(SurgeStorage *s) {}

bool initEvaluatorState(EvaluatorState &s)
{
    s.isvalid = false;
    s.L = nullptr;
    return true;
}

bool cleanEvaluatorState(EvaluatorState &s)
{
    s.isvalid = false;
    s.L = nullptr;
    return true;
}

void removeFunctionsAssociatedWith(SurgeStorage *, FormulaModulatorStorage *fs) {}

bool prepareForEvaluation(SurgeStorage *storage, FormulaModulatorStorage *fs,
                          EvaluatorState &s, bool is_display)
{
    s.isvalid = false;
    return false;
}

void setupEvaluatorStateFrom(EvaluatorState &s, const SurgePatch &patch, int sceneIndex) {}

void setupEvaluatorStateFrom(EvaluatorState &s, SurgeVoice *v) {}

void valueAt(int phaseIntPart, float phaseFracPart, SurgeStorage *,
             FormulaModulatorStorage *fs, EvaluatorState *state,
             float output[max_formula_outputs], bool justSetup)
{
    for (int i = 0; i < max_formula_outputs; i++)
        output[i] = 0.f;
}

void createInitFormula(FormulaModulatorStorage *fs)
{
    fs->setFormula(R"FN(function process(state)
    state.output = state.phase * 2 - 1
    return state
end)FN");
    fs->interpreter = FormulaModulatorStorage::LUA;
}

bool isUserDefined(std::string) { return false; }

void setUserDefined(DebugRow &, int, bool) {}

std::vector<DebugRow> createDebugDataOfModState(const EvaluatorState &, std::string, bool[8])
{
    return {};
}

std::string createDebugViewOfModState(const EvaluatorState &)
{
    return "(unavailable in WASM)";
}

std::variant<float, std::string, bool> runOverModStateForTesting(const std::string &,
                                                                  const EvaluatorState &)
{
    return 0.0f;
}

std::variant<float, std::string, bool> extractModStateKeyForTesting(const std::string &,
                                                                     const EvaluatorState &)
{
    return 0.0f;
}

} // namespace Formula
} // namespace Surge

// ========================================================================
// UserDefaults.cpp stubs
// ========================================================================

namespace Surge
{
namespace Storage
{

std::string getUserDefaultValue(SurgeStorage *storage, const DefaultKey &key,
                                const std::string &valueIfMissing, bool potentiallyRead)
{
    return valueIfMissing;
}

int getUserDefaultValue(SurgeStorage *storage, const DefaultKey &key, int valueIfMissing,
                        bool potentiallyRead)
{
    return valueIfMissing;
}

std::pair<int, int> getUserDefaultValue(SurgeStorage *storage, const DefaultKey &key,
                                        const std::pair<int, int> &valueIfMissing,
                                        bool potentiallyRead)
{
    return valueIfMissing;
}

bool updateUserDefaultValue(SurgeStorage *storage, const DefaultKey &key, const std::string &value)
{
    return false;
}

bool updateUserDefaultValue(SurgeStorage *storage, const DefaultKey &key, const int value)
{
    return false;
}

bool updateUserDefaultValue(SurgeStorage *storage, const DefaultKey &key,
                            const std::pair<int, int> &value)
{
    return false;
}

std::string defaultKeyToString(DefaultKey k) { return "unknown"; }

// ========================================================================
// FxPresetAndClipboardManager.cpp stubs
// ========================================================================

void FxUserPreset::doPresetRescan(SurgeStorage *storage, bool forceRescan) {}

// ========================================================================
// ModulatorPresetManager.cpp stubs
// ========================================================================

void ModulatorPreset::forcePresetRescan() {}

} // namespace Storage
} // namespace Surge

// ========================================================================
// PatchDB.cpp stubs (SQLite dependency excluded)
// ========================================================================

namespace Surge
{
namespace PatchStorage
{

struct PatchDB::WriterWorker {};

PatchDB::PatchDB(SurgeStorage *s) : storage(s) {}
PatchDB::~PatchDB() = default;

void PatchDB::initialize() {}
void PatchDB::prepareForWrites() {}
std::vector<std::string> PatchDB::readUserFavorites() { return {}; }

// Stubs for other PatchDB methods that may be referenced
void PatchDB::considerFXPForLoad(const fs::path &, const std::string &,
                                  const std::string &, const CatType) const {}
void PatchDB::addRootCategory(const std::string &, CatType) {}
void PatchDB::addSubCategory(const std::string &, const std::string &, CatType) {}
void PatchDB::addDebugMessage(const std::string &) {}
void PatchDB::setUserFavorite(const std::string &, bool) {}
void PatchDB::erasePatchByID(int) {}
void PatchDB::doAfterCurrentQueueDrained(std::function<void()>) {}
int PatchDB::numberOfJobsOutstanding() { return 0; }
int PatchDB::waitForJobsOutstandingComplete(int) { return 0; }
std::vector<std::pair<std::string, int>> PatchDB::readAllFeatures() { return {}; }
std::vector<std::string> PatchDB::readAllFeatureValueString(const std::string &) { return {}; }
std::vector<int> PatchDB::readAllFeatureValueInt(const std::string &) { return {}; }
std::unordered_map<std::string, std::pair<int, int64_t>> PatchDB::readAllPatchPathsWithIdAndModTime() { return {}; }
std::string PatchDB::sqlWhereClauseFor(const std::unique_ptr<PatchDBQueryParser::Token> &) { return ""; }
std::vector<PatchDB::patchRecord> PatchDB::queryFromQueryString(const std::unique_ptr<PatchDBQueryParser::Token> &) { return {}; }
std::vector<PatchDB::patchRecord> PatchDB::rawQueryForNameLike(const std::string &) { return {}; }
std::vector<PatchDB::catRecord> PatchDB::rootCategoriesForType(const CatType) { return {}; }
std::vector<PatchDB::catRecord> PatchDB::childCategoriesOf(int) { return {}; }

} // namespace PatchStorage
} // namespace Surge

// ========================================================================
// PatchDBQueryParser stubs
// ========================================================================

namespace Surge
{
namespace PatchStorage
{

std::unique_ptr<PatchDBQueryParser::Token> PatchDBQueryParser::parseQuery(const std::string &)
{
    return nullptr;
}

void PatchDBQueryParser::printParseTree(std::ostream &, const std::unique_ptr<Token> &,
                                         const std::string)
{
}

} // namespace PatchStorage
} // namespace Surge

// ========================================================================
// version.cpp stubs (normally generated by build system)
// ========================================================================

// ========================================================================
// BBDEnsembleEffect.cpp stub (excluded — chowdsp dependency)
// ========================================================================

int ensemble_stage_count() { return 7; }

// ========================================================================
// version.cpp stubs (normally generated by build system)
// ========================================================================

const char *Surge::Build::MajorVersionStr = "1";
const int Surge::Build::MajorVersionInt = 1;
const char *Surge::Build::SubVersionStr = "4";
const int Surge::Build::SubVersionInt = 4;
const char *Surge::Build::ReleaseNumberStr = "0";
const char *Surge::Build::ReleaseStr = "WASM";
const bool Surge::Build::IsRelease = false;
const bool Surge::Build::IsNightly = true;
const char *Surge::Build::GitHash = "wasm";
const char *Surge::Build::GitBranch = "wasm";
const char *Surge::Build::BuildNumberStr = "0";
const char *Surge::Build::FullVersionStr = "1.4.0-WASM";
const char *Surge::Build::BuildHost = "emscripten";
const char *Surge::Build::BuildArch = "wasm32";
const char *Surge::Build::BuildCompiler = "emcc";
const char *Surge::Build::BuildLocation = "Local";
const char *Surge::Build::BuildDate = __DATE__;
const char *Surge::Build::BuildTime = __TIME__;
const char *Surge::Build::BuildYear = "2026";
const char *Surge::Build::CMAKE_INSTALL_PREFIX = "/tmp";
