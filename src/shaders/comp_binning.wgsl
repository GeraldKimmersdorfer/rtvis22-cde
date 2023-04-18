
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

struct PositionEntry {
    position: vec2<f32>,            // the precalculated x and y position
    index_bounds: vec2<u32>,        // min and max id inside temperaturelist, (requires temperaturelist sorted by pid)
    avgvalues: vec2<f32>,           // contains the average value for the given time ranges as outputed by the aggregation step
    nvalues: vec2<u32>              // contains the amount of values taken into account for the avgvalue as written by the aggregation step
}

struct KdPositionEntry {
    position: vec2<f32>,
    left: i32,
    right: i32,
    pid: u32,                       // Index inside position list
    buff: u32,  // weirdly necessary, instead crash...
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

struct Rectangle {
    left: f32,
    bottom: f32,
    right: f32,
    top: f32
}

const BINNING_WORKGROUP_SIZE:u32 = 32;
const MAX_U32:f32 = 4294967295.0;
const KDTRAVERSAL_QUEUE_SIZE = 10;

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
/* NOTE: I had to figure out the hardway that compute shaders can't write in an array<vec3<f32>>... */
@group(0) @binding(1) var<storage, read_write> grid: array<GridEntry>;
@group(0) @binding(2) var<storage, read> positions: array<PositionEntry>;
@group(0) @binding(4) var<storage, read_write> workgroupBounds: array<vec2<f32>>;
@group(0) @binding(5) var<storage, read> kdPositions: array<KdPositionEntry>;

var<workgroup> sharedIntMax:atomic<u32>;
var<workgroup> sharedIntMin:atomic<u32>;
var<workgroup> sharedN:atomic<u32>;

// Adapted from here: https://stackoverflow.com/questions/5193331/is-a-point-inside-regular-hexagon
fn pos_inside_hexagon(pos:vec2<f32>, hex_middle:vec2<f32>, hex_outerradius:f32) -> bool {
    let x = (pos.x - hex_middle.x) / hex_outerradius;
    let y = (pos.y - hex_middle.y) / hex_outerradius;

    // Check length (squared) against inner and outer radius
    let l2 = x * x + y * y;
    if (l2 > 1.0f) {
        return false;
    }
    if (l2 < 0.75f) {
        return true; // (sqrt(3)/2)^2 = 3/4
    }

    // Check against borders
    let px = x * 1.15470053838f; // 2/sqrt(3)
    if (px > 1.0f || px < -1.0f) {
        return false;
    }
    let py = 0.5f * px + y;
    if (py > 1.0f || py < -1.0f) {
        return false;
    }
    if (px - py > 1.0f || px - py < -1.0f) {
        return false;
    }
    return true;
}

fn f32_to_u32(val:f32) -> u32 {
    return u32((val - uniforms.temperatureBounds.x) / (uniforms.temperatureBounds.y - uniforms.temperatureBounds.x) * MAX_U32);
}
fn u32_to_f32(val:u32) -> f32 {
    return f32(val) / MAX_U32 * (uniforms.temperatureBounds.y - uniforms.temperatureBounds.x) + uniforms.temperatureBounds.x;
}

@compute @workgroup_size(BINNING_WORKGROUP_SIZE)
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
    /// The most important step: Aggregate all temperature values inside the current 
    /// cell position.
    /// ================================================================================
    var val = 0.0;
    var valN:u32 = 0;

    let posN = arrayLength(&positions);
    var debugVal: f32 = -1.0;   // overwrites val if > 0
    var tempSum: vec2<f32> = vec2<f32>(0.0, 0.0);
    var tempN: vec2<u32> = vec2<u32>(0, 0);

    // In order to take into account that the hexagons might be distorted we'll stretch the points accordingly such that
    // we can check with a simple circle again
    var distord:vec2<f32> = vec2<f32>(1.0);
    if (uniforms.gridAspect == 1) {
        distord.x = f32(uniforms.screenSize.x) / f32(uniforms.screenSize.y);
    }
    let middlePointPosDis = mPointPos * distord;

