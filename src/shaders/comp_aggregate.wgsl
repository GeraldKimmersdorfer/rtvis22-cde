
struct Uniforms {
	gridProperties: vec4<f32>,		// hexagon size, vertical space, horizontal space, border
    screenSize: vec2<u32>,			// the size of the viewport
    gridResolution: vec2<u32>,		// resolution of the grid

    timeRangeBounds: vec4<u32>,     // contains TimeAMin, TimeAMax, TimeBMin, TimeBMax already in the appropriate dm
    monthComparison: i32,           // which month to compare (-1... whole year, 0...January, ...)
    firstMonthIndex: u32,           // contains the index of the first month. (in the dataset the first month is dec 1743 therefore it will be 11)

    gridAspect: u32,                // 1 if grid should respect viewport aspect ratio
    colorMode: u32,                 // 0...sequential, 1...diverging
    colorA: vec4<f32>,              // color for max values
    colorB: vec4<f32>,              // color for 0 (if diverging)
    colorC: vec4<f32>,              // color for min values
    colorNull: vec4<f32>            // color for empty cell
};

struct PositionEntry {
    position: vec2<f32>,            // the precalculated x and y position
    index_bounds: vec2<u32>         // min and max id inside temperaturelist, (requires temperaturelist sorted by pid)
}

struct TemperatureEntry {
    dm: u32,
    avgt: f32,
    src: u32
}

struct GridEntry {
    mPoint: vec2<f32>,
    value: f32,
    valueN: u32
}

const ATOMIC_FLOAT_DIS_BOUNDS:vec2<f32> = vec2<f32>(-1000.0, 1000.0);
const AGGREGATE_WORKGROUP_SIZE:u32 = 64;
const MAX_U32:f32 = 4294967295.0;

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
/* NOTE: I had to figure out the hardway that compute shaders can't write in an array<vec3<f32>>... */
@group(0) @binding(1) var<storage, read_write> grid: array<GridEntry>;
@group(0) @binding(2) var<storage, read> positions: array<PositionEntry>;
@group(0) @binding(3) var<storage, read> temperatures: array<TemperatureEntry>;
@group(0) @binding(4) var<storage, read_write> workgroupBounds: array<vec2<f32>>;

var<workgroup> sharedIntMax:atomic<u32>;
var<workgroup> sharedIntMin:atomic<u32>;
var<workgroup> sharedN:atomic<u32>;

fn pos_inside_circle(pos:vec2<f32>, circle_middle:vec2<f32>, circle_radius:f32) -> bool {
    var distord:vec2<f32> = vec2<f32>(1.0);
    if (uniforms.gridAspect == 1) {
        // In order to take into account that the hexagons might be distorted we'll stretch the points accordingly such that
        // we again can check with a simple circle
        distord.x = f32(uniforms.screenSize.x) / f32(uniforms.screenSize.y);
    }
    return (distance(pos * distord, circle_middle * distord) < circle_radius);
}

// We discretize linearly between ATOMIC_FLOAT_DIS_BOUNDS and hope that no avg temperature will be outside oO
fn f32_to_u32(val:f32) -> u32 {
    return u32((val - ATOMIC_FLOAT_DIS_BOUNDS.x) / (ATOMIC_FLOAT_DIS_BOUNDS.y - ATOMIC_FLOAT_DIS_BOUNDS.x) * MAX_U32);
}
fn u32_to_f32(val:u32) -> f32 {
    return f32(val) / MAX_U32 * (ATOMIC_FLOAT_DIS_BOUNDS.y - ATOMIC_FLOAT_DIS_BOUNDS.x) + ATOMIC_FLOAT_DIS_BOUNDS.x;
}

