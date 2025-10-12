CXX = emcc

LAMMPS_SOURCE := $(wildcard lammps/src/*.cpp)
LAMMPS_SOURCE := $(filter-out lammps/src/main.cpp, $(LAMMPS_SOURCE))
LAMMPS_OBJ_FILES := $(addprefix obj/,$(notdir $(LAMMPS_SOURCE:.cpp=.o)))

#LD_FLAGS := -O1 --pre-js locateFile.js --no-entry -gsource-map --source-map-base="http://localhost:3000/atomify/" -lembind
#CC_FLAGS := -O0 -DLAMMPS_EXCEPTIONS -DLAMMPS_SMALLSMALL -gsource-map # -DNDEBUG
LD_FLAGS := -Oz --pre-js locateFile.js --no-entry -lembind
CC_FLAGS := -Oz -DLAMMPS_EXCEPTIONS -DLAMMPS_SMALLSMALL -s NO_DISABLE_EXCEPTION_CATCHING=1 -DCOLVARS_LAMMPS
INCLUDE_FLAGS := -Ilammps/src
SYMBOLS := \
  -s ENVIRONMENT='web,worker' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s ASYNCIFY \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORT_NAME='createModule' \
  -s EXPORTED_RUNTIME_METHODS="['getValue','FS', 'HEAPF32']" \
  -s FORCE_FILESYSTEM=1 \
  -s SINGLE_FILE=1 \
  -s ASSERTIONS=2 \
  -s INITIAL_MEMORY=2048MB \
  -s TOTAL_STACK=1024MB \
  -s SINGLE_FILE=1 \
  -s DISABLE_EXCEPTION_CATCHING=0 \

default: wasm
wasm: obj lammps.js

lammps.js: $(LAMMPS_OBJ_FILES)
	$(CXX) $(SYMBOLS) $(LD_FLAGS) -o $@ $^
	
obj:
	mkdir -p obj

obj/%.o: lammps/src/%.cpp
	$(CXX) $(CC_FLAGS) $(INCLUDE_FLAGS) -c -o $@ $<

clean:
	rm lammps.js; rm obj/*