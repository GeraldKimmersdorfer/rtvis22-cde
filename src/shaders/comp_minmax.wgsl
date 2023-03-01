
struct Uniforms {
	gridProperties: vec4<f32>,      // hexagon size, vertical space, horizontal space, border
    screenSize: vec2<u32>,          // the size of the viewport
    gridResolution: vec2<u32>,      // resolution of the grid

    timeRangeBounds: vec4<u32>,     // contains TimeAMin, TimeAMax, TimeBMin, TimeBMax already in the appropriate dm
    monthComparison: i32,           // which month to compare (-1... whole year, 0...January, ...)
    firstMonthIndex: u32,           // contains the index of the first month. (in the dataset the first month is dec 1743 therefore it will be 11)

    gridAspect: u32,                // 1 if grid should respect viewport aspect ratio
    colorMode: u32,                 // 0...sequential, 1...diverging
    colorA: vec4<f32>,              // color for min values
    colorB: vec4<f32>,              // color for 0 (if diverging)
    colorC: vec4<f32>,              // color for max values
    colorNull: vec4<f32>,           // color for empty cell
    colorPoints: vec4<f32>,         // color of the positions if activated

    sizePoints: f32,                // size of the positions if activated
    hoverIndex: i32,                // contains the id of the active grid cell

    temperatureBounds: vec2<f32>,   // contains minTemp und maxTemp from the whole dataset (for discretization)

    useKdTreeImplementation: u32,   // 1 if kd tree should be used. (On this data a little bit slower, with more points maybe faster?)
};

struct GridEntry {
    mPoint: vec2<f32>,
    value: f32,
    valueN: u32
}

const MINMAX_WORKGROUP_SIZE:u32 = 64;
const MAX_U32:f32 = 4294967295.0;

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
//@group(0) @binding(1) var<storage, read_write> grid: array<GridEntry>; // todo not necessary
@group(0) @binding(2) var<storage, read_write> minmaxvalues: vec4<f32>;
@group(0) @binding(3) var<storage, read> workgroupBounds: array<vec2<f32>>;

var<workgroup> sharedIntMax:atomic<u32>;
var<workgroup> sharedIntMin:atomic<u32>;
var<workgroup> sharedCount:atomic<u32>;

fn f32_to_u32(val:f32) -> u32 {
    return u32((val - uniforms.temperatureBounds.x) / (uniforms.temperatureBounds.y - uniforms.temperatureBounds.x) * MAX_U32);
}
fn u32_to_f32(val:u32) -> f32 {
    return f32(val) / MAX_U32 * (uniforms.temperatureBounds.y - uniforms.temperatureBounds.x) + uniforms.temperatureBounds.x;
}

@compute @workgroup_size(MINMAX_WORKGROUP_SIZE)
fn cs_main(
    @builtin(local_invocation_index) localId: u32, // Current index inside the workgroup
) {
    let N: u32 = arrayLength(&workgroupBounds);
    // We have one workgroup with MINMAX_WORKGROUP_SIZE threads available so lets do this as follows:
    /// STEP 1: Get min/max of every i+MINMAX_WORKGROUP_SIZE*x item:
    var minVal:f32 = 1000.0;
    var maxVal:f32 = -1000.0;
    var cnt:u32 = 0;
    for (var i:u32=localId; i < N; i+=MINMAX_WORKGROUP_SIZE) {
        let cwb = workgroupBounds[i];
        if ((cwb.y - cwb.x) < 1000) { // Sanity check: if > 1000 probably no value in whole workgroup (gets set by binning stage)
            minVal = min(minVal, cwb.x);
            maxVal = max(maxVal, cwb.y);
            cnt += 1;
        }
    }

    /// STEP 2: Get min/max of the workgroup:
    if (localId == 0) {
        atomicStore(&sharedIntMin, u32(MAX_U32)); // Initialize IntMin
    }
    workgroupBarrier(); 
    if (cnt > 0) {
        atomicMin(&sharedIntMin, f32_to_u32(minVal));
        atomicMax(&sharedIntMax, f32_to_u32(maxVal));
        atomicAdd(&sharedCount, cnt);
    }
    workgroupBarrier();

    /// STEP 3: Thread 0 writes the result:
	if (localId == 0) {
        let workgroupCount:u32 = atomicLoad(&sharedCount);
        var sharedBounds:vec2<f32> = vec2<f32>(0.0, 0.0);
        if (workgroupCount > 0) {
            sharedBounds = vec2(u32_to_f32(atomicLoad(&sharedIntMin)), u32_to_f32(atomicLoad(&sharedIntMax)));
        }
        minmaxvalues = vec4<f32>(sharedBounds.x, sharedBounds.y, sharedBounds.y - sharedBounds.x, f32(workgroupCount));
	}    
}