@compute @workgroup_size(AGGREGATE_WORKGROUP_SIZE)
fn cs_main(
    @builtin(global_invocation_id) globalId: vec3<u32>,
    @builtin(local_invocation_index) localId: u32, // Current index inside the workgroup, 0 is in charge for writting the shared max/min
    @builtin(workgroup_id) workgroupId: vec3<u32>,  // Workgroup index inside workgroup grid, (only x relevant)
) {
    let i: u32 = globalId.x;
    let N: u32 = uniforms.gridResolution.x * uniforms.gridResolution.y;
    var gridValue:GridEntry;
    let time_range_bounds:vec4<u32> = uniforms.timeRangeBounds;

    /// ================================================================================
    /// CALCULATE GRID PROPERTIES
    /// The following calculates the middle points for the current cell (thread=cell)
    /// ================================================================================
    // Note: Executing the compute shader on the grid is probably a more elegant solution!
    let col = i % uniforms.gridResolution.x;
    let row = i / uniforms.gridResolution.x;
    var mPointPos:vec2<f32> = vec2<f32>(f32(col) * uniforms.gridProperties.z, f32(row) * uniforms.gridProperties.y);

    if (row % 2 == 1) { // offset for odd rows
        let x0 = uniforms.gridProperties.z / 2.0;
        mPointPos.x += x0;
    }
    gridValue.mPoint = mPointPos;

    /// ================================================================================
    /// AGGREGATE VALUES
    /// The most important step: Aggregate all temperature values inside the given time_
    /// range and the current cell position.
    /// ================================================================================
    var val = 0.0;
    var valN:u32 = 0;

    let posN = arrayLength(&positions);
    var tempSum: vec2<f32> = vec2<f32>(0.0, 0.0);
    var tempN: vec2<u32> = vec2<u32>(0, 0);
    // ToDo: Use kd-tree or quadtree to speed up things!
    for (var j:u32=0; j < posN; j++) {
        let p:PositionEntry = positions[j];
        // ToDo: Collision should be checked with hexagon not with circle (we have possible overlaps right now)
        // Note: To make it faster we could first check with outer circle to completely discard positions before doing the fine check
        if (pos_inside_circle(p.position, mPointPos, uniforms.gridProperties.x)) {
            for (var k:u32=p.index_bounds[0]; k <= p.index_bounds[1]; k++) {
                let t:TemperatureEntry = temperatures[k];
                if (uniforms.monthComparison > -1) {
                    if ((t.dm + uniforms.firstMonthIndex) % 12 != u32(uniforms.monthComparison)) {
                        continue;
                    }
                }
                if (t.dm >= time_range_bounds[0] && t.dm <= time_range_bounds[1]) {
                    tempSum.x += t.avgt;
                    tempN.x += 1;
                }
                if (t.dm >= time_range_bounds[2] && t.dm <= time_range_bounds[3]) {
                    tempSum.y += t.avgt;
                    tempN.y += 1;
                }
            }  
        }
    }

    if (tempN.x > 0 && tempN.y > 0) { // Check for divbyzero error (no entry in given time range and position)
        var tempAvg: vec2<f32> = tempSum / vec2<f32>(tempN);
        val = tempAvg[1] - tempAvg[0];
        valN = tempN.x + tempN.y;
    }

    /// ================================================================================
    /// GET MIN/MAX PER WORKGROUP
    /// The following calculates the min/max values per workgroup and writes it into the
    /// workgroup-bounds buffer.
    /// ================================================================================
    if (localId == 0) {
        atomicStore(&sharedIntMin, u32(MAX_U32)); // Initialize IntMin
    }
    workgroupBarrier(); 
    if (valN > 0) {
        let valInt:u32 = f32_to_u32(val);
        atomicMin(&sharedIntMin, valInt);
        atomicMax(&sharedIntMax, valInt);
        atomicAdd(&sharedN, valN);
    }
    workgroupBarrier();
    if (localId == 0) {
        // First thread of local workgroup is in charge to write the workgroups min/max values
        let workgroupN:u32 = atomicLoad(&sharedN);
        var sharedBounds:vec2<f32> = vec2<f32>(-1000.0, 1000.0);
        if (workgroupN > 0) {
            sharedBounds = vec2(u32_to_f32(atomicLoad(&sharedIntMin)), u32_to_f32(atomicLoad(&sharedIntMax)));
        }
        workgroupBounds[workgroupId.x] = sharedBounds;
    }

    gridValue.value = val;
    gridValue.valueN = valN;
    if (i < N) { // Guard against out-of-bounds workgroup sizes
        grid[i] = gridValue;
    }
}