    if (uniforms.useKdTreeImplementation == 0) {
        // NON KD TREE IMPLEMENTATION
        for (var j:u32=0; j < posN; j++) {
            let p:PositionEntry = positions[j];
            // ToDo: Collision should be checked with hexagon not with circle (we have possible overlaps right now)
            // Note: To make it faster we could first check with outer circle to completely discard positions before doing the fine check
            if (pos_inside_hexagon(p.position * distord, middlePointPosDis, uniforms.gridProperties.x)) {
                tempSum += p.avgvalues;
                tempN += p.nvalues;
            }
        }  
    } else {
        // KD TREE IMPLEMENTATION
        var node = kdPositions[0];
        let hexagonsize = uniforms.gridProperties.x;
        let xoffset = sqrt(3.0) * hexagonsize / 2.0;
        let hexagonAABB:Rectangle = Rectangle(middlePointPosDis.x-xoffset,middlePointPosDis.y-hexagonsize,middlePointPosDis.x+xoffset,middlePointPosDis.y+hexagonsize);
        var curDim:i32 = 1;    // 1 = x, 2 = y
        var ignoreBranch:vec2<bool>;
        
        var queue_indices:array<i32, KDTRAVERSAL_QUEUE_SIZE>;
        var queue_dim:array<i32, KDTRAVERSAL_QUEUE_SIZE>;
        var queue_index:i32 = -1;
        //var queue_index_max:i32 = 0;
        loop {
            let pointPosDis = node.position * distord;
            ignoreBranch = vec2<bool>(false, false);
            if (curDim == 1) {
                if (pointPosDis.x < hexagonAABB.left) {
                    // In this case, alle points to the left of pointPosDis are also outside the aabb
                    ignoreBranch.x = true;
                }
                if (pointPosDis.x > hexagonAABB.right) {
                    // In this case, all points to the right of pointPosDis are also outside the aabb
                    ignoreBranch.y = true;
                }
            } else {
                if (pointPosDis.y > hexagonAABB.top) {
                    // In this case all points above pointPosDis are also outside the aabb
                    ignoreBranch.y = true;
                }
                if (pointPosDis.y < hexagonAABB.bottom) {
                    // In this case all points below pointPosDis are also outside the aabb
                    ignoreBranch.x = true;
                }
            }
            if (ignoreBranch.x == false && ignoreBranch.y == false) {
                // In this case check whether its a hit and go down left and right subtree
                if (pos_inside_hexagon(pointPosDis, middlePointPosDis, uniforms.gridProperties.x)) {
                    let pid = node.pid;
                    if (pid >= posN || pid < 0) {
                        // Not good: kd tree wrongly formed. pid has to be inside the range of the position array
                        debugVal = 6000;
                    } else {
                        let p:PositionEntry = positions[node.pid];
                        tempSum += p.avgvalues;
                        tempN += p.nvalues;
                    }
                }
            }

            var nextNodeFound:bool = false;
            var nextNode:KdPositionEntry;
            var nextDim:i32 = select(1, 2, curDim==1);
            if (ignoreBranch.x == false && node.left > 0) {
                nextNode = kdPositions[node.left];
                nextNodeFound = true;
            }
            if (ignoreBranch.y == false && node.right > 0) {
                if (nextNodeFound) {
                    // We can't process this branch now so add it to the queue
                    if (queue_index < KDTRAVERSAL_QUEUE_SIZE - 1) {
                        queue_index += 1;
                        queue_dim[queue_index] = nextDim;
                        queue_indices[queue_index] = node.right;
                    } else {
                        // Not good! In this case we have to increase the size of the queue
                        // ToDo Handle Error
                    }
                } else {
                    nextNode = kdPositions[node.right];
                    nextNodeFound = true;
                }
            }
            if (!nextNodeFound) {
                // Get next node from queue, if queue empty exit
                if (queue_index < 0) {
                    break;
                } else {
                    node = kdPositions[queue_indices[queue_index]];
                    curDim = queue_dim[queue_index];
                    queue_index -= 1;
                }                
            } else {
                node = nextNode;
                curDim = nextDim;
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