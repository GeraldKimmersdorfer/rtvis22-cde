
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
};

struct PositionEntry {
    position: vec2<f32>,            // the precalculated x and y position
    index_bounds: vec2<u32>         // min and max id inside temperaturelist, (requires temperaturelist sorted by pid)
}

struct KdPositionEntry {
    position: vec2<f32>,
    left: i32,
    right: i32,
    index_bounds: vec2<u32>
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

const ATOMIC_FLOAT_DIS_BOUNDS:vec2<f32> = vec2<f32>(-1000.0, 1000.0);
const AGGREGATE_WORKGROUP_SIZE:u32 = 64;
const MAX_U32:f32 = 4294967295.0;

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
/* NOTE: I had to figure out the hardway that compute shaders can't write in an array<vec3<f32>>... */
@group(0) @binding(1) var<storage, read_write> grid: array<GridEntry>;
@group(0) @binding(2) var<storage, read> positions: array<PositionEntry>;
@group(0) @binding(3) var<storage, read> temperatures: array<TemperatureEntry>;
@group(0) @binding(4) var<storage, read_write> workgroupBounds: array<vec2<f32>>;
@group(0) @binding(5) var<storage, read> kdPositions: array<KdPositionEntry>;

var<workgroup> sharedIntMax:atomic<u32>;
var<workgroup> sharedIntMin:atomic<u32>;
var<workgroup> sharedN:atomic<u32>;

fn pos_inside_circle(pos:vec2<f32>, circle_middle:vec2<f32>, circle_radius:f32) -> bool {

    return (distance(pos, circle_middle) < circle_radius);
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
    var debugVal: f32 = -1.0;   // overwrites val if > 0
    var tempSum: vec2<f32> = vec2<f32>(0.0, 0.0);
    var tempN: vec2<u32> = vec2<u32>(0, 0);
    // ToDo: Use kd-tree or quadtree to speed up things!
    var node = kdPositions[0];

    // In order to take into account that the hexagons might be distorted we'll stretch the points accordingly such that
    // we can check with a simple circle again
    var distord:vec2<f32> = vec2<f32>(1.0);
    if (uniforms.gridAspect == 1) {
        distord.x = f32(uniforms.screenSize.x) / f32(uniforms.screenSize.y);
    }
    let middlePointPosDis = mPointPos * distord;
    let hexagonsize = uniforms.gridProperties.x;
    let xoffset = sqrt(3.0) * hexagonsize / 2.0;
    let hexagonAABB:Rectangle = Rectangle(middlePointPosDis.x-xoffset,middlePointPosDis.y-hexagonsize,middlePointPosDis.x+xoffset,middlePointPosDis.y+hexagonsize);
    var curDim:i32 = 1;    // 1 = x, 2 = y
    var ignoreBranch:vec2<bool>;
    const QUEUE_SIZE = 10;
    var queue_indices:array<i32, QUEUE_SIZE>;
    var queue_dim:array<i32, QUEUE_SIZE>;
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
            if (pos_inside_circle(pointPosDis, middlePointPosDis, uniforms.gridProperties.x)) {
                for (var k:u32=node.index_bounds[0]; k <= node.index_bounds[1]; k++) {
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

        var nextNodeFound:bool = false;
        var nextNode:KdPositionEntry;
        var nextDim:i32 = select(1, 2, curDim==1);
        if (ignoreBranch.x == false && node.left > 0) {
            nextNode = kdPositions[node.left];
            nextNodeFound = true;
        }
        if (ignoreBranch.y == false && node.right > 0) {
            if (nextNodeFound) {
                // ToDo: Add a queue
                if (queue_index < QUEUE_SIZE - 1) {
                    queue_index += 1;
                    //if (queue_index > queue_index_max) {
                        //queue_index_max = queue_index;
                    //}
                    queue_dim[queue_index] = nextDim;
                    queue_indices[queue_index] = node.right;
                } else {
                    debugVal += 2000.0; // Not good! In this case we have to increase the size of the queue
                }
                
            } else {
                nextNode = kdPositions[node.right];
                nextNodeFound = true;
            }
        }
        if (!nextNodeFound) {
            // Get from queue, if queue empty exit
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
    //debugVal = f32(queue_index_max);
    
    //let tmp = temperatures[0];
    /*
    for (var j:u32=0; j < posN; j++) {
        let p:PositionEntry = positions[j];
        // ToDo: Collision should be checked with hexagon not with circle (we have possible overlaps right now)
        // Note: To make it faster we could first check with outer circle to completely discard positions before doing the fine check

    }*/

    if (tempN.x > 0 && tempN.y > 0) { // Check for divbyzero error (no entry in given time range and position)
        var tempAvg: vec2<f32> = tempSum / vec2<f32>(tempN);
        val = tempAvg[1] - tempAvg[0];
        valN = tempN.x + tempN.y;
    }
    if (debugVal > 0) {
        val = debugVal + 100;